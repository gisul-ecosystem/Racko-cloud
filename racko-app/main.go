package main

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/app"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/dialog"
	"fyne.io/fyne/v2/theme"
	"fyne.io/fyne/v2/widget"

	apiclient "github.com/racko-ai/racko-app/api"
	"github.com/racko-ai/racko-app/config"
)

// ─── Globals ──────────────────────────────────────────────────────────────────

var (
	client   *apiclient.Client
	machines []apiclient.Machine
	mainWin  fyne.Window
)

// ─── Entry Point ──────────────────────────────────────────────────────────────

func main() {
	setupLogging()

	cfg, err := config.Load()
	if err != nil {
		showFatalError("Cannot load config: " + err.Error() +
			"\n\nMake sure the Racko Agent is installed and running.")
		return
	}

	agentID, err := config.ReadAgentID()
	if err != nil || agentID == "" {
		showFatalError("Agent is not registered yet.\n\nPlease wait for the Racko Agent service to start, then reopen this app.")
		return
	}

	client = apiclient.New(cfg.PlatformURL, agentID)

	// Load machine list (for VM selector in upload dialog)
	machines, _ = client.ListMachines()

	// ── Build Fyne app ────────────────────────────────────────────────────────
	a := app.NewWithID("ai.racko.app")
	a.SetIcon(resourceRackoIconPng)
	mainWin = a.NewWindow("Racko Shared Files")
	mainWin.Resize(fyne.NewSize(820, 560))
	mainWin.SetMaster()

	mainWin.SetContent(buildMainUI())

	// System tray — keep running when window is closed
	if desk, ok := a.(interface {
		SetSystemTrayMenu(*fyne.Menu)
		SetSystemTrayIcon(fyne.Resource)
	}); ok {
		desk.SetSystemTrayIcon(resourceRackoIconPng)
		desk.SetSystemTrayMenu(fyne.NewMenu("Racko",
			fyne.NewMenuItem("Open", func() { mainWin.Show() }),
			fyne.NewMenuItemSeparator(),
			fyne.NewMenuItem("Quit", func() { a.Quit() }),
		))
		mainWin.SetCloseIntercept(func() { mainWin.Hide() })
	}

	mainWin.ShowAndRun()
}

// ─── Main UI ──────────────────────────────────────────────────────────────────

func buildMainUI() fyne.CanvasObject {
	// ── Header ────────────────────────────────────────────────────────────────
	title := widget.NewLabelWithStyle("Racko Shared Files",
		fyne.TextAlignLeading, fyne.TextStyle{Bold: true})

	uploadBtn := widget.NewButtonWithIcon("Upload & Share", theme.UploadIcon(), func() {
		showUploadDialog()
	})
	uploadBtn.Importance = widget.HighImportance

	refreshBtn := widget.NewButtonWithIcon("Refresh", theme.ViewRefreshIcon(), func() {
		mainWin.SetContent(buildMainUI())
	})

	header := container.NewBorder(nil, nil, nil,
		container.NewHBox(refreshBtn, uploadBtn),
		title,
	)

	// ── Tabs ──────────────────────────────────────────────────────────────────
	tabs := container.NewAppTabs(
		container.NewTabItemWithIcon("Received", theme.DownloadIcon(), buildInboxTab()),
		container.NewTabItemWithIcon("Sent", theme.UploadIcon(), buildOutboxTab()),
	)

	return container.NewBorder(
		container.NewPadded(header),
		nil, nil, nil,
		container.NewPadded(tabs),
	)
}

// ─── Inbox Tab (files shared WITH this machine) ───────────────────────────────

