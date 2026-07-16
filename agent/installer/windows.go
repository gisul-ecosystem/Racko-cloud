//go:build windows

package installer

import (
	"archive/zip"
	"bytes"
	"context"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
)

// directInstallTimeout is applied to msi/exe/zip/script installs where we
// spawn the process directly with no built-in timeout of their own.
const directInstallTimeout = 4 * time.Hour

// ─── Win32 API declarations ───────────────────────────────────────────────────

// WTS_SESSION_INFO mirrors the Win32 WTS_SESSION_INFOW struct.
type wtsSessionInfo struct {
	SessionID         uint32
	pWinStationName   *uint16
	State             uint32
}

const (
	wtsActive       = 0 // WTSActive — session has an interactive logged-on user
	wtsDisconnected = 4 // WTSDisconnected — user closed RDP but session still alive
)

var (
	modWtsapi32                = windows.NewLazySystemDLL("wtsapi32.dll")
	modUserenv                 = windows.NewLazySystemDLL("userenv.dll")
	procWTSEnumerateSessions   = modWtsapi32.NewProc("WTSEnumerateSessionsW")
	procWTSFreeMemory          = modWtsapi32.NewProc("WTSFreeMemory")
	procWTSQueryUserToken      = modWtsapi32.NewProc("WTSQueryUserToken")
	procCreateEnvironmentBlock = modUserenv.NewProc("CreateEnvironmentBlock")
	procDestroyEnvironmentBlock = modUserenv.NewProc("DestroyEnvironmentBlock")
)

// findActiveSessionID enumerates all WTS sessions and returns the best one
// to run installers in. Priority:
//  1. WTSActive — user is actively connected (console or RDP)
//  2. WTSDisconnected — user closed RDP window but session is still alive
//
// This covers the common cloud VM scenario where a user connects via RDP,
// sets up their machine, closes the RDP window, and then an admin pushes
// software from the portal. Without WTSDisconnected support, those installs
// would fall back to LocalSystem (Session 0) and hang.
func findActiveSessionID() (uint32, error) {
	var pSessions uintptr
	var count uint32

	ret, _, err := procWTSEnumerateSessions.Call(
		0, // WTS_CURRENT_SERVER_HANDLE
		0, // Reserved
		1, // Version
		uintptr(unsafe.Pointer(&pSessions)),
		uintptr(unsafe.Pointer(&count)),
	)
	if ret == 0 {
		return 0, fmt.Errorf("WTSEnumerateSessionsW: %w", err)
	}
	defer procWTSFreeMemory.Call(pSessions)

	size := unsafe.Sizeof(wtsSessionInfo{})

	// First pass: prefer an actively connected session
	for i := uint32(0); i < count; i++ {
		info := (*wtsSessionInfo)(unsafe.Pointer(pSessions + uintptr(i)*size))
		if info.State == wtsActive && info.SessionID != 0 {
			log.Printf("[runAsUser] Found active session ID=%d (WTSActive)", info.SessionID)
			return info.SessionID, nil
		}
	}

	// Second pass: fall back to disconnected session (user closed RDP window)
	for i := uint32(0); i < count; i++ {
		info := (*wtsSessionInfo)(unsafe.Pointer(pSessions + uintptr(i)*size))
		if info.State == wtsDisconnected && info.SessionID != 0 {
			log.Printf("[runAsUser] Found disconnected session ID=%d (WTSDisconnected) — user closed RDP", info.SessionID)
			return info.SessionID, nil
		}
	}

	return 0, fmt.Errorf("no active or disconnected user session found (sessions checked: %d)", count)
}

func wtsQueryUserToken(sessionID uint32) (windows.Token, error) {
	var token windows.Token
	ret, _, err := procWTSQueryUserToken.Call(uintptr(sessionID), uintptr(unsafe.Pointer(&token)))
	if ret == 0 {
		return 0, fmt.Errorf("WTSQueryUserToken: %w", err)
	}
	return token, nil
}
func createEnvironmentBlock(token windows.Token) (uintptr, error) {
	var env uintptr
	ret, _, err := procCreateEnvironmentBlock.Call(uintptr(unsafe.Pointer(&env)), uintptr(token), 0)
	if ret == 0 {
		return 0, fmt.Errorf("CreateEnvironmentBlock: %w", err)
	}
	return env, nil
}

