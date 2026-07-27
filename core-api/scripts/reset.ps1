# ============================================================
# RACKO VM RESET SCRIPT — Production Ready v9
# Removes ALL user-installed software dynamically.
# Windows user account is NEVER touched (only its data is cleaned).
# ============================================================

# ── Helper: remove a folder with retry for locked files ─────
function Remove-FolderWithRetry {
    param([string]$Path, [int]$MaxAttempts = 3, [int]$DelaySeconds = 2)
    if (-not $Path) { return }
    for ($i = 1; $i -le $MaxAttempts; $i++) {
        if (-not (Test-Path $Path)) { return }
        Remove-Item $Path -Recurse -Force -ErrorAction SilentlyContinue
        if (-not (Test-Path $Path)) { return }
        if ($i -lt $MaxAttempts) {
            $folderName = Split-Path $Path -Leaf
            Get-Process | Where-Object {
                try { $_.MainModule.FileName -like "*$folderName*" } catch { $false }
            } | Stop-Process -Force -ErrorAction SilentlyContinue
            Start-Sleep -Seconds $DelaySeconds
        }
    }
    if (Test-Path $Path) {
        Write-Host "  WARNING: Could not fully remove $Path (files may be locked)" -ForegroundColor DarkYellow
    }
}

# ── Helper: split "exe" args style uninstall strings correctly ──
function Split-UninstallCommand {
    param([string]$Raw)
    $s = $Raw.Trim()
    if ($s -match '^"([^"]+)"\s*(.*)$') {
        return [PSCustomObject]@{ Exe = $matches[1]; Args = $matches[2].Trim() }
    } elseif ($s -match '^(\S+)\s*(.*)$') {
        return [PSCustomObject]@{ Exe = $matches[1]; Args = $matches[2].Trim() }
    } else {
        return [PSCustomObject]@{ Exe = $s; Args = '' }
    }
}

# ── Helper: run an uninstaller with a hard timeout ───────────
function Invoke-UninstallerWithTimeout {
    param(
        [string]$FilePath,
        [string[]]$Arguments = @(),
        [int]$TimeoutSeconds = 120
    )
    try {
        if (-not (Test-Path $FilePath)) {
            Write-Host "  SKIP: exe not found -> $FilePath" -ForegroundColor DarkYellow
            return
        }
        # Filter out empty strings to avoid ArgumentList null errors
        $argList = $Arguments | Where-Object { $_ -and $_.Trim() -ne '' }
        $p = if ($argList) {
            Start-Process -FilePath $FilePath -ArgumentList $argList -PassThru -NoNewWindow -ErrorAction Stop
        } else {
            Start-Process -FilePath $FilePath -PassThru -NoNewWindow -ErrorAction Stop
        }
        if (-not $p.WaitForExit($TimeoutSeconds * 1000)) {
            Write-Host "  TIMEOUT after ${TimeoutSeconds}s -- killing $FilePath" -ForegroundColor Red
            Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
        }
    } catch {
        Write-Host "  ERROR launching $FilePath -- $_" -ForegroundColor Red
    }
}

# ── Helper: uninstall logic shared by HKLM/HKCU/per-user hive scans ──
function Invoke-UninstallEntry {
    param($app)
    $name = $app.DisplayName
    Write-Host "Uninstalling: $name" -ForegroundColor Yellow
    try {
        $quiet  = if ($app.QuietUninstallString) { $app.QuietUninstallString.Trim() } else { '' }
        $uninst = if ($app.UninstallString)      { $app.UninstallString.Trim()      } else { '' }

        if ($quiet -ne '') {
            # Split QuietUninstallString into exe + args array — handles double spaces correctly
            $qcmd = Split-UninstallCommand $quiet
            $qargs = $qcmd.Args -split '\s+' | Where-Object { $_ -ne '' }
            Invoke-UninstallerWithTimeout -FilePath $qcmd.Exe -Arguments $qargs -TimeoutSeconds 120
        } elseif ($uninst -match 'msedgewebview|EdgeWebView') {
            $cmd = Split-UninstallCommand $uninst
            Invoke-UninstallerWithTimeout -FilePath $cmd.Exe -Arguments @('--uninstall','--msedgewebview','--system-level','--force-uninstall') -TimeoutSeconds 90
        } elseif ($uninst -match 'MsiExec') {
            $guid = [regex]::Match($uninst, '\{[A-F0-9\-]+\}', 'IgnoreCase').Value
            if ($guid) {
                Invoke-UninstallerWithTimeout -FilePath 'msiexec.exe' -Arguments @("/X$guid",'/quiet','/norestart') -TimeoutSeconds 180
            }
        } elseif ($uninst -match 'Docker Desktop Installer') {
            $cmd = Split-UninstallCommand $uninst
            Invoke-UninstallerWithTimeout -FilePath $cmd.Exe -Arguments @('uninstall','--quiet') -TimeoutSeconds 180
        } elseif ($uninst -match 'setup\.exe') {
            $cmd = Split-UninstallCommand $uninst
            Invoke-UninstallerWithTimeout -FilePath $cmd.Exe -Arguments @('--uninstall','--force-uninstall','--system-level') -TimeoutSeconds 120
        } elseif ($uninst -match 'Update\.exe') {
            # Squirrel-based installers (Slack, Discord, VS Code, etc.)
            $cmd = Split-UninstallCommand $uninst
            Invoke-UninstallerWithTimeout -FilePath $cmd.Exe -Arguments @('--uninstall','-s') -TimeoutSeconds 120
        } elseif ($uninst -match '-burn\.exe' -or $uninst -match 'Bundle') {
            # WiX Burn bundle installers (Microsoft/Adobe/enterprise)
            $cmd = Split-UninstallCommand $uninst
            Invoke-UninstallerWithTimeout -FilePath $cmd.Exe -Arguments @('/uninstall','/quiet','/norestart') -TimeoutSeconds 180
        } else {
            $cmd = Split-UninstallCommand $uninst
            if ($cmd.Exe -match 'unins\d+\.exe') {
                Invoke-UninstallerWithTimeout -FilePath $cmd.Exe -Arguments @('/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART') -TimeoutSeconds 120
            } elseif ($cmd.Exe -match '[\\\/]uninstall\.exe$') {
                Invoke-UninstallerWithTimeout -FilePath $cmd.Exe -Arguments @('-q') -TimeoutSeconds 120
            } else {
                # Generic fallback — split any args from UninstallString
                $uargs = $cmd.Args -split '\s+' | Where-Object { $_ -ne '' }
                if ($uargs) {
                    Invoke-UninstallerWithTimeout -FilePath $cmd.Exe -Arguments $uargs -TimeoutSeconds 120
                } else {
                    Invoke-UninstallerWithTimeout -FilePath $cmd.Exe -Arguments @('/S') -TimeoutSeconds 120
                }
            }
        }

        $loc = if ($app.InstallLocation) { $app.InstallLocation.Trim() } else { '' }
        if ($loc -ne '' -and (Test-Path $loc)) {
            Remove-FolderWithRetry -Path $loc
            Write-Host "  Cleaned folder: $loc" -ForegroundColor DarkGray
        }
        Write-Host "Done: $name" -ForegroundColor Green
    } catch {
        Write-Host "Failed: $name -- $_" -ForegroundColor Red
    }
}

# ── PROTECTED: never uninstall these ────────────────────────
$skipExact   = @('Microsoft Edge', 'RackoAgent', 'Racko Agent')
$skipLike    = @('Cloudbase-Init*', 'Virtio-win*', 'QEMU*', 'VMware*')
$skipPattern = '^(Microsoft Visual C\+\+|Python Launcher|Windows SDK|Windows Desktop|Windows App|Windows Mobile|Windows IoT|Windows Team|WinRT|SDK ARM|Universal CRT|Universal General|vs_|vcp|vcpp|Kits |MsiDev|DiagnosticsHub|Application Verifier|vs[_ ])'

