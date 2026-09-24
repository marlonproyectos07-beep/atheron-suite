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
Estado: EN CURSO / CHECKPOINT S12.
Ya implementado:
- grupo 149 `Hotel v1 / API Sofía`;
- usuario técnico 27 `Sofía API STAGING`;
- sin grupo 148, sin admin, 0 API keys;
- gateway acción 1967;
- operaciones permitidas: disponibilidad, cotización, HOLD, estado;
- `source_channel=sofia` forzado;
- parámetros sensibles/prohibidos rechazados;
- idempotencia;
- auditoría `x_hotel_api_log`;
- rate limit opcional;
- aislamiento de datos;
- pricelist neutra 20 para nuevo flujo;
- legacy 16/17 se conserva por órdenes históricas;
- automatizaciones 71/132/135/137 refactorizadas hacia Master Data donde existe unidad;
- S1–S11 reportadas PASS;
- 56/56 pruebas previas PASS.

Checkpoint S12:
- HOLD QA: `COT/2026/03788`, hold_id 22153.
- origen: sofia.
- unidad 202.
- 03/12/2029 -> 05/12/2029.
- pricelist 20.
- precio congelado 220000 COP.
- cron 155 / acción 1907 vence HOLDs cada 15 minutos.
- al último acceso, el HOLD ya había pasado su `expires_at` pero aún faltaba verificar la ejecución del cron y la liberación efectiva.

Pendiente para cerrar HOTEL-006:
1. S12 expiración HOLD -> inventario liberado.
2. S13 pricelist legacy no contamina flujo nuevo.
3. S14 automatizaciones 71/132/135/137.
4. idempotencia concurrente.
5. regresiones HOTEL-002/003/004/005.
6. concurrencia final.
7. limpieza QA.
8. reporte final.

## Problema operativo descubierto
El proyecto depende demasiado de sesiones de navegador autenticadas.
Cuando Claude Code agota cuota o el navegador bloquea acciones, el relevo se frena aunque la lógica esté documentada.

## Próximo gate propuesto
### ATH-ODOO-HOTEL-007 — Acceso técnico persistente y redundancia multiagente
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