func destroyEnvironmentBlock(env uintptr) {
	procDestroyEnvironmentBlock.Call(env)
}

// rebootRequiredExitCodes are Windows installer exit codes that mean
// "installed successfully, reboot required". Treat as success.
var rebootRequiredExitCodes = map[uint32]bool{
	3010: true, // ERROR_SUCCESS_REBOOT_REQUIRED (most common — MSI, choco packages)
	1641: true, // ERROR_SUCCESS_REBOOT_INITIATED (installer triggered a reboot)
}

// getElevatedToken returns the elevated (admin) token linked to t.
// Under UAC, WTSQueryUserToken returns a filtered token even for Administrators.
// TokenLinkedToken retrieves the full elevated counterpart.
// If the token is already elevated or has no linked token, t itself is returned.
func getElevatedToken(t windows.Token) (windows.Token, error) {
	// TOKEN_ELEVATION_TYPE: 1=Default, 2=Full(elevated), 3=Limited(filtered)
	var elevType uint32
	var retLen uint32
	err := windows.GetTokenInformation(t, windows.TokenElevationType,
		(*byte)(unsafe.Pointer(&elevType)), uint32(unsafe.Sizeof(elevType)), &retLen)
	if err != nil {
		return 0, fmt.Errorf("GetTokenInformation(TokenElevationType): %w", err)
	}

	const tokenElevationTypeLimited = 3
	if elevType != tokenElevationTypeLimited {
		// Already elevated or default — duplicate it directly
		var dup windows.Token
		err = windows.DuplicateTokenEx(t, windows.TOKEN_ALL_ACCESS, nil,
			windows.SecurityDelegation, windows.TokenPrimary, &dup)
		if err != nil {
			return 0, fmt.Errorf("DuplicateTokenEx(already elevated): %w", err)
		}
		return dup, nil
	}

	// Token is limited — get the linked elevated token
	var linkedToken windows.Token
	err = windows.GetTokenInformation(t, windows.TokenLinkedToken,
		(*byte)(unsafe.Pointer(&linkedToken)), uint32(unsafe.Sizeof(linkedToken)), &retLen)
	if err != nil {
		return 0, fmt.Errorf("GetTokenInformation(TokenLinkedToken): %w", err)
	}

	// LinkedToken is an impersonation token; duplicate to primary
	var primary windows.Token
	err = windows.DuplicateTokenEx(linkedToken, windows.TOKEN_ALL_ACCESS, nil,
		windows.SecurityDelegation, windows.TokenPrimary, &primary)
	linkedToken.Close()
	if err != nil {
		return 0, fmt.Errorf("DuplicateTokenEx(linked): %w", err)
	}
	return primary, nil
}