function Test-ShouldUninstall {
    param($entry)
    if (-not $entry.DisplayName) { return $false }
    if (-not ($entry.UninstallString -or $entry.QuietUninstallString)) { return $false }
    if ($skipExact -contains $entry.DisplayName) { return $false }
    foreach ($p in $skipLike) { if ($entry.DisplayName -like $p) { return $false } }
    if ($entry.DisplayName -match $skipPattern) { return $false }
    return $true
}

# ── Windows-owned Program Files folders (whitelist) ─────────
$pfSystemFolders = @(
    'Common Files','Internet Explorer','WindowsPowerShell','Reference Assemblies',
    'dotnet','IIS Express','MSBuild','ModifiableWindowsApps','WindowsApps',
    'Windows Defender','Windows Defender Advanced Threat Protection','Windows Mail',
    'Windows Media Player','Windows NT','Windows Photo Viewer','Windows Security',
    'Windows Sidebar','Windows Journal','Microsoft','Microsoft.NET',
    'Microsoft Analysis Services','Microsoft Office','Microsoft SQL Server',
    'Uninstall Information','Cloudbase Solutions','Qemu-ga','Virtio-Win','VMware','PackageManagement'
)

# ── Windows-owned AppData folders (whitelist) ────────────────
$appDataSystemFolders = @(
    'Microsoft','Windows','Temp','Packages','PackageStaging',
    'ConnectedDevicesPlatform','CrashDumps','DBG','D3DSCache',
    'PeerDistRepub','AccountPictures','Application Data','History',
    'Temporary Internet Files','LocalLow','ElevatedDiagnostics',
    'CommsPhone','IECompatCache','SquirrelTemp','MicrosoftEdge',
    'nvidia','NVIDIA','AMD','Intel','VMware','Comms'
)

# ── Windows-owned ProgramData folders (whitelist) ────────────
$pdSystemFolders = @(
    'Microsoft*','Windows*','Package Cache','Packages',
    'USOPrivate','USOShared','regid*','ssh',
    'Cloudbase*','Virtio*','QEMU*','VMware*',
    'racko-agent','RackoAgent','SoftwareDistribution'
)

# ── Start Menu system folders (whitelist) ────────────────────
$startMenuSystemFolders = @(
    'Microsoft*','Windows*','Accessibility','Administrative Tools',
    'Maintenance','System Tools','Startup'
)

# ── Desktop shortcuts to keep ────────────────────────────────
$keepShortcuts = @('Microsoft Edge.lnk')

# ── Startup entries to keep ──────────────────────────────────
$keepStartup = @('SecurityHealth','RtkAudUService','racko*','Racko*','BingSvc')

# ── Services to never touch ──────────────────────────────────
$serviceSkipLike = @(
    'Racko*','Cloudbase*','Qemu*','QEMU*','Virtio*','VMware*',
    'WinDefend','wscsvc','MpsSvc','BFE','Dnscache','Dhcp',
    'RpcSs','RpcEptMapper','DcomLaunch','PlugPlay','Power',
    'edgeupdate','edgeupdatem','MicrosoftEdgeElevationService'
)

# ── Helper: get non-system user profile directories ──────────
# Using a function + foreach instead of inline pipeline chains
# so the script works correctly whether run as a file or any other way.
function Get-UserProfiles {
    $excluded = @('Public','Default','Default User','All Users')
    $result = @()
    foreach ($dir in (Get-ChildItem 'C:\Users' -Directory -ErrorAction SilentlyContinue)) {
        if ($dir.Name -notin $excluded) { $result += $dir }
    }
    return $result
}

# ============================================================
# PHASE 0 — Kill all user-launched processes before anything else
# This ensures no file locks during uninstall/folder deletion.
# ============================================================
Write-Host "`n=== PHASE 0: KILLING USER PROCESSES ===" -ForegroundColor Cyan

# Processes that must never be killed — Windows core + our agent
$processSkip = @(
    # Windows kernel / session core
    'System','Registry','smss','csrss','wininit','winlogon','lsass','lsm',
    'services','svchost','dwm','fontdrvhost','LogonUI','conhost',
    'Idle',                              # CPU idle process — PID 0
    'Secure System',                     # Windows kernel security
    'AggregatorHost',                    # Windows system aggregator
    'WUDFHost',                          # Windows Driver Foundation host
    'smartscreen',                       # Windows SmartScreen
    # Desktop shell
    'explorer','taskhostw','sihost','ctfmon','ShellExperienceHost',
    'StartMenuExperienceHost','SearchIndexer','SearchHost','SearchApp',
    'RuntimeBroker','ApplicationFrameHost','spoolsv',
    # Windows Defender / Security
    'MsMpEng','NisSrv','SecurityHealthService','SecurityHealthSystray',
    'MpDefenderCoreService',             # Defender core — killing drops security subsystem
    # System infrastructure
    'WmiPrvSE','dllhost','msdtc','TrustedInstaller','TiWorker',
    'audiodg','TabTip','TabTip32','TextInputHost',
    # Our own session
    'powershell','pwsh','cmd',           # keep our own session alive
    # Racko agent
    'RackoAgent','racko-agent',
    # VM guest tools
    'vmtoolsd','vm3dservice','VGAuthService',
    'cloudbase-init','QemuGuestAgent',
    # Hyper-V / VM infrastructure — killing these drops the RDP session on VMs
    'vmcompute',                         # Hyper-V compute service
    'vmms',                              # Hyper-V VM management
    'vmwp',                              # VM worker process
    'vmmem',                             # VM memory process
    # RDP session processes
    'rdpclip','rdpinput','rdpshell',
    'termsrv','ssman','rdpdr',
    'mstsc','tstheme'
)

$currentPid = $PID  # our own PowerShell process — never kill self

$killed = 0
foreach ($proc in (Get-Process -ErrorAction SilentlyContinue)) {
    # Skip PID 0 (Idle), PID 4 (System), and self
    if ($proc.Id -eq 0 -or $proc.Id -eq 4 -or $proc.Id -eq $currentPid) { continue }
    $skip = $false
    foreach ($s in $processSkip) {
        if ($proc.Name -like $s) { $skip = $true; break }
    }
    if ($skip) { continue }

    Write-Host "  Killing: $($proc.Name) (PID $($proc.Id))" -ForegroundColor DarkYellow
    # Use taskkill instead of Stop-Process — works cross-session (Session 0 → Session 2+)
    # /F = force, /T = kill process tree (children too), /PID = target by PID
    taskkill /F /T /PID $proc.Id 2>$null | Out-Null
    $killed++
}

if ($killed -gt 0) {
    Write-Host "  Killed $killed processes. Waiting for them to exit..." -ForegroundColor DarkYellow
    Start-Sleep -Seconds 3
} else {
    Write-Host "  No user processes found to kill." -ForegroundColor DarkGray
}

# ============================================================
# PHASE 1 — Registry-driven uninstall (HKLM + HKCU + all per-user hives)
# ============================================================
Write-Host "`n=== PHASE 1: UNINSTALLING VIA REGISTRY ===" -ForegroundColor Cyan

$all = @()
$all += Get-ItemProperty 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*'            -ErrorAction SilentlyContinue
$all += Get-ItemProperty 'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*' -ErrorAction SilentlyContinue
$all += Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*'            -ErrorAction SilentlyContinue
$all += Get-ItemProperty 'HKCU:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*' -ErrorAction SilentlyContinue

$toUninstall = $all | Where-Object { Test-ShouldUninstall $_ } | Sort-Object DisplayName -Unique
Write-Host "Found $($toUninstall.Count) apps to uninstall (current session hive)" -ForegroundColor Yellow
foreach ($app in $toUninstall) { Invoke-UninstallEntry $app }

