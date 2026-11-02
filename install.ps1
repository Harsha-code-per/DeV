# DeV Code installer for Windows.
#   irm https://harsha-code-per.github.io/DeV/install.ps1 | iex
#   & ([scriptblock]::Create((irm https://harsha-code-per.github.io/DeV/install.ps1))) 1.2.3   (a given version)
# Installs to ~\.devcode\bin, or $env:DEVCODE_INSTALL_DIR, and adds that folder to your PATH. The
# download is checked against the release's SHA256SUMS before anything is installed.
param([string]$Version = $(if ($env:DEVCODE_VERSION) { $env:DEVCODE_VERSION } else { "latest" }))
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$repo = "Harsha-code-per/DeV"
$e = [char]27
$color = $Host.UI.SupportsVirtualTerminal -and -not $env:NO_COLOR
function Paint($code, $text) { if ($color) { "$e[${code}m$text$e[0m" } else { $text } }
function Step($text) { Write-Host "  $(Paint 32 ([char]0x2713)) $text" }
Write-Host ""
Write-Host "  $(Paint '1;38;2;242;165;22' 'D e V')  $(Paint 2 'Code installer')"
Write-Host ""
$dir = if ($env:DEVCODE_INSTALL_DIR) { $env:DEVCODE_INSTALL_DIR } else { Join-Path $HOME ".devcode\bin" }
$arch = if ($env:PROCESSOR_ARCHITEW6432) { $env:PROCESSOR_ARCHITEW6432 } else { $env:PROCESSOR_ARCHITECTURE }
$asset = switch ($arch) {
  "AMD64" { "devcode-windows-x64.zip" }
  "ARM64" { "devcode-windows-arm64.zip" }
  default { throw "Unsupported CPU: $arch" }
}
$base = if ($Version -eq "latest") {
  "https://github.com/$repo/releases/latest/download"
} else {
  "https://github.com/$repo/releases/download/v$($Version.TrimStart('v'))"
}

$tmp = Join-Path ([IO.Path]::GetTempPath()) ("devcode-" + [Guid]::NewGuid())
New-Item -ItemType Directory -Path $tmp | Out-Null
try {
  Step "This computer: windows $($arch.ToLower())"
  Write-Host "  $(Paint '38;2;242;165;22' ([char]0x2193)) Downloading DeV Code $(Paint 2 "($Version)")"
  try {
    Invoke-WebRequest -UseBasicParsing -Uri "$base/SHA256SUMS" -OutFile "$tmp\SHA256SUMS"
    Invoke-WebRequest -UseBasicParsing -Uri "$base/$asset" -OutFile "$tmp\$asset"
  } catch {
    throw "Download from $base failed. Check your connection, or that version $Version exists."
  }

  $line = Get-Content "$tmp\SHA256SUMS" | Where-Object { ($_ -split '\s+')[1] -in @($asset, "*$asset") } | Select-Object -First 1
  if (-not $line) { throw "SHA256SUMS has no entry for $asset" }
  $expected = ($line -split '\s+')[0].ToLower()
  $actual = (Get-FileHash -Algorithm SHA256 "$tmp\$asset").Hash.ToLower()
  if ($actual -ne $expected) { throw "Checksum mismatch for $asset (expected $expected, got $actual)" }
  Step "Checksum verified"

  Expand-Archive -Path "$tmp\$asset" -DestinationPath "$tmp\extract"
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  # Files beside the binary (such as vendor\) first. A running devcode.exe can be renamed but not
  # overwritten, so move it aside before putting the new one in place.
  $target = Join-Path $dir "devcode.exe"
  Copy-Item "$tmp\extract\*" $dir -Exclude devcode.exe -Recurse -Force
  Copy-Item "$tmp\extract\devcode.exe" "$target.new" -Force
  Remove-Item "$target.old" -Force -ErrorAction SilentlyContinue
  if (Test-Path $target) { Move-Item $target "$target.old" -Force }
  Move-Item "$target.new" $target
  # 1.0.x also installed a dev.cmd shim; that name belongs to the DeV desktop app.
  Remove-Item (Join-Path $dir "dev.cmd") -Force -ErrorAction SilentlyContinue
} finally {
  Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
}

$installed = & (Join-Path $dir "devcode.exe") --version 2>$null
Step "Installed DeV Code $installed to $dir"
$path = [Environment]::GetEnvironmentVariable("Path", "User")
if (($path -split ';') -notcontains $dir) {
  [Environment]::SetEnvironmentVariable("Path", "$dir;$path", "User")
  Step "Added to PATH"
}
# This window too, so devcode works right away.
if (($env:Path -split ';') -notcontains $dir) { $env:Path = "$dir;$env:Path" }

Write-Host ""
Write-Host "  $(Paint '1;38;2;242;165;22' 'DeV Code is ready.')"
Write-Host ""
Write-Host "  Start with:  $(Paint 1 'devcode')"
Write-Host ""
