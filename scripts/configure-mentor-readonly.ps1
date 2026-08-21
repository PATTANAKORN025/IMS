param(
    [string]$EnvFile = (Join-Path $PSScriptRoot "..\.env"),
    [string]$ContainerName = "ldi-postgres"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $EnvFile)) {
    throw "Environment file not found: $EnvFile"
}

$envValues = @{}
Get-Content -LiteralPath $EnvFile | ForEach-Object {
    if ($_ -match '^([^#=]+)=(.*)$') {
        $envValues[$matches[1]] = $matches[2].Trim("'")
    }
}

$readerPassword = $envValues['MENTOR_LDI_DB_PASSWORD']
if ([string]::IsNullOrWhiteSpace($readerPassword)) {
    throw 'MENTOR_LDI_DB_PASSWORD must be set in the ignored .env file.'
}

$containerId = docker inspect --format '{{.Id}}' $ContainerName 2>$null
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($containerId)) {
    throw "Container not found: $ContainerName"
}

$sql = @'
\set ON_ERROR_STOP on
\getenv reader_password MENTOR_LDI_DB_PASSWORD

BEGIN;

SELECT 'CREATE ROLE ldi_readonly
  NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
  NOREPLICATION NOBYPASSRLS'
WHERE NOT EXISTS (
  SELECT 1 FROM pg_roles WHERE rolname = 'ldi_readonly'
)
\gexec

SELECT format(
  'CREATE ROLE grafana_mentor_reader
     LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE
     NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 10 PASSWORD %L',
  :'reader_password'
)
WHERE NOT EXISTS (
  SELECT 1 FROM pg_roles WHERE rolname = 'grafana_mentor_reader'
)
\gexec

SELECT format(
  'ALTER ROLE grafana_mentor_reader PASSWORD %L',
  :'reader_password'
)
\gexec

ALTER ROLE grafana_mentor_reader
  LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE
  NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 10;

REVOKE ALL PRIVILEGES ON DATABASE ldi FROM ldi_readonly;
REVOKE ALL PRIVILEGES ON SCHEMA public FROM ldi_readonly;
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM ldi_readonly;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM ldi_readonly;

GRANT CONNECT ON DATABASE ldi TO ldi_readonly;
GRANT USAGE ON SCHEMA public TO ldi_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO ldi_readonly;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO ldi_readonly;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT ON TABLES TO ldi_readonly;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT ON SEQUENCES TO ldi_readonly;
ALTER DEFAULT PRIVILEGES FOR ROLE admin IN SCHEMA public
  GRANT SELECT ON TABLES TO ldi_readonly;
ALTER DEFAULT PRIVILEGES FOR ROLE admin IN SCHEMA public
  GRANT SELECT ON SEQUENCES TO ldi_readonly;
ALTER DEFAULT PRIVILEGES FOR ROLE eap IN SCHEMA public
  GRANT SELECT ON TABLES TO ldi_readonly;
ALTER DEFAULT PRIVILEGES FOR ROLE eap IN SCHEMA public
  GRANT SELECT ON SEQUENCES TO ldi_readonly;

GRANT ldi_readonly TO grafana_mentor_reader;

ALTER ROLE grafana_mentor_reader IN DATABASE ldi
  SET default_transaction_read_only = on;
ALTER ROLE grafana_mentor_reader IN DATABASE ldi
  SET statement_timeout = '30s';
ALTER ROLE grafana_mentor_reader IN DATABASE ldi
  SET idle_in_transaction_session_timeout = '30s';
ALTER ROLE grafana_mentor_reader IN DATABASE ldi
  SET search_path = 'pg_catalog', 'public';

COMMIT;
'@

try {
    $env:MENTOR_LDI_DB_PASSWORD = $readerPassword
    $sql | docker exec -i `
        -e MENTOR_LDI_DB_PASSWORD `
        $ContainerName `
        psql -X -v ON_ERROR_STOP=1 -U postgres -d ldi

    if ($LASTEXITCODE -ne 0) {
        throw 'Failed to configure the mentor read-only database role.'
    }
}
finally {
    Remove-Item Env:MENTOR_LDI_DB_PASSWORD -ErrorAction SilentlyContinue
}

Write-Output 'Configured grafana_mentor_reader with SELECT-only access to database ldi.'
