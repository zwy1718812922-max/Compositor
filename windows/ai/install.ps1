param([Parameter(Mandatory=$true)][string]$Root)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding($false)
[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
Add-Type -AssemblyName System.IO.Compression.FileSystem
$manifest=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'runtime.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$Root=[IO.Path]::GetFullPath($Root)
$runtime=Join-Path $Root 'runtime'
$staging=Join-Path $Root ('install-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $staging -Force | Out-Null
function Progress([int]$Percent,[string]$Stage) { @{progress=$Percent;stage=$Stage}|ConvertTo-Json -Compress }
function Download($Asset,$File,[int]$Start,[int]$End) {
    $request=[Net.WebRequest]::Create($Asset.url);$request.Timeout=30000;$response=$request.GetResponse();$stream=$response.GetResponseStream();$output=[IO.File]::Create($File);$buffer=New-Object byte[] 262144;$count=0;$last=-1
    try {while(($read=$stream.Read($buffer,0,$buffer.Length)) -gt 0){$output.Write($buffer,0,$read);$count+=$read;$progress=if($response.ContentLength -gt 0){$Start+[int](($End-$Start)*$count/$response.ContentLength)}else{$Start};if($progress -ne $last){Progress $progress 'Downloading AI runtime';$last=$progress}}}finally{$output.Dispose();$stream.Dispose();$response.Dispose()}
    if((Get-FileHash -LiteralPath $File -Algorithm SHA256).Hash.ToLowerInvariant() -ne $Asset.sha256){throw 'Runtime checksum mismatch; please retry'}
}
try {
    $archive=Join-Path $staging 'python.zip';Download $manifest.python $archive 0 10
    $engine=Join-Path $staging 'engine';[IO.Compression.ZipFile]::ExtractToDirectory($archive,$engine)
    $site=Join-Path $engine 'Lib\site-packages';New-Item -ItemType Directory -Path $site -Force | Out-Null
    $index=0
    foreach($wheel in $manifest.wheels){$archive=Join-Path $staging ($wheel.filename+'.zip');Download $wheel $archive (10+$index*20) (30+$index*20);[IO.Compression.ZipFile]::ExtractToDirectory($archive,$site);$index++}
    [IO.File]::WriteAllText((Join-Path $engine 'python312._pth'),"python312.zip`n.`nLib\site-packages`nimport site`n",[Text.Encoding]::ASCII)
    # Move only within the validated AI cache root; preserve models and user projects.
    if(Test-Path -LiteralPath $runtime){$previous=Join-Path $Root ('runtime-old-'+[guid]::NewGuid().ToString('N'));Move-Item -LiteralPath $runtime -Destination $previous}
    Move-Item -LiteralPath $engine -Destination $runtime
    Progress 100 'AI runtime installed'
    @{result=@{installed=$true}} | ConvertTo-Json -Compress
} catch { @{error=$_.Exception.Message}|ConvertTo-Json -Compress;exit 1 }
finally { if([IO.Path]::GetFullPath($staging).StartsWith($Root+[IO.Path]::DirectorySeparatorChar)){Remove-Item -LiteralPath $staging -Recurse -Force -ErrorAction SilentlyContinue} }