// runAsActiveUser launches name+args in the active console user's session using
// CreateProcessAsUser. This is the industry-standard RMM pattern for running
// installers from a LocalSystem service — the process gets the user's desktop,
// profile, PATH, and Start Menu, exactly as if the user ran it themselves.
//
// stdout+stderr are captured via anonymous pipes passed through STARTF_USESTDHANDLES —
// the proper Win32 method that works across session boundaries without file permission issues.
// Falls back to runCmd (Session 0 / LocalSystem) if no active user session exists.
func runAsActiveUser(name string, args ...string) (string, error) {
	sessionID, err := findActiveSessionID()
	if err != nil {
		log.Printf("[runAsUser] %v — falling back to LocalSystem for: %s", err, name)
		return runCmd(name, args...)
	}

	// Get the user token for that session
	userToken, err := wtsQueryUserToken(sessionID)
	if err != nil {
		log.Printf("[runAsUser] WTSQueryUserToken failed (%v) — falling back to LocalSystem", err)
		return runCmd(name, args...)
	}
	defer userToken.Close()

	elevatedToken, err := getElevatedToken(userToken)
	if err != nil {
		log.Printf("[runAsUser] getElevatedToken failed (%v) — using standard user token", err)
		// Fall back: duplicate the original token directly
		var fallback windows.Token
		dupErr := windows.DuplicateTokenEx(userToken, windows.TOKEN_ALL_ACCESS, nil,
			windows.SecurityDelegation, windows.TokenPrimary, &fallback)
		if dupErr != nil {
			log.Printf("[runAsUser] DuplicateTokenEx fallback failed (%v) — falling back to LocalSystem", dupErr)
			return runCmd(name, args...)
		}
		elevatedToken = fallback
	} else {
		log.Printf("[runAsUser] Using elevated (admin) token for session %d", sessionID)
	}
	defer elevatedToken.Close()

	// elevatedToken is already a primary token (getElevatedToken returns a primary)
	primaryToken := elevatedToken

	// Build environment block from the user token so PATH, APPDATA, etc. are correct
	envBlock, err := createEnvironmentBlock(primaryToken)
	if err != nil {
		log.Printf("[runAsUser] CreateEnvironmentBlock failed (%v) — proceeding without user env", err)
		envBlock = 0
	} else {
		defer destroyEnvironmentBlock(envBlock)
	}

	// Create anonymous pipes for stdout+stderr capture.
	// Using STARTF_USESTDHANDLES is the industry-standard Win32 approach —
	// it works across session boundaries with no file permission issues,
	// unlike shell redirection (cmd.exe /C ... > file) which requires the
	// user token to have write access to a SYSTEM-owned temp file.
	var readPipe, writePipe windows.Handle
	sa := windows.SecurityAttributes{
		Length:             uint32(unsafe.Sizeof(windows.SecurityAttributes{})),
		InheritHandle:      1, // pipe handles must be inheritable
	}
	if err := windows.CreatePipe(&readPipe, &writePipe, &sa, 0); err != nil {
		log.Printf("[runAsUser] CreatePipe failed (%v) — falling back to LocalSystem", err)
		return runCmd(name, args...)
	}
	// The write end goes to the child; close it in the parent after process starts
	// so ReadFile on the read end returns EOF when the child exits.
	defer windows.CloseHandle(readPipe)

	cmdLine := buildCmdLine(name, args...)
	log.Printf("[runAsUser] Launching in user session %d: %s", sessionID, cmdLine)

	cmdLinePtr, err := windows.UTF16PtrFromString(cmdLine)
	if err != nil {
		windows.CloseHandle(writePipe)
		return runCmd(name, args...)
	}

	// Desktop must be the interactive desktop for the process to function correctly
	desktop, _ := windows.UTF16PtrFromString("winsta0\\default")

	si := windows.StartupInfo{
		Cb:         uint32(unsafe.Sizeof(windows.StartupInfo{})),
		Desktop:    desktop,
		Flags:      windows.STARTF_USESTDHANDLES | windows.STARTF_USESHOWWINDOW,
		ShowWindow: 0, // SW_HIDE
		StdInput:   windows.InvalidHandle,
		StdOutput:  writePipe,
		StdErr:     writePipe,
	}
	pi := windows.ProcessInformation{}

	creationFlags := uint32(windows.CREATE_NO_WINDOW)
	if envBlock != 0 {
		creationFlags |= windows.CREATE_UNICODE_ENVIRONMENT
	}

	var envPtr *uint16
	if envBlock != 0 {
		envPtr = (*uint16)(unsafe.Pointer(envBlock))
	}

	startTime := time.Now()

	err = windows.CreateProcessAsUser(
		primaryToken,
		nil,         // lpApplicationName (nil = use command line)
		cmdLinePtr,
		nil,         // process security attrs
		nil,         // thread security attrs
		true,        // inherit handles — required for pipe handles to be passed to child
		creationFlags,
		envPtr,
		nil,         // current directory (inherit)
		&si,
		&pi,
	)
	// Close write end in parent immediately after CreateProcessAsUser —
	// this ensures ReadFile below returns EOF when the child process exits.
	windows.CloseHandle(writePipe)

	if err != nil {
		log.Printf("[runAsUser] CreateProcessAsUser failed (%v) — falling back to LocalSystem", err)
		return runCmd(name, args...)
	}
	defer windows.CloseHandle(pi.Thread)
	defer windows.CloseHandle(pi.Process)

	log.Printf("[runAsUser] PID=%d started in session %d: %s", pi.ProcessId, sessionID, name)

	// Read all output from the pipe in a goroutine so the buffer never fills
	// and blocks the child process (deadlock prevention).
	outputCh := make(chan string, 1)
	go func() {
		var buf bytes.Buffer
		tmp := make([]byte, 4096)
		for {
			var n uint32
			err := windows.ReadFile(readPipe, tmp, &n, nil)
			if n > 0 {
				buf.Write(tmp[:n])
			}
			if err != nil {
				break // EOF or error — child exited and write end is closed
			}
		}
		outputCh <- buf.String()
	}()

	// Progress ticker
	doneCh := make(chan struct{})
	go func() {
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-doneCh:
				return
			case <-ticker.C:
				log.Printf("[runAsUser] STILL RUNNING: %s (PID=%d) elapsed=%s",
					name, pi.ProcessId, time.Since(startTime).Round(time.Second))
			}
		}
	}()

	// Wait for process to finish (no timeout — package managers self-manage)
	windows.WaitForSingleObject(pi.Process, windows.INFINITE)
	close(doneCh)

	elapsed := time.Since(startTime).Round(time.Millisecond)

	var exitCode uint32
	windows.GetExitCodeProcess(pi.Process, &exitCode)

	// Wait for the output reader goroutine to finish
	output := <-outputCh
	combined := fmt.Sprintf("cmd: %s\nstdout+stderr:\n%s", cmdLine, output)

	if exitCode != 0 {
		log.Printf("[runAsUser] FAILED: %s (PID=%d) exitCode=%d elapsed=%s", name, pi.ProcessId, exitCode, elapsed)
		log.Printf("[runAsUser] output: %s", output)

		if rebootRequiredExitCodes[exitCode] {
			log.Printf("[runAsUser] Exit code %d means reboot required — treating as success", exitCode)
			return combined, nil
		}

		outLower := strings.ToLower(output)
		for _, signal := range alreadyInstalledSignals {
			if strings.Contains(outLower, signal) {
				log.Printf("[runAsUser] Already-installed signal detected — treating as success")
				return combined, nil
			}
		}
		return combined, fmt.Errorf("%s exited with code %d", name, exitCode)
	}

	log.Printf("[runAsUser] SUCCESS: %s (PID=%d) elapsed=%s", name, pi.ProcessId, elapsed)
	log.Printf("[runAsUser] output: %s", output)
	return combined, nil
}