# ── Scan HKEY_USERS for all currently logged-in users ─────────────────────────
# When running as LocalSystem, HKCU:\  only covers LocalSystem's own hive.
# Logged-in users' hives are already mounted under HKEY_USERS\<SID> and
# readable by LocalSystem — no NTUSER.DAT load needed, no file locking issues.
if (-not (Get-PSDrive -Name HKU -ErrorAction SilentlyContinue)) {
    New-PSDrive -PSProvider Registry -Name HKU -Root HKEY_USERS | Out-Null
}
Get-ChildItem 'HKU:\' -ErrorAction SilentlyContinue | Where-Object {
    $_.PSChildName -match 'S-1-5-21' -and $_.PSChildName -notmatch '_Classes'
} | ForEach-Object {
    $sid = $_.PSChildName
    $userApps = @()
    $userApps += Get-ItemProperty "HKU:\$sid\Software\Microsoft\Windows\CurrentVersion\Uninstall\*"            -ErrorAction SilentlyContinue
    $userApps += Get-ItemProperty "HKU:\$sid\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*" -ErrorAction SilentlyContinue
    $userToUninstall = $userApps | Where-Object { Test-ShouldUninstall $_ } | Sort-Object DisplayName -Unique
    if ($userToUninstall.Count -gt 0) {
        Write-Host "Found $($userToUninstall.Count) apps for SID $sid (logged-in user)" -ForegroundColor Yellow
        foreach ($app in $userToUninstall) { Invoke-UninstallEntry $app }
    }
}

# ── Scan every OTHER local user's registry hive for per-user installs ──
if (-not (Get-PSDrive -Name HKU -ErrorAction SilentlyContinue)) {
    New-PSDrive -PSProvider Registry -Name HKU -Root HKEY_USERS | Out-Null
}

foreach ($userDir in (Get-UserProfiles)) {
    $profilePath = $userDir.FullName
    if (-not $profilePath) { continue }
    $ntuser = Join-Path $profilePath 'NTUSER.DAT'
    if (-not (Test-Path $ntuser)) { continue }

    $tempHive = "TempHive_$($userDir.Name)"
    $loadResult = reg load "HKU\$tempHive" "$ntuser" 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  Could not load hive for $($userDir.Name) (likely in use) -- skipping" -ForegroundColor DarkYellow
        continue
    }

    try {
        $userApps = @()
        $userApps += Get-ItemProperty "HKU:\$tempHive\Software\Microsoft\Windows\CurrentVersion\Uninstall\*"            -ErrorAction SilentlyContinue
        $userApps += Get-ItemProperty "HKU:\$tempHive\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*" -ErrorAction SilentlyContinue
        $userToUninstall = $userApps | Where-Object { Test-ShouldUninstall $_ } | Sort-Object DisplayName -Unique
        Write-Host "Found $($userToUninstall.Count) per-user apps for $($userDir.Name)" -ForegroundColor Yellow
        foreach ($app in $userToUninstall) { Invoke-UninstallEntry $app }
    } finally {
        [gc]::Collect()
        [gc]::WaitForPendingFinalizers()
        Start-Sleep -Milliseconds 500
        reg unload "HKU\$tempHive" 2>&1 | Out-Null
    }
}

# ============================================================
# PHASE 1b — Python dedicated uninstall (MSI components)
# Phase 1 generic handler often times out on Python's multi-component
# MSI install. This pass targets Python 3.x specifically with a longer
# timeout and also force-removes known Python install folders.
# Python Launcher is intentionally skipped (protected by $skipPattern).
# ============================================================
Write-Host "`n=== PHASE 1b: PYTHON DEDICATED UNINSTALL ===" -ForegroundColor Cyan

$pythonEntries = @()
foreach ($regPath in @(
    'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
    'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*',
    'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*'
)) {
    $pythonEntries += Get-ItemProperty $regPath -ErrorAction SilentlyContinue |
        Where-Object { $_.DisplayName -match '^Python 3' -and $_.DisplayName -notmatch 'Python Launcher' }
}

$pythonEntries = $pythonEntries | Sort-Object DisplayName -Unique
Write-Host "Found $($pythonEntries.Count) Python MSI components to uninstall" -ForegroundColor Yellow

foreach ($entry in $pythonEntries) {
    $name   = $entry.DisplayName
    $uninst = if ($entry.UninstallString) { $entry.UninstallString.Trim() } else { '' }
    $guid   = [regex]::Match($uninst, '\{[A-F0-9\-]+\}', 'IgnoreCase').Value
    if (-not $guid) {
        Write-Host "  SKIP (no GUID found): $name" -ForegroundColor DarkYellow
        continue
    }
    Write-Host "Uninstalling Python component: $name ($guid)" -ForegroundColor Yellow
    Invoke-UninstallerWithTimeout -FilePath 'msiexec.exe' -Arguments @("/X$guid", '/quiet', '/norestart') -TimeoutSeconds 300
    Write-Host "Done: $name" -ForegroundColor Green
}

# Force-remove known Python install folder locations (catches partial uninstalls)
$pythonFolders = @()
$pythonFolders += Get-Item 'C:\Python3*' -ErrorAction SilentlyContinue
$pythonFolders += Get-Item 'C:\Program Files\Python3*' -ErrorAction SilentlyContinue
$pythonFolders += Get-Item 'C:\Program Files (x86)\Python3*' -ErrorAction SilentlyContinue
foreach ($userDir in (Get-UserProfiles)) {
    $perUserPython = Join-Path $userDir.FullName 'AppData\Local\Programs\Python'
    if (Test-Path $perUserPython) { $pythonFolders += Get-Item $perUserPython }
}
foreach ($pf in $pythonFolders) {
    if ($pf -and (Test-Path $pf.FullName)) {
        Write-Host "Removing Python folder: $($pf.FullName)" -ForegroundColor Yellow
        Remove-FolderWithRetry -Path $pf.FullName
        if (-not (Test-Path $pf.FullName)) { Write-Host "Removed: $($pf.FullName)" -ForegroundColor Green }
    }
}

# Clean up stale Python registry entries whose folders are now gone
foreach ($regPath in @(
    'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall',
    'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall',
    'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall'
)) {
    if (-not (Test-Path $regPath)) { continue }
    foreach ($key in (Get-ChildItem $regPath -ErrorAction SilentlyContinue)) {
        $props = Get-ItemProperty $key.PSPath -ErrorAction SilentlyContinue
        if ($props.DisplayName -match '^Python 3' -and $props.DisplayName -notmatch 'Python Launcher') {
            Remove-Item $key.PSPath -Recurse -Force -ErrorAction SilentlyContinue
            Write-Host "  Removed stale Python registry entry: $($props.DisplayName)" -ForegroundColor DarkGray
        }
    }
}

# ============================================================
# PHASE 2 — Program Files whitelist sweep
# ============================================================
Write-Host "`n=== PHASE 2: PROGRAM FILES WHITELIST SWEEP ===" -ForegroundColor Cyan

foreach ($pf in @('C:\Program Files', 'C:\Program Files (x86)')) {
    if (-not (Test-Path $pf)) { continue }
    foreach ($dir in (Get-ChildItem $pf -Directory -ErrorAction SilentlyContinue)) {
        $isSystem = $false
        foreach ($s in $pfSystemFolders) {
            if ($dir.Name -eq $s -or $dir.Name -like "$s*") { $isSystem = $true; break }
        }
        if ($isSystem) { continue }
        Write-Host "Removing: $($dir.FullName)" -ForegroundColor Yellow
        Remove-FolderWithRetry -Path $dir.FullName
        if (-not (Test-Path $dir.FullName)) { Write-Host "Removed:  $($dir.FullName)" -ForegroundColor Green }
    }
}

# ============================================================
# PHASE 3 — C:\tools sweep
# ============================================================
Write-Host "`n=== PHASE 3: C:\TOOLS SWEEP ===" -ForegroundColor Cyan

if (Test-Path 'C:\tools') {
    foreach ($dir in (Get-ChildItem 'C:\tools' -Directory -ErrorAction SilentlyContinue)) {
        Write-Host "Removing: $($dir.FullName)" -ForegroundColor Yellow
        Remove-FolderWithRetry -Path $dir.FullName
        if (-not (Test-Path $dir.FullName)) { Write-Host "Removed:  $($dir.FullName)" -ForegroundColor Green }
    }
    if (-not (Get-ChildItem 'C:\tools' -ErrorAction SilentlyContinue)) {
        Remove-Item 'C:\tools' -Force -ErrorAction SilentlyContinue
    }
}

