# Proves backups work: brings up a throwaway stack (project animal-logbook-drill, test credentials),
# creates data through the real app, backs up, wipes every volume, restores, and checks the data is back.
#   .\deploy\restore-drill.ps1      (needs Docker, Node and the repo dependencies)
Set-Location (Join-Path $PSScriptRoot "..")
$env:ENV_FILE = "docker/e2e.env"
$env:COMPOSE_PROJECT = "animal-logbook-drill"
$env:COMPOSE_FILES = "docker-compose.prod.yml docker-compose.e2e.yml"
if (-not $env:BACKUP_DIR) { $env:BACKUP_DIR = Join-Path ([IO.Path]::GetTempPath()) ("drill-" + [guid]::NewGuid().ToString("N")) }
. .\deploy\lib.ps1

try {
  Write-Host "== up"
  Invoke-Dc @("up", "-d", "--wait", "--wait-timeout", "240", "--build")
  Write-Host "== create data through the app"
  $env:E2E_KEEP = "1"; $env:E2E_PROJECT = $Project
  Invoke-Native "node" @("scripts/e2e-image.mjs", "e2e/animals.spec.ts", "--workers=1")
  $before = (Get-RowCounts) -join "|"
  Write-Host ((Get-RowCounts) -join "; ")
  $filesBefore = @(Get-UploadChecksums).Count
  if ($filesBefore -lt 1) { throw "FAIL: the seed run stored no files" }

  Write-Host "== backup"
  & .\deploy\backup.ps1
  if ($LASTEXITCODE -ne 0) { throw "backup failed" }
  $archive = (Get-ChildItem $BackupDir -Filter "animal-logbook-*.tar" | Select-Object -First 1).FullName

  Write-Host "== wipe everything"
  Invoke-Dc @("down", "-v", "--remove-orphans")

  Write-Host "== restore"
  & .\deploy\restore.ps1 $archive -Yes
  if ($LASTEXITCODE -ne 0) { throw "restore failed" }
  if ((Get-RowCounts) -join "|" -ne $before) { throw "FAIL: counts differ after restore" }
  if (@(Get-UploadChecksums).Count -ne $filesBefore) { throw "FAIL: file count differs after restore" }
  $ready = curl.exe -sk --resolve logbook.localhost:8443:127.0.0.1 https://logbook.localhost:8443/api/health/ready
  if ($ready -notmatch '"ok"') { throw "FAIL: not ready after restore" }
  Write-Host "== drill passed"
} finally {
  Invoke-Dc @("down", "-v", "--remove-orphans")
}