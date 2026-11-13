# ATH-FIN-016 — Ejecutor financiero ATHERON

## Estado
**EJECUCIÓN RESTRINGIDA AL LOTE A; NO SE FUSIONA A MAIN.**

- Rama: ath-fin-016-financial-executor
- Base: main (sin cambios)
- Alcance: exclusivamente ATH-FIN-015 / Lote A, 21 movimientos de Bancolombia 0136.
- Mapa aprobado: compañía 5; cuenta bancaria 111007 (ID 31472); diario BC (ID 65); GMF y cuota bancaria 530500 (ID 31397); intereses 421000 (ID 31346).
- El manifiesto operativo se suministra solo mediante GitHub Actions Secret.
- El preflight vuelve a comprobar credencial, ACL, compañía, cuentas, diario y duplicados antes de cada ejecución.
- El ejecutor revalida cada movimiento inmediatamente antes de crear, verifica el borrador leído de vuelta, publica y verifica el estado publicado.
- Si una ejecución se interrumpe, un reintento reconoce el asiento exacto en borrador o publicado y nunca crea otro con la misma referencia.
- Logs: únicamente ID de movimiento, número interno del asiento y estado; no imprimen importes ni titulares.
- No se importan extractos, no se concilia, no se cambian saldos de apertura y no se tocan otras operaciones.

## Controles
1. Destino fijo: https://atheron1.odoo.com, base atheron1.
2. Métodos de escritura permitidos: solo account.move.create y account.move.action_post.
3. Cuenta bancaria, diario y cuentas de contrapartida fijados por ID y código; compañía fijada en ID 5.
4. Manifiesto validado por SHA-256, alcance, cantidad, IDs, fechas, categorías y totales exactos.
5. Cada movimiento tiene referencia idempotente ATH-FIN-015|LOTE-A|<id>.
6. Duplicados exactos y líneas bancarias potencialmente equivalentes se revisan antes de cada creación.
7. El asiento se lee de vuelta antes de publicar y después de publicar; se verifican estado, compañía, diario, fecha, referencia, cuentas e importes.
8. El workflow de escritura solo se dispara por un marcador de liberación exacto en esta rama.
9. Un fallo detiene el lote; los asientos ya publicados no se duplican en un reintento.
10. No se fusiona a main.

## Secretos y variables
- Variables: ODOO_BASE_URL, ODOO_DATABASE.
- Secretos: ODOO_API_KEY, ATH_FIN016_MANIFEST_JSON.
- No se imprime ningún secreto en logs.

## Prohibiciones
No tocar los otros 105 movimientos, no modificar reservas, pagos, conciliaciones, históricos, ni otras cuentas o empresas.