# ============================================================
# PHASE 4 — AppData whitelist sweep (all users) + browser/credential wipe
# ============================================================
Write-Host "`n=== PHASE 4: APPDATA WHITELIST SWEEP + BROWSER/CREDENTIAL WIPE ===" -ForegroundColor Cyan

$uwpKeepPrefixes = @(
    'Microsoft.Windows.','Microsoft.549981C3F5F10','Microsoft.AAD.BrokerPlugin',
    'Microsoft.AccountsControl','Microsoft.BioEnrollment','Microsoft.CredDialogHost',
    'Microsoft.ECApp','Microsoft.LockApp','Microsoft.MicrosoftEdge',
    'Microsoft.Windows.Photos','Microsoft.WindowsCalculator','Microsoft.WindowsStore',
    'Microsoft.WindowsNotepad','Microsoft.Xbox','Microsoft.XboxGameOverlay',
    'Microsoft.XboxGamingOverlay','Microsoft.XboxIdentityProvider',
    'Microsoft.SecHealthUI','Microsoft.ScreenSketch','Microsoft.Paint',
    'Microsoft.NET.Native','Microsoft.VCLibs','NcsiUwpApp','MicrosoftWindows.Client.'
)

foreach ($userDir in (Get-UserProfiles)) {
    $userProfile = $userDir.FullName
    if (-not $userProfile) { continue }

    # Wipe Edge profile data
    $edgeUserData = Join-Path $userProfile 'AppData\Local\Microsoft\Edge\User Data'
    if (Test-Path $edgeUserData) {
        Write-Host "Wiping Edge profile data: $edgeUserData" -ForegroundColor Yellow
        Remove-FolderWithRetry -Path $edgeUserData
    }

    # Wipe Chrome profile data
    $chromeUserData = Join-Path $userProfile 'AppData\Local\Google\Chrome\User Data'
    if (Test-Path $chromeUserData) {
        Write-Host "Wiping Chrome profile data: $chromeUserData" -ForegroundColor Yellow
        Remove-FolderWithRetry -Path $chromeUserData
    }

    # Wipe Firefox profiles
    $firefoxProfiles = Join-Path $userProfile 'AppData\Roaming\Mozilla\Firefox\Profiles'
    if (Test-Path $firefoxProfiles) {
        Write-Host "Wiping Firefox profile data: $firefoxProfiles" -ForegroundColor Yellow
        Remove-FolderWithRetry -Path $firefoxProfiles
    }

    # Wipe Windows Credential Manager vault + DPAPI protect store
    foreach ($credPath in @(
        (Join-Path $userProfile 'AppData\Local\Microsoft\Credentials'),
        (Join-Path $userProfile 'AppData\Roaming\Microsoft\Credentials'),
        (Join-Path $userProfile 'AppData\Local\Microsoft\Vault'),
        (Join-Path $userProfile 'AppData\Local\Microsoft\Protect'),
        (Join-Path $userProfile 'AppData\Roaming\Microsoft\Protect')
    )) {
        if (Test-Path $credPath) {
            Write-Host "Wiping credential store: $credPath" -ForegroundColor Yellow
            Remove-FolderWithRetry -Path $credPath
        }
    }

    # UWP Packages — remove non-system app data folders
    $packagesPath = Join-Path $userProfile 'AppData\Local\Packages'
    if (Test-Path $packagesPath) {
        foreach ($pkg in (Get-ChildItem $packagesPath -Directory -ErrorAction SilentlyContinue)) {
            $keep = $false
            foreach ($prefix in $uwpKeepPrefixes) {
                if ($pkg.Name.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)) { $keep = $true; break }
            }
            if ($keep) { continue }
            Write-Host "Removing: $($pkg.FullName)" -ForegroundColor Yellow
            Remove-FolderWithRetry -Path $pkg.FullName
            if (-not (Test-Path $pkg.FullName)) { Write-Host "Removed:  $($pkg.FullName)" -ForegroundColor Green }
        }
    }

    # AppData\Local and AppData\Roaming whitelist sweep
    foreach ($base in @('AppData\Local', 'AppData\Roaming')) {
        $basePath = Join-Path $userProfile $base
        if (-not (Test-Path $basePath)) { continue }
        foreach ($dir in (Get-ChildItem $basePath -Directory -ErrorAction SilentlyContinue)) {
            $isSystem = $false
            foreach ($s in $appDataSystemFolders) {
                if ($dir.Name -eq $s -or $dir.Name -like "$s*") { $isSystem = $true; break }
            }
            if ($isSystem) { continue }
            Write-Host "Removing: $($dir.FullName)" -ForegroundColor Yellow
            Remove-FolderWithRetry -Path $dir.FullName
            if (-not (Test-Path $dir.FullName)) { Write-Host "Removed:  $($dir.FullName)" -ForegroundColor Green }
        }
    }
}

# Clear cached credentials for current session
try {
    $stored = cmdkey /list 2>$null | Select-String 'Target:'
    foreach ($line in $stored) {
        $target = ($line -replace '.*Target:\s*', '').Trim()
        if ($target) { cmdkey /delete:$target 2>$null | Out-Null }
    }
} catch { }

# ============================================================
# PHASE 5 — ProgramData sweep
# ============================================================
Write-Host "`n=== PHASE 5: PROGRAMDATA SWEEP ===" -ForegroundColor Cyan

foreach ($dir in (Get-ChildItem 'C:\ProgramData' -Directory -ErrorAction SilentlyContinue)) {
    $isSystem = $false
    foreach ($s in $pdSystemFolders) {
        if ($dir.Name -eq $s -or $dir.Name -like $s) { $isSystem = $true; break }
    }
    if ($isSystem) { continue }
    Write-Host "Removing: $($dir.FullName)" -ForegroundColor Yellow
    Remove-FolderWithRetry -Path $dir.FullName
    if (-not (Test-Path $dir.FullName)) { Write-Host "Removed:  $($dir.FullName)" -ForegroundColor Green }
}

# ============================================================
# PHASE 6 — Stale registry cleanup (HKLM + HKCU)
# ============================================================
Write-Host "`n=== PHASE 6: STALE REGISTRY CLEANUP ===" -ForegroundColor Cyan