// buildCmdLine builds a properly quoted command-line string for CreateProcess.
func buildCmdLine(name string, args ...string) string {
	parts := make([]string, 0, len(args)+1)
	parts = append(parts, quoteArg(name))
	for _, a := range args {
		parts = append(parts, quoteArg(a))
	}
	return strings.Join(parts, " ")
}

// quoteArg wraps an argument in double-quotes if it contains spaces or is empty.
func quoteArg(s string) string {
	if s == "" || strings.ContainsAny(s, " \t") {
		return `"` + strings.ReplaceAll(s, `"`, `\"`) + `"`
	}
	return s
}

// ─── Platform entry point ─────────────────────────────────────────────────────

func installOnPlatform(pkg SoftwarePackage) (string, error) {
	log.Printf("[installer] installOnPlatform: name=%s version=%s method=%s chocoName=%s wingetId=%s",
		pkg.Name, pkg.Version, pkg.InstallMethod, pkg.ChocoName, pkg.WingetID)
	start := time.Now()
	out, err := func() (string, error) {
		switch pkg.InstallMethod {
		case "winget":
			return runWinget(pkg)
		case "choco":
			return runChoco(pkg)
		case "msi":
			return runMSI(pkg)
		case "exe":
			return runEXE(pkg)
		case "zip":
			return runZIP(pkg)
		case "script":
			return runPowerShell(pkg)
		default:
			return "", fmt.Errorf("unsupported install method on Windows: %s", pkg.InstallMethod)
		}
	}()
	elapsed := time.Since(start).Round(time.Millisecond)
	if err != nil {
		log.Printf("[installer] installOnPlatform FAILED: name=%s elapsed=%s err=%v", pkg.Name, elapsed, err)
	} else {
		log.Printf("[installer] installOnPlatform SUCCESS: name=%s elapsed=%s", pkg.Name, elapsed)
	}
	return out, err
}