func buildInboxTab() fyne.CanvasObject {
	files, err := client.ListInbox()
	if err != nil {
		return widget.NewLabel("Failed to load received files: " + err.Error())
	}

	if len(files) == 0 {
		return container.NewCenter(
			widget.NewLabel("No files have been shared with this machine yet."),
		)
	}

	// Table headers
	headers := []string{"File", "From", "Permission", "Size", "Actions"}
	table := widget.NewTable(
		func() (int, int) { return len(files) + 1, len(headers) },
		func() fyne.CanvasObject {
			return widget.NewLabel("                              ")
		},
		func(id widget.TableCellID, obj fyne.CanvasObject) {
			label := obj.(*widget.Label)
			if id.Row == 0 {
				label.TextStyle = fyne.TextStyle{Bold: true}
				label.SetText(headers[id.Col])
				return
			}
			label.TextStyle = fyne.TextStyle{}
			f := files[id.Row-1]
			switch id.Col {
			case 0:
				label.SetText(f.FileName)
			case 1:
				label.SetText(f.SourceMachineName)
			case 2:
				label.SetText(permissionLabel(f.Permission))
			case 3:
				label.SetText(formatSize(f.SizeBytes))
			case 4:
				label.SetText("[Download]")
			}
		},
	)

	table.SetColumnWidth(0, 240)
	table.SetColumnWidth(1, 140)
	table.SetColumnWidth(2, 120)
	table.SetColumnWidth(3, 90)
	table.SetColumnWidth(4, 120)

	table.OnSelected = func(id widget.TableCellID) {
		if id.Row == 0 || id.Col != 4 {
			return
		}
		f := files[id.Row-1]
		table.UnselectAll()
		showDownloadDialog(f)
	}

	return table
}

// ─── Outbox Tab (files uploaded BY this machine) ─────────────────────────────

func buildOutboxTab() fyne.CanvasObject {
	files, err := client.ListOutbox()
	if err != nil {
		return widget.NewLabel("Failed to load uploaded files: " + err.Error())
	}

	if len(files) == 0 {
		return container.NewCenter(
			widget.NewLabel("You have not shared any files yet. Use 'Upload & Share' to get started."),
		)
	}

	headers := []string{"File", "Permission", "Shared With", "Size", "Actions"}
	table := widget.NewTable(
		func() (int, int) { return len(files) + 1, len(headers) },
		func() fyne.CanvasObject {
			return widget.NewLabel("                              ")
		},
		func(id widget.TableCellID, obj fyne.CanvasObject) {
			label := obj.(*widget.Label)
			if id.Row == 0 {
				label.TextStyle = fyne.TextStyle{Bold: true}
				label.SetText(headers[id.Col])
				return
			}
			label.TextStyle = fyne.TextStyle{}
			f := files[id.Row-1]
			switch id.Col {
			case 0:
				label.SetText(f.FileName)
			case 1:
				label.SetText(permissionLabel(f.Permission))
			case 2:
				label.SetText(fmt.Sprintf("%d VM(s)", len(f.SharedWithMachineIDs)))
			case 3:
				label.SetText(formatSize(f.SizeBytes))
			case 4:
				label.SetText("[Manage | Delete]")
			}
		},
	)

	table.SetColumnWidth(0, 240)
	table.SetColumnWidth(1, 120)
	table.SetColumnWidth(2, 100)
	table.SetColumnWidth(3, 90)
	table.SetColumnWidth(4, 160)

	table.OnSelected = func(id widget.TableCellID) {
		if id.Row == 0 || id.Col != 4 {
			return
		}
		f := files[id.Row-1]
		table.UnselectAll()
		showManageDialog(f)
	}

	return table
}

// ─── Upload Dialog ────────────────────────────────────────────────────────────