foreach ($base in @(
    'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall',
    'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall',
    'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall',
    'HKCU:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall'
)) {
    if (-not (Test-Path $base)) { continue }
    foreach ($key in (Get-ChildItem $base -ErrorAction SilentlyContinue)) {
        $props = Get-ItemProperty $key.PSPath -ErrorAction SilentlyContinue
        if (-not $props.DisplayName) { continue }
        $loc = if ($props.InstallLocation) { $props.InstallLocation.Trim() } else { '' }
        if ($loc -ne '' -and -not (Test-Path $loc)) {
            Write-Host "Removing stale registry: $($props.DisplayName)" -ForegroundColor DarkGray
            Remove-Item $key.PSPath -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
}

# ── Clean stale HKEY_USERS entries for all logged-in users ─────────────────
# HKCU:\  under LocalSystem only covers LocalSystem's hive.
# Logged-in users' hives are mounted at HKEY_USERS\<SID> — readable by LocalSystem.
# Remove any entry whose uninstaller exe no longer exists on disk.
if (-not (Get-PSDrive -Name HKU -ErrorAction SilentlyContinue)) {
    New-PSDrive -PSProvider Registry -Name HKU -Root HKEY_USERS | Out-Null
}
Get-ChildItem 'HKU:\' -ErrorAction SilentlyContinue | Where-Object {
    $_.PSChildName -match 'S-1-5-21' -and $_.PSChildName -notmatch '_Classes'
} | ForEach-Object {
    $sid = $_.PSChildName
    foreach ($base in @("HKU:\$sid\Software\Microsoft\Windows\CurrentVersion\Uninstall", "HKU:\$sid\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall")) {
        if (-not (Test-Path $base)) { continue }
        foreach ($key in (Get-ChildItem $base -ErrorAction SilentlyContinue)) {
            $props  = Get-ItemProperty $key.PSPath -ErrorAction SilentlyContinue
            if (-not $props.DisplayName) { continue }
            $quiet  = if ($props.QuietUninstallString) { $props.QuietUninstallString.Trim() } else { '' }
            $uninst = if ($props.UninstallString)      { $props.UninstallString.Trim()      } else { '' }
            $raw    = if ($quiet -ne '') { $quiet } else { $uninst }
            if ($raw -eq '') { continue }
            $exe = if ($raw -match '^"([^"]+)"') { $matches[1] } elseif ($raw -match '^(\S+)') { $matches[1] } else { '' }
            if ($exe -ne '' -and -not (Test-Path $exe)) {
                Write-Host "Removing stale HKCU entry: $($props.DisplayName)" -ForegroundColor DarkGray
                Remove-Item $key.PSPath -Recurse -Force -ErrorAction SilentlyContinue
            }
        }
    }
}

# ============================================================
# PHASE 7 — Desktop / Documents / Pictures / Videos cleanup
# ============================================================
Write-Host "`n=== PHASE 7: USER DATA FOLDERS CLEANUP ===" -ForegroundColor Cyan

foreach ($userDir in (Get-UserProfiles)) {
    $userProfile = $userDir.FullName
    if (-not $userProfile) { continue }
    foreach ($folderName in @('Desktop','Documents','Pictures','Videos','OneDrive','Dropbox','Box','Google Drive')) {
        $target = Join-Path $userProfile $folderName
        if (-not (Test-Path $target)) { continue }
        foreach ($item in (Get-ChildItem $target -ErrorAction SilentlyContinue)) {
            if ($folderName -eq 'Desktop' -and $item.Extension -in @('.lnk','.url') -and $keepShortcuts -contains $item.Name) {
                continue
            }
            Remove-Item $item.FullName -Recurse -Force -ErrorAction SilentlyContinue
            Write-Host "Removed: $($item.FullName)" -ForegroundColor DarkGray
        }
    }
}

if (Test-Path 'C:\Users\Public\Desktop') {
    foreach ($item in (Get-ChildItem 'C:\Users\Public\Desktop' -ErrorAction SilentlyContinue)) {
        if ($item.Extension -in @('.lnk','.url') -and $keepShortcuts -contains $item.Name) { continue }
        Remove-Item $item.FullName -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host "Removed public: $($item.FullName)" -ForegroundColor DarkGray
    }
}

# ============================================================
# PHASE 8 — Start Menu shortcut cleanup (all users + system)
# ============================================================
Write-Host "`n=== PHASE 8: START MENU CLEANUP ===" -ForegroundColor Cyan

foreach ($userDir in (Get-UserProfiles)) {
    $userProfile = $userDir.FullName
    if (-not $userProfile) { continue }
    $startMenuPrograms = Join-Path $userProfile 'AppData\Roaming\Microsoft\Windows\Start Menu\Programs'
    if (-not (Test-Path $startMenuPrograms)) { continue }

    foreach ($item in (Get-ChildItem $startMenuPrograms -File -ErrorAction SilentlyContinue)) {
        if ($item.Extension -in @('.lnk', '.url')) {
            Remove-Item $item.FullName -Force -ErrorAction SilentlyContinue
            Write-Host "Removed Start Menu shortcut: $($item.Name)" -ForegroundColor DarkGray
        }
    }
    foreach ($dir in (Get-ChildItem $startMenuPrograms -Directory -ErrorAction SilentlyContinue)) {
        $isSystem = $false
        foreach ($s in $startMenuSystemFolders) {
            if ($dir.Name -eq $s -or $dir.Name -like $s) { $isSystem = $true; break }
        }
        if ($isSystem) { continue }
        Remove-FolderWithRetry -Path $dir.FullName
        Write-Host "Removed Start Menu folder: $($dir.Name)" -ForegroundColor DarkGray
    }
}

$sysStartMenu = 'C:\ProgramData\Microsoft\Windows\Start Menu\Programs'
if (Test-Path $sysStartMenu) {
    foreach ($item in (Get-ChildItem $sysStartMenu -File -ErrorAction SilentlyContinue)) {
        if ($item.Extension -in @('.lnk', '.url')) {
            Remove-Item $item.FullName -Force -ErrorAction SilentlyContinue
            Write-Host "Removed system Start Menu shortcut: $($item.Name)" -ForegroundColor DarkGray
        }
    }
    foreach ($dir in (Get-ChildItem $sysStartMenu -Directory -ErrorAction SilentlyContinue)) {
        $isSystem = $false
        foreach ($s in $startMenuSystemFolders) {
            if ($dir.Name -eq $s -or $dir.Name -like $s) { $isSystem = $true; break }
        }
        if ($isSystem) { continue }
        Remove-FolderWithRetry -Path $dir.FullName
        Write-Host "Removed system Start Menu folder: $($dir.Name)" -ForegroundColor DarkGray
    }
}

# ============================================================
# PHASE 9 — Downloads folder cleanup (all users + Public)
# ============================================================
Write-Host "`n=== PHASE 9: DOWNLOADS CLEANUP ===" -ForegroundColor Cyan

foreach ($userDir in (Get-UserProfiles)) {
    $userProfile = $userDir.FullName
    if (-not $userProfile) { continue }
    $downloads = Join-Path $userProfile 'Downloads'
    if (-not (Test-Path $downloads)) { continue }
    foreach ($item in (Get-ChildItem $downloads -ErrorAction SilentlyContinue)) {
        Remove-Item $item.FullName -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host "Removed: $($item.Name)" -ForegroundColor DarkGray
    }
}

if (Test-Path 'C:\Users\Public\Downloads') {
    foreach ($item in (Get-ChildItem 'C:\Users\Public\Downloads' -ErrorAction SilentlyContinue)) {
        Remove-Item $item.FullName -Recurse -Force -ErrorAction SilentlyContinue
    }
}

# ============================================================
# PHASE 10 — WSL distro cleanup (registry-based)
# ============================================================
Write-Host "`n=== PHASE 10: WSL DISTRO CLEANUP ===" -ForegroundColor Cyan

$wslRegPath = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Lxss'
if (Test-Path $wslRegPath) {
    $distros = @()
    foreach ($key in (Get-ChildItem $wslRegPath -ErrorAction SilentlyContinue)) {
        $props = Get-ItemProperty $key.PSPath -ErrorAction SilentlyContinue
        if ($props.DistributionName) { $distros += $props.DistributionName }
    }
    if ($distros.Count -gt 0) {
        foreach ($distro in $distros) {
            $d = $distro.Trim()
            Write-Host "Unregistering WSL distro: $d" -ForegroundColor Yellow
            wsl --unregister $d 2>$null
            Write-Host "Unregistered: $d" -ForegroundColor Green
        }
    } else {
        Write-Host "  No WSL distros found" -ForegroundColor DarkGray
    }
} else {
    Write-Host "  No WSL distros found" -ForegroundColor DarkGray
}

# ============================================================
# PHASE 11 — Stale PATH cleanup (system + user)
# ============================================================
Write-Host "`n=== PHASE 11: STALE PATH CLEANUP ===" -ForegroundColor Cyan

$sysPaths = ([Environment]::GetEnvironmentVariable('PATH', 'Machine') -split ';') | Where-Object { $_.Trim() -ne '' } | Sort-Object -Unique
$cleanSys = $sysPaths | Where-Object { Test-Path $_ }
[Environment]::SetEnvironmentVariable('PATH', ($cleanSys -join ';'), 'Machine')
Write-Host "  System PATH: $($sysPaths.Count) entries -> $($cleanSys.Count) valid" -ForegroundColor DarkGray

$userPaths = ([Environment]::GetEnvironmentVariable('PATH', 'User') -split ';') | Where-Object { $_.Trim() -ne '' } | Sort-Object -Unique
$cleanUser = $userPaths | Where-Object { Test-Path $_ }
[Environment]::SetEnvironmentVariable('PATH', ($cleanUser -join ';'), 'User')
Write-Host "  User PATH: $($userPaths.Count) entries -> $($cleanUser.Count) valid" -ForegroundColor DarkGray

# ============================================================
# PHASE 12 — Non-system scheduled tasks cleanup
# ============================================================
Write-Host "`n=== PHASE 12: SCHEDULED TASKS CLEANUP ===" -ForegroundColor Cyan

$taskNameSkip = @('Racko*','RackoAgent*')

$tasksToRemove = Get-ScheduledTask -ErrorAction SilentlyContinue | Where-Object {
    $_.TaskPath -notlike '\Microsoft*' -and
    $_.TaskPath -notlike '\Windows*' -and
    $_.TaskName -notlike 'MicrosoftEdge*'
}
foreach ($task in $tasksToRemove) {
    $keep = $false
    foreach ($k in $taskNameSkip) { if ($task.TaskName -like $k) { $keep = $true; break } }
    if ($keep) { continue }
    Write-Host "Removing task: $($task.TaskPath)$($task.TaskName)" -ForegroundColor Yellow
    Unregister-ScheduledTask -TaskName $task.TaskName -TaskPath $task.TaskPath -Confirm:$false -ErrorAction SilentlyContinue
    Write-Host "Removed: $($task.TaskName)" -ForegroundColor Green
}

# ============================================================
# PHASE 13 — Chocolatey installed packages cleanup
# ============================================================
Write-Host "`n=== PHASE 13: CHOCOLATEY PACKAGES CLEANUP ===" -ForegroundColor Cyan

$chocoRoot = 'C:\ProgramData\chocolatey'
if (Test-Path $chocoRoot) {
    # First run choco uninstall for all packages if choco.exe is available
    $chocoExe = Join-Path $chocoRoot 'bin\choco.exe'
    if (Test-Path $chocoExe) {
        Write-Host "  Running choco uninstall for all packages..." -ForegroundColor Yellow
        try {
            $chocoList = & $chocoExe list --local-only --no-progress 2>$null |
                Select-String '^\S' | ForEach-Object { ($_ -split ' ')[0] } |
                Where-Object { $_ -and $_ -notmatch '^chocolatey$' }
            foreach ($pkg in $chocoList) {
                Write-Host "  Uninstalling choco package: $pkg" -ForegroundColor Yellow
                & $chocoExe uninstall $pkg -y --force --no-progress 2>$null | Out-Null
            }
        } catch { }
    }

    # Remove entire chocolatey root folder (bin, lib, config, extensions, etc.)
    Write-Host "Removing chocolatey root: $chocoRoot" -ForegroundColor Yellow
    Remove-FolderWithRetry -Path $chocoRoot
    if (-not (Test-Path $chocoRoot)) {
        Write-Host "Removed: $chocoRoot" -ForegroundColor Green
    } else {
        Write-Host "  WARNING: Could not fully remove $chocoRoot" -ForegroundColor DarkYellow
    }
} else {
    Write-Host "  Chocolatey not found -- skipping" -ForegroundColor DarkGray
}

# Remove chocolatey entries from System and User PATH
# (Phase 11 runs before Phase 13 so this must be done explicitly here)
foreach ($scope in @('Machine', 'User')) {
    $currentPath = [Environment]::GetEnvironmentVariable('PATH', $scope)
    if (-not $currentPath) { continue }
    $entries    = $currentPath -split ';' | Where-Object { $_.Trim() -ne '' }
    $cleanPath  = $entries | Where-Object { $_ -notmatch 'chocolatey' }
    if ($cleanPath.Count -ne $entries.Count) {
        [Environment]::SetEnvironmentVariable('PATH', ($cleanPath -join ';'), $scope)
        Write-Host "  Removed chocolatey from $scope PATH" -ForegroundColor DarkGray
    }
}

# ============================================================
# PHASE 14 — Startup registry entries cleanup (HKCU + HKLM)
# ============================================================
Write-Host "`n=== PHASE 14: STARTUP ENTRIES CLEANUP ===" -ForegroundColor Cyan

foreach ($key in @(
    'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run',
    'HKCU:\Software\Microsoft\Windows\CurrentVersion\RunOnce',
    'HKLM:\Software\Microsoft\Windows\CurrentVersion\Run',
    'HKLM:\Software\Microsoft\Windows\CurrentVersion\RunOnce'
)) {
    if (-not (Test-Path $key)) { continue }
    $props = Get-Item $key -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Property
    foreach ($entryName in $props) {
        $keep = $false
        foreach ($k in $keepStartup) { if ($entryName -like $k) { $keep = $true; break } }
        if ($keep) { continue }
        Remove-ItemProperty -Path $key -Name $entryName -Force -ErrorAction SilentlyContinue
        Write-Host "Removed startup entry: $entryName" -ForegroundColor DarkGray
    }
}

# ============================================================
# PHASE 15 — Orphaned services cleanup
# ============================================================
Write-Host "`n=== PHASE 15: ORPHANED SERVICES CLEANUP ===" -ForegroundColor Cyan

foreach ($svc in (Get-CimInstance Win32_Service -ErrorAction SilentlyContinue)) {
    $svcName = $svc.Name
    $skip = $false
    foreach ($s in $serviceSkipLike) { if ($svcName -like $s) { $skip = $true; break } }
    if ($skip) { continue }
    $pathName = $svc.PathName
    if (-not $pathName) { continue }
    $exePath = (Split-UninstallCommand $pathName).Exe
    if ($exePath -and -not (Test-Path $exePath)) {
        Write-Host "Removing orphaned service: $svcName (missing binary $exePath)" -ForegroundColor Yellow
        Stop-Service -Name $svcName -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 2
        sc.exe delete "$svcName" | Out-Null
        Write-Host "Removed: $svcName" -ForegroundColor Green
    }
}

# ============================================================
# PHASE 16 — Empty Recycle Bin
# ============================================================
Write-Host "`n=== PHASE 16: EMPTYING RECYCLE BIN ===" -ForegroundColor Cyan

try {
    Clear-RecycleBin -Force -ErrorAction SilentlyContinue
    Write-Host "  Recycle Bin emptied" -ForegroundColor Green
} catch {
    Write-Host "  Could not empty Recycle Bin -- $_" -ForegroundColor DarkYellow
}

# ============================================================
# PHASE 17 — Trace / activity / network / system cleanup
# ============================================================
Write-Host "`n=== PHASE 17: TRACE & ACTIVITY CLEANUP ===" -ForegroundColor Cyan

# ── Helper: run a scriptblock against every local user's hive ──
function Invoke-ForEachUserHive {
    param([scriptblock]$Action)
    & $Action 'HKCU:'
    foreach ($userDir in (Get-UserProfiles)) {
        $ntuser = Join-Path $userDir.FullName 'NTUSER.DAT'
        if (-not (Test-Path $ntuser)) { continue }
        $tempHive = "TempHive17_$($userDir.Name)"
        reg load "HKU\$tempHive" "$ntuser" 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) { continue }
        try {
            & $Action "HKU:\$tempHive"
        } finally {
            [gc]::Collect(); [gc]::WaitForPendingFinalizers()
            Start-Sleep -Milliseconds 500
            reg unload "HKU\$tempHive" 2>&1 | Out-Null
        }
    }
}

