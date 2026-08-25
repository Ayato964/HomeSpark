$ErrorActionPreference = "Stop"

$BackendDir = Resolve-Path "$PSScriptRoot\..\lab_sales_spark_backend"
$RuntimeDir = "$BackendDir\python_runtime"
$ZipUrl = "https://www.python.org/ftp/python/3.10.11/python-3.10.11-embed-amd64.zip"
$ZipFile = "$BackendDir\python_embed.zip"
$GetPipUrl = "https://bootstrap.pypa.io/get-pip.py"
$GetPipFile = "$BackendDir\get-pip.py"

Write-Host "[Python Portable] Setting up standalone embedded Python runtime..."

if (-not (Test-Path $RuntimeDir)) {
    New-Item -ItemType Directory -Path $RuntimeDir -Force | Out-Null
}

# 1. Download Python Embeddable Zip if not exists
if (-not (Test-Path "$RuntimeDir\python.exe")) {
    Write-Host "[Python Portable] Downloading Python 3.10.11 Embeddable ZIP..."
    Invoke-WebRequest -Uri $ZipUrl -OutFile $ZipFile
    Expand-Archive -Path $ZipFile -DestinationPath $RuntimeDir -Force
    Remove-Item $ZipFile -Force
}

# 2. Enable site-packages in python310._pth
$PthFile = "$RuntimeDir\python310._pth"
if (Test-Path $PthFile) {
    $content = Get-Content $PthFile
    $newContent = @()
    foreach ($line in $content) {
        if ($line -eq "#import site") {
            $newContent += "import site"
        } else {
            $newContent += $line
        }
    }
    if ($newContent -notcontains "import site") {
        $newContent += "import site"
    }
    if ($newContent -notcontains ".") {
        $newContent += "."
    }
    if ($newContent -notcontains "Lib\site-packages") {
        $newContent += "Lib\site-packages"
    }
    Set-Content -Path $PthFile -Value $newContent
    Write-Host "[Python Portable] Configured python310._pth for site-packages support."
}

# 3. Ensure Lib\site-packages exists
$SitePackages = "$RuntimeDir\Lib\site-packages"
if (-not (Test-Path $SitePackages)) {
    New-Item -ItemType Directory -Path $SitePackages -Force | Out-Null
}

# 4. Copy existing installed packages from .venv or install via pip
$VenvSitePackages = "$BackendDir\.venv\Lib\site-packages"
if (Test-Path $VenvSitePackages) {
    Write-Host "[Python Portable] Copying pre-installed site-packages from local .venv..."
    Copy-Item -Path "$VenvSitePackages\*" -Destination $SitePackages -Recurse -Force
} else {
    Write-Host "[Python Portable] Installing pip into embedded Python..."
    Invoke-WebRequest -Uri $GetPipUrl -OutFile $GetPipFile
    & "$RuntimeDir\python.exe" $GetPipFile --no-warn-script-location
    Remove-Item $GetPipFile -Force

    Write-Host "[Python Portable] Installing requirements.txt into embedded Python..."
    & "$RuntimeDir\python.exe" -m pip install -r "$BackendDir\requirements.txt" --target "$SitePackages"
}

Write-Host "[Python Portable] Verifying standalone embedded Python..."
& "$RuntimeDir\python.exe" -c "import sys; print('[SUCCESS] Python Version:', sys.version); import uvicorn, fastapi; print('[SUCCESS] FastAPI and Uvicorn successfully imported without any external venv!')"
