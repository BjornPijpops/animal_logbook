# Backs up the database (pg_dump, owner role) and the uploads volume into one timestamped archive.
#   $env:ENV_FILE = "C:\animal-logbook\.env.production"; .\deploy\backup.ps1
# Optional: BACKUP_DIR, BACKUP_KEEP_DAYS (default 14), BACKUP_AGE_RECIPIENT or BACKUP_GPG_RECIPIENT
# to encrypt the archive. See docs/DEPLOYMENT.md. A backup on the same disk is not a real backup.
Set-Location (Join-Path $PSScriptRoot "..")
. .\deploy\lib.ps1

New-Item -ItemType Directory -Force $BackupDir | Out-Null
$BackupDir = (Resolve-Path $BackupDir).Path
$stamp = (Get-Date).ToUniversalTime().ToString("yyyyMMddTHHmmssZ")
$work = Join-Path ([IO.Path]::GetTempPath()) "animal-logbook-backup-$stamp"
New-Item -ItemType Directory -Force $work | Out-Null
try {
  Write-Host "Dumping database ..."
  $pg = (& docker compose @ComposeArgs ps -q postgres).Trim()
  Invoke-Dc @("exec", "-T", "postgres", "pg_dump", "-U", $DbOwner, "-d", $DbName, "-Fc", "-f", "/tmp/db.dump")
  Invoke-Native "docker" @("cp", "${pg}:/tmp/db.dump", (Join-Path $work "db.dump"))
  Invoke-Dc @("exec", "-T", "postgres", "rm", "-f", "/tmp/db.dump")
  Write-LfFile (Join-Path $work "counts.txt") (Get-RowCounts)

  Write-Host "Archiving uploads ..."
  Invoke-Native "docker" @("run", "--rm", "-v", "${Project}_uploads:/data:ro", "-v", "${work}:/out", $HelperImage, "sh", "-c", "cd /data && tar czf /out/uploads.tgz .")
  Write-LfFile (Join-Path $work "uploads.sha256") (Get-UploadChecksums)

  $archive = Join-Path $BackupDir "animal-logbook-$stamp.tar"
  Invoke-Native "tar" @("-cf", $archive, "-C", $work, "db.dump", "counts.txt", "uploads.tgz", "uploads.sha256")

  if ($env:BACKUP_AGE_RECIPIENT) {
    Invoke-Native "age" @("-r", $env:BACKUP_AGE_RECIPIENT, "-o", "$archive.age", $archive)
    Remove-Item $archive; $archive = "$archive.age"
  } elseif ($env:BACKUP_GPG_RECIPIENT) {
    Invoke-Native "gpg" @("--batch", "--yes", "--encrypt", "--recipient", $env:BACKUP_GPG_RECIPIENT, "--output", "$archive.gpg", $archive)
    Remove-Item $archive; $archive = "$archive.gpg"
  }

  Get-ChildItem $BackupDir -Filter "animal-logbook-*.tar*" |
    Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$KeepDays) } | Remove-Item -Force
  Write-Host "Backup written: $archive"
} finally {
  Remove-Item -Recurse -Force $work -ErrorAction SilentlyContinue
}