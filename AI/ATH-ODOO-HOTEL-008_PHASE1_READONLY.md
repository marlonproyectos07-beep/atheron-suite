# ATH-ODOO-HOTEL-008 — Fase 1 READ-ONLY

Estado de esta rama: **IMPLEMENTADO / AUTH_BLOCKED para ejecución LIVE desde ChatGPT**.

## Fuente maestra

- Issue #71: ATH-ODOO-HOTEL-008 — Tablero operativo + multicanal + cierre gerencial.
- Base técnica reutilizada: PR #57 / rama feature/ath-odoo-hotel-007-gateway.
- No se reconstruyó el gateway: se reutiliza su transporte JSON-RPC ya probado contra staging.

## Hallazgo de checkpoint

La discrepancia previa de PR #68 no significaba que el gateway no existiera.
PR #68 trabajó desde un checkout que no contenía integrations/odoo-hotel-gateway.
PR #57 sí contiene el gateway real y documenta pruebas LIVE en staging.

## Qué se implementó

### 1. Cliente Odoo fail-closed de solo lectura

Archivo: integrations/odoo-hotel-gateway/src/readonly-odoo.mjs

Únicos métodos permitidos:
- fields_get
- search
- read
- search_read

Cualquier write/create/unlink/action_post/reconcile se bloquea antes del transporte.

### 2. Extractor del cierre gerencial

Archivo: scripts/ath-cierre-gerencial.mjs

Salida:
- ATH_CIERRE_GERENCIAL_YYYY-MM-DD.json
- ATH_CIERRE_GERENCIAL_YYYY-MM-DD.md

Consulta, si el usuario técnico tiene permiso:
- Planning / reservas
- Ventas
- líneas de venta
- facturas
- pagos
- movimientos bancarios
- diarios
- recursos

Regla:

VENTA != COBRO != MOVIMIENTO BANCARIO != CONCILIACION

Los totales se calculan únicamente cuando la relación puede sostenerse con evidencia.
Si no, se emite PENDIENTE_DE_VERIFICAR.

### 3. PowerShell

Archivo: scripts/ath-cierre-gerencial.ps1

Uso previsto en el equipo local:

    .\scripts\ath-cierre-gerencial.ps1 -Date 2026-09-28 -Refs COT/2026/03605,COT/2026/03617,COT/2026/03615,COT/2026/03616

Las credenciales se leen exclusivamente desde variables de entorno inyectadas por un almacén seguro local.

## Pruebas ejecutadas

Prueba local independiente del transporte real:
- sintaxis Node: PASS
- search_read permitido: PASS
- write: bloqueado antes de autenticación: PASS
- create: bloqueado antes de autenticación: PASS
- unlink: bloqueado antes de autenticación: PASS
- action_post: bloqueado antes de autenticación: PASS
- reconcile: bloqueado antes de autenticación: PASS
- modelo fuera de allowlist: bloqueado: PASS

Suite nueva: **3/3 PASS**.

## Comportamiento sin credenciales

Se ejecutó el extractor sin secretos para comprobar fail-closed.

Resultado: AUTH_BLOCKED

Variables faltantes reportadas solo por nombre:
- ODOO_BASE_URL
- ODOO_DATABASE
- ODOO_TECHNICAL_USER
- ODOO_TECHNICAL_SECRET

No se intentó ninguna llamada de red.

## Estado del cierre 28/09/2026

Aún no se pueden afirmar con evidencia técnica desde esta sesión:
- VENTAS
- FACTURADO
- COBRADO
- PENDIENTE
- conciliación del payout Airbnb 302

Estado actual: AUTH_BLOCKED

No pedir credenciales por chat.

## Siguiente acción técnica

Ejecutar el PowerShell anterior en el equipo de Marlon donde ya existió el acceso técnico Odoo, cargando las credenciales desde el mecanismo seguro local existente.

Ese paso debe producir los dos artefactos del 28/09/2026.
Después se auditan los datos y se cierra Fase 1 antes de diseñar el Tablero de Ángela.

## Restricciones preservadas

- no producción estructural
- no cutover
- no merge
- no conciliación
- no DIAN
- no impuestos
- no Atheron Security
- no Booking/Airbnb write
- no secretos en Git
