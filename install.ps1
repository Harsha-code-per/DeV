# DeV Code installer for Windows.
#   irm https://harsha-code-per.github.io/DeV/install.ps1 | iex
#   & ([scriptblock]::Create((irm https://harsha-code-per.github.io/DeV/install.ps1))) 1.2.3   (a given version)
# Installs to ~\.devcode\bin, or $env:DEVCODE_INSTALL_DIR. The download is checked against the
# release's SHA256SUMS before anything is installed.
param([string]$Version = $(if ($env:DEVCODE_VERSION) { $env:DEVCODE_VERSION } else { "latest" }))
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$repo = "Harsha-code-per/DeV"
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
  Write-Host "Downloading $asset ($Version)"
  try {
    Invoke-WebRequest -UseBasicParsing -Uri "$base/SHA256SUMS" -OutFile "$tmp\SHA256SUMS"
    Invoke-WebRequest -UseBasicParsing -Uri "$base/$asset" -OutFile "$tmp\$asset"
  } catch {
    throw "Download from $base failed. The release may not exist, or the repository is still private (until v1.0)."
  }

  $line = Get-Content "$tmp\SHA256SUMS" | Where-Object { ($_ -split '\s+')[1] -in @($asset, "*$asset") } | Select-Object -First 1
  if (-not $line) { throw "SHA256SUMS has no entry for $asset" }
  $expected = ($line -split '\s+')[0].ToLower()
  $actual = (Get-FileHash -Algorithm SHA256 "$tmp\$asset").Hash.ToLower()
  if ($actual -ne $expected) { throw "Checksum mismatch for $asset (expected $expected, got $actual)" }

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
  # "dev" is a shim so upgrades only ever replace devcode.exe.
  Set-Content -Path (Join-Path $dir "dev.cmd") -Value "@`"%~dp0devcode.exe`" %*" -Encoding ASCII
} finally {
  Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
}

Write-Host "Installed DeV Code to $dir"
$path = [Environment]::GetEnvironmentVariable("Path", "User")
if (($path -split ';') -notcontains $dir) {
  Write-Host ""
  Write-Host "Add DeV Code to your PATH (then open a new terminal):"
  Write-Host "  [Environment]::SetEnvironmentVariable('Path', `"$dir;`" + [Environment]::GetEnvironmentVariable('Path', 'User'), 'User')"
}
