# Start Vaayu browser dashboard at http://localhost:3000 (dev-server.mjs — required for SAMAGAM)
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$port = 3000
if ($args.Count -gt 0) { $port = [int]$args[0] }

function Test-VaayuDevServer([int]$p) {
    try {
        $r = Invoke-RestMethod -Uri "http://127.0.0.1:$p/api/health" -TimeoutSec 2
        return ($r.ok -eq $true -and $r.server -eq "vaayu-dev" -and $r.ubiPending -eq $true)
    } catch {
        return $false
    }
}

function Test-PortListening([int]$p) {
    try {
        $r = Invoke-WebRequest -Uri "http://127.0.0.1:$p" -TimeoutSec 2 -UseBasicParsing
        return $r.StatusCode -ge 200
    } catch {
        return $false
    }
}

function Stop-PortListeners([int]$p) {
    $pids = @()
    try {
        $pids = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue |
            Select-Object -ExpandProperty OwningProcess -Unique
    } catch {
        # Get-NetTCPConnection may be unavailable on some Windows builds
    }
    foreach ($procId in $pids) {
        if ($procId -and $procId -ne 0) {
            Write-Host "Stopping process on port $p (PID $procId)..." -ForegroundColor Yellow
            Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
        }
    }
    Start-Sleep -Seconds 1
}

if (Test-VaayuDevServer $port) {
    Write-Host "Vaayu dev server already running: http://localhost:$port" -ForegroundColor Green
    Start-Process "http://localhost:$port"
    exit 0
}

if (Test-PortListening $port) {
    try {
        $health = Invoke-RestMethod -Uri "http://127.0.0.1:$port/api/health" -TimeoutSec 2
        if ($health.server -eq "vaayu-dev" -and $health.ubiPending -ne $true) {
            Write-Host ""
            Write-Host "Port $port has an OLD Vaayu dev server (missing UBI fee API)." -ForegroundColor Red
            Write-Host "Restarting with the latest dev-server.mjs..." -ForegroundColor Cyan
            Write-Host ""
            Stop-PortListeners $port
        }
    } catch {
        # fall through to generic port-in-use handling below
    }
}

if (Test-PortListening $port) {
    Write-Host ""
    Write-Host "Port $port is in use by a BASIC static server (npm serve / Python)." -ForegroundColor Red
    Write-Host "SAMAGAM auto-login needs the Vaayu dev server (dev-server.mjs)." -ForegroundColor Yellow
    Write-Host "Stopping the old server and starting the correct one..." -ForegroundColor Cyan
    Write-Host ""
    Stop-PortListeners $port
}

Write-Host "Starting Vaayu dev server at http://localhost:$port ..." -ForegroundColor Cyan
Write-Host "Keep this window open. Press Ctrl+C to stop." -ForegroundColor Yellow
Write-Host "SAMAGAM proxy: http://localhost:$port/samagam-proxy/" -ForegroundColor DarkGray
Write-Host ""

$node = Get-Command node -ErrorAction SilentlyContinue
if ($node -and (Test-Path (Join-Path $PSScriptRoot "dev-server.mjs"))) {
    $env:PORT = "$port"
    node dev-server.mjs
    exit $LASTEXITCODE
}

Write-Host "ERROR: Node.js and dev-server.mjs are required." -ForegroundColor Red
Write-Host "Install Node from https://nodejs.org then run start-web.bat again." -ForegroundColor Red
exit 1
