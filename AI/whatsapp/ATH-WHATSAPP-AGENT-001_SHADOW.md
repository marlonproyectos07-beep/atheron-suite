# GOAL-WHATSAPP-AGENT-001 — Agente de WhatsApp en modo SHADOW (continuación)

> Rama `feature/ath-odoo-hotel-012-master-board-housekeeping` (la única autorizada en esta sesión).
> Código aislado en `integrations/whatsapp-shadow-agent/`; **no modifica** el gateway, `HOTEL-011` ni la rama de Booking de Codex.
> Odoo STAGING: **no accedido** (sin credenciales en el entorno cloud). Production, WhatsApp real y Meta: **no tocados**. Nada se envió.

## 1. Estado en una línea

**CERRADO EN SHADOW, validación Odoo real PENDIENTE.** Ver `ATH-WHATSAPP-AGENT-001_CIERRE.md` (decisiones de Control
Maestro 2026-10-03: `CEO_CASES_V1.md` canónico, política de cancelación oficial, anticipo 50 %).
`ODOO_STAGING_LIVE_VALIDATION=PENDING_EXTERNAL_AUTHENTICATED_TEST` · `WHATSAPP_AUTOMATION_MODE=shadow`.

*(Las secciones 6 y 9 de abajo son del turno anterior; lo vigente es el documento de cierre.)*

## 2. Qué es (y qué no es)

Un agente **determinista basado en reglas** (sin LLM, sin red) que recibe un mensaje, entiende la intención, recuerda el
contexto, decide si consulta Odoo o escala a un humano y **propone** una respuesta. **Nunca envía**: no existe ninguna
función de envío en el código (prueba CEO-D01 lo verifica leyendo el código fuente) y `decision.outbound` es siempre `null`.

Principio: *la IA conversa, Odoo decide, el humano valida el dinero*. Las tarifas salen siempre de Odoo; el agente nunca
las calcula. No crea HOLD, no confirma reservas, no cancela (el puerto `guardPort` lanza `ShadowViolation` ante
`hold/cancel/release/registerPayment`).

| Archivo | Papel |
|---|---|
| `src/policy.mjs` | política (50 %, grupos, idiomas, cancelación) y fichas de propiedad con fuente (W/C/P/ODOO) |
| `src/nlu.mjs` | fechas, personas, propiedad, vehículo, mascota, presupuesto e intenciones (vocabulario del Playbook) |
| `src/agent.mjs` | decisión, memoria multi-turno, escalaciones, respuestas propuestas |
| `src/groups.mjs` | grupos: `HUMAN_QUOTE` / `PARTIAL_CAPACITY` / `STRATEGIC_GROUP_LEAD`, sin prometer cupo |
| `src/deposit.mjs` | 50 % sobre el total de Odoo + detección de desajuste con Odoo |
| `src/odoo-port.mjs` | puerto de solo lectura (availability/quote); adaptador al Gateway con `quote` desactivado |
| `src/lint.mjs` | reglas duras de estilo/seguridad aplicadas a **cada** respuesta |
| `src/playbook-harness.mjs`, `specs/`, `scripts/` | arnés y ejecución reproducible de T01–T100 |

## 3. Decisiones CEO aplicadas

| Decisión | Implementación | Evidencia |
|---|---|---|
| **Anticipo 50 %** | `POLICY.deposit.percent = 50`; `depositFor(total)`; si Odoo exige otro % → bandera `ODOO_DEPOSIT_MISMATCH` y el agente sigue diciendo 50 % | CEO-D02, T57 |
| **Horarios reales, no 00:00** | AS 15:00/11:00; Neusa, Apartamentos Algarra y Colonial desde la ficha web verificada; **Casa Algarra y La Margarita = DATA_GAP → escala** | CEO-D03 |
| **Playbook como contrato** | versionado en `AI/whatsapp/` (+ sha256), 100 casos extraídos por programa, IDs T01–T100 intactos | `playbook.test.mjs` |
| **Capacidades / UNIT_ID_MAP** | solo Atheron Suite verificada en Odoo; el resto = referencia **no verificada** → `PARTIAL_CAPACITY`/DATA_GAP + humano | CEO-D11 |
| **≥100 personas** | `STRATEGIC_GROUP_LEAD`, urgencia ALTA, frase natural del CEO, sin prometer cupo, sin HOLD | CEO-D10 |

Frase para grupos grandes (literal): *«Sí podemos revisar un grupo de ese tamaño. Déjame validar capacidad entre
nuestras propiedades y te confirmo la distribución.»*

## 4. Resultados reproducibles

```bash
cd integrations/whatsapp-shadow-agent
node --test                      # 180 pruebas
node scripts/run-playbook.mjs    # regenera AI/whatsapp/PLAYBOOK_RESULTS.{md,json}
```

| Medida | Resultado |
|---|---|
| Playbook T01–T100 | **100/100 PASS** — 83 exactamente como lo escribe el Playbook; **17 con desviaciones documentadas** (18 desviaciones: 15 de `ODOO`, 3 de `ESC`) |
| Requisitos CEO (CEO-D01…D12) | **12/12 PASS** (*no* son los 12 casos originales, ver §9) |
| Regresión gateway HOTEL-007…012 | **376/376 PASS** (sin cambios) |
| Total agente | 180/180 |

### Desviaciones del Playbook (todas con razón escrita en `PLAYBOOK_RESULTS.md`)

