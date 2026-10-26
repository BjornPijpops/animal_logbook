# Restores an archive made by backup.ps1 into the running (or freshly created) stack, then verifies it.
#   $env:ENV_FILE = "..."; .\deploy\restore.ps1 <archive> -Yes
# Replaces the current database and uploads. Encrypted archives need BACKUP_AGE_IDENTITY (age key
# file) or a gpg key in your keyring. Stops web/worker/caddy during the restore.
param([Parameter(Mandatory)][string]$Archive, [switch]$Yes)
Set-Location (Join-Path $PSScriptRoot "..")
. .\deploy\lib.ps1
if (-not $Yes) { throw "This replaces the current data. Re-run with -Yes." }
$Archive = (Resolve-Path $Archive).Path

$work = Join-Path ([IO.Path]::GetTempPath()) ("animal-logbook-restore-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Force $work | Out-Null
try {
  $tar = Join-Path $work "backup.tar"
  if ($Archive.EndsWith(".age")) {
    if (-not $env:BACKUP_AGE_IDENTITY) { throw "Set BACKUP_AGE_IDENTITY" }
    Invoke-Native "age" @("-d", "-i", $env:BACKUP_AGE_IDENTITY, "-o", $tar, $Archive)
  } elseif ($Archive.EndsWith(".gpg")) {
    Invoke-Native "gpg" @("--batch", "--yes", "--decrypt", "--output", $tar, $Archive)
  } else { Copy-Item $Archive $tar }
  Invoke-Native "tar" @("-xf", $tar, "-C", $work)

  Write-Host "Starting postgres and preparing roles ..."
  Invoke-Dc @("up", "-d", "--wait", "postgres")
  Invoke-Dc @("up", "--no-start", "web", "worker")
  Invoke-Dc @("stop", "caddy", "web", "worker")
  Invoke-Dc @("run", "--rm", "migrate")

  Write-Host "Restoring database ..."
  $pg = (& docker compose @ComposeArgs ps -q postgres).Trim()
  Invoke-Native "docker" @("cp", (Join-Path $work "db.dump"), "${pg}:/tmp/db.dump")
  Invoke-Dc @("exec", "-T", "postgres", "pg_restore", "-U", $DbOwner, "-d", $DbName, "--clean", "--if-exists", "--no-owner", "--single-transaction", "/tmp/db.dump")
  Invoke-Dc @("exec", "-T", "postgres", "rm", "-f", "/tmp/db.dump")

  Write-Host "Restoring uploads ..."
  Invoke-Native "docker" @("run", "--rm", "-v", "${Project}_uploads:/data", "-v", "${work}:/in:ro", $HelperImage, "sh", "-c", "find /data -mindepth 1 -delete && tar xzf /in/uploads.tgz -C /data && chown -R 1000:1000 /data")

  Write-Host "Verifying ..."
  $wantCounts = (Get-Content (Join-Path $work "counts.txt") | Where-Object { $_.Trim() }) -join "|"
  $wantFiles = Get-Content (Join-Path $work "uploads.sha256") | Where-Object { $_.Trim() }
  $failed = $false
  if ((Get-RowCounts) -join "|" -ne $wantCounts) { Write-Host "FAIL: row counts differ from the backup"; $failed = $true }
  if ((Get-UploadChecksums) -join "|" -ne ($wantFiles -join "|")) { Write-Host "FAIL: uploaded file checksums differ"; $failed = $true }
  if ($failed) { exit 1 }
  Write-Host "OK: row counts and $(@($wantFiles).Count) file checksums match the backup."

  Invoke-Dc @("up", "-d", "--wait")
} finally {
  Remove-Item -Recurse -Force $work -ErrorAction SilentlyContinue
}