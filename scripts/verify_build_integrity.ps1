param (
    [string]$InstallerPath = ""
)

$ErrorActionPreference = "Stop"

Write-Host "=================================================================="
Write-Host " [AUTOMATED FACT CHECK] HomeSpark Binary Integrity Verifier"
Write-Host "=================================================================="

if (-not $InstallerPath) {
    # Find latest exe in dist-package
    $distDir = "G:\My_Project\spark\lab_sales_spark_frontend\dist-package"
    $exes = Get-ChildItem -Path $distDir -Filter "*.exe" -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending
    if ($exes) {
        $InstallerPath = $exes[0].FullName
    } else {
        Write-Error "[FAIL] No installer executable found to verify!"
    }
}

Write-Host "[1/4] Verifying Installer Exists: $InstallerPath"
if (-not (Test-Path $InstallerPath)) {
    Write-Error "[FAIL] Installer does not exist at: $InstallerPath"
}

$file = Get-Item $InstallerPath
Write-Host "      Size: $([math]::Round($file.Length / 1MB, 2)) MB ($($file.Length) bytes)"
if ($file.Length -lt 150MB) {
    Write-Error "[FAIL] Installer size is suspiciously small (< 150MB). Python runtime might be missing!"
}

# 7-Zip inspection
$7z = "C:\Program Files\7-Zip\7z.exe"
if (-not (Test-Path $7z)) {
    $7z = "C:\Program Files (x86)\7-Zip\7z.exe"
}
if (-not (Test-Path $7z)) {
    Write-Host "[WARN] 7-Zip not installed. Skipping deep internal extraction check."
    exit 0
}

$tempExtract = Join-Path $env:TEMP ("homespark_verify_" + [System.Guid]::NewGuid().ToString().Substring(0, 8))
New-Item -ItemType Directory -Path $tempExtract -Force | Out-Null

try {
    Write-Host "[2/4] Extracting NSIS Container..."
    & $7z x "$InstallerPath" "-o$tempExtract" -y | Out-Null

    $app7z = Get-ChildItem -Path $tempExtract -Recurse -Filter "*.7z"
    if ($app7z) {
        $innerExtract = Join-Path $tempExtract "inner"
        & $7z x $app7z[0].FullName "-o$innerExtract" -y | Out-Null
        $searchRoot = $innerExtract
    } else {
        $searchRoot = $tempExtract
    }

    Write-Host "[3/4] Checking Python Runtime in Packaged Artifacts..."
    $py = Get-ChildItem -Path $searchRoot -Recurse -Filter "python.exe"
    if (-not $py) {
        Write-Error "[FATAL ERROR] python.exe is MISSING inside the packaged application!"
    }
    Write-Host "      [PASS] Found python.exe at: $($py[0].FullName)"

    Write-Host "[4/4] Checking Auto-Updater Metadata (app-update.yml)..."
    $updater = Get-ChildItem -Path $searchRoot -Recurse -Filter "app-update.yml"
    if (-not $updater) {
        Write-Error "[FATAL ERROR] app-update.yml is MISSING inside the packaged application!"
    }
    Write-Host "      [PASS] Found app-update.yml with content:"
    Get-Content $updater[0].FullName | ForEach-Object { Write-Host "             $_" }

    Write-Host "=================================================================="
    Write-Host " [RESULT: CLEARED] All physical binary integrity checks PASSED!"
    Write-Host "=================================================================="
}
finally {
    if (Test-Path $tempExtract) {
        Remove-Item $tempExtract -Recurse -Force -ErrorAction SilentlyContinue
    }
}
