# ATH-ODOO-STAGING — credential store local

Mecanismo persistente para que este equipo (el de Marlon) no tenga que
volver a teclear las 5 variables de Odoo staging cada sesion.

## Mecanismo elegido: archivo cifrado con DPAPI, fuera del repositorio

- **Donde:** `%LOCALAPPDATA%\AtheronSecrets\odoo-hotel-staging.cred`
  (fuera del checkout de git; `%LOCALAPPDATA%` no sincroniza con perfiles
  moviles/roaming en la configuracion tipica de Windows).
- **Como se cifra:** `ConvertTo-SecureString`/`ConvertFrom-SecureString`
  de PowerShell sin `-Key`, que usa DPAPI (Data Protection API) de
  Windows atada al **usuario + equipo** actuales. Es el mismo mecanismo
  criptografico que usa Windows Credential Manager por debajo; solo se
  eligio el archivo DPAPI directo (en vez de la API de Credential
  Manager) porque se implementa entero en PowerShell puro, sin
  interoperabilidad nativa (P/Invoke) ni modulos de terceros que instalar
  — menos superficie de error, mismo nivel de seguridad.
- **Quien puede leerlo:** solo esta cuenta de Windows, en este equipo. Ni
  otro usuario del mismo Windows, ni copiar el archivo a otra maquina,
  sirve para descifrarlo. Ademas el archivo queda con ACL restringida
  (`icacls /inheritance:r` + solo el usuario actual).
- **Persiste tras reinicio:** si. Es un archivo en disco; sobrevive
  reinicios, cierres de sesion de PowerShell, etc. Se pierde solo si se
  borra el archivo o se reinstala/resetea el perfil de Windows.

## Archivos de este mecanismo

- `setup-odoo-secret-store.ps1` — configuracion UNICA. Pide las 5
  variables por `Read-Host` (el secreto con `-AsSecureString`, nunca en
  pantalla ni como argumento), valida `ODOO_DATABASE` antes de guardar
  nada, cifra y guarda.
- `load-odoo-secrets.ps1 -Command "<comando>"` — descifra, valida
  fail-closed (variable faltante o base distinta de
  `atheron1-hotel-staging-20260923` => `BLOCKED_STAGING_CREDENTIALS` y
  STOP, nunca corre el comando), inyecta las variables SOLO en el
  proceso hijo que ejecuta `<comando>`, y las limpia del proceso de
  PowerShell actual en un `finally` (corra bien, falle, o se interrumpa).
- `../../src/config/odoo-staging-guard.mjs` — el mismo fail-closed
  (`ODOO_DATABASE === atheron1-hotel-staging-20260923`, las 5 variables
  obligatorias, sin fallback nunca) pero en Node puro, reusable por
  cualquier script del gateway (runner LIVE, dry-run, etc.), probado
  offline en `test/odoo-staging-guard.test.mjs` sin necesitar secretos
  reales.
- `print-safe-status.mjs` — demuestra el camino completo sin imprimir el
  secreto (usuario tecnico enmascarado, secreto nunca mostrado ni en
  longitud).
- `scan-for-secret-leak.mjs` — segunda capa de proteccion: revisa los
  archivos en stage de Git (o los que se le pasen) buscando una
  asignacion con valor no vacio de `ODOO_TECHNICAL_SECRET`,
  `ODOO_TECHNICAL_USER` o `ODOO_BASE_URL`, y bloquea si encuentra alguna.
  `npm run check-secrets` lo corre sobre el stage actual.

## Unica intervencion humana necesaria (una sola vez por equipo)

```powershell
cd integrations\odoo-hotel-gateway\scripts\secure-store
.\setup-odoo-secret-store.ps1
```

Pide las 5 variables interactivamente. El secreto nunca se muestra en
pantalla ni se pega en ningun chat.

## Uso despues de configurado

```powershell
cd integrations\odoo-hotel-gateway
.\scripts\secure-store\load-odoo-secrets.ps1 -Command "node scripts/live-hotel-008a-runner.mjs all"
```

## Rotacion / revocacion

- **Rotar el secreto:** volver a correr `setup-odoo-secret-store.ps1`
  (sobrescribe el archivo anterior).
- **Revocar sin tocar este mecanismo:** desactivar/rotar el usuario
  tecnico directamente en Odoo (igual que ya documenta el `README.md`
  principal del gateway) — el store local queda con un secreto invalido,
  pero eso es responsabilidad de Odoo, no de este archivo.
- **Borrar todo:** `Remove-Item "$env:LOCALAPPDATA\AtheronSecrets" -Recurse -Force`
  (accion destructiva: solo Marlon la ejecuta, este script nunca la
  automatiza).

## Que NO hace este mecanismo (a proposito)

- No sube nada a GitHub Secrets ni a ningun CI (fuera de alcance de esta
  tarea).
- No permite ninguna base de datos distinta de
  `atheron1-hotel-staging-20260923`: `ODOO_DATABASE` se compara por
  igualdad estricta, sin normalizar mayusculas ni espacios, y sin
  fallback si falta.
- No imprime el secreto en ningun punto del camino, ni truncado.
