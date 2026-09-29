<#
.SYNOPSIS
  ATH-ODOO-STAGING — descifra el credential store local y corre UN
  comando con las 5 variables Odoo inyectadas solo en ese proceso hijo.

.DESCRIPTION
  Nunca imprime ningun valor secreto. Falla cerrado ANTES de exponer
  nada si:
    - el archivo cifrado no existe (correr setup-odoo-secret-store.ps1
      primero),
    - no se puede descifrar (DPAPI: otro usuario/equipo, o corrupto),
    - falta cualquiera de las 5 variables,
    - ODOO_DATABASE no es EXACTAMENTE atheron1-hotel-staging-20260923.

  Las variables solo existen en el entorno del proceso hijo que arranca
  -Command; se limpian del proceso de PowerShell actual en el finally,
  pase lo que pase (exito, error o Ctrl+C).

.PARAMETER Command
  El comando a correr con las credenciales ya inyectadas, por ejemplo:
    node scripts/live-hotel-008a-runner.mjs all

.EXAMPLE
  .\load-odoo-secrets.ps1 -Command "node scripts/live-hotel-008a-runner.mjs all"
#>
param(
    [Parameter(Mandatory = $true)]
    [string]$Command
)

$ErrorActionPreference = 'Stop'
$ALLOWED_DATABASE = 'atheron1-hotel-staging-20260923'
$storePath = Join-Path $env:LOCALAPPDATA 'AtheronSecrets\odoo-hotel-staging.cred'

if (-not (Test-Path $storePath)) {
    Write-Host "BLOCKED_STAGING_CREDENTIALS: no existe $storePath. Corre setup-odoo-secret-store.ps1 primero." -ForegroundColor Red
    exit 1
}

try {
    $encrypted = Get-Content -Path $storePath -Raw
    $secure = ConvertTo-SecureString -String $encrypted
    $bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    $json = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
    [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    $payload = $json | ConvertFrom-Json
} catch {
    Write-Host "BLOCKED_STAGING_CREDENTIALS: no se pudo descifrar el store (usuario/equipo distinto al que lo creo, o archivo corrupto)." -ForegroundColor Red
    exit 1
}

$required = @('ODOO_BASE_URL', 'ODOO_DATABASE', 'ODOO_TECHNICAL_USER', 'ODOO_TECHNICAL_SECRET', 'ODOO_ACTION_ID')
foreach ($key in $required) {
    if ([string]::IsNullOrWhiteSpace($payload.$key)) {
        Write-Host "BLOCKED_STAGING_CREDENTIALS: falta $key en el store. STOP." -ForegroundColor Red
        exit 1
    }
}

if ($payload.ODOO_DATABASE -ne $ALLOWED_DATABASE) {
    Write-Host "BLOCKED_STAGING_CREDENTIALS: ODOO_DATABASE del store no es la base autorizada. STOP, no se ejecuta nada." -ForegroundColor Red
    exit 1
}

Write-Host "OK database confirmada: $ALLOWED_DATABASE"
Write-Host "Ejecutando: $Command"

try {
    $env:ODOO_BASE_URL = $payload.ODOO_BASE_URL
    $env:ODOO_DATABASE = $payload.ODOO_DATABASE
    $env:ODOO_TECHNICAL_USER = $payload.ODOO_TECHNICAL_USER
    $env:ODOO_TECHNICAL_SECRET = $payload.ODOO_TECHNICAL_SECRET
    $env:ODOO_ACTION_ID = $payload.ODOO_ACTION_ID

    & cmd /c $Command
    $exitCode = $LASTEXITCODE
} finally {
    # Se limpian SIEMPRE, incluso si el comando falla o se interrumpe.
    Remove-Item Env:\ODOO_BASE_URL -ErrorAction SilentlyContinue
    Remove-Item Env:\ODOO_DATABASE -ErrorAction SilentlyContinue
    Remove-Item Env:\ODOO_TECHNICAL_USER -ErrorAction SilentlyContinue
    Remove-Item Env:\ODOO_TECHNICAL_SECRET -ErrorAction SilentlyContinue
    Remove-Item Env:\ODOO_ACTION_ID -ErrorAction SilentlyContinue
}

exit $exitCode
