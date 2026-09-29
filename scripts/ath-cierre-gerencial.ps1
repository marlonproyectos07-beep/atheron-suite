param(
  [Parameter(Mandatory=$true)]
  [ValidatePattern('^\d{4}-\d{2}-\d{2}$')]
  [string]$Date,

  [string[]]$Refs = @(),
  [string]$OutputDir = 'tmp/ath-odoo-hotel'
)

$ErrorActionPreference = 'Stop'

$required = @(
  'ODOO_BASE_URL',
  'ODOO_DATABASE',
  'ODOO_TECHNICAL_USER',
  'ODOO_TECHNICAL_SECRET'
)

$missing = @(
  $required | Where-Object {
    [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($_))
  }
)

if ($missing.Count -gt 0) {
  Write-Host "AUTH_BLOCKED: faltan variables seguras: $($missing -join ', ')"
  Write-Host 'No se intentará conexión. Cárgalas desde el almacén seguro local; no las pegues en Git ni en chat.'
}

$refsArg = ($Refs -join ',')
& node 'scripts/ath-cierre-gerencial.mjs' "--date=$Date" "--refs=$refsArg" "--out=$OutputDir"
exit $LASTEXITCODE
