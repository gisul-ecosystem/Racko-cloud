; Racko Agent Setup — Inno Setup Script
; Produces: racko-agent-setup.exe
; Requires: Inno Setup 6+ (https://jrsoftware.org/isinfo.php)
;
; Pre-build checklist:
;   1. Build Go agent:   make build-windows          (outputs dist\racko-agent.exe)
;   2. Build racko-app:  dotnet publish ..\racko-app\RackoApp.csproj
;                          -c Release -r win-x64 --self-contained true
;                          -o ..\dist\racko-app\
;   3. Run Inno Setup compiler: iscc racko-agent-setup.iss
;
; WebView2 Runtime is installed at runtime by the installer itself — no file
; to download manually. The installer checks the registry; if already present
; (Win10/11/Server with Edge) it skips the download entirely.

#define MyAppName      "Racko Agent"
#define MyAppVersion   "1.0.0"
#define MyAppPublisher "Racko.ai"
#define MyAppURL       "https://racko.ai"
#define MyServiceName  "RackoAgent"
#define MyInstallDir   "{commonappdata}\racko-agent"
#define MyBinaryName   "racko-agent.exe"
#define MyAppExe       "racko-app.exe"
#ifndef PlatformURL
  #define PlatformURL "http://localhost:8000"
#endif

[Setup]
AppId={{B3F2A1C0-4D5E-4F6A-8B9C-1D2E3F4A5B6C}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
DefaultDirName={#MyInstallDir}
DisableDirPage=yes
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
OutputDir=..\dist
OutputBaseFilename=racko-agent-setup
Compression=lzma2
SolidCompression=yes
PrivilegesRequired=admin
WizardStyle=modern
WizardSizePercent=120

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
; Go agent service binary
Source: "..\dist\{#MyBinaryName}"; DestDir: "{#MyInstallDir}"; Flags: ignoreversion

; racko-app — full folder publish so WebView2Loader.dll lands on disk next to the exe.
; Built by CI: dotnet publish -c Release -r win-x64 --self-contained true -o dist\racko-app\
; The wildcard copies all DLLs including WebView2Loader.dll and the .NET runtime.
Source: "..\dist\racko-app\{#MyAppExe}"; DestDir: "{#MyInstallDir}\racko-app"; Flags: ignoreversion
Source: "..\dist\racko-app\*"; DestDir: "{#MyInstallDir}\racko-app"; \
  Flags: ignoreversion recursesubdirs createallsubdirs; Excludes: "{#MyAppExe}"

[Code]
var
  TokenPage: TWizardPage;
  TokenEdit: TEdit;
  TokenLabel: TLabel;
  TokenHint: TLabel;

// ── WebView2 registry check ───────────────────────────────────────────────────
// Returns true if WebView2 Runtime is already installed at the system level.
// Checks the same registry key the WebView2 loader uses internally.
// Source: https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/distribution
function IsWebView2Installed(): Boolean;
var
  Version: String;
begin
  // 64-bit system-level install (most common — Edge/Win11 ships this)
  if RegQueryStringValue(HKLM,
    'SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}',
    'pv', Version) then
  begin
    Result := (Version <> '') and (Version <> '0.0.0.0');
    Exit;
  end;
  // 32-bit or per-user install fallback
  if RegQueryStringValue(HKCU,
    'SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}',
    'pv', Version) then
  begin
    Result := (Version <> '') and (Version <> '0.0.0.0');
    Exit;
  end;
  Result := False;
end;

// ── Detect old install — show instructions and block ─────────────────────────
function InitializeSetup(): Boolean;
var
  ServiceKey: String;
  OldBinaryExists: Boolean;
  ServiceExists: Boolean;
  Msg: String;
begin
  Result := True;

  OldBinaryExists := FileExists(ExpandConstant('{commonappdata}\racko-agent\racko-agent.exe'));
  ServiceKey := 'SYSTEM\CurrentControlSet\Services\RackoAgent';
  ServiceExists := RegKeyExists(HKLM, ServiceKey);

  if OldBinaryExists or ServiceExists then
  begin
    Msg :=
      'An existing Racko Agent installation was found.' + #13#10 +
      'You must remove it completely before installing the new version.' + #13#10 + #13#10 +
      'Follow BOTH steps below, then run this installer again:' + #13#10 + #13#10 +
      'Step 1 — Uninstall from Control Panel:' + #13#10 +
      '  Control Panel > Programs > Uninstall a Program' + #13#10 +
      '  Find "Racko Agent" > Click Uninstall' + #13#10 + #13#10 +
      'Step 2 — Open PowerShell as Administrator and run:' + #13#10 +
      '  sc.exe stop RackoAgent' + #13#10 +
      '  sc.exe delete RackoAgent' + #13#10 +
      '  Remove-Item "C:\ProgramData\racko-agent" -Recurse -Force' + #13#10 + #13#10 +
      'After both steps, run this installer again.';

    MsgBox(Msg, mbError, MB_OK);
    Result := False;
  end;
end;

// ── Custom page: token entry ──────────────────────────────────────────────────
procedure InitializeWizard;
begin
  TokenPage := CreateCustomPage(wpWelcome, 'Account Token', 'Enter your Racko account token');

  TokenLabel := TLabel.Create(WizardForm);
  TokenLabel.Parent := TokenPage.Surface;
  TokenLabel.Left := 0;
  TokenLabel.Top := 8;
  TokenLabel.Width := TokenPage.SurfaceWidth;
  TokenLabel.Caption := 'Paste your account token below.';
  TokenLabel.Font.Size := 9;

  TokenEdit := TEdit.Create(WizardForm);
  TokenEdit.Parent := TokenPage.Surface;
  TokenEdit.Left := 0;
  TokenEdit.Top := 32;
  TokenEdit.Width := TokenPage.SurfaceWidth;
  TokenEdit.Height := 24;
  TokenEdit.Font.Size := 9;
  TokenEdit.PasswordChar := #0;

  TokenHint := TLabel.Create(WizardForm);
  TokenHint.Parent := TokenPage.Surface;
  TokenHint.Left := 0;
  TokenHint.Top := 64;
  TokenHint.Width := TokenPage.SurfaceWidth;
  TokenHint.Caption := 'You can find your token in the Racko portal under Machine Manager > Setup Wizard.';
  TokenHint.Font.Size := 8;
  TokenHint.Font.Color := $666666;
  TokenHint.WordWrap := True;
end;

// ── Validate token before Next ────────────────────────────────────────────────
function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;
  if CurPageID = TokenPage.ID then
  begin
    if Trim(TokenEdit.Text) = '' then
    begin
      MsgBox('Please paste your account token before continuing.', mbError, MB_OK);
      Result := False;
      WizardForm.ActiveControl := TokenEdit;
    end;
  end;
end;

// ── Write config.json and register service ────────────────────────────────────
procedure CurStepChanged(CurStep: TSetupStep);
var
  ConfigPath: String;
  ConfigContent: String;
  BinaryPath: String;
  ResultCode: Integer;
begin
  if CurStep = ssInstall then
  begin
    Exec('sc.exe', 'stop {#MyServiceName}', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    Sleep(1500);

    // ── Install WebView2 Runtime ───────────────────────────────────────────────
    // Uses the Microsoft Evergreen Bootstrapper approach:
    //   1. Check registry — if already installed, skip entirely (no download, no wait)
    //   2. If not installed — download the ~2MB bootstrapper from Microsoft at runtime
    //      and run it silently. The bootstrapper then fetches the full ~120MB runtime.
    // This is Microsoft's documented production deployment method — no file to bundle
    // in CI, no compile-time dependency, works on any online Windows machine.
    // Reference: https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/distribution
    if not IsWebView2Installed() then
    begin
      Exec('powershell.exe',
        '-NonInteractive -ExecutionPolicy Bypass -Command ' +
        '"$p = Join-Path $env:TEMP ''MicrosoftEdgeWebview2Setup.exe''; ' +
        'Invoke-WebRequest -Uri ''https://go.microsoft.com/fwlink/p/?LinkId=2124703'' ' +
        '-OutFile $p -UseBasicParsing; ' +
        'Start-Process $p -ArgumentList ''/silent /install'' -Wait; ' +
        'Remove-Item $p -Force -ErrorAction SilentlyContinue"',
        '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    end;
  end;

  if CurStep = ssPostInstall then
  begin
    ConfigPath := ExpandConstant('{#MyInstallDir}\config.json');
    ConfigContent := '{"PLATFORM_URL":"' + ExpandConstant('{param:platformurl|{#PlatformURL}}') + '",' +
                     '"ACCOUNT_TOKEN":"' + Trim(TokenEdit.Text) + '"}';
    SaveStringToFile(ConfigPath, ConfigContent, False);

    BinaryPath := ExpandConstant('{#MyInstallDir}\{#MyBinaryName}');

    Exec('sc.exe', 'stop {#MyServiceName}', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    Exec('sc.exe', 'delete {#MyServiceName}', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);

    Exec('sc.exe',
      'create {#MyServiceName} binpath= "' + BinaryPath + '" start= auto displayname= "Racko Agent" obj= LocalSystem',
      '', SW_HIDE, ewWaitUntilTerminated, ResultCode);

    Exec('sc.exe',
      'description {#MyServiceName} "Racko software management agent"',
      '', SW_HIDE, ewWaitUntilTerminated, ResultCode);

    // Configure automatic restart on failure — required for zero-touch auto-update.
    // The updater calls os.Exit(0) after replacing the binary; the SCM detects
    // the exit and restarts the service with the new binary automatically.
    // Actions: restart after 5s, 10s, 30s. Reset failure count after 24h.
    Exec('sc.exe',
      'failure {#MyServiceName} reset= 86400 actions= restart/5000/restart/10000/restart/30000',
      '', SW_HIDE, ewWaitUntilTerminated, ResultCode);

    Exec('sc.exe', 'start {#MyServiceName}', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  end;
end;

// ── Uninstall: stop and delete service ───────────────────────────────────────
procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  ResultCode: Integer;
begin
  if CurUninstallStep = usUninstall then
  begin
    Exec('sc.exe', 'stop {#MyServiceName}', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    Exec('sc.exe', 'delete {#MyServiceName}', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  end;
end;

[Icons]
Name: "{group}\Uninstall {#MyAppName}"; Filename: "{uninstallexe}"
; Desktop and Start Menu shortcut — exe is in the racko-app subfolder
Name: "{commondesktop}\Racko Shared Files"; Filename: "{#MyInstallDir}\racko-app\{#MyAppExe}"; Tasks: desktopicon
Name: "{group}\Racko Shared Files"; Filename: "{#MyInstallDir}\racko-app\{#MyAppExe}"

[Tasks]
Name: "desktopicon"; Description: "Create a &desktop shortcut for Racko Shared Files"; GroupDescription: "Additional icons:"

[Run]
; Start the GUI app after install (non-blocking, visible to the logged-in user)
Filename: "{#MyInstallDir}\racko-app\{#MyAppExe}"; Description: "Launch Racko Shared Files"; Flags: nowait postinstall skipifsilent
Filename: "{cmd}"; Parameters: "/c echo Racko Agent is running as a Windows service."; \
  Description: "Agent started"; Flags: nowait postinstall skipifsilent