# --- 17a: Jump Lists + Recent Items ---
Write-Host "-- Jump lists / recent items --" -ForegroundColor Cyan
foreach ($userDir in (Get-UserProfiles)) {
    $userProfile = $userDir.FullName
    if (-not $userProfile) { continue }
    foreach ($p in @(
        'AppData\Roaming\Microsoft\Windows\Recent\AutomaticDestinations',
        'AppData\Roaming\Microsoft\Windows\Recent\CustomDestinations',
        'AppData\Roaming\Microsoft\Windows\Recent'
    )) {
        $target = Join-Path $userProfile $p
        if (Test-Path $target) {
            Get-ChildItem $target -File -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
        }
    }
}

# --- 17b: RecentDocs / RunMRU / TypedPaths registry ---
Write-Host "-- RecentDocs / RunMRU / TypedPaths registry --" -ForegroundColor Cyan
Invoke-ForEachUserHive -Action {
    param($hiveRoot)
    foreach ($p in @(
        "$hiveRoot\Software\Microsoft\Windows\CurrentVersion\Explorer\RecentDocs",
        "$hiveRoot\Software\Microsoft\Windows\CurrentVersion\Explorer\RunMRU",
        "$hiveRoot\Software\Microsoft\Windows\CurrentVersion\Explorer\TypedPaths",
        "$hiveRoot\Software\Microsoft\Windows\CurrentVersion\Explorer\ComDlg32\OpenSavePidlMRU",
        "$hiveRoot\Software\Microsoft\Windows\CurrentVersion\Explorer\ComDlg32\LastVisitedPidlMRU"
    )) {
        if (Test-Path $p) { Remove-Item $p -Recurse -Force -ErrorAction SilentlyContinue }
    }
}