// ─── Install methods ──────────────────────────────────────────────────────────

// ensureChocolatey installs Chocolatey if not already present.
// Runs as LocalSystem — choco bootstrap only touches system paths.
func ensureChocolatey() (string, error) {
	log.Printf("[choco] Checking if chocolatey is installed...")
	if path, err := exec.LookPath("choco"); err == nil {
		log.Printf("[choco] Found choco in PATH: %s", path)
		return "", nil
	}
	chocoExe := `C:\ProgramData\chocolatey\bin\choco.exe`
	if _, err := os.Stat(chocoExe); err == nil {
		log.Printf("[choco] Found choco at default path: %s", chocoExe)
		return "", nil
	}
	log.Printf("[choco] Chocolatey not found — installing now...")
	installScript := `[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor 3072; iex ((New-Object Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))`
	out, err := runCmd("powershell.exe",
		"-ExecutionPolicy", "Bypass",
		"-NonInteractive",
		"-Command", installScript,
	)
	if err != nil {
		log.Printf("[choco] Chocolatey install FAILED: %v", err)
		return out, fmt.Errorf("chocolatey install failed: %w", err)
	}
	log.Printf("[choco] Chocolatey installed successfully")
	return out, nil
}

// runWinget installs via winget in the active user's session.
// Falls back to choco ONLY if pkg.ChocoName is explicitly set.
func runWinget(pkg SoftwarePackage) (string, error) {
	wingetID := pkg.WingetID
	if wingetID == "" {
		wingetID = pkg.Name
	}

	wingetPath, err := exec.LookPath("winget")
	if err != nil {
		// Check known install location
		wingetPath = `C:\Program Files\WindowsApps\Microsoft.DesktopAppInstaller_8wekyb3d8bbwe\winget.exe`
		if _, statErr := os.Stat(wingetPath); statErr != nil {
			// winget not found — try to install it
			log.Printf("[winget] winget not found — installing App Installer...")
			installOut, installErr := ensureWinget()
			if installErr != nil {
				log.Printf("[winget] Failed to install winget: %v", installErr)
				// Only fall back to choco if a choco package name is explicitly provided
				if pkg.ChocoName != "" {
					log.Printf("[winget] Falling back to choco for %s", pkg.Name)
					return runChoco(pkg)
				}
				return installOut, fmt.Errorf("winget not available and no choco fallback: %w", installErr)
			}
			log.Printf("[winget] winget installed successfully")
			// Re-check path after install
			if p, lookErr := exec.LookPath("winget"); lookErr == nil {
				wingetPath = p
			}
		}
	}
	log.Printf("[winget] Found winget at: %s", wingetPath)

	args := []string{"install", "--id", wingetID, "-e",
		"--accept-source-agreements", "--accept-package-agreements", "--silent", "--scope", "machine"}
	if pkg.InstallArgs != "" {
		args = append(args, strings.Fields(pkg.InstallArgs)...)
	}

	log.Printf("[winget] Running in active user session: winget %v", args)
	out, err := runAsActiveUser(wingetPath, args...)
	if err != nil {
		outLower := strings.ToLower(out)
		for _, signal := range alreadyInstalledSignals {
			if strings.Contains(outLower, signal) {
				log.Printf("[winget] Already-installed signal detected — treating as success")
				return out, nil
			}
		}
	}
	return out, err
}

