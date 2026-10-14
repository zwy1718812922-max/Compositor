param([string]$NsisCompiler)
$ErrorActionPreference = 'Stop'
$windowsRoot = Split-Path -Parent $PSScriptRoot
$version = (Get-Content -LiteralPath (Join-Path $windowsRoot 'package.json') -Encoding UTF8 -Raw | ConvertFrom-Json).version
$outputRoot = Join-Path $windowsRoot 'dist\lite-unpacked'
$archive = Join-Path $windowsRoot "dist\Compositor-ZH-$version-x64-Lite.zip"
if (!(Test-Path -LiteralPath (Join-Path $outputRoot 'Compositor 中文版.exe'))) { throw 'Build the native host before packaging.' }
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archiveStream = [System.IO.File]::Open($archive,[System.IO.FileMode]::Create)
try {
    $zip = New-Object System.IO.Compression.ZipArchive($archiveStream,[System.IO.Compression.ZipArchiveMode]::Create,$true)
    try {
        foreach ($file in (Get-ChildItem -LiteralPath $outputRoot -Recurse -File | Where-Object { $_.FullName -notmatch '\\__pycache__\\' })) {
            $entry = 'lite-unpacked/' + $file.FullName.Substring($outputRoot.Length+1).Replace('\','/')
            [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip,$file.FullName,$entry,[System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
        }
    } finally { $zip.Dispose() }
} finally { $archiveStream.Dispose() }
if (!$NsisCompiler) {
    $cacheRoot = Join-Path $env:LOCALAPPDATA 'electron-builder\Cache'
    $NsisCompiler = Get-ChildItem -LiteralPath $cacheRoot -Recurse -Filter makensis.exe | Where-Object { $_.Directory.Name -eq 'Bin' } | Select-Object -First 1 -ExpandProperty FullName
}
if (!$NsisCompiler) { throw 'NSIS compiler missing. Supply -NsisCompiler with the path to makensis.exe.' }
Push-Location (Join-Path $windowsRoot 'native')
try { & $NsisCompiler "/DVERSION=$version" 'installer.nsi'; if ($LASTEXITCODE -ne 0) { throw 'NSIS compilation failed' } } finally { Pop-Location }
Get-Item -LiteralPath $archive,(Join-Path $windowsRoot "dist\Compositor-ZH-$version-x64-Lite-Setup.exe") | Select-Object Name,Length
