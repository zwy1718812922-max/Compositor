$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
$windowsRoot = Split-Path -Parent $PSScriptRoot
$version = (Get-Content -LiteralPath (Join-Path $windowsRoot 'package.json') -Encoding UTF8 -Raw | ConvertFrom-Json).version
$validationRoot = Join-Path $windowsRoot 'validation'
$installedRoot = Join-Path $validationRoot 'installed-lite'
$installer = Join-Path $windowsRoot "dist\Compositor-ZH-$version-x64-Lite-Setup.exe"
$registryKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\CompositorZH-Lite'
if (Test-Path -LiteralPath $registryKey) { throw 'An existing Lite installation is registered; do not replace it during testing.' }
if (Test-Path -LiteralPath $installedRoot) { throw 'Package test directory already exists; inspect it before repeating the test.' }
New-Item -ItemType Directory -Path $validationRoot -Force | Out-Null
$originalClipboard = [System.Windows.Forms.Clipboard]::GetDataObject()
$backup = New-Object System.Windows.Forms.DataObject
if ($originalClipboard) {
    foreach ($format in $originalClipboard.GetFormats($false)) {
        $value = $originalClipboard.GetData($format,$false)
        if ($value -is [System.IO.MemoryStream]) { $value = New-Object System.IO.MemoryStream(,$value.ToArray()) }
        if ($value -is [System.Drawing.Bitmap]) { $value = $value.Clone() }
        $backup.SetData($format,$false,$value)
    }
}
try {
    $process = Start-Process -FilePath $installer -ArgumentList @('/S','/NOSHORTCUT',"/D=$installedRoot") -WindowStyle Hidden -Wait -PassThru
    if ($process.ExitCode -ne 0) { throw 'Silent installation failed.' }
    $installedExe = Join-Path $installedRoot 'Compositor 中文版.exe'
    if (!(Test-Path -LiteralPath $installedExe)) { throw 'Installed executable missing.' }
    if ((Get-ItemProperty -LiteralPath $registryKey).DisplayVersion -ne $version) { throw 'Installed version incorrect.' }
    $env:COMPOSITOR_NATIVE_EXECUTABLE = $installedExe
    $env:COMPOSITOR_TEST_CLIPBOARD = '1'
    Push-Location $windowsRoot
    try { node scripts/native-smoke.cjs; if ($LASTEXITCODE -ne 0) { throw 'Installed native application smoke test failed.' } } finally { Pop-Location }
    $retainedFile = Join-Path $installedRoot 'user-document.keep'
    Set-Content -LiteralPath $retainedFile -Value 'User files must survive uninstall.' -Encoding UTF8
    $uninstaller = Join-Path $installedRoot '卸载.exe'
    Start-Process -FilePath $uninstaller -ArgumentList '/S' -WindowStyle Hidden -Wait | Out-Null
    for ($index=0; $index -lt 300 -and (Test-Path -LiteralPath $installedExe); $index++) { Start-Sleep -Milliseconds 100 }
    if ((Test-Path -LiteralPath $installedExe) -or (Test-Path -LiteralPath $registryKey)) { throw 'Uninstall did not finish.' }
    if (!(Test-Path -LiteralPath $retainedFile)) { throw 'Uninstall removed an unrelated user file.' }
    Remove-Item -LiteralPath $retainedFile
    Remove-Item -LiteralPath $installedRoot
    '{"install":true,"installedSmoke":true,"clipboard":true,"uninstall":true,"retainedUserFile":true}' | Set-Content -LiteralPath (Join-Path $validationRoot 'native-package.json') -Encoding UTF8
    Write-Output 'Native installer, installed application, clipboard and uninstall verified.'
} finally {
    Remove-Item Env:COMPOSITOR_NATIVE_EXECUTABLE,Env:COMPOSITOR_TEST_CLIPBOARD -ErrorAction SilentlyContinue
    if ($originalClipboard) { [System.Windows.Forms.Clipboard]::SetDataObject($backup,$true) } else { [System.Windows.Forms.Clipboard]::Clear() }
}