func showUploadDialog() {
	// File picker
	selectedPath := ""
	fileLabel := widget.NewLabel("No file selected")
	fileLabel.Wrapping = fyne.TextTruncate

	pickBtn := widget.NewButtonWithIcon("Browse...", theme.FolderOpenIcon(), func() {
		dialog.ShowFileOpen(func(uc fyne.URIReadCloser, err error) {
			if err != nil || uc == nil {
				return
			}
			uc.Close()
			selectedPath = uc.URI().Path()
			fileLabel.SetText(filepath.Base(selectedPath))
		}, mainWin)
	})

	// Permission selector
	permSelect := widget.NewSelect(
		[]string{"Read Only", "Read & Write", "Full Control"},
		nil,
	)
	permSelect.SetSelected("Read Only")

	// VM selector (checkboxes)
	vmChecks := make([]*widget.Check, len(machines))
	vmList := container.NewVBox()
	for i, m := range machines {
		check := widget.NewCheck(m.Name, nil)
		vmChecks[i] = check
		vmList.Add(check)
	}

	if len(machines) == 0 {
		vmList.Add(widget.NewLabel("No other VMs found."))
	}

	vmScroll := container.NewVScroll(vmList)
	vmScroll.SetMinSize(fyne.NewSize(300, 160))

	// Form
	form := &widget.Form{
		Items: []*widget.FormItem{
			{Text: "File", Widget: container.NewBorder(nil, nil, nil, pickBtn, fileLabel)},
			{Text: "Permission", Widget: permSelect},
			{Text: "Share with VMs", Widget: vmScroll},
		},
	}

	dlg := dialog.NewCustomConfirm(
		"Upload & Share File",
		"Upload",
		"Cancel",
		container.NewPadded(form),
		func(confirmed bool) {
			if !confirmed || selectedPath == "" {
				return
			}

			// Collect selected machine IDs
			var selectedIDs []string
			for i, check := range vmChecks {
				if check != nil && check.Checked {
					selectedIDs = append(selectedIDs, machines[i].ID)
				}
			}
			if len(selectedIDs) == 0 {
				dialog.ShowError(fmt.Errorf("please select at least one VM to share with"), mainWin)
				return
			}

			// Map UI permission to API value
			perm := uiPermToAPI(permSelect.Selected)

			// Show progress
			prog := dialog.NewProgressInfinite("Uploading...", "Uploading file to Racko storage", mainWin)
			prog.Show()

			go func() {
				_, err := client.UploadFile(selectedPath, perm, selectedIDs)
				prog.Hide()
				if err != nil {
					dialog.ShowError(fmt.Errorf("upload failed: %w", err), mainWin)
					return
				}
				dialog.ShowInformation("Success",
					fmt.Sprintf("'%s' shared with %d VM(s).", filepath.Base(selectedPath), len(selectedIDs)),
					mainWin)
				// Refresh UI
				mainWin.SetContent(buildMainUI())
			}()
		},
		mainWin,
	)
	dlg.Resize(fyne.NewSize(480, 420))
	dlg.Show()
}

// ─── Download Dialog ──────────────────────────────────────────────────────────

func showDownloadDialog(f apiclient.SharedFile) {
	info := fmt.Sprintf(
		"File: %s\nFrom: %s\nPermission: %s\nSize: %s",
		f.FileName,
		f.SourceMachineName,
		permissionLabel(f.Permission),
		formatSize(f.SizeBytes),
	)

	dialog.ShowCustomConfirm(
		"Download File",
		"Download",
		"Cancel",
		widget.NewLabel(info),
		func(confirmed bool) {
			if !confirmed {
				return
			}
			// Default to Downloads folder
			destDir := downloadsDir()

			prog := dialog.NewProgressInfinite("Downloading...", "Downloading file from Racko storage", mainWin)
			prog.Show()

			go func() {
				savedPath, err := client.DownloadFile(f.ID, f.FileName, destDir)
				prog.Hide()
				if err != nil {
					dialog.ShowError(fmt.Errorf("download failed: %w", err), mainWin)
					return
				}
				dialog.ShowInformation("Downloaded",
					fmt.Sprintf("Saved to:\n%s", savedPath),
					mainWin)
			}()
		},
		mainWin,
	)
}

// ─── Manage Dialog (edit permission / delete) ─────────────────────────────────

