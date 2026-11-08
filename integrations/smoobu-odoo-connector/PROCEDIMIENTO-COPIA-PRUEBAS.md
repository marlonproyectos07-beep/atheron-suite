# Copia de pruebas neutralizada de atheron1 (ATH-HOTELS-SIRE-TRA-001)

**Estado: PROCEDIMIENTO. No se duplico ninguna base.** Verificado en pantalla el 2026-11-08 (odoo.com y atheron1 > Mi suscripcion).

## 1. Lo verificado en pantalla
| Dato | Evidencia |
|---|---|
| atheron1 es `19.0+e` y `Pagado` | menu de la base en odoo.com/my/databases |
| Plan personalizado, 1 usuario, suscripcion mensual, **vence el 24/11/2026** | atheron1 > Mi suscripcion (el repo decia 2026-12-02: corregir) |
| Boton **Duplicar** ("para fines de pruebas o produccion") existe | Mi suscripcion > Base de datos |
| Dialogo Duplicar: campo "Nombre nuevo" (vacio) y casilla **"Propositos de prueba"** MARCADA por defecto: "deshabilitar integraciones externas, correo..., acciones programadas" (texto cortado por el panel; el resto no se leyo) | dialogo abierto y cancelado, sin duplicar |
| El dialogo **no muestra costo ni vigencia** de la copia | idem |
| Registros de actividad de la administracion disponibles (Mi suscripcion) | util para trazabilidad (sigue siendo un solo usuario) |
| Bases en la cuenta: `atheron1` (Pagado), `atheron1-hotel-staging-20261009` (19.0+e **Prueba**; su URL respondia "no existe"), `masivos-tests-2026` | lista de bases |
No verificado: vigencia y cupo de la copia (la documentacion de versiones previas decia 15 dias y 5 copias), costo (la pantalla no lo muestra), si la copia hereda claves de API.

## 2. Crear la copia (lo hace Marlon, en pantalla)
1. atheron1 > Mi suscripcion > Base de datos > **Duplicar**.
2. Nombre: `atheron1-pruebas-AAAAMMDD` (el script solo acepta ese patron).
3. Dejar **marcada** "Propositos de prueba". Si se desmarca: STOP y cancelar.
4. Confirmar. **No** abrir la copia con usuarios ni ejecutar nada mas hasta el paso 3.

## 3. Verificar el aislamiento (antes de cualquier escritura)
Automatico de Odoo (neutralizacion; la lista oficial no es exhaustiva): bandera `database.is_neutralized`, franja roja, crons y correo saliente desactivados, proveedores de pago, IAP.
Controles ADICIONALES nuestros (`checkTestEnvironment`, solo lecturas): crons activos = 0; servidores de correo saliente activos = 0; automatizaciones activas con accion webhook o WhatsApp = 0; proveedores de pago habilitados = 0. Cualquier fallo o dato ilegible = STOP.
Si falla un adicional: en la copia (nunca en produccion) desactivar la automatizacion o accion afectada y repetir.
Revision humana (no automatizable): sin cuenta de WhatsApp Business activa, sin iCal/OTA/Smoobu apuntando a la copia, sitio web despublicado, datos personales anonimizados (N04, N10-N13 de STAGING-PLAN.md).
Claves de API: **no se sabe** si se copian. Comprobarlo en la copia (Ajustes > usuarios > claves) sin revocar nada en produccion; el script exige una clave distinta de la de produccion.

## 4. Ejecutar el incremento 1
`npm run inc1-estructura` simula (por defecto). `--apply` exige ademas `ODOO_TEST_WRITES=yes-test-copy`.
Variables: `ODOO_TEST_BASE_URL`, `ODOO_TEST_DATABASE`, `ODOO_TEST_API_KEY` (secreto propio de la copia). Rechaza atheron1.odoo.com por URL, nombre y credencial.

## 5. Reversion
Descartar la copia y duplicar de nuevo, o eliminar solo la copia desde su propia pagina. Nunca eliminar en produccion.
