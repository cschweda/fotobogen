# Installs nothing; checks that a built Fotobogen runs on Windows the way the
# README describes: start the server, read the setup token, finish setup,
# log in, reset the admin password. Run from the repository root after
# `pnpm install` and `pnpm build`:
#
#   pwsh scripts/smoke-test.ps1
#
# Uses a throwaway data folder and removes it afterwards.
$ErrorActionPreference = 'Stop'

$port = 3219
$base = "http://localhost:$port"
$dataDir = Join-Path ([IO.Path]::GetTempPath()) ("fotobogen-smoke-" + [guid]::NewGuid().ToString('N'))
$log = Join-Path ([IO.Path]::GetTempPath()) ("fotobogen-smoke-" + [guid]::NewGuid().ToString('N') + ".log")

function Step($text) { Write-Host "-- $text" }
function Check($condition, $text) {
  if (-not $condition) { throw "FAILED: $text" }
  Write-Host "   ok: $text"
}
# Invoke-WebRequest throws on 4xx and 5xx; return the status code instead.
function Status($uri, $session) {
  try { return (Invoke-WebRequest -Uri $uri -WebSession $session -MaximumRedirection 0 -SkipHttpErrorCheck).StatusCode }
  catch { return $_.Exception.Response.StatusCode.value__ }
}

$env:DATA_DIR = $dataDir
$env:PORT = "$port"
$env:HOST = '127.0.0.1'
$server = Start-Process -FilePath 'node' -ArgumentList '.output/server/index.mjs' `
  -RedirectStandardOutput $log -RedirectStandardError "$log.err" -PassThru -NoNewWindow

try {
  Step 'Start the server'
  $healthy = $false
  foreach ($attempt in 1..60) {
    try {
      $health = Invoke-RestMethod -Uri "$base/api/health"
      $healthy = $true
      break
    }
    catch { Start-Sleep -Milliseconds 500 }
  }
  Check $healthy 'the server answers /api/health'
  Check ($health.database -eq 'ok') 'the database is ok'

  Step 'Read the setup token'
  $token = (Get-Content (Join-Path $dataDir 'setup-token') -Raw).Trim()
  Check ($token -match '^[0-9a-f]{32}$') 'data/setup-token holds a token'
  Check ((Get-Content $log -Raw) -match "Fotobogen setup token: $token") 'the same token was printed at start'
  Check ((Status "$base/" $null) -eq 302) 'pages redirect to the wizard before setup'

  Step 'Finish setup'
  $headers = @{ Origin = $base }
  $answers = @{
    token = $token; siteTitle = 'Windows Test'; tagline = ''; username = 'admin'
    password = 'correct horse battery staple'; grid = 'masonry'; photoView = 'modal'; samples = $false
  } | ConvertTo-Json
  Invoke-RestMethod -Uri "$base/api/setup/complete" -Method Post -Headers $headers `
    -ContentType 'application/json' -Body $answers -SessionVariable session | Out-Null
  Check ((Status "$base/api/admin/overview" $session) -eq 200) 'the admin area opens with the session from setup'
  Check ((Status "$base/setup" $null) -eq 404) 'the wizard is closed after setup'
  Check (-not (Test-Path (Join-Path $dataDir 'setup-token'))) 'the setup token file is gone'

  Step 'Reset the admin password from the command line'
  'a brand new password' | node scripts/fotobogen.mjs reset-admin
  Check ($LASTEXITCODE -eq 0) 'reset-admin succeeds'
  Check ((Status "$base/api/admin/overview" $session) -eq 401) 'the old session is signed out'
  $login = @{ username = 'admin'; password = 'a brand new password' } | ConvertTo-Json
  Invoke-RestMethod -Uri "$base/api/auth/login" -Method Post -Headers $headers `
    -ContentType 'application/json' -Body $login -SessionVariable fresh | Out-Null
  Check ((Status "$base/api/admin/overview" $fresh) -eq 200) 'the new password logs in'

  Write-Host "`nFotobogen runs on this machine."
}
catch {
  Write-Host "`n--- server output ---"
  if (Test-Path $log) { Get-Content $log }
  if (Test-Path "$log.err") { Get-Content "$log.err" }
  throw
}
finally {
  if (-not $server.HasExited) { Stop-Process -Id $server.Id -Force }
  Start-Sleep -Milliseconds 500
  Remove-Item -Recurse -Force $dataDir, $log, "$log.err" -ErrorAction SilentlyContinue
}
