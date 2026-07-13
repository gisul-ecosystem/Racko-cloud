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

var (
	modWtsapi32                  = windows.NewLazySystemDLL("wtsapi32.dll")
	modUserenv                   = windows.NewLazySystemDLL("userenv.dll")
	procWTSGetActiveConsoleSessionId = windows.NewLazySystemDLL("kernel32.dll").NewProc("WTSGetActiveConsoleSessionId")
	procWTSQueryUserToken        = modWtsapi32.NewProc("WTSQueryUserToken")
	procCreateEnvironmentBlock   = modUserenv.NewProc("CreateEnvironmentBlock")
	procDestroyEnvironmentBlock  = modUserenv.NewProc("DestroyEnvironmentBlock")
)

func wtsGetActiveConsoleSessionId() uint32 {
	ret, _, _ := procWTSGetActiveConsoleSessionId.Call()
	return uint32(ret)
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

// ─── Active-user process launcher ─────────────────────────────────────────────

// runAsActiveUser launches name+args in the active console user's session using
// CreateProcessAsUser. This is the industry-standard RMM pattern for running
// installers from a LocalSystem service — the process gets the user's desktop,
// profile, PATH, and Start Menu, exactly as if the user ran it themselves.
//
// stdout+stderr are captured via a temp file and returned as a string.
// Falls back to runCmd (Session 0 / LocalSystem) if no active user session exists
// (e.g. headless server with no one logged in).
func runAsActiveUser(name string, args ...string) (string, error) {
	sessionID := wtsGetActiveConsoleSessionId()
	const noSession = ^uint32(0) // 0xFFFFFFFF means no active session
	if sessionID == noSession {
		log.Printf("[runAsUser] No active console session — falling back to LocalSystem for: %s", name)
		return runCmd(name, args...)
	}
	log.Printf("[runAsUser] Active console session ID: %d", sessionID)

	// Get the user token for that session
	userToken, err := wtsQueryUserToken(sessionID)
	if err != nil {
		log.Printf("[runAsUser] WTSQueryUserToken failed (%v) — falling back to LocalSystem", err)
		return runCmd(name, args...)
	}
	defer userToken.Close()

	// Duplicate to a primary token (required for CreateProcessAsUser)
	var primaryToken windows.Token
	err = windows.DuplicateTokenEx(
		userToken,
		windows.TOKEN_ALL_ACCESS,
		nil,
		windows.SecurityImpersonation,
		windows.TokenPrimary,
		&primaryToken,
	)
	if err != nil {
		log.Printf("[runAsUser] DuplicateTokenEx failed (%v) — falling back to LocalSystem", err)
		return runCmd(name, args...)
	}
	defer primaryToken.Close()

	// Build environment block from the user token so PATH, APPDATA etc. are correct
	envBlock, err := createEnvironmentBlock(primaryToken)
	if err != nil {
		log.Printf("[runAsUser] CreateEnvironmentBlock failed (%v) — proceeding without user env", err)
		envBlock = 0
	} else {
		defer destroyEnvironmentBlock(envBlock)
	}

	// Capture output via a temp file — pipes require additional handles inheritance
	// setup that is fragile across sessions; a temp file is simpler and reliable.
	outFile, err := os.CreateTemp("", "racko_install_out_*.txt")
	if err != nil {
		log.Printf("[runAsUser] Cannot create temp output file (%v) — falling back to LocalSystem", err)
		return runCmd(name, args...)
	}
	outPath := outFile.Name()
	outFile.Close()
	defer os.Remove(outPath)

	// Build command line string (CreateProcess takes a single string)
	cmdLine := buildCmdLine(name, args...)
	log.Printf("[runAsUser] Launching in user session %d: %s", sessionID, cmdLine)

	// Wrap in cmd.exe so we can redirect stdout/stderr to the temp file
	wrappedCmd := fmt.Sprintf(`cmd.exe /C %s > "%s" 2>&1`, cmdLine, outPath)
	wrappedCmdLine, err := windows.UTF16PtrFromString(wrappedCmd)
	if err != nil {
		return runCmd(name, args...)
	}

	// Desktop name — must be the interactive desktop
	desktop, _ := windows.UTF16PtrFromString("winsta0\\default")

	si := windows.StartupInfo{
		Cb:          uint32(unsafe.Sizeof(windows.StartupInfo{})),
		Desktop:     desktop,
		Flags:       windows.STARTF_USESHOWWINDOW,
		ShowWindow:  0, // SW_HIDE
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
		nil,           // lpApplicationName (nil = use command line)
		wrappedCmdLine,
		nil,           // process security attrs
		nil,           // thread security attrs
		false,         // inherit handles
		creationFlags,
		envPtr,
		nil,           // current directory (inherit)
		&si,
		&pi,
	)
	if err != nil {
		log.Printf("[runAsUser] CreateProcessAsUser failed (%v) — falling back to LocalSystem", err)
		return runCmd(name, args...)
	}
	defer windows.CloseHandle(pi.Thread)
	defer windows.CloseHandle(pi.Process)

	log.Printf("[runAsUser] PID=%d started in session %d: %s", pi.ProcessId, sessionID, name)

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
	_, err = windows.WaitForSingleObject(pi.Process, windows.INFINITE)
	close(doneCh)

	elapsed := time.Since(startTime).Round(time.Millisecond)

	// Get exit code
	var exitCode uint32
	windows.GetExitCodeProcess(pi.Process, &exitCode)

	// Read captured output
	outBytes, readErr := os.ReadFile(outPath)
	output := ""
	if readErr == nil {
		output = string(outBytes)
	}
	combined := fmt.Sprintf("cmd: %s\nstdout+stderr:\n%s", cmdLine, output)

	if exitCode != 0 {
		log.Printf("[runAsUser] FAILED: %s (PID=%d) exitCode=%d elapsed=%s", name, pi.ProcessId, exitCode, elapsed)
		log.Printf("[runAsUser] output: %s", output)

		// Check already-installed signals before treating as failure
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
// Falls back to choco if winget is unavailable.
func runWinget(pkg SoftwarePackage) (string, error) {
	wingetID := pkg.WingetID
	if wingetID == "" {
		wingetID = pkg.Name
	}

	wingetPath, err := exec.LookPath("winget")
	if err != nil {
		// Also check the known install location
		candidate := `C:\Users\` // winget is per-user; check common system location
		_ = candidate
		wingetPath = `C:\Program Files\WindowsApps\Microsoft.DesktopAppInstaller_8wekyb3d8bbwe\winget.exe`
		if _, statErr := os.Stat(wingetPath); statErr != nil {
			log.Printf("[winget] winget not found — falling back to choco for %s", pkg.Name)
			if pkg.ChocoName != "" || pkg.Name != "" {
				return runChoco(pkg)
			}
			return "", fmt.Errorf("winget not found and no choco fallback available")
		}
	}
	log.Printf("[winget] Found winget at: %s", wingetPath)

	args := []string{"install", "--id", wingetID, "-e",
		"--accept-source-agreements", "--accept-package-agreements", "--silent", "--scope", "machine"}
	if pkg.InstallArgs != "" {
		args = append(args, strings.Fields(pkg.InstallArgs)...)
	}

	log.Printf("[winget] Running in active user session: winget %v", args)
	// Use user session — winget needs interactive desktop context
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

// runMSI downloads and installs a .msi file.
func runMSI(pkg SoftwarePackage) (string, error) {
	path, cleanup, err := downloadFile(pkg.FileURL, pkg.FileName)
	if err != nil {
		return "", fmt.Errorf("download msi: %w", err)
	}
	defer cleanup()

	args := []string{"/i", path, "/quiet", "/norestart"}
	if pkg.InstallArgs != "" {
		args = append(args, strings.Fields(pkg.InstallArgs)...)
	}
	return runCmdWithTimeout(directInstallTimeout, "msiexec", args...)
}

// runEXE downloads and runs a silent .exe installer.
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
	return runCmdWithTimeout(directInstallTimeout, path, args...)
}

// runZIP downloads, extracts, and runs the installer.
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
	return runCmdWithTimeout(directInstallTimeout, installerPath, args...)
}

// runPowerShell downloads and runs a .ps1 script.
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
	return runCmdWithTimeout(directInstallTimeout, "powershell.exe", args...)
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