# --- 17c: Windows Timeline / Activity History ---
Write-Host "-- Activity History / Timeline --" -ForegroundColor Cyan
foreach ($userDir in (Get-UserProfiles)) {
    $userProfile = $userDir.FullName
    if (-not $userProfile) { continue }
    $actDb = Join-Path $userProfile 'AppData\Local\ConnectedDevicesPlatform'
    if (Test-Path $actDb) {
        Get-ChildItem $actDb -Recurse -Filter 'ActivitiesCache.db*' -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
    }
}
Invoke-ForEachUserHive -Action {
    param($hiveRoot)
    $key = "$hiveRoot\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced"
    if (Test-Path $key) { Set-ItemProperty -Path $key -Name 'Start_TrackDocs' -Value 0 -ErrorAction SilentlyContinue }
}

# --- 17d: Clipboard history ---
Write-Host "-- Clipboard history --" -ForegroundColor Cyan
try { Clear-Clipboard -ErrorAction SilentlyContinue } catch { }
Invoke-ForEachUserHive -Action {
    param($hiveRoot)
    $key = "$hiveRoot\Software\Microsoft\Clipboard"
    if (Test-Path $key) { Remove-Item $key -Recurse -Force -ErrorAction SilentlyContinue }
}

# --- 17e: Wi-Fi saved profiles ---
Write-Host "-- Wi-Fi profiles --" -ForegroundColor Cyan
try {
    $wifiLines = netsh wlan show profiles 2>$null
    foreach ($line in $wifiLines) {
        if ($line -match 'All User Profile\s*:\s*(.+)$') {
            $p = $matches[1].Trim()
            netsh wlan delete profile name="$p" | Out-Null
            Write-Host "  Removed Wi-Fi profile: $p" -ForegroundColor DarkGray
        }
    }
} catch { }

# --- 17f: Mapped network drives + RDP connection history ---
Write-Host "-- Mapped drives / RDP MRU --" -ForegroundColor Cyan
try { net use * /delete /y 2>$null | Out-Null } catch { }
Invoke-ForEachUserHive -Action {
    param($hiveRoot)
    foreach ($key in @(
        "$hiveRoot\Software\Microsoft\Terminal Server Client\Default",
        "$hiveRoot\Software\Microsoft\Terminal Server Client\Servers"
    )) {
        if (Test-Path $key) { Remove-Item $key -Recurse -Force -ErrorAction SilentlyContinue }
    }
}

# --- 17g: Prefetch ---
Write-Host "-- Prefetch --" -ForegroundColor Cyan
if (Test-Path 'C:\Windows\Prefetch') {
    Get-ChildItem 'C:\Windows\Prefetch' -Filter '*.pf' -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
}

# --- 17h: Windows Event Logs ---
Write-Host "-- Event logs --" -ForegroundColor Cyan
try {
    foreach ($log in (wevtutil el)) { wevtutil cl "$log" 2>$null }
} catch { }

# --- 17i: Search index rebuild ---
Write-Host "-- Search index --" -ForegroundColor Cyan
try {
    Stop-Service WSearch -Force -ErrorAction SilentlyContinue
    $idx = 'C:\ProgramData\Microsoft\Search\Data\Applications\Windows'
    if (Test-Path $idx) { Remove-FolderWithRetry -Path $idx }
    Start-Service WSearch -ErrorAction SilentlyContinue
    Write-Host "  Index cleared -- will rebuild automatically" -ForegroundColor DarkGray
} catch { }

# --- 17j: Taskbar pins + layout cache ---
Write-Host "-- Taskbar pins --" -ForegroundColor Cyan
foreach ($userDir in (Get-UserProfiles)) {
    $userProfile = $userDir.FullName
    if (-not $userProfile) { continue }

    # Remove pinned shortcut files
    $pinned = Join-Path $userProfile 'AppData\Roaming\Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar'
    if (Test-Path $pinned) {
        Get-ChildItem $pinned -File -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
    }

    # Remove taskbar layout XML — Windows rebuilds default layout on next login
    $layoutXml = Join-Path $userProfile 'AppData\Local\Microsoft\Windows\Shell\LayoutModification.xml'
    if (Test-Path $layoutXml) {
        Remove-Item $layoutXml -Force -ErrorAction SilentlyContinue
        Write-Host "  Cleared taskbar layout: $layoutXml" -ForegroundColor DarkGray
    }

    # Remove taskbar cache DB files
    foreach ($cacheFile in @(
        (Join-Path $userProfile 'AppData\Local\Microsoft\Windows\Shell\DefaultLayouts.xml'),
        (Join-Path $userProfile 'AppData\Roaming\Microsoft\Internet Explorer\Quick Launch\User Pinned\ImplicitAppShortcuts')
    )) {
        if (Test-Path $cacheFile) {
            Remove-Item $cacheFile -Recurse -Force -ErrorAction SilentlyContinue
            Write-Host "  Cleared taskbar cache: $cacheFile" -ForegroundColor DarkGray
        }
    }
}

# Clear the TaskBand registry key per user (stores pinned app order/state)
Invoke-ForEachUserHive -Action {
    param($hiveRoot)
    $taskBandKey = "$hiveRoot\Software\Microsoft\Windows\CurrentVersion\Explorer\Taskband"
    if (Test-Path $taskBandKey) {
        Remove-Item $taskBandKey -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host "  Cleared TaskBand registry key" -ForegroundColor DarkGray
    }
}

# Re-pin Edge and File Explorer to the taskbar by writing a default layout XML.
# This runs for all user profiles so every user who logs in gets the correct
# default taskbar with Edge + File Explorer pinned, matching the clean VM state.
Write-Host "-- Restoring default taskbar pins (Edge + File Explorer) --" -ForegroundColor Cyan

$defaultTaskbarXml = @'
<?xml version="1.0" encoding="utf-8"?>
<LayoutModificationTemplate
    xmlns="http://schemas.microsoft.com/Start/2014/LayoutModification"
    xmlns:defaultlayout="http://schemas.microsoft.com/Start/2014/FullDefaultLayout"
    xmlns:start="http://schemas.microsoft.com/Start/2014/StartLayout"
    xmlns:taskbar="http://schemas.microsoft.com/Start/2014/TaskbarLayout"
    Version="1">
  <CustomTaskbarLayoutCollection PinListPlacement="Replace">
    <defaultlayout:TaskbarLayout>
      <taskbar:TaskbarPinList>
        <taskbar:DesktopApp DesktopApplicationLinkPath="%APPDATA%\Microsoft\Windows\Start Menu\Programs\System Tools\File Explorer.lnk" />
        <taskbar:DesktopApp DesktopApplicationID="MSEdge" />
      </taskbar:TaskbarPinList>
    </defaultlayout:TaskbarLayout>
  </CustomTaskbarLayoutCollection>
</LayoutModificationTemplate>
'@

