//go:build windows

package install

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"syscall"
	"unsafe"

	"github.com/racko-ai/agent/config"
	"github.com/racko-ai/agent/store"
	"golang.org/x/sys/windows"
	"golang.org/x/sys/windows/svc"
	"golang.org/x/sys/windows/svc/mgr"
)

const serviceName = "RackoAgent"
const serviceDisplay = "Racko Agent"
const serviceDesc = "Racko software management agent"

// ─── Win32 API bindings for the simple installer dialog ──────────────────────

var (
	user32   = syscall.NewLazyDLL("user32.dll")
	kernel32 = syscall.NewLazyDLL("kernel32.dll")

	procMessageBoxW       = user32.NewProc("MessageBoxW")
	procCreateWindowExW   = user32.NewProc("CreateWindowExW")
	procDefWindowProcW    = user32.NewProc("DefWindowProcW")
	procDispatchMessageW  = user32.NewProc("DispatchMessageW")
	procGetMessageW       = user32.NewProc("GetMessageW")
	procPostQuitMessage   = user32.NewProc("PostQuitMessage")
	procRegisterClassExW  = user32.NewProc("RegisterClassExW")
	procTranslateMessage  = user32.NewProc("TranslateMessage")
	procShowWindow        = user32.NewProc("ShowWindow")
	procUpdateWindow      = user32.NewProc("UpdateWindow")
	procGetDlgItemTextW   = user32.NewProc("GetDlgItemTextW")
	procSetWindowTextW    = user32.NewProc("SetWindowTextW")
	procDestroyWindow     = user32.NewProc("DestroyWindow")
	procGetModuleHandleW  = kernel32.NewProc("GetModuleHandleW")
)

const (
	WS_OVERLAPPED   = 0x00000000
	WS_CAPTION      = 0x00C00000
	WS_SYSMENU      = 0x00080000
	WS_VISIBLE      = 0x10000000
	WS_CHILD        = 0x40000000
	WS_TABSTOP      = 0x00010000
	WS_BORDER       = 0x00800000
	ES_AUTOHSCROLL  = 0x0080
	BS_PUSHBUTTON   = 0x00000000
	BS_DEFPUSHBUTTON = 0x00000001
	WM_DESTROY      = 0x0002
	WM_COMMAND      = 0x0111
	WM_CLOSE        = 0x0010
	SW_SHOW         = 5
	MB_OK           = 0x00000000
	MB_ICONERROR    = 0x00000010
	MB_ICONINFO     = 0x00000040
	IDC_TOKEN_INPUT = 101
	IDC_INSTALL_BTN = 102
	CW_USEDEFAULT   = 0x80000000
)

type WNDCLASSEX struct {
	CbSize        uint32
	Style         uint32
	LpfnWndProc   uintptr
	CbClsExtra    int32
	CbWndExtra    int32
	HInstance     uintptr
	HIcon         uintptr
	HCursor       uintptr
	HbrBackground uintptr
	LpszMenuName  *uint16
	LpszClassName *uint16
	HIconSm       uintptr
}

type MSG struct {
	Hwnd    uintptr
	Message uint32
	WParam  uintptr
	LParam  uintptr
	Time    uint32
	Pt      struct{ X, Y int32 }
}

var (
	hwndMain   uintptr
	hwndInput  uintptr
	hwndBtn    uintptr
	installerCfg *config.Config
)

func messageBox(hwnd uintptr, text, caption string, flags uint32) {
	t, _ := syscall.UTF16PtrFromString(text)
	c, _ := syscall.UTF16PtrFromString(caption)
	procMessageBoxW.Call(hwnd, uintptr(unsafe.Pointer(t)), uintptr(unsafe.Pointer(c)), uintptr(flags))
}

