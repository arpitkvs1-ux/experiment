# Builds app-debug.apk on your PC (needs JDK 17+ and Android SDK).
# Install Android Studio once, then either:
#   - Set ANDROID_HOME to your SDK (e.g. %LOCALAPPDATA%\Android\Sdk), or
#   - Let this script try common locations.

$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot
Set-Location $Root

$sdk = $env:ANDROID_HOME
if (-not $sdk) { $sdk = $env:ANDROID_SDK_ROOT }
if (-not $sdk) {
    $try = "$env:LOCALAPPDATA\Android\Sdk"
    if (Test-Path $try) { $sdk = $try }
}
if (-not $sdk) {
    Write-Host "ANDROID_HOME not set and default SDK path not found."
    Write-Host "Install Android Studio, open SDK Manager, then set ANDROID_HOME to your Sdk folder."
    exit 1
}
"sdk.dir=$($sdk.Replace('\', '/'))" | Set-Content -Path "$Root\local.properties" -Encoding UTF8

$jbr = @(
    "$env:LOCALAPPDATA\Programs\Android\Android Studio\jbr",
    "${env:ProgramFiles}\Android\Android Studio\jbr"
) | Where-Object { Test-Path "$_\bin\java.exe" } | Select-Object -First 1

if ($jbr) {
    $env:JAVA_HOME = $jbr
    Write-Host "Using JAVA_HOME=$jbr"
}

& "$Root\gradlew.bat" assembleDebug --no-daemon
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$apk = "$Root\app\build\outputs\apk\debug\app-debug.apk"
if (Test-Path $apk) {
    Write-Host ""
    Write-Host "APK ready:"
    Write-Host $apk
    Write-Host ""
    Write-Host "Copy app-debug.apk to your phone and open it to install (allow unknown sources if asked)."
} else {
    Write-Host "Build finished but APK not found at expected path."
    exit 1
}
