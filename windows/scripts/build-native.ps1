param([string]$WebView2Package = "$env:USERPROFILE\.nuget\packages\microsoft.web.webview2\1.0.3179.45")
$ErrorActionPreference = 'Stop'
$windowsRoot = Split-Path -Parent $PSScriptRoot
$outputRoot = Join-Path $windowsRoot 'dist\lite-unpacked'
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$sdkPath = (Resolve-Path -LiteralPath $WebView2Package).Path
foreach ($file in @('lib\net462\Microsoft.Web.WebView2.Core.dll','lib\net462\Microsoft.Web.WebView2.WinForms.dll','runtimes\win-x64\native\WebView2Loader.dll')) {
    if (!(Test-Path -LiteralPath (Join-Path $sdkPath $file))) { throw "WebView2 SDK file missing: $file" }
}
New-Item -ItemType Directory -Path $outputRoot -Force | Out-Null
foreach ($name in @('src','assets')) { Copy-Item -LiteralPath (Join-Path $windowsRoot $name) -Destination $outputRoot -Recurse -Force }
Copy-Item -LiteralPath (Join-Path $windowsRoot 'LICENSE') -Destination $outputRoot -Force
Copy-Item -LiteralPath (Join-Path $sdkPath 'LICENSE.txt') -Destination (Join-Path $outputRoot 'WebView2-LICENSE.txt') -Force
foreach ($file in @('lib\net462\Microsoft.Web.WebView2.Core.dll','lib\net462\Microsoft.Web.WebView2.WinForms.dll','runtimes\win-x64\native\WebView2Loader.dll')) { Copy-Item -LiteralPath (Join-Path $sdkPath $file) -Destination $outputRoot -Force }
Push-Location $windowsRoot
try { node scripts/bundle-native.cjs; if ($LASTEXITCODE -ne 0) { throw 'Browser bundle failed' } } finally { Pop-Location }
$core = Join-Path $outputRoot 'Microsoft.Web.WebView2.Core.dll'
$forms = Join-Path $outputRoot 'Microsoft.Web.WebView2.WinForms.dll'
$exePath = Join-Path $outputRoot 'Compositor 中文版.exe'
& $compiler /nologo /target:winexe /platform:x64 /optimize+ /utf8output "/out:$exePath" "/win32icon:$windowsRoot\assets\icon.ico" "/win32manifest:$windowsRoot\native\app.manifest" /reference:System.dll /reference:System.Core.dll /reference:System.Drawing.dll /reference:System.Windows.Forms.dll /reference:System.Web.Extensions.dll "/reference:$core" "/reference:$forms" "$windowsRoot\native\Host.cs"
if ($LASTEXITCODE -ne 0) { throw 'Native host compilation failed' }
Write-Output "Built native host: $exePath"