func wndProc(hwnd, msg, wParam, lParam uintptr) uintptr {
	switch msg {
	case WM_COMMAND:
		if wParam&0xFFFF == IDC_INSTALL_BTN {
			buf := make([]uint16, 512)
			procGetDlgItemTextW.Call(hwnd, IDC_TOKEN_INPUT, uintptr(unsafe.Pointer(&buf[0])), 512)
			token := syscall.UTF16ToString(buf)
			token = strings.TrimSpace(token)

			if token == "" {
				messageBox(hwnd, "Please paste your account token before installing.", "Racko Agent", MB_OK|MB_ICONERROR)
				return 0
			}

			// Set button text to installing...
			btnText, _ := syscall.UTF16PtrFromString("Installing...")
			procSetWindowTextW.Call(hwndBtn, uintptr(unsafe.Pointer(btnText)))

			go func() {
				err := performInstall(token)
				if err != nil {
					messageBox(hwnd, fmt.Sprintf("Installation failed:\n%v", err), "Racko Agent", MB_OK|MB_ICONERROR)
					btnText, _ := syscall.UTF16PtrFromString("Install")
					procSetWindowTextW.Call(hwndBtn, uintptr(unsafe.Pointer(btnText)))
					return
				}
				messageBox(hwnd, "Racko Agent installed successfully!\nThe agent is now running in the background.", "Racko Agent", MB_OK|MB_ICONINFO)
				procDestroyWindow.Call(hwnd)
			}()
		}
	case WM_CLOSE:
		procPostQuitMessage.Call(0)
	case WM_DESTROY:
		procPostQuitMessage.Call(0)
	}
	ret, _, _ := procDefWindowProcW.Call(hwnd, msg, wParam, lParam)
	return ret
}

// RunInstallerGUI shows the simple installer window.
func RunInstallerGUI(cfg *config.Config) {
	installerCfg = cfg

	hInstance, _, _ := procGetModuleHandleW.Call(0)
	className, _ := syscall.UTF16PtrFromString("RackoInstaller")

	wc := WNDCLASSEX{
		LpfnWndProc:   syscall.NewCallback(wndProc),
		HInstance:     hInstance,
		LpszClassName: className,
		HbrBackground: 6, // COLOR_BTNFACE + 1
	}
	wc.CbSize = uint32(unsafe.Sizeof(wc))
	procRegisterClassExW.Call(uintptr(unsafe.Pointer(&wc)))

	title, _ := syscall.UTF16PtrFromString("Racko Agent Setup")
	hwndMain, _, _ = procCreateWindowExW.Call(
		0,
		uintptr(unsafe.Pointer(className)),
		uintptr(unsafe.Pointer(title)),
		WS_OVERLAPPED|WS_CAPTION|WS_SYSMENU|WS_VISIBLE,
		uintptr(CW_USEDEFAULT), uintptr(CW_USEDEFAULT),
		400, 180,
		0, 0, hInstance, 0,
	)

	// Label
	labelClass, _ := syscall.UTF16PtrFromString("STATIC")
	labelText, _ := syscall.UTF16PtrFromString("Paste your account token:")
	procCreateWindowExW.Call(
		0, uintptr(unsafe.Pointer(labelClass)), uintptr(unsafe.Pointer(labelText)),
		WS_CHILD|WS_VISIBLE,
		20, 20, 340, 20,
		hwndMain, 0, hInstance, 0,
	)

	// Token input
	editClass, _ := syscall.UTF16PtrFromString("EDIT")
	editPlaceholder, _ := syscall.UTF16PtrFromString("")
	hwndInput, _, _ = procCreateWindowExW.Call(
		WS_BORDER,
		uintptr(unsafe.Pointer(editClass)),
		uintptr(unsafe.Pointer(editPlaceholder)),
		WS_CHILD|WS_VISIBLE|WS_TABSTOP|ES_AUTOHSCROLL,
		20, 48, 340, 24,
		hwndMain, IDC_TOKEN_INPUT, hInstance, 0,
	)

	// Install button
	btnClass, _ := syscall.UTF16PtrFromString("BUTTON")
	btnText, _ := syscall.UTF16PtrFromString("Install")
	hwndBtn, _, _ = procCreateWindowExW.Call(
		0,
		uintptr(unsafe.Pointer(btnClass)),
		uintptr(unsafe.Pointer(btnText)),
		WS_CHILD|WS_VISIBLE|WS_TABSTOP|BS_DEFPUSHBUTTON,
		130, 90, 120, 30,
		hwndMain, IDC_INSTALL_BTN, hInstance, 0,
	)

	procShowWindow.Call(hwndMain, SW_SHOW)
	procUpdateWindow.Call(hwndMain)

	// Message loop
	var msg MSG
	for {
		ret, _, _ := procGetMessageW.Call(uintptr(unsafe.Pointer(&msg)), 0, 0, 0)
		if ret == 0 {
			break
		}
		procTranslateMessage.Call(uintptr(unsafe.Pointer(&msg)))
		procDispatchMessageW.Call(uintptr(unsafe.Pointer(&msg)))
	}
}

