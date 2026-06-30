# build-linux.ps1
# Run from repo root: .\build-linux.ps1
# Cross-compiles the Linux agent binary on Windows using Go's built-in cross-compilation.
# Requires: Go 1.21+ installed, WSL not required.

param(
    [string]$PlatformURL   = "",
    [string]$EnrollmentKey = "",
    [string]$AccountToken  = ""
)

$ErrorActionPreference = "Stop"

$AgentDir  = Join-Path $PSScriptRoot "agent"
$OutputDir = Join-Path $AgentDir "dist"
$Output    = Join-Path $OutputDir "racko-agent"

Write-Host "=== Building Racko Agent for Linux ===" -ForegroundColor Cyan

# Ensure dist/ exists
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

# Build ldflags
$LDFlags = ""
if ($PlatformURL)   { $LDFlags += " -X github.com/racko-ai/agent/config.LDPlatformURL=$PlatformURL" }
if ($AccountToken)  { $LDFlags += " -X github.com/racko-ai/agent/config.LDAccountToken=$AccountToken" }
if ($EnrollmentKey) { $LDFlags += " -X github.com/racko-ai/agent/config.LDEnrollmentKey=$EnrollmentKey" }
$LDFlags = $LDFlags.Trim()

Write-Host "Output: $Output"
if ($LDFlags) { Write-Host "LDFlags: $LDFlags" }

Push-Location $AgentDir
try {
    $env:GOOS   = "linux"
    $env:GOARCH = "amd64"
    $env:CGO_ENABLED = "0"   # static binary — no glibc dependency

    $buildArgs = @("build", "-o", $Output)
    if ($LDFlags) {
        $buildArgs += @("-ldflags", $LDFlags)
    }
    $buildArgs += "."

    Write-Host "Running: go $($buildArgs -join ' ')"
    & go @buildArgs

    if ($LASTEXITCODE -ne 0) {
        throw "go build failed with exit code $LASTEXITCODE"
    }

    $size = (Get-Item $Output).Length
    $sizeMB = [math]::Round($size/1MB, 1)
    Write-Host ""
    Write-Host "Built successfully: $Output ($sizeMB MB)" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Yellow
    Write-Host "  1. Commit agent/dist/racko-agent to the repo (or deploy to server)"
    Write-Host "  2. Restart core-api so it can serve the new binary"
    Write-Host "  3. On Ubuntu VM: download and run with --install flag"
} finally {
    $env:GOOS   = ""
    $env:GOARCH = ""
    $env:CGO_ENABLED = ""
    Pop-Location
}
