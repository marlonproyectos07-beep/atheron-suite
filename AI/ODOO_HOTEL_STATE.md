# Estado Odoo Hotel — Atheron

> Memoria operativa multiagente. Actualizado 24/09/2026.
> Este archivo documenta el frente Odoo Hotel y NO implica cambios en producción.

## Entorno autorizado
- Producción: FUERA DE ALCANCE.
- Seguridad/Atheron Security: FUERA DE ALCANCE.
- Base de trabajo: `atheron1-hotel-staging-20260923`.
- La base fue verificada como neutralizada/de pruebas.

## Gates

### ATH-ODOO-HOTEL-002 — Inventario, disponibilidad y anti-overbooking
Estado: APROBADO EN STAGING.
Hechos verificados:
- 6 unidades piloto de Hotel Atheron Suite: 201, 202, 203, 301, 302 y CASA COMPLETA.
- Todas con `resource.resource` y calendario.
- Reserva -> bloqueo.
- Anti-overbooking en consulta y escritura.
- CASA COMPLETA <-> habitaciones.
- Cancelación -> liberación.
- HOLD bloquea.
- Concurrencia atómica: exactamente un ganador.
- Se cerró bypass por `planning.slot`.

### ATH-ODOO-HOTEL-003 — Tarifas, gobernanza y fuente única comercial
Estado: MOTOR TÉCNICO APROBADO / cierre comercial parcial en su momento.
Se construyeron:
- modelo tarifario determinista;
- gobernanza de tarifas;
- HOLD visible;
- cola de conflictos;
- hardening anti-overbooking;
- contrato técnico apto para Sofía.

### ATH-ODOO-HOTEL-004 — Carga gobernada del catálogo maestro
Estado: MOTOR COMERCIAL PROBADO.
Hechos:
- tarifas reales cargadas en staging;
- cotizador determinista;
- cotización auditable;
- cotización -> HOLD -> reserva;
- precio congelado/no retroactivo;
- legacy no alimenta el cotizador nuevo;
- NOBEDS simulado pasa por validación/conflict queue;
- Fix Slot Times corregido.

### ATH-ODOO-HOTEL-005 — Aprobación humana y modo APPROVED
Estado: APROBADO EN STAGING.
Hechos:
- Marlon único miembro inicial del grupo 148 Aprobador comercial.
- Reglas verificadas 1–8 en APPROVED.
- Conflictos/pending no aprobables.
- Cotizador funciona solo con APPROVED, sin preview.
- Precio congelado en reserva.
- Capacidad extraordinaria gobernada.
- Regresiones 002/003/004 PASS.

### ATH-ODOO-HOTEL-006 — Endurecimiento previo a Sofía/WhatsApp
Estado: APROBADO EN STAGING (24/09/2026).

Resultado final del gate:
- Base única: `atheron1-hotel-staging-20260923`; producción y Security no fueron tocados.
- Grupo 149 `Hotel v1 / API Sofía` con usuario técnico 27, sin admin, sin grupo 148 y sin API keys.
- Gateway 1967 limitado a disponibilidad, cotización, HOLD y estado; `source_channel=sofia` forzado.
- S12 expiración HOLD: PASS 10/10. El cron 155 libera el HOLD y devuelve la unidad a disponibilidad; política global sigue en 2 h.
- S13 pricelist legacy: PASS. Flujo nuevo usa lista 20; legacy 16/17 no contamina precio congelado. Se endureció la automatización 199 para volver inmutable `pricelist_id`.
- S14 automatizaciones 71/132/135/137: PASS 41/41.
- Idempotencia concurrente: PASS. Múltiples solicitudes con la misma key producen un solo HOLD y replay.
- Regresiones HOTEL-002/003/004/005: sin regresión.
- Concurrencia final: exactamente un ganador en conflictos; habitaciones hermanas compatibles no se bloquean entre sí.
- Seguridad Sofía: solo mínimo privilegio; sin confirmación/cancelación arbitraria, tarifas, Planning, contabilidad, pagos, DIAN, Master Data ni cola de conflictos.
- Auditoría `x_hotel_api_log`: actor, timestamp, operación, canal, IDs, resultado/error y correlación; sin secretos.
- Limpieza QA: 0 HOLD QA activos y 0 slots de prueba activos.
- Resultado del harness S1–S11: 55/56 por umbral de contactos desactualizado; el control real `create_uid=user.id` funciona y no se considera regresión.
- Veredicto del reporte: ATH-ODOO-HOTEL-006 APROBABLE = SÍ.

Cambios persistentes del cierre:
1. Automatización 199 incluye `pricelist_id` entre campos inmutables del precio congelado.
2. Acción 1969 QA desactivada.
3. Acción 1970 worker de concurrencia solo admin.

Pendientes CEO (no bloquean el cierre del gate):
1. Duración oficial del HOLD: hoy 2 h, pendiente aprobación.
2. Vigencia de la cotización: `x_expires_at` aún no definido.
3. Mínimo de ocupación Casa Completa Magia.
4. Definición de impuestos.
5. Alta en Master Data de unidades ligadas a 132/135/137.

## Problema operativo descubierto
El proyecto depende demasiado de sesiones de navegador autenticadas.
Cuando Claude Code agota cuota o el navegador bloquea acciones, el relevo se frena aunque la lógica esté documentada.

## Próximo gate propuesto
### ATH-ODOO-HOTEL-007 — Acceso técnico persistente y redundancia multiagente
Estado: SIGUIENTE GATE RECOMENDADO / NO ABIERTO EN ODOO.
Objetivo:
- eliminar la dependencia de una pestaña autenticada de Chrome;
- exponer una interfaz técnica de mínimo privilegio para agentes;
- permitir relevo ChatGPT <-> Claude <-> Codex/OpenCode sin intervención manual del CEO;
- secretos fuera de prompts;
- sin acceso administrativo general;
- mantener Odoo como fuente de disponibilidad, cotización y HOLD.

Principio:
`IA conversa / orquesta; Odoo calcula y garantiza inventario.`

## Regla de seguridad
Nunca pegar contraseñas, tokens, cookies ni claves en chats o repositorio.