// performInstall writes config, copies binary, registers service.
func performInstall(token string) error {
	installDir := filepath.Join(os.Getenv("ProgramData"), "racko-agent")
	if err := os.MkdirAll(installDir, 0o755); err != nil {
		return fmt.Errorf("create install dir: %w", err)
	}

	// Write config.json with the token the user entered
	cfgData := fmt.Sprintf(
		`{"PLATFORM_URL":%q,"ACCOUNT_TOKEN":%q}`,
		installerCfg.PlatformURL, token,
	)
	if err := os.WriteFile(filepath.Join(installDir, "config.json"), []byte(cfgData), 0o600); err != nil {
		return fmt.Errorf("write config: %w", err)
	}

	// Also persist token to agent.json so register flow picks it up
	if err := store.WriteAccountToken(token); err != nil {
		log.Printf("[install] Warning: could not persist token: %v", err)
	}

	// Copy binary to install dir
	exe, err := os.Executable()
	if err != nil {
		return fmt.Errorf("get executable: %w", err)
	}
	destExe := filepath.Join(installDir, "racko-agent.exe")
	if !strings.EqualFold(filepath.Clean(exe), filepath.Clean(destExe)) {
		data, err := os.ReadFile(exe)
		if err != nil {
			return fmt.Errorf("read binary: %w", err)
		}
		if err := os.WriteFile(destExe, data, 0o755); err != nil {
			return fmt.Errorf("write binary: %w", err)
		}
	}

	// Register + start Windows service
	m, err := mgr.Connect()
	if err != nil {
		return fmt.Errorf("service manager: %w", err)
	}
	defer m.Disconnect()

	existing, err := m.OpenService(serviceName)
	if err == nil {
		existing.Control(svc.Stop)
		existing.Delete()
		existing.Close()
	}

	s, err := m.CreateService(serviceName, destExe, mgr.Config{
		StartType:   mgr.StartAutomatic,
		DisplayName: serviceDisplay,
		Description: serviceDesc,
	})
	if err != nil {
		return fmt.Errorf("create service: %w", err)
	}
	defer s.Close()

	if err := s.Start(); err != nil {
		return fmt.Errorf("start service: %w", err)
	}

	log.Printf("[install] Service installed and started from %s", destExe)
	return nil
}

// ShouldSelfInstall returns true when not running as a Windows service.
func ShouldSelfInstall() bool {
	isService, err := svc.IsWindowsService()
	if err != nil {
		return false
	}
	return !isService
}

// ElevateIfNeeded re-launches with admin rights if not already elevated.
func ElevateIfNeeded() {
	if windows.GetCurrentProcessToken().IsElevated() {
		return
	}
	exe, _ := os.Executable()
	verb, _ := syscall.UTF16PtrFromString("runas")
	file, _ := syscall.UTF16PtrFromString(exe)
	err := windows.ShellExecute(0, verb, file, nil, nil, syscall.SW_NORMAL)
	if err != nil {
		log.Printf("[install] Failed to elevate: %v", err)
	}
	os.Exit(0)
}

// Uninstall stops and removes the Windows service.
func Uninstall() error {
	m, err := mgr.Connect()
	if err != nil {
		return err
	}
	defer m.Disconnect()
	s, err := m.OpenService(serviceName)
	if err != nil {
		return err
	}
	defer s.Close()
	s.Control(svc.Stop)
	return s.Delete()
}
