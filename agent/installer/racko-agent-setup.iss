; Racko Agent Setup — Inno Setup Script
; Produces: racko-agent-setup.exe
; Requires: Inno Setup 6+ (https://jrsoftware.org/isinfo.php)
;
; Pre-build checklist:
;   1. Build Go agent:        make build-windows   (outputs dist\racko-agent.exe)
;   2. Publish racko-app:     dotnet publish ..\racko-app\RackoApp.csproj -c Release -r win-x64 --no-self-contained false --output ..\racko-app\publish\
;      OR with self-contained: dotnet publish ..\racko-app\RackoApp.csproj -c Release -r win-x64 --output ..\racko-app\publish\
;   3. Download WebView2 bootstrapper (one-time, ~2MB):
;      Invoke-WebRequest -Uri "https://go.microsoft.com/fwlink/p/?LinkId=2124703" -OutFile "MicrosoftEdgeWebview2Setup.exe"
;   4. Run Inno Setup compiler: iscc racko-agent-setup.iss

#define MyAppName      "Racko Agent"
#define MyAppVersion   "1.0.0"
#define MyAppPublisher "Racko.ai"
#define MyAppURL       "https://racko.ai"
#define MyServiceName  "RackoAgent"
#define MyInstallDir   "{commonappdata}\racko-agent"
#define MyBinaryName   "racko-agent.exe"
#define MyAppExe       "racko-app.exe"
#define WebView2Setup  "MicrosoftEdgeWebview2Setup.exe"
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

; racko-app — published as a folder (not single-file) so WebView2Loader.dll
; lands on disk next to the exe. The {#MyAppExe} entry must be listed first
; so Inno knows it is the main exe; the wildcard picks up all DLLs including
; WebView2Loader.dll, the .NET runtime files, and all managed assemblies.
Source: "..\racko-app\publish\{#MyAppExe}"; DestDir: "{#MyInstallDir}"; Flags: ignoreversion
Source: "..\racko-app\publish\*"; DestDir: "{#MyInstallDir}"; \
  Flags: ignoreversion recursesubdirs createallsubdirs; Excludes: "{#MyAppExe}"

; WebView2 Evergreen Bootstrapper (~2MB).
; Download once with:
;   Invoke-WebRequest -Uri "https://go.microsoft.com/fwlink/p/?LinkId=2124703" -OutFile "{#WebView2Setup}"
; The bootstrapper detects if WebView2 Runtime is already installed and skips
; the download in that case — safe to run on every install, online or offline
; if the machine already has Edge/WebView2 Runtime present.
Source: "{#WebView2Setup}"; DestDir: "{tmp}"; Flags: deleteafterinstall

[Code]
var
  TokenPage: TWizardPage;
  TokenEdit: TEdit;
  TokenLabel: TLabel;
  TokenHint: TLabel;

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

    // ── Install WebView2 Runtime (Evergreen Bootstrapper) ─────────────────────
    // Runs silently — bootstrapper detects if Runtime is already present and
    // skips the download in that case (idempotent, safe on every install).
    // /silent    — no UI
    // /install   — install the runtime
    // Edge/WebView2 is already present on Win11 and most Win10 machines; this
    // is a no-op for them. On Server 2019/2022 Core it downloads ~120MB once.
    if FileExists(ExpandConstant('{tmp}\{#WebView2Setup}')) then
      Exec(ExpandConstant('{tmp}\{#WebView2Setup}'), '/silent /install', '',
           SW_HIDE, ewWaitUntilTerminated, ResultCode);
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
; Desktop and Start Menu shortcut to the GUI tray app
Name: "{commondesktop}\Racko Shared Files"; Filename: "{#MyInstallDir}\{#MyAppExe}"; Tasks: desktopicon
Name: "{group}\Racko Shared Files"; Filename: "{#MyInstallDir}\{#MyAppExe}"

[Tasks]
Name: "desktopicon"; Description: "Create a &desktop shortcut for Racko Shared Files"; GroupDescription: "Additional icons:"

[Run]
; Start the GUI app after install (non-blocking, visible to the logged-in user)
Filename: "{#MyInstallDir}\{#MyAppExe}"; Description: "Launch Racko Shared Files"; Flags: nowait postinstall skipifsilent
Filename: "{cmd}"; Parameters: "/c echo Racko Agent is running as a Windows service."; \
  Description: "Agent started"; Flags: nowait postinstall skipifsilent
