$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type -Path (Join-Path $PSScriptRoot 'Fonts.cs')
ConvertTo-Json -InputObject @([FontCatalog]::Read()) -Depth 5 -Compress
