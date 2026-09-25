# Handoff activo

## Tarea principal
ATH-ODOO-HOTEL-007 — Acceso técnico persistente y redundancia multiagente

## Rama de memoria
`chore/ai-orchestration-foundation`

## Entorno funcional
`atheron1-hotel-staging-20260923` — STAGING neutralizado.

## Leer primero
1. `AI/ODOO_HOTEL_STATE.md`
2. `AI/AGENTS.md`
3. `AI/TASKS.md`
4. Issue #56.
5. Draft PR #57 — `feature/ath-odoo-hotel-007-gateway`.

## Estado exacto
- HOTEL-002: APROBADO.
- HOTEL-003: motor técnico aprobado.
- HOTEL-004: motor comercial probado.
- HOTEL-005: APROBADO en modo APPROVED.
- HOTEL-006: APROBADO EN STAGING el 24/09/2026.
- HOTEL-007: contrato/DRY_RUN/LIVE SIMULADO APROBADOS por reauditoría ChatGPT.
- PR #57 head auditado: `61a743163539b3e8af87824806fb1faa69ed5d54`.
- Bloqueador `source_channel='sofia'`: CERRADO.
- 63/63 tests reportados PASS por Claude; ejecución local, sin CI independiente.
- LIVE real contra Odoo staging: PENDIENTE.

## Corrección HOTEL-007 aprobada
El cliente no puede enviar `source_channel`.
El gateway fuerza internamente `source_channel='sofia'`.
El payload interno puede llegar al adapter/upstream Odoo.
Campos sensibles como price/discount/tax/admin/sudo/confirm/cancel/master_data_write continúan bloqueados.
El pipeline LIVE se prueba con transporte Odoo simulado/injectable y falla cerrado ante bypass del contrato.

## Autorización CEO vigente
Marlon Parra AUTORIZA credencial técnica de Odoo exclusivamente para STAGING.

Entorno único permitido:
`atheron1-hotel-staging-20260923`

Alcance autorizado:
- availability;
- quote;
- hold;
- status;
- verificar auditoría asociada;
- limpiar HOLDs de prueba;
- probar revocación/rollback.

La credencial debe:
- tener mínimo privilegio;
- equivaler al grupo 149 Hotel v1 / API Sofía;
- NO ser admin;
- NO pertenecer al grupo aprobador 148;
- vivir fuera del repositorio, prompts, logs y chat;
- poder revocarse/rotarse.

## Gate LIVE REAL
Ejecutar únicamente contra staging:
1. provisionar credencial técnica mínima;
2. cargar secreto solo en secret manager/variables de entorno del runtime de prueba;
3. validar autenticación;
4. availability;
5. quote;
6. HOLD idempotente;
7. status;
8. verificar auditoría Odoo y `source_channel=sofia`;
9. verificar que privilegios/campos prohibidos siguen fallando;
10. limpiar HOLDs de prueba;
11. demostrar revocación/rollback;
12. entregar reporte verificable.

## Restricciones
- NO producción.
- NO Atheron Security.
- NO pagos.
- NO DIAN.
- NO WhatsApp/Meta/Sofía real.
- NO Booking/Airbnb/OTA real.
- NO secretos en chat/repositorio.
- NO merge de PR #57 durante el gate LIVE.

## Observaciones técnicas abiertas
- idempotencia, rate limit y audit log del gateway siguen in-memory;
- no hay GitHub Actions independiente;
- definir store compartido/persistente antes de multiinstancia real.

## Frente paralelo ATH-OTA-001
Draft PR #59 — `feature/ath-ota-001-audit`.

Alcance operativo actual definido por CEO:
- Hotel Atheron Suite — Booking ID 16559325.
- Atheron Grand House Zipaquirá de 10 a 20 personas — Booking ID 16569053.
- anuncios antiguos quedan fuera de alcance salvo interferencia real.

Regla comercial:
- Grand House = CASA COMPLETA;
- Hotel Atheron Suite = habitaciones individuales;
- venta CASA COMPLETA debe bloquear habitaciones;
- venta de habitación debe bloquear CASA COMPLETA.

## Pendientes CEO separados
1. Duración oficial HOLD (actual: 2 h).
2. Vigencia de cotización.
3. Mínimo de ocupación Casa Completa Magia.
4. Impuestos.
5. Master Data para unidades ligadas a automatizaciones legacy.

## Próxima acción exacta
Ejecutar ATH-ODOO-HOTEL-007 LIVE exclusivamente en staging con credencial técnica mínima autorizada, sin exponer secretos y sin tocar producción.

## Principio
`IA conversa / orquesta; Odoo calcula y garantiza inventario.`