// ensureWinget installs the Windows Package Manager (winget) if not present.
// Uses the Microsoft.WinGet.Client PowerShell module — the officially recommended
// method for Windows Server 2019/2022 where winget doesn't ship by default.
func ensureWinget() (string, error) {
	script := `
$ErrorActionPreference = "Stop"
Write-Host "[winget-install] Installing NuGet package provider..."
Install-PackageProvider -Name NuGet -MinimumVersion 2.8.5.201 -Force -Scope AllUsers | Out-Null
Write-Host "[winget-install] Installing Microsoft.WinGet.Client module..."
Install-Module -Name Microsoft.WinGet.Client -Force -Scope AllUsers -AllowClobber | Out-Null
Write-Host "[winget-install] Running Repair-WinGetPackageManager..."
Repair-WinGetPackageManager -AllUsers
Write-Host "[winget-install] Verifying winget..."
winget --version
Write-Host "[winget-install] winget is ready."
`
	return runAsActiveUser("powershell.exe",
		"-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script)
}

// runChoco installs via choco in the active user's session.
func runChoco(pkg SoftwarePackage) (string, error) {
	log.Printf("[choco] Starting install: name=%s chocoName=%s version=%s", pkg.Name, pkg.ChocoName, pkg.Version)
	installLog, err := ensureChocolatey()
	if err != nil {
		return installLog, fmt.Errorf("ensure chocolatey: %w", err)
	}

	name := pkg.ChocoName
	if name == "" {
		name = pkg.Name
	}
	args := []string{"install", name, "-y", "--no-progress"}
	if pkg.InstallArgs != "" {
		log.Printf("[choco] Extra installArgs: %s", pkg.InstallArgs)
		args = append(args, strings.Fields(pkg.InstallArgs)...)
	}

	chocoExe := `C:\ProgramData\chocolatey\bin\choco.exe`
	if _, err := os.Stat(chocoExe); err != nil {
		chocoExe = "choco"
	}

	log.Printf("[choco] Running in active user session: %s %v", chocoExe, args)
	// Use user session — ensures installers run with full desktop context
	out, err := runAsActiveUser(chocoExe, args...)
	combined := installLog + out

	if err != nil {
		outLower := strings.ToLower(combined)
		for _, signal := range alreadyInstalledSignals {
			if strings.Contains(outLower, signal) {
				log.Printf("[choco] Already installed signal detected for %s — treating as success", name)
				return combined, nil
			}
		}
		log.Printf("[choco] Install FAILED for %s: %v", name, err)
		return combined, fmt.Errorf("choco install failed: %w", err)
	}

	log.Printf("[choco] Install succeeded for %s", name)
	return combined, nil
}

// runMSI downloads and installs a .msi file in the active user session.
func runMSI(pkg SoftwarePackage) (string, error) {
	path, cleanup, err := downloadFile(pkg.FileURL, pkg.FileName)
	if err != nil {
		return "", fmt.Errorf("download msi: %w", err)
	}
	defer cleanup()

	// Build msiexec args — note: don't duplicate /quiet /norestart from installArgs
	args := []string{"/i", path, "/quiet", "/norestart"}
	if pkg.InstallArgs != "" {
		extra := strings.Fields(pkg.InstallArgs)
		// Filter out flags already added to avoid duplicates
		for _, a := range extra {
			lower := strings.ToLower(a)
			if lower != "/quiet" && lower != "/norestart" {
				args = append(args, a)
			}
		}
	}
	log.Printf("[msi] Running in active user session: msiexec %v", args)
	return runAsActiveUser("msiexec", args...)
}

// runEXE downloads and runs a silent .exe installer in the active user session.
func runEXE(pkg SoftwarePackage) (string, error) {
	path, cleanup, err := downloadFile(pkg.FileURL, pkg.FileName)
	if err != nil {
		return "", fmt.Errorf("download exe: %w", err)
	}
	defer cleanup()

	args := []string{"/S", "/silent", "/quiet"}
	if pkg.InstallArgs != "" {
		args = strings.Fields(pkg.InstallArgs)
	}
	log.Printf("[exe] Running in active user session: %s %v", path, args)
	return runAsActiveUser(path, args...)
}

// runZIP downloads, extracts, and runs the installer in the active user session.
func runZIP(pkg SoftwarePackage) (string, error) {
	zipPath, cleanup, err := downloadFile(pkg.FileURL, pkg.FileName)
	if err != nil {
		return "", fmt.Errorf("download zip: %w", err)
	}
	defer cleanup()

	extractDir := zipPath + "_extracted"
	if err := os.MkdirAll(extractDir, 0o755); err != nil {
		return "", fmt.Errorf("create extract dir: %w", err)
	}
	defer os.RemoveAll(extractDir)

	if err := extractZip(zipPath, extractDir); err != nil {
		return "", fmt.Errorf("extract zip: %w", err)
	}

	installerPath := findInstallerInDir(extractDir, []string{"setup.exe", "install.exe", "installer.exe"})
	if installerPath == "" {
		return "", fmt.Errorf("no installer found in zip (expected setup.exe, install.exe, or installer.exe)")
	}

	args := []string{"/S", "/silent", "/quiet"}
	if pkg.InstallArgs != "" {
		args = strings.Fields(pkg.InstallArgs)
	}
	log.Printf("[zip] Running in active user session: %s %v", installerPath, args)
	return runAsActiveUser(installerPath, args...)
}

// runPowerShell downloads and runs a .ps1 script in the active user session.
func runPowerShell(pkg SoftwarePackage) (string, error) {
	path, cleanup, err := downloadFile(pkg.FileURL, pkg.FileName)
	if err != nil {
		return "", fmt.Errorf("download script: %w", err)
	}
	defer cleanup()

	args := []string{"-ExecutionPolicy", "Bypass", "-NonInteractive", "-File", path}
	if pkg.InstallArgs != "" {
		args = append(args, strings.Fields(pkg.InstallArgs)...)
	}
	log.Printf("[script] Running in active user session: powershell.exe %v", args)
	return runAsActiveUser("powershell.exe", args...)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// alreadyInstalledSignals are choco/winget output strings that indicate the
// package is already present — treated as success (idempotent installs).
var alreadyInstalledSignals = []string{
	"already installed",
	"already exists",
	"package already installed",
	"nothing to install",
	"is already installed",
	"no applicable upgrade found",
	"no available upgrade found",
	"no newer package versions are available",
}

// runCmd runs a command as LocalSystem with no timeout.
// Used for package manager bootstrapping and non-interactive installs.
func runCmd(name string, args ...string) (string, error) {
	log.Printf("[runCmd] START: %s %v", name, args)
	startTime := time.Now()

	cmd := exec.Command(name, args...)
	cmd.SysProcAttr = &windows.SysProcAttr{
		CreationFlags: windows.CREATE_NO_WINDOW,
	}
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Start(); err != nil {
		log.Printf("[runCmd] FAILED to start: %s — %v", name, err)
		return "", fmt.Errorf("%s failed to start: %w", name, err)
	}
	log.Printf("[runCmd] PID=%d started: %s", cmd.Process.Pid, name)

	done := make(chan struct{})
	go func() {
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-done:
				return
			case t := <-ticker.C:
				log.Printf("[runCmd] STILL RUNNING: %s (PID=%d) elapsed=%s at %s",
					name, cmd.Process.Pid, time.Since(startTime).Round(time.Second), t.Format("15:04:05"))
			}
		}
	}()

	err := cmd.Wait()
	close(done)

	elapsed := time.Since(startTime).Round(time.Millisecond)
	combined := fmt.Sprintf("cmd: %s %v\nstdout:\n%s\nstderr:\n%s",
		name, args, stdout.String(), stderr.String())

	if err != nil {
		log.Printf("[runCmd] FAILED: %s (PID=%d) elapsed=%s exitErr=%v", name, cmd.Process.Pid, elapsed, err)
		log.Printf("[runCmd] stdout: %s", stdout.String())
		log.Printf("[runCmd] stderr: %s", stderr.String())

		// Check for reboot-required exit codes before treating as failure
		if exitErr, ok := err.(*exec.ExitError); ok {
			code := uint32(exitErr.ExitCode())
			if rebootRequiredExitCodes[code] {
				log.Printf("[runCmd] Exit code %d means reboot required — treating as success", code)
				return combined, nil
			}
		}
		return combined, fmt.Errorf("%s exited with error: %w", name, err)
	}

	log.Printf("[runCmd] SUCCESS: %s (PID=%d) elapsed=%s", name, cmd.Process.Pid, elapsed)
	log.Printf("[runCmd] stdout: %s", stdout.String())
	return combined, nil
}