foreach ($userDir in (Get-UserProfiles)) {
    $userProfile = $userDir.FullName
    if (-not $userProfile) { continue }
    $shellDir = Join-Path $userProfile 'AppData\Local\Microsoft\Windows\Shell'
    if (-not (Test-Path $shellDir)) {
        New-Item -ItemType Directory -Path $shellDir -Force -ErrorAction SilentlyContinue | Out-Null
    }
    $layoutPath = Join-Path $shellDir 'LayoutModification.xml'
    try {
        Set-Content -Path $layoutPath -Value $defaultTaskbarXml -Encoding UTF8 -Force -ErrorAction SilentlyContinue
        Write-Host "  Wrote default taskbar layout for: $($userDir.Name)" -ForegroundColor DarkGray
    } catch {
        Write-Host "  WARNING: Could not write taskbar layout for $($userDir.Name): $_" -ForegroundColor DarkYellow
    }
}

# --- 17k: Personalization reset (wallpaper/theme back to default, key NOT deleted) ---
Write-Host "-- Personalization reset --" -ForegroundColor Cyan
Invoke-ForEachUserHive -Action {
    param($hiveRoot)
    $desktopKey = "$hiveRoot\Control Panel\Desktop"
    if (Test-Path $desktopKey) {
        Set-ItemProperty -Path $desktopKey -Name 'Wallpaper'      -Value '%SystemRoot%\web\wallpaper\Windows\img0.jpg' -ErrorAction SilentlyContinue
        Set-ItemProperty -Path $desktopKey -Name 'WallpaperStyle' -Value '10' -ErrorAction SilentlyContinue
        Set-ItemProperty -Path $desktopKey -Name 'TileWallpaper'  -Value '0'  -ErrorAction SilentlyContinue
    }
    $themesKey = "$hiveRoot\Software\Microsoft\Windows\CurrentVersion\Themes"
    if (Test-Path $themesKey) {
        Set-ItemProperty -Path $themesKey -Name 'CurrentTheme' -Value '%SystemRoot%\resources\themes\aero\aero.theme' -ErrorAction SilentlyContinue
        Set-ItemProperty -Path $themesKey -Name 'LastTheme'    -Value '%SystemRoot%\resources\themes\aero\aero.theme' -ErrorAction SilentlyContinue
    }
}

# --- 17l: Windows Update cache ---
Write-Host "-- Windows Update cache --" -ForegroundColor Cyan
try {
    Stop-Service wuauserv -Force -ErrorAction SilentlyContinue
    $wu = 'C:\Windows\SoftwareDistribution\Download'
    if (Test-Path $wu) { Remove-FolderWithRetry -Path $wu }
    Start-Service wuauserv -ErrorAction SilentlyContinue
} catch { }

# --- 17m: TEMP folder cleanup ---
Write-Host "-- TEMP folders --" -ForegroundColor Cyan
if (Test-Path 'C:\Windows\Temp') {
    Get-ChildItem 'C:\Windows\Temp' -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
}
foreach ($userDir in (Get-UserProfiles)) {
    $userProfile = $userDir.FullName
    if (-not $userProfile) { continue }
    $t = Join-Path $userProfile 'AppData\Local\Temp'
    if (Test-Path $t) {
        Get-ChildItem $t -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
    }
}

# --- 17o: DNS + ARP cache ---
Write-Host "-- DNS / ARP cache --" -ForegroundColor Cyan
try {
    ipconfig /flushdns | Out-Null
    arp -d * 2>$null | Out-Null
} catch { }

# --- 17p: Restart Explorer to clear open windows and ghost taskbar thumbnails ---
Write-Host "-- Restarting Explorer --" -ForegroundColor Cyan
try {
    # Set Explorer to NOT open a folder window on launch (launch to desktop only)
    # LaunchTo: 1 = This PC, 2 = Quick Access
    # Setting HubMode suppresses the automatic folder open on restart
    $explorerAdvKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced'
    if (Test-Path $explorerAdvKey) {
        Set-ItemProperty -Path $explorerAdvKey -Name 'LaunchTo' -Value 1 -ErrorAction SilentlyContinue
    }

    # Disable "launch folder windows in a separate process" so shell restart works cleanly
    $explorerKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer'
    if (Test-Path $explorerKey) {
        Set-ItemProperty -Path $explorerKey -Name 'DesktopProcess' -Value 0 -ErrorAction SilentlyContinue
    }

    Stop-Process -Name 'explorer' -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2

    # Start Explorer as the shell (desktop only, no folder window)
    $shell = New-Object -ComObject Shell.Application -ErrorAction SilentlyContinue
    if ($shell) {
        # Use shell automation to restart — this starts the desktop shell without opening a window
        Start-Process 'explorer.exe' -ArgumentList 'shell:::{26EE0668-A00A-44D7-9371-BEB064C98683}' -ErrorAction SilentlyContinue
        Start-Sleep -Milliseconds 800
        # Close that control panel window that opened
        $shell.Windows() | ForEach-Object { try { $_.Quit() } catch {} }
    } else {
        Start-Process 'explorer.exe'
    }

    Write-Host "  Explorer restarted -- session state cleared" -ForegroundColor DarkGray
} catch {
    Write-Host "  Could not restart Explorer -- $_" -ForegroundColor DarkYellow
}

# Clear Recycle Bin AFTER Explorer restarts so the icon refreshes to empty.
# Running it before Explorer restarts causes the icon to remain showing "full"
# even though the bin was emptied.
Write-Host "-- Emptying Recycle Bin (post-Explorer restart refresh) --" -ForegroundColor Cyan
try {
    Start-Sleep -Milliseconds 500  # brief pause so Explorer shell is ready
    Clear-RecycleBin -Force -ErrorAction SilentlyContinue
    Write-Host "  Recycle Bin emptied and icon refreshed" -ForegroundColor Green
} catch {
    Write-Host "  Could not empty Recycle Bin -- $_" -ForegroundColor DarkYellow
}

Write-Host "`n=== PHASE 18: DRIVE ROOT SWEEP (user-created folders on all drives) ===" -ForegroundColor Cyan

# Dynamically detect all fixed drives on this VM and delete any top-level folder
# that is not a known Windows system folder.
# This catches folders like C:\mahi, C:\work, D:\projects etc. that users create
# directly on a drive root — these are not covered by any other phase.

# System folders that must never be deleted — per drive letter
# C:\ has many more protected folders than other drives
$cSystemFolders = @(
    'Windows','Users','Program Files','Program Files (x86)','ProgramData',
    'inetpub','PerfLogs','sysprep1007','$Recycle.Bin','$WinREAgent',
    'Config.Msi','Recovery','System Volume Information','$SysReset',
    'OneDriveTemp','MSOCache'
)
# For non-C drives, only Windows metadata folders are protected
$otherDriveSystemFolders = @(
    '$Recycle.Bin','System Volume Information','$WinREAgent'
)

# Get all fixed local drives (type 3 = Fixed)
$fixedDrives = [System.IO.DriveInfo]::GetDrives() |
    Where-Object { $_.DriveType -eq [System.IO.DriveType]::Fixed -and $_.IsReady }

foreach ($drive in $fixedDrives) {
    $driveLetter = $drive.RootDirectory.FullName  # e.g. "C:\"
    $isSystemDrive = ($driveLetter -like 'C:\' -or $driveLetter -like 'C:/')
    $protectedFolders = if ($isSystemDrive) { $cSystemFolders } else { $otherDriveSystemFolders }

    Write-Host "  Sweeping drive root: $driveLetter" -ForegroundColor DarkGray

    foreach ($dir in (Get-ChildItem $driveLetter -Directory -ErrorAction SilentlyContinue)) {
        $isProtected = $false
        foreach ($s in $protectedFolders) {
            if ($dir.Name -eq $s -or $dir.Name -like $s) {
                $isProtected = $true
                break
            }
        }
        if ($isProtected) { continue }

        Write-Host "  Removing user folder: $($dir.FullName)" -ForegroundColor Yellow
        Remove-FolderWithRetry -Path $dir.FullName
        if (-not (Test-Path $dir.FullName)) {
            Write-Host "  Removed: $($dir.FullName)" -ForegroundColor Green
        }
    }
}

Write-Host "`n=== RESET COMPLETE ===" -ForegroundColor Cyan
