# ATH-FIN-016 — Ejecutor financiero ATHERON

## Estado

**PREPARACIÓN AISLADA. ESCRITURAS EN ODOO BLOQUEADAS POR CÓDIGO.**

- Rama: ath-fin-016-financial-executor
- Base: main (sin cambios)
- Alcance futuro: exclusivamente ATH-FIN-015 / Lote A, 21 movimientos de Bancolombia 0136.
- Mapa aprobado: compañía 5; cuenta bancaria 111007 (ID 31472); diario BC (ID 65); GMF y cuota bancaria 530500 (ID 31397); intereses 421000 (ID 31346).
- El mapa se vuelve a validar en Odoo por código, ID, compañía y estado activo en cada preflight.
- Este directorio no contiene movimientos bancarios, importes, titulares, comprobantes ni datos de clientes.
- El manifiesto operativo se suministra solo mediante un GitHub Actions Secret. Nunca se guarda en el repositorio público ni se imprime en logs.
- El preflight consulta Odoo JSON-2 en modo de solo lectura. Los datos detallados permanecen en memoria del runner; GitHub Actions solo imprime estados y conteos sanitizados. No se exportan artefactos financieros.

## Controles

1. Destino fijo: https://atheron1.odoo.com, base atheron1.
2. Lista blanca de métodos de lectura; el cliente de preflight no expone create, write, unlink ni action_post.
3. El manifiesto se valida contra el alcance exacto mediante SHA-256, cantidad, categorías, fechas, formato y direcciones.
4. Importes enteros en centavos; no se usa aritmética binaria para contabilizar.
5. Cada movimiento genera una referencia idempotente ATH-FIN-015|LOTE-A|<id>.
6. La prevalidación busca referencias exactas y posibles líneas bancarias duplicadas.
7. Un movimiento con referencia duplicada, posible duplicado o conflicto se bloquea para revisión.
8. El constructor genera borradores balanceados en memoria; no llama a Odoo.
9. El escritor contiene un cerrojo de código permanentemente cerrado en esta fase.
10. Cualquier futura apertura requiere una nueva revisión y autorización específica. Este PR no puede publicar.

## GitHub Actions

El workflow de esta rama ejecuta:
- Pruebas unitarias locales con datos sintéticos.
- Comprobación de credenciales Odoo y permisos ACL mediante consultas de lectura.
- Descubrimiento de esquema, diario bancario y cuentas candidatas.
- Detección de referencias/posibles duplicados, solo si se configura el manifiesto secreto.
- Resumen de estado sanitizado en logs; no se exportan datos financieros.

No imprime datos detallados de Odoo en los logs. Solo muestra estados y conteos. La ausencia de secretos deja el proceso bloqueado sin llamadas autenticadas.

## Secretos/variables previstos

- Variables: ODOO_BASE_URL, ODOO_DATABASE.
- Secretos existentes: ODOO_API_KEY.
- Secretos pendientes: ATH_FIN016_MANIFEST_JSON (JSON privado del Lote A) y ATH_FIN016_MANIFEST_SHA256 (SHA-256 calculado independientemente sobre el manifiesto canónico).
- El digest productivo permanece deliberadamente sin configurar hasta recuperar las 21 filas fuente completas; no se permite usar un hash provisional.
- No se necesita secreto de cifrado porque los datos detallados no salen del runner.
- No configurar ninguna variable de activación de escrituras en esta fase.

## Prohibiciones vigentes

No publicar, crear borradores, conciliar, modificar extractos, crear pagos, facturas ni tocar otras cuentas/empresas. No fusionar a main. No ampliar el Lote A a otros movimientos.
