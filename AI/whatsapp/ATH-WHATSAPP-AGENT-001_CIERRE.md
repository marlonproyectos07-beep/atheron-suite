# GOAL-WHATSAPP-AGENT-001 — CIERRE (2026-10-03)

> Rama `feature/ath-odoo-hotel-012-master-board-housekeeping`. `WHATSAPP_AUTOMATION_MODE=shadow`. Sin outbound, sin Production, sin Odoo escrito.
> `ODOO_STAGING_LIVE_VALIDATION=PENDING_EXTERNAL_AUTHENTICATED_TEST` (sesión autenticada separada de Claude Chrome; **no** se intentó aquí).

## Decisiones de Control Maestro incorporadas

- **Fuente canónica de los 12 casos:** `AI/whatsapp/CEO_CASES_V1.md` (no existía un artefacto histórico). Ejecutados en `test/ceo-cases.test.mjs`.
- **Política de cancelación (directa)** — texto oficial verbatim en `CEO_CASES_V1.md`; implementada así:
  - ≥ 48 h antes del check-in (hora real de check-in de la propiedad, no 00:00): se **explica** (sin devolución en efectivo, saldo a favor 6 meses, sujeto a disponibilidad, tarifa vigente de la nueva fecha, diferencia si es mayor).
  - < 48 h, no-show, sin check-in verificable, o reserva sin identificar: **ESCALATE_HUMAN**, sin decidir devolución ni penalidad.
  - Reserva OTA (Booking/Airbnb/otra): se rige primero por la plataforma → humano.
  - Pregunta general de política (sin reserva): se responde el texto oficial.
  - **Errata probable:** el texto oficial dice «Hoteles Atero»; las respuestas dicen «Hoteles Atheron». Pendiente de confirmar.
- **Anticipo 50 %** se mantiene; Odoo STAGING puede seguir en 30 % (se corrige en sesión separada; el agente marca `ODOO_DEPOSIT_MISMATCH`).
- **Seguridad:** intención desconocida o confianza insuficiente (mensaje sin intención con varias palabras sin explicar, o audio < 0.6) → ESCALATE_HUMAN; nunca se asume disponibilidad ni se consulta Odoo.
- **Nuevos en este cierre:** `ALLY_B2B`, `PAYMENT_VALIDATION_REQUIRED`, `GROUP_PRICING_APPROVAL`, invalidación de la cotización anterior al cambiar personas/fechas (CEO-08), consulta de capacidad verificada (solo Atheron Suite) para grupos ≥ 23.

## Resultados (reproducibles)

```bash
cd integrations/whatsapp-shadow-agent && node --test          # 211 pruebas
node scripts/run-playbook.mjs                                  # T01-T100 -> PLAYBOOK_RESULTS.{md,json}
cd ../odoo-hotel-gateway && node --test                        # 376
```

| Medida | Resultado |
|---|---|
| CEO-01…CEO-12 canónicos | 12/12 PASS (+ safety, modo) |
| Playbook T01–T100 | 100/100 PASS; 81 sin desviación y 19 casos con 21 desviaciones documentadas con razón (3 nuevas por la política oficial: T23, T47 y T81) |
| Pruebas del agente | 211/211 |
| Regresión gateway | 376/376 |

### Advertencia de generalización
Medida en ciego (primera corrida, antes de corregir): **77 %, 53 %, 67 %, 60 %** en cuatro conjuntos (30+15+15+15 mensajes).
Es un agente de reglas; con tráfico real fallará más. Los fallos se corrigieron por causa general y los conjuntos quedan como regresión,
pero ya no son ciegos. El fallback a humano hace que lo desconocido sea seguro (no necesariamente útil). **No pasar de SHADOW sin medir con conversaciones reales.**

## Auditoría de implementación duplicada — `DUPLICATE_IMPLEMENTATION_RISK=HIGH`

Hallazgo (solo lectura por API, sin merge ni checkout):

| | |
|---|---|
| Rama | `claude/atero-whatsapp-shadow-agent-0v0yho` · commit `4935d59` (2026-10-03 16:40 UTC), otra sesión (`session_0158j8GH…`) |
| Mismo directorio | `integrations/whatsapp-shadow-agent/` (README, `.env.example`, `src/`, `cases/`, `evidence/`, `scripts/`, `test/`, `package.json`) + `AI/whatsapp/SHADOW_AGENT_STATUS.md` |
| Contenido | clasificador de 8 clases, memoria, reglas CEO, grupos/multipropiedad, eventos de llamada, puerto de audio, **kill switch**, evidencia anonimizada; 59 pruebas (1 omitida por falta del Playbook) |
| Base | `main`; no contiene nuestro Playbook ni hotel-009/012 |
| Divergencias | check-in a las **00:00** (nosotros: hora real); ya no tenía el Playbook; no ejecuta T01–T100 |
| Otras ramas | `feature/ath-odoo-hotel-013-whatsapp-natural-conversation`, `-016-whatsapp-natural-media`, `-011-whatsapp-controlled-pilot` (Codex): solo `odoo-hotel-gateway`/`odoo-hotel-ical`, sin `whatsapp-shadow-agent` |

**Riesgo:** merge de ambas ramas ⇒ conflictos *add/add* en el mismo directorio y dos políticas divergentes. **No se mergeó nada.**
**Recomendación (decide Control Maestro):** una sola implementación canónica. Opciones: (A) esta (ejecuta Playbook + CEO_CASES_V1) y portar de la otra el *kill switch*, eventos de llamada, puerto de audio y evidencia anonimizada; o (B) renombrar uno de los dos directorios antes de cualquier merge.

## Bloqueos / pendientes
1. Validación Odoo STAGING real (sesión autenticada separada; incluye 30 % → 50 %).
2. Confirmar la errata «Hoteles Atero» y decidir cuál implementación es la canónica.
3. UNIT_ID_MAP/capacidades: solo Atheron Suite verificada.
4. Medir con conversaciones reales antes de salir de SHADOW.