- **15 × ODOO:** el Playbook marca «Sí» pero el mensaje no trae fecha/personas (T23, T25–T31, T69, T87…) o la propiedad no está mapeada en Odoo (T35). Sin fecha **no** se consulta Odoo ni se afirma disponibilidad.
- **T57 (anticipo):** el Playbook decía «escalar hasta definir regla»; la decisión CEO 2026-10-03 la define (50 %).
- **T83 y T85 (sin cupo):** el Playbook suponía alternativas en Odoo; hoy solo Atheron Suite es consultable, así que se escala a humano en vez de ofrecer otra propiedad sin verificar.

### Generalización — medida honesta

Afiné el agente contra los mismos 100 casos, así que pasarlos **no demuestra** que generalice. Medí con mensajes
parafraseados que el agente no había visto (tasa de la **primera** corrida, antes de corregir):

| Conjunto | Primera corrida | Después de corregir causas generales |
|---|---|---|
| 30 parafraseados (`generalization.mjs`) | **23/30 (77 %)** | 30/30 (ya no ciego) |
| 15 nuevos ciegos (`-blind`) | **8/15 (53 %)** | 15/15 (ya no ciego) |
| 15 nuevos ciegos (`-blind2`) | **10/15 (67 %)** | 15/15 (ya no ciego) |

Lectura: un agente de reglas se queda corto con redacciones nuevas (~50–75 % a la primera). Las correcciones fueron
de causa general (p. ej. el regex `habitaciones?` no reconocía «habitacion»; prefijos con `\b`). Además cambié el
**comportamiento por defecto ante lo desconocido**: antes preguntaba «¿para qué fecha y cuántas personas?» incluso
ante una queja; ahora **pasa a un humano** (`INTENCION_NO_ENTENDIDA`). Con tráfico real habrá más fallos: por eso el
modo es SHADOW (propone, un humano aprueba) y debe medirse con conversaciones reales antes de cualquier envío.

## 5. Grupos y capacidad

| Tamaño | Estado | Comportamiento |
|---|---|---|
| 7–10 | `SMALL_GROUP` | cotización a la medida → humano; Odoo solo como insumo si es Atheron Suite |
| 11–22 | `HUMAN_QUOTE` | humano |
| 23–99 | `PARTIAL_CAPACITY` | solo 22 verificados (Atheron Suite) → humano valida distribución |
| ≥100 | `STRATEGIC_GROUP_LEAD` | humano, urgencia alta, etiqueta |

Siempre: `can_promise_capacity=false`, `hold_allowed=false`. Capacidades web (Casa Algarra 22, Neusa 8, Apartamentos 41,
Colonial 28, La Margarita 40) quedan como **referencia no verificada** (`verified:false`).

### UNIT_ID_MAP

**PARCIAL.** Cubre solo Atheron Suite (unit_id 1–6: 201, 202, 203, 301, 302, CASA COMPLETA, capacidades 2/4/4/7/3/22
vistas en vivo en HOTEL-009). Existen en Odoo `unit_id 7` (Casa Algarra) y `8` (Casa Neusa) **sin capacidad**; los
Apartamentos Algarra, Colonial Confort y La Margarita **no están en Odoo**. Hasta completarlo, esas propiedades dan
DATA_GAP → humano. **No se inventó ninguna capacidad.**

## 6. Cancelación

Siempre humano. El resumen del CEO menciona «48 h / saldo 6 meses», pero **el texto de la política no está en el repo**
(el Playbook la marca DATA_GAP #1). Por eso la pista viaja **solo al humano**, marcada `SIN CONFIRMAR`, y **nunca** se le
dice al huésped (prueba CEO-D06). Cuando el CEO entregue el texto exacto se activa para el huésped.

## 7. Seguridad

Sin secretos ni teléfonos en los entregables (escaneo en CEO-D12). Sin `fetch`/APIs de mensajería en `src/`. Quote del
Gateway real desactivado en SHADOW (crearía una cotización en Odoo): el agente lo **planea** y lo declara
(`QUOTE_PLANNED_NOT_EXECUTED`) sin inventar precio. Teléfonos nunca en las respuestas.

## 8. Limitaciones conocidas

- Reglas, no comprensión real: ver generalización. Falta medir con conversaciones reales.
- Odoo simulado (`test/fake-odoo.mjs`, precios **ficticios**): nunca verificado contra STAGING.
- Audio: se prueba con la transcripción ya dada (no hay ASR real); idioma no español → humano.
- Llamadas: solo registra y escala.
- El Playbook se basa en ~14 conversaciones completas (limitación declarada en su §0).
- Disponibilidad/precio de propiedades distintas de Atheron Suite: siempre humano.

## 9. Bloqueos

1. **Los 12 casos CEO originales NO están** en el repo ni en esta sesión. No los reconstruí. Los 12 requisitos del
   mensaje se ejecutaron como `CEO-D01…D12`. **Adjuntar el archivo** (p. ej. `AI/whatsapp/CEO_CASES_12.md`) para correrlos tal cual.
2. **Texto exacto de la política de cancelación (48 h / 6 meses)**: necesario para decirlo al huésped.
3. **Odoo STAGING 30 % → 50 %: NO ejecutado** (sin sesión). Procedimiento y verificación en `ODOO_DEPOSIT_50_RUNBOOK.md`;
   `check-deposit-policy-live.mjs` (solo lectura) lo comprueba. El agente usa 50 % mientras tanto y avisa del desajuste.
