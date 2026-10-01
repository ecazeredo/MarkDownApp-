# Packages the release EXE as an MSIX for the Microsoft Store.
# Usage: pwsh store/build-msix.ps1 -Version 1.0.0.0
param([Parameter(Mandatory)][string]$Version)
$ErrorActionPreference = "Stop"

$root = Split-Path $PSScriptRoot -Parent
$identity = Get-Content "$PSScriptRoot/identity.json" -Raw | ConvertFrom-Json
$layout = Join-Path $root "out/msix-layout"
Remove-Item $layout -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force "$layout/Assets" | Out-Null

Copy-Item "$root/src-tauri/target/release/markdownpp.exe" $layout
Copy-Item "$PSScriptRoot/assets/Square44x44Logo.png", "$PSScriptRoot/assets/Square150x150Logo.png", "$PSScriptRoot/assets/StoreLogo.png", "$PSScriptRoot/assets/Wide310x150Logo.png" "$layout/Assets"

(Get-Content "$PSScriptRoot/AppxManifest.xml" -Raw).
  Replace("{{NAME}}", $identity.name).
  Replace("{{PUBLISHER}}", $identity.publisher).
  Replace("{{PUBLISHER_DISPLAY_NAME}}", $identity.publisherDisplayName).
  Replace("{{DISPLAY_NAME}}", $identity.displayName).
  Replace("{{VERSION}}", $Version) | Set-Content "$layout/AppxManifest.xml" -Encoding utf8

$makeappx = Get-ChildItem "${env:ProgramFiles(x86)}\Windows Kits\10\bin\*\x64\makeappx.exe" |
  Sort-Object FullName -Descending | Select-Object -First 1
if (-not $makeappx) { throw "makeappx.exe not found; install the Windows SDK." }

$out = Join-Path $root "out/MarkDownEditor_$Version`_x64.msix"
& $makeappx.FullName pack /o /d $layout /p $out
if ($LASTEXITCODE -ne 0) { throw "makeappx failed with exit code $LASTEXITCODE" }
Write-Host "Created $out"
