<#
.SYNOPSIS
    Resets the PostgreSQL `postgres` superuser password on this machine when
    the current one is lost.

.DESCRIPTION
    Standard PostgreSQL recovery procedure, scoped as narrowly as possible:
      1. Backs up pg_hba.conf.
      2. Prepends ONE rule allowing the `postgres` role to connect from
         127.0.0.1 only, without a password (method "trust").
      3. Restarts the PostgreSQL service.
      4. Runs ALTER USER postgres WITH PASSWORD '<new>'.
      5. Restores the original pg_hba.conf and restarts the service again.
      6. Verifies the new password works.
    Step 5 runs in a `finally`, so the temporary rule never outlives the script.

    Must be run from an elevated (Administrator) PowerShell — pg_hba.conf lives
    under Program Files and restarting the service needs admin rights.

.PARAMETER ServiceName
    Windows service of the PostgreSQL instance. Default: postgresql-x64-18
    (the instance on port 5432 that Amilut uses).

.PARAMETER Port
    TCP port of that instance. Default: 5432.

.PARAMETER SaveToEnv
    Also write the new password into the repo-root .env (PGPASSWORD=...),
    which `npm run db:generate` loads. The file is gitignored.

.EXAMPLE
    # From an elevated PowerShell, in the repo root:
    Set-ExecutionPolicy -Scope Process Bypass -Force
    .\SQL-Migration\reset-superuser-password.ps1 -SaveToEnv
#>
[CmdletBinding()]
param(
    [string]$ServiceName = 'postgresql-x64-18',
    [int]$Port = 5432,
    [switch]$SaveToEnv
)

$ErrorActionPreference = 'Stop'

function Write-Step([string]$msg) { Write-Host "  -> $msg" -ForegroundColor Cyan }
function Write-Ok([string]$msg)   { Write-Host "  OK $msg" -ForegroundColor Green }

# ---- 0. Preconditions --------------------------------------------------------
$isAdmin = ([Security.Principal.WindowsPrincipal] `
    [Security.Principal.WindowsIdentity]::GetCurrent()
).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    throw 'Run this script from an elevated (Administrator) PowerShell.'
}

$svc = Get-CimInstance Win32_Service -Filter "Name='$ServiceName'"
if (-not $svc) { throw "Service '$ServiceName' not found. Check: Get-Service postgresql*" }

# Data directory comes from the service command line: ... -D "C:\...\data" ...
if ($svc.PathName -notmatch '-D\s+"([^"]+)"') {
    throw "Could not read the data directory from the service command line:`n$($svc.PathName)"
}
$dataDir = $Matches[1]
$hba     = Join-Path $dataDir 'pg_hba.conf'
if (-not (Test-Path $hba)) { throw "pg_hba.conf not found at $hba" }

# bin dir sits next to the data dir in the standard installer layout
$binDir  = Join-Path (Split-Path $dataDir -Parent) 'bin'
$psql    = Join-Path $binDir 'psql.exe'
$isready = Join-Path $binDir 'pg_isready.exe'
foreach ($exe in @($psql, $isready)) {
    if (-not (Test-Path $exe)) { throw "Not found: $exe" }
}

Write-Host ''
Write-Host "  PostgreSQL service : $ServiceName (port $Port)"
Write-Host "  Data directory     : $dataDir"
Write-Host "  pg_hba.conf        : $hba"
Write-Host ''

# ---- 1. Ask for the new password (twice, hidden) -----------------------------
function ConvertFrom-Secure([securestring]$s) {
    $p = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)
    try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($p) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($p) }
}
$new1 = ConvertFrom-Secure (Read-Host 'New postgres password' -AsSecureString)
$new2 = ConvertFrom-Secure (Read-Host 'Repeat it            ' -AsSecureString)
if ($new1 -ne $new2)        { throw 'Passwords do not match.' }
if ($new1.Length -lt 1)     { throw 'Password must not be empty.' }
$newPassword = $new1

function Wait-ForServer {
    for ($i = 0; $i -lt 30; $i++) {
        & $isready -h 127.0.0.1 -p $Port -q
        if ($LASTEXITCODE -eq 0) { return }
        Start-Sleep -Seconds 1
    }
    throw "PostgreSQL did not become ready on port $Port within 30s."
}

# ---- 2. Temporary trust rule, scoped to postgres@127.0.0.1 --------------------
$stamp  = Get-Date -Format 'yyyyMMdd-HHmmss'
$backup = "$hba.bak-$stamp"
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

Write-Step "Backing up pg_hba.conf -> $backup"
Copy-Item $hba $backup

$original = [IO.File]::ReadAllText($hba)
$tempRule = "# TEMPORARY - added by reset-superuser-password.ps1, removed automatically`r`n" +
            "host    all    postgres    127.0.0.1/32    trust`r`n"

try {
    Write-Step 'Adding temporary trust rule for postgres@127.0.0.1'
    [IO.File]::WriteAllText($hba, $tempRule + $original, $utf8NoBom)

    Write-Step "Restarting $ServiceName"
    Restart-Service -Name $ServiceName -Force
    Wait-ForServer

    # ---- 3. Set the new password -------------------------------------------
    Write-Step 'Setting the new password'
    $escaped = $newPassword -replace "'", "''"
    $sql = "ALTER USER postgres WITH PASSWORD '$escaped';"
    $env:PGPASSWORD = $null
    $sql | & $psql -U postgres -h 127.0.0.1 -p $Port -d postgres -w -v ON_ERROR_STOP=1 -q
    if ($LASTEXITCODE -ne 0) { throw 'ALTER USER failed (see psql output above).' }
    Write-Ok 'Password changed'
}
finally {
    # ---- 4. Always restore the original auth config -------------------------
    Write-Step 'Restoring original pg_hba.conf'
    [IO.File]::WriteAllText($hba, $original, $utf8NoBom)
    Write-Step "Restarting $ServiceName"
    Restart-Service -Name $ServiceName -Force
    try { Wait-ForServer } catch { Write-Warning $_ }
}

# ---- 5. Verify with the new password ----------------------------------------
Write-Step 'Verifying login with the new password'
$env:PGPASSWORD = $newPassword
& $psql -U postgres -h 127.0.0.1 -p $Port -d postgres -w -t -c 'SELECT current_user;' | Out-Null
$ok = ($LASTEXITCODE -eq 0)
$env:PGPASSWORD = $null
if (-not $ok) { throw 'Login with the new password FAILED. The original pg_hba.conf was restored.' }
Write-Ok "postgres can log in on 127.0.0.1:$Port with the new password"

# ---- 6. Optionally save into repo-root .env ---------------------------------
if ($SaveToEnv) {
    $repoRoot = Split-Path $PSScriptRoot -Parent
    $envFile  = Join-Path $repoRoot '.env'
    $line     = "PGPASSWORD=$newPassword"
    if (Test-Path $envFile) {
        $content = [IO.File]::ReadAllText($envFile)
        if ($content -match '(?m)^\s*#?\s*PGPASSWORD=.*$') {
            $content = $content -replace '(?m)^\s*#?\s*PGPASSWORD=.*$', $line
        } else {
            $content = $content.TrimEnd() + "`r`n$line`r`n"
        }
        [IO.File]::WriteAllText($envFile, $content, $utf8NoBom)
    } else {
        [IO.File]::WriteAllText($envFile, "$line`r`n", $utf8NoBom)
    }
    Write-Ok "Saved PGPASSWORD to $envFile (gitignored)"
}

Write-Host ''
Write-Host "  Done. Backup of the original pg_hba.conf kept at:`n  $backup" -ForegroundColor Green
Write-Host ''
