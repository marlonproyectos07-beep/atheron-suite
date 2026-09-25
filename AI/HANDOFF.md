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
- S12: PASS 10/10.
- S13: PASS.
- S14: PASS 41/41.
- Idempotencia concurrente: PASS.
- Regresiones 002–005: sin regresión.
- Concurrencia: exactamente un ganador.
- QA HOTEL-006: limpio.

## HOTEL-007 — estado al 24/09/2026
PR #57 sigue abierto en DRAFT sobre `feature/ath-odoo-hotel-007-gateway`.

Alcance local/DRY_RUN construido:
- contrato;
- autenticación técnica revocable/rotable por agente;
- idempotencia;
- rate limit;
- auditoría;
- adapter Odoo;
- servidor Node;
- clientes Claude + genérico;
- documentación y rollback;
- 53 tests declarados PASS por el constructor.

Estado de aprobación:
- HECHO: alcance local/DRY_RUN.
- NO APROBADO todavía para LIVE.
- PENDIENTE: validación LIVE real contra Odoo staging.
- NO hay autorización para usar credencial técnica real hasta corregir el bloqueador detallado abajo.

## Bloqueador de auditoría HOTEL-007
Auditoría ChatGPT sobre head `a843e11121796ff5a0894711dd552458814954c7` encontró:

1. `validateRequest()` fuerza `source_channel: 'sofia'`.
2. La lista de campos prohibidos incluye `source_channel`.
3. El camino LIVE ejecuta `assertSafeUpstreamPayload(payload)`.
4. Por lo tanto, un request válido del gateway sería rechazado con `FORBIDDEN_FIELD` antes de llegar a la acción Odoo 1967.

Corrección requerida antes de credencial LIVE:
- separar campos prohibidos al cliente de campos internos forzados por el gateway;
- mantener `source_channel='sofia'` inmutable para el cliente;
- permitir que ese valor interno llegue al upstream;
- añadir prueba de regresión LIVE con transporte Odoo simulado/injectable;
- verificar que `source_channel`, `price`, `admin` y otros campos siguen bloqueados cuando vienen del cliente;
- mantener `DRY_RUN=true` como default seguro.

## Observaciones técnicas HOTEL-007
- idempotencia, rate limit y audit log están en memoria; reinicios o múltiples instancias pierden ese estado local;
- no hay GitHub Actions asociado al head actual; Vercel reporta success, pero no sustituye la reproducción independiente de los tests del paquete;
- el camino LIVE contra Odoo real sigue sin probar;
- no guardar secretos en chat ni en GitHub.

## Decisión vigente sobre credencial técnica Odoo
NO AUTORIZADA todavía.

Condición para autorizar:
1. corregir el bloqueador `source_channel`;
2. agregar y pasar la prueba de regresión LIVE simulada;
3. volver a auditar PR #57;
4. solo entonces crear/cargar credencial técnica de mínimo privilegio fuera del repositorio y probar contra `atheron1-hotel-staging-20260923`.

La prueba LIVE deberá limitarse a:
- availability;
- quote;
- hold;
- status;
- usuario/grupo equivalente a Hotel v1 / API Sofía;
- sin admin;
- sin grupo aprobador 148;
- sin producción;
- sin pagos, DIAN, WhatsApp/Meta ni OTA real.

## Pendientes CEO que deben mantenerse como decisiones separadas
1. Duración oficial HOLD (actual: 2 h).
2. Vigencia de cotización.
3. Mínimo de ocupación Casa Completa Magia.
4. Impuestos.
5. Master Data para unidades ligadas a automatizaciones legacy.

## Frente paralelo ATH-OTA-001
Rama preparada:
`feature/ath-ota-001-audit`

Estado:
- preparada;
- sin commits nuevos respecto del punto base al último chequeo;
- auditoría Booking/Airbnb aún no ejecutada en GitHub;
- no modificar Booking/Airbnb durante el primer gate.

## Restricciones
- NO producción hasta gate y aprobación explícita.
- NO Atheron Security.
- NO WhatsApp/Meta/Sofía real todavía.
- NO OTA real/DIAN/pagos.
- NO secretos en chat/repositorio.

## Próxima acción exacta
Corregir PR #57 y demostrar por test el camino LIVE simulado sin relajar el bloqueo de campos del cliente. Después, reauditar. Solo si pasa, habilitar credencial técnica segura y ejecutar prueba LIVE exclusivamente sobre staging.

En paralelo puede arrancarse ATH-OTA-001 como auditoría de solo lectura, sin cambios en Booking/Airbnb.

## Objetivo operacional
Eliminar la dependencia de una sesión de navegador autenticada para que ChatGPT, Claude, Codex/OpenCode y posteriormente Sofía puedan relevarse sobre el mismo contrato técnico.

## Principio
`IA conversa / orquesta; Odoo calcula y garantiza inventario.`
