param([string]$Installer)
$ErrorActionPreference = 'Stop'
$windowsRoot = Split-Path -Parent $PSScriptRoot
$version = (Get-Content -LiteralPath (Join-Path $windowsRoot 'package.json') -Encoding UTF8 -Raw | ConvertFrom-Json).version
if (!$Installer) { $Installer = Join-Path $windowsRoot "dist\Compositor-ZH-$version-x64-Lite-Setup.exe" }
$folder = Join-Path $windowsRoot ('validation\locked-update-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $folder -Force | Out-Null
Get-ChildItem -LiteralPath (Join-Path $windowsRoot 'dist\lite-unpacked') | Copy-Item -Destination $folder -Recurse -Force
$exe = Join-Path $folder 'Compositor 中文版.exe'
$bridge = Join-Path $folder 'native\bridge.js'
$beforeExe = (Get-FileHash -LiteralPath $exe).Hash
$beforeBridge = (Get-FileHash -LiteralPath $bridge).Hash
$app = Start-Process -FilePath $exe -PassThru -WindowStyle Hidden
try {
    $setup = Start-Process -FilePath $Installer -ArgumentList "/S /NOSHORTCUT /D=$folder" -PassThru -Wait -WindowStyle Hidden
    if ($setup.ExitCode -ne 2) { throw "Running-app update was not rejected: $($setup.ExitCode)" }
    if ((Get-FileHash -LiteralPath $exe).Hash -ne $beforeExe -or (Get-FileHash -LiteralPath $bridge).Hash -ne $beforeBridge) { throw 'Running-app update changed package files' }
    if (Test-Path -LiteralPath (Join-Path $folder '卸载.exe')) { throw 'Rejected update created installation files' }
    Write-Output 'Running-app update rejected with exit code 2; executable and resources unchanged.'
} finally {
    if (!$app.HasExited) { Stop-Process -Id $app.Id; $app.WaitForExit() }
}