// runCmdWithTimeout runs a command with a hard timeout (for direct installers).
func runCmdWithTimeout(timeout time.Duration, name string, args ...string) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	cmd := exec.CommandContext(ctx, name, args...)
	cmd.SysProcAttr = &windows.SysProcAttr{
		CreationFlags: windows.CREATE_NO_WINDOW,
	}
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	err := cmd.Run()
	combined := fmt.Sprintf("cmd: %s %v\nstdout:\n%s\nstderr:\n%s",
		name, args, stdout.String(), stderr.String())
	if ctx.Err() == context.DeadlineExceeded {
		return combined, fmt.Errorf("%s timed out after %s", name, timeout)
	}
	if err != nil {
		log.Printf("[installer] %s failed: %v\noutput: %s", name, err, combined)
		return combined, fmt.Errorf("%s exited with error: %w", name, err)
	}
	return combined, nil
}

// downloadFile downloads url to a temp file and returns its path plus a cleanup func.
func downloadFile(url, fileName string) (string, func(), error) {
	if url == "" {
		return "", func() {}, fmt.Errorf("fileUrl is empty")
	}

	resp, err := http.Get(url) // #nosec G107 — URL comes from trusted platform catalog
	if err != nil {
		return "", func() {}, fmt.Errorf("http get: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", func() {}, fmt.Errorf("download failed with status %d", resp.StatusCode)
	}

	if fileName == "" {
		fileName = "racko_installer_tmp"
	}

	tmp, err := os.CreateTemp("", "racko_*_"+filepath.Base(fileName))
	if err != nil {
		return "", func() {}, fmt.Errorf("create temp file: %w", err)
	}

	if _, err := io.Copy(tmp, resp.Body); err != nil {
		tmp.Close()
		os.Remove(tmp.Name())
		return "", func() {}, fmt.Errorf("write temp file: %w", err)
	}
	tmp.Close()

	return tmp.Name(), func() { os.Remove(tmp.Name()) }, nil
}

func extractZip(zipPath, destDir string) error {
	r, err := zip.OpenReader(zipPath)
	if err != nil {
		return err
	}
	defer r.Close()

	for _, f := range r.File {
		fPath := filepath.Join(destDir, filepath.Clean(f.Name))
		if !strings.HasPrefix(fPath, filepath.Clean(destDir)+string(os.PathSeparator)) {
			return fmt.Errorf("invalid file path in zip: %s", f.Name)
		}
		if f.FileInfo().IsDir() {
			os.MkdirAll(fPath, 0o755)
			continue
		}
		if err := os.MkdirAll(filepath.Dir(fPath), 0o755); err != nil {
			return err
		}
		out, err := os.Create(fPath)
		if err != nil {
			return err
		}
		rc, err := f.Open()
		if err != nil {
			out.Close()
			return err
		}
		_, err = io.Copy(out, rc) // #nosec G110
		out.Close()
		rc.Close()
		if err != nil {
			return err
		}
	}
	return nil
}

func findInstallerInDir(dir string, names []string) string {
	for _, name := range names {
		candidate := filepath.Join(dir, name)
		if _, err := os.Stat(candidate); err == nil {
			return candidate
		}
	}
	entries, _ := os.ReadDir(dir)
	for _, entry := range entries {
		if entry.IsDir() {
			for _, name := range names {
				candidate := filepath.Join(dir, entry.Name(), name)
				if _, err := os.Stat(candidate); err == nil {
					return candidate
				}
			}
		}
	}
	return ""
}
