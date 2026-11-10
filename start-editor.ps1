$scriptDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$port = 4173

Set-Location -LiteralPath $scriptDirectory

if (Get-Command py -ErrorAction SilentlyContinue) {
  Write-Host "Starting Paper Ink at http://localhost:$port"
  py -m http.server $port
  exit $LASTEXITCODE
}

if (Get-Command python -ErrorAction SilentlyContinue) {
  Write-Host "Starting Paper Ink at http://localhost:$port"
  python -m http.server $port
  exit $LASTEXITCODE
}

Write-Error "Python was not found. Install Python or open index.html directly in a browser."
exit 1
