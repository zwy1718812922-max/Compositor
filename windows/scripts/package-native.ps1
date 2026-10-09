param([string]$NsisCompiler)
$ErrorActionPreference = 'Stop'
$windowsRoot = Split-Path -Parent $PSScriptRoot
$version = (Get-Content -LiteralPath (Join-Path $windowsRoot 'package.json') -Encoding UTF8 -Raw | ConvertFrom-Json).version
$outputRoot = Join-Path $windowsRoot 'dist\lite-unpacked'
$archive = Join-Path $windowsRoot "dist\Compositor-ZH-$version-x64-Lite.zip"
if (!(Test-Path -LiteralPath (Join-Path $outputRoot 'Compositor 中文版.exe'))) { throw 'Build the native host before packaging.' }
Compress-Archive -LiteralPath $outputRoot -DestinationPath $archive -CompressionLevel Optimal -Force
if (!$NsisCompiler) {
    $cacheRoot = Join-Path $env:LOCALAPPDATA 'electron-builder\Cache'
    $NsisCompiler = Get-ChildItem -LiteralPath $cacheRoot -Recurse -Filter makensis.exe | Where-Object { $_.Directory.Name -eq 'Bin' } | Select-Object -First 1 -ExpandProperty FullName
}
if (!$NsisCompiler) { throw 'NSIS compiler missing. Supply -NsisCompiler with the path to makensis.exe.' }
Push-Location (Join-Path $windowsRoot 'native')
try { & $NsisCompiler "/DVERSION=$version" 'installer.nsi'; if ($LASTEXITCODE -ne 0) { throw 'NSIS compilation failed' } } finally { Pop-Location }
Get-Item -LiteralPath $archive,(Join-Path $windowsRoot "dist\Compositor-ZH-$version-x64-Lite-Setup.exe") | Select-Object Name,Length