func showManageDialog(f apiclient.SharedFile) {
	permSelect := widget.NewSelect(
		[]string{"Read Only", "Read & Write", "Full Control"},
		nil,
	)
	// Set current permission
	switch f.Permission {
	case "read":
		permSelect.SetSelected("Read Only")
	case "read-write":
		permSelect.SetSelected("Read & Write")
	default:
		permSelect.SetSelected("Full Control")
	}

	// VM checkboxes
	vmChecks := make([]*widget.Check, len(machines))
	vmList := container.NewVBox()
	for i, m := range machines {
		checked := false
		for _, id := range f.SharedWithMachineIDs {
			if id == m.ID {
				checked = true
				break
			}
		}
		check := widget.NewCheck(m.Name, nil)
		check.SetChecked(checked)
		vmChecks[i] = check
		vmList.Add(check)
	}

	vmScroll := container.NewVScroll(container.NewVBox(vmList))
	vmScroll.SetMinSize(fyne.NewSize(300, 140))

	deleteBtn := widget.NewButtonWithIcon("Delete File", theme.DeleteIcon(), func() {
		dialog.ShowConfirm("Delete File",
			fmt.Sprintf("Permanently delete '%s'? This cannot be undone.", f.FileName),
			func(ok bool) {
				if !ok {
					return
				}
				if err := client.DeleteFile(f.ID); err != nil {
					dialog.ShowError(err, mainWin)
					return
				}
				dialog.ShowInformation("Deleted", "File deleted successfully.", mainWin)
				mainWin.SetContent(buildMainUI())
			}, mainWin)
	})
	deleteBtn.Importance = widget.DangerImportance

	form := &widget.Form{
		Items: []*widget.FormItem{
			{Text: "File", Widget: widget.NewLabel(f.FileName)},
			{Text: "Permission", Widget: permSelect},
			{Text: "Share with VMs", Widget: vmScroll},
			{Text: "", Widget: deleteBtn},
		},
	}

	dlg := dialog.NewCustomConfirm(
		"Manage Shared File",
		"Save Changes",
		"Cancel",
		container.NewPadded(form),
		func(confirmed bool) {
			if !confirmed {
				return
			}
			var selectedIDs []string
			for i, check := range vmChecks {
				if check != nil && check.Checked {
					selectedIDs = append(selectedIDs, machines[i].ID)
				}
			}
			perm := uiPermToAPI(permSelect.Selected)
			if err := client.UpdateShare(f.ID, perm, selectedIDs); err != nil {
				dialog.ShowError(err, mainWin)
				return
			}
			dialog.ShowInformation("Saved", "Sharing settings updated.", mainWin)
			mainWin.SetContent(buildMainUI())
		},
		mainWin,
	)
	dlg.Resize(fyne.NewSize(460, 400))
	dlg.Show()
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

func permissionLabel(p string) string {
	switch p {
	case "read":
		return "Read Only"
	case "read-write":
		return "Read & Write"
	case "full":
		return "Full Control"
	default:
		return p
	}
}

func uiPermToAPI(ui string) string {
	switch ui {
	case "Read & Write":
		return "read-write"
	case "Full Control":
		return "full"
	default:
		return "read"
	}
}

func formatSize(b int64) string {
	switch {
	case b >= 1<<30:
		return fmt.Sprintf("%.1f GB", float64(b)/(1<<30))
	case b >= 1<<20:
		return fmt.Sprintf("%.1f MB", float64(b)/(1<<20))
	case b >= 1<<10:
		return fmt.Sprintf("%.1f KB", float64(b)/(1<<10))
	default:
		return fmt.Sprintf("%d B", b)
	}
}

func downloadsDir() string {
	home, _ := os.UserHomeDir()
	dir := filepath.Join(home, "Downloads")
	os.MkdirAll(dir, 0o755)
	return dir
}

func setupLogging() {
	cacheDir := config.CacheDir()
	os.MkdirAll(cacheDir, 0o755)
	logPath := filepath.Join(cacheDir, "racko-app.log")
	f, err := os.OpenFile(logPath, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
	if err != nil {
		return
	}
	log.SetOutput(f)
	log.SetFlags(log.Ldate | log.Ltime)
}

func showFatalError(msg string) {
	a := app.New()
	w := a.NewWindow("Racko — Error")
	w.SetContent(container.NewPadded(widget.NewLabel(msg)))
	w.Resize(fyne.NewSize(480, 160))
	w.ShowAndRun()
}

// ─── Placeholder icon resource ─────────────────────────────────────────────────
// Replace with go generate / fyne bundle in production for a real PNG icon.

var resourceRackoIconPng = &fyne.StaticResource{
	StaticName:    "racko-icon.png",
	StaticContent: defaultIconBytes(),
}

func defaultIconBytes() []byte {
	// 1×1 transparent PNG — replace with real icon via: fyne bundle -o bundled.go icon.png
	return []byte{
		0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
		0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
		0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
		0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x62, 0x00, 0x00, 0x00, 0x02,
		0x00, 0x01, 0xe2, 0x21, 0xbc, 0x33, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45,
		0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
	}
}

// ─── Platform endpoint for machine list (add to core-api agentRouter) ─────────
// See shared-files.routes.ts — GET /api/v1/agent/machines-for-app
// Returns all non-deleted machines for this agent's admin.
// The handler is in shared-files.controller.ts: agentListMachines()
// strings import is used for VM name display only
var _ = strings.Join
