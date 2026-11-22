# Node.js for this user only (no admin), when the PC has no Node 20+. Windows.
# Installs Node 24 LTS from nodejs.org into %USERPROFILE%\roblox-shorts\tools\node, checked against its SHASUMS256.txt.
# Run: powershell -NoProfile -ExecutionPolicy Bypass -File install\node.ps1
# The last line is  NODE=<path to node.exe>  or  FAILED: <reason>.
$ErrorActionPreference = "Stop"; $ProgressPreference = "SilentlyContinue"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
function Fail($m) { Write-Output "FAILED: $m"; exit 1 }
$sys = Get-Command node -ErrorAction SilentlyContinue
if ($sys) { & $sys.Source -e "process.exit(Number(process.versions.node.split('.')[0]) < 20 ? 1 : 0)"; if ($LASTEXITCODE -eq 0) { Write-Output ("NODE=" + $sys.Source); exit 0 } }
$T = Join-Path $env:USERPROFILE "roblox-shorts\tools"
$node = Join-Path $T "node\node.exe"
if (Test-Path $node) { & $node -e "process.exit(Number(process.versions.node.split('.')[0]) < 20 ? 1 : 0)"; if ($LASTEXITCODE -eq 0) { Write-Output "NODE=$node"; exit 0 } }
New-Item -ItemType Directory -Force -Path $T | Out-Null
$Tmp = Join-Path ([IO.Path]::GetTempPath()) ("rs-" + [guid]::NewGuid().ToString("N")); New-Item -ItemType Directory -Force -Path $Tmp | Out-Null
function Get-File($url, $out) {
  for ($i = 0; $i -lt 3; $i++) { try { Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $out; return } catch { Start-Sleep 2 } }
  try { Invoke-WebRequest -UseBasicParsing -Method Head -Uri "https://nodejs.org" -TimeoutSec 10 | Out-Null } catch { Fail "no internet connection. Connect, then try again." }
  Fail ("couldn't download " + [IO.Path]::GetFileName($url) + ". Try again in a minute.")
}
$arch = if ($env:PROCESSOR_ARCHITECTURE -eq "ARM64") { "arm64" } else { "x64" }
Write-Output "Getting Node.js..."
Get-File "https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt" "$Tmp\sums"
$line = Get-Content "$Tmp\sums" | Where-Object { $_ -match "node-v[0-9.]+-win-$arch\.zip$" } | Select-Object -First 1
if (-not $line) { Fail "couldn't find Node.js for this PC." }
$sum, $f = $line -split "\s+"
Get-File "https://nodejs.org/dist/latest-v24.x/$f" "$Tmp\$f"
if ((Get-FileHash -Algorithm SHA256 "$Tmp\$f").Hash.ToLower() -ne $sum.ToLower()) { Fail "the download didn't match its official checksum. Try again." }
Expand-Archive -Force "$Tmp\$f" "$Tmp\node"
if (Test-Path (Join-Path $T "node")) { Remove-Item -Recurse -Force (Join-Path $T "node") }
Move-Item (Get-ChildItem "$Tmp\node" | Select-Object -First 1).FullName (Join-Path $T "node")
Remove-Item -Recurse -Force $Tmp -ErrorAction SilentlyContinue
Write-Output "NODE=$node"
