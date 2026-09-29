<#
.SYNOPSIS
  ATH-ODOO-STAGING — configuracion UNICA del credential store local para
  las 5 variables de Odoo staging (atheron1-hotel-staging-20260923).

.DESCRIPTION
  Pide cada variable de forma interactiva (Read-Host), nunca como
  parametro ni argumento (eso quedaria en el historial de PowerShell).
  ODOO_TECHNICAL_SECRET se pide como SecureString: no se muestra en
  pantalla mientras se escribe.

  Guarda las 5 variables como JSON cifrado con DPAPI (ConvertTo-SecureString
  sin -Key => atado al usuario y equipo actuales; nadie mas, ni siquiera
  otro usuario de este mismo Windows, puede descifrarlo) en:
    $env:LOCALAPPDATA\AtheronSecrets\odoo-hotel-staging.cred

  Ese archivo esta FUERA del repositorio (LOCALAPPDATA, no el checkout de
  git) y ademas .gitignore ya excluye *.cred por si alguna vez alguien lo
  copia por error dentro del repo.

  Se ejecuta UNA sola vez por equipo/usuario. Para rotar el secreto,
  volver a correr este mismo script (sobrescribe el archivo anterior).

.EXAMPLE
  .\setup-odoo-secret-store.ps1
#>

$ErrorActionPreference = 'Stop'

$storeDir = Join-Path $env:LOCALAPPDATA 'AtheronSecrets'
$storePath = Join-Path $storeDir 'odoo-hotel-staging.cred'

if (-not (Test-Path $storeDir)) {
    New-Item -ItemType Directory -Path $storeDir -Force | Out-Null
}

Write-Host "Configurando credential store local para Odoo staging."
Write-Host "Base autorizada esperada: atheron1-hotel-staging-20260923"
Write-Host ""

$baseUrl = Read-Host "ODOO_BASE_URL"
$database = Read-Host "ODOO_DATABASE"
if ($database -ne 'atheron1-hotel-staging-20260923') {
    Write-Host "ABORTADO: ODOO_DATABASE debe ser exactamente 'atheron1-hotel-staging-20260923'. No se guardo nada." -ForegroundColor Red
    exit 1
}
$technicalUser = Read-Host "ODOO_TECHNICAL_USER"
$technicalSecretSecure = Read-Host "ODOO_TECHNICAL_SECRET (no se muestra en pantalla)" -AsSecureString
$actionId = Read-Host "ODOO_ACTION_ID"

# Solo se convierte a texto plano en memoria el tiempo minimo indispensable
# para armar el JSON que se va a cifrar; nunca se escribe a disco ni a
# consola en claro.
$bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($technicalSecretSecure)
try {
    $technicalSecretPlain = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
} finally {
    [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
}

$payload = [PSCustomObject]@{
    ODOO_BASE_URL         = $baseUrl
    ODOO_DATABASE         = $database
    ODOO_TECHNICAL_USER   = $technicalUser
    ODOO_TECHNICAL_SECRET = $technicalSecretPlain
    ODOO_ACTION_ID        = $actionId
} | ConvertTo-Json -Compress

$technicalSecretPlain = $null

$encrypted = ConvertTo-SecureString -String $payload -AsPlainText -Force | ConvertFrom-SecureString
Set-Content -Path $storePath -Value $encrypted -Encoding ascii -NoNewline

# Restringe el archivo al usuario actual unicamente (quita herencia, borra
# otros permisos, deja solo el usuario actual con control total).
icacls $storePath /inheritance:r | Out-Null
icacls $storePath /grant:r "$($env:USERDOMAIN)\$($env:USERNAME):(F)" | Out-Null

Write-Host ""
Write-Host "OK: credenciales guardadas cifradas (DPAPI) en:" -ForegroundColor Green
Write-Host "  $storePath"
Write-Host "Solo este usuario, en este equipo, puede descifrarlas."
Write-Host ""
Write-Host "Para usarlas: .\load-odoo-secrets.ps1 -Command 'node scripts/live-hotel-008a-runner.mjs all'"
