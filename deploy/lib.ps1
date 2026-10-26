# Shared by backup.ps1, restore.ps1 and restore-drill.ps1. Dot-sourced, not executed.
$ErrorActionPreference = "Stop"

if (-not $env:ENV_FILE) { throw "Set `$env:ENV_FILE to the path of your .env.production" }
$Project = if ($env:COMPOSE_PROJECT) { $env:COMPOSE_PROJECT } else { "animal-logbook-prod" }
$BackupDir = if ($env:BACKUP_DIR) { $env:BACKUP_DIR } else { ".\backups" }
$KeepDays = if ($env:BACKUP_KEEP_DAYS) { [int]$env:BACKUP_KEEP_DAYS } else { 14 }
$HelperImage = if ($env:BACKUP_HELPER_IMAGE) { $env:BACKUP_HELPER_IMAGE } else { "postgres:17.7-alpine3.22" }
$DbName = "animal_logbook"
$DbOwner = "animal_owner"
$ComposeFiles = if ($env:COMPOSE_FILES) { $env:COMPOSE_FILES -split " " } else { @("docker-compose.prod.yml") }

$ComposeArgs = @("-p", $Project, "--env-file", $env:ENV_FILE)
foreach ($f in $ComposeFiles) { $ComposeArgs += @("-f", $f) }

# Runs a native command and throws when it fails (PowerShell does not do that by itself).
function Invoke-Native {
  param([string]$Exe, [string[]]$Arguments)
  & $Exe @Arguments
  if ($LASTEXITCODE -ne 0) { throw "$Exe $($Arguments -join ' ') failed with exit code $LASTEXITCODE" }
}
function Invoke-Dc { param([string[]]$Arguments) Invoke-Native "docker" (@("compose") + $ComposeArgs + $Arguments) }

$CountSql = @"
select 'users', count(*) from users union all select 'households', count(*) from households
union all select 'household_members', count(*) from household_members union all select 'animals', count(*) from animals
union all select 'documents', count(*) from documents union all select 'appointments', count(*) from appointments
union all select 'expenses', count(*) from expenses union all select 'medical_records', count(*) from medical_records
order by 1
"@ -replace "\r?\n", " "

function Get-RowCounts {
  $out = & docker compose @ComposeArgs exec -T postgres psql -U $DbOwner -d $DbName -Atc $CountSql
  if ($LASTEXITCODE -ne 0) { throw "row count query failed" }
  return ($out | ForEach-Object { $_.Trim() } | Where-Object { $_ })
}

# One "<sha256>  <path>" line per file in the uploads volume, sorted by path.
function Get-UploadChecksums {
  $out = & docker run --rm -v "${Project}_uploads:/data:ro" $HelperImage sh -c "cd /data && find . -type f -exec sha256sum {} + | sort -k2"
  if ($LASTEXITCODE -ne 0) { throw "checksum listing failed" }
  return ($out | ForEach-Object { $_.Trim() } | Where-Object { $_ })
}

function Write-LfFile { param([string]$Path, [string[]]$Lines)
  [IO.File]::WriteAllText($Path, (($Lines -join "`n") + "`n"), (New-Object Text.UTF8Encoding $false))
}