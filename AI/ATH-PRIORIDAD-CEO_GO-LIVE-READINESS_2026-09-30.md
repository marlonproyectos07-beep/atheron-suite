# PRIORIDAD CEO — Atheron Hotel Reception Go-Live Readiness (2026-09-30)

> Ejecutado en paralelo: A) HOTEL-011 WhatsApp test, B) Modo Ángela
> (Odoo STAGING). Rama: `feature/ath-odoo-hotel-011-whatsapp-controlled-pilot`.

## A — HOTEL-011

- Webhook real desplegado en Vercel Preview ya existía (gate anterior);
  hoy se cableó el `POST /api/hotel/webhook` al pipeline real completo
  (`whatsapp-orchestrator.mjs` → `ai-tool-adapters.mjs` →
  `whatsapp-gateway-tools.mjs`/`WebHotelClient` → Gateway → Odoo
  STAGING), reutilizando exactamente las mismas variables que
  `availability.ts` (`HOTEL_GATEWAY_BASE_URL`/`HOTEL_WEB_AGENT_ID`/
  `HOTEL_WEB_AGENT_KEY`).
- **Hallazgo real**: esas variables están cargadas en Vercel pero
  `HOTEL_GATEWAY_BASE_URL` no apunta hoy a un Gateway alcanzable desde
  internet (`fetch failed` real, verificado en logs) — el Gateway solo
  ha corrido como proceso local en esta máquina hasta ahora. Conectar
  el webhook real de punta a punta (Meta → Vercel → Gateway → Odoo)
  requiere decidir dónde vive el Gateway como servicio permanente y
  cargar credenciales reales de Odoo en esa infraestructura — **eso es
  la acción exclusiva del CEO en la que se detiene esta pista hoy**
  (mismo patrón que HOTEL-008: cargar esas variables ya requería
  autorización explícita).
- Mientras tanto, el webhook desplegado sigue fallando cerrado de forma
  segura (mensaje aceptado/deduplicado a nivel de transporte, nunca
  enrutado sin Gateway alcanzable) — 309/309 tests, 0 regresiones,
  commit `5c3ebb1`.

## B — Modo Ángela (auditoría real en Odoo STAGING)

### Lo que vio Ángela HOY, antes de tocar nada

Entrando a **Hotel v1 (Piloto) → Reservas hotel**, la vista por defecto
era una **lista genérica de órdenes de venta** (columnas: Número,
Cliente, Vendedor, Total, Estado de factura) — sin habitación, sin
fechas, sin saldo. El Kanban (ya enriquecido desde HOTEL-009) sí
mostraba lo correcto, pero **la columna CANCELADA tenía 205 de 238
tarjetas** — en la práctica, inutilizable para revisar de un vistazo.

### Hallazgo real: hoy el 100% de las reservas son de prueba

Se investigó filtrar por nombre de cliente (`QA-`, `FICTICIO`, `TEST`,
`Cliente WhatsApp`) para ocultar ruido QA. Resultado real (no
asumido): **con ese filtro el tablero queda en 0 registros** — porque
todavía no existe ni una sola reserva real (el piloto de WhatsApp real
no está conectado, ver Sección A). Filtrar por nombre habría dejado el
tablero vacío e inútil para practicar.

### Filtro real aplicado (reversible, sin borrar nada)

Se creó un `ir.filters` compartido y **por defecto** sobre la acción
"Hotel v1 — Reservas hotel" (id 1909):

- **Nombre**: "Operación del día (sin canceladas)"
- **Dominio**: oculta solo `CANCELADA`/`NO_SHOW` (resueltas, nada que
  hacer); todo lo demás (CONSULTA/OPCIÓN/HOLD/CONFIRMADA/PRE_CHECKIN/
  CHECKIN/CHECKOUT/CERRADA) sigue visible, sea de prueba o real.
- **Resultado real**: de 238 registros a **33** visibles por defecto.
- Reversible: cualquiera puede quitar el filtro desde el buscador
  (ícono ⭐) y ver el histórico completo, incluida la evidencia QA —
  nada se borró.

### Prueba TEST completa (real, ciclo limpio)

Vía el mismo pipeline de HOTEL-011 (disponibilidad → cotización →
HOLD real contra Odoo STAGING, unidad 201, 2027-05-20/22):
`hold_id 22231`, `COT/2026/03824`, $160.000. Liberado con el botón
real **HOTEL v1 — CANCELAR** (vía `ir.actions.server`, no UI manual)
y reconfirmado disponible de nuevo. Sin residuos.

### Dashboard gerencial

Reverificado real contra Odoo STAGING (`manager-dashboard-live.mjs`):
PASS. Ventas de hoy, ocupación, cobros, saldo por cobrar, ventas por
canal/unidad — todo con datos reales agregados, sin mezclar Atheron
Security (no hay ningún dato de esa app en este modelo).

## STAGING expira en 7 días — inventario real (NO migrado, solo leído)

**Hallazgo crítico**: esta base STAGING no es solo "datos de prueba".
Contiene el **motor operativo completo** del piloto hotelero:

| Categoría | Cantidad real | Ejemplos |
|---|---|---|
| MASTER_DATA (campos custom en `sale.order`) | 97 | `x_hotel_balance`, `x_reservation_status`, `x_hold_expires`, `x_frozen_price_total`... |
| ODOO_STUDIO (vistas heredadas de `sale.order`) | 78 | Kanban enriquecido (HOTEL-009), `HOTEL v1 — sale.order piloto`, formulario con botones Hotel |
| AUTOMATIZACIONES (`base.automation`) | 101 | Anti-doble-reserva, capacidad por propiedad, precio congelado, vencimiento de HOLD, Casa Completa bloquea habitaciones |
| ACCIONES de servidor (código real) | 69 | Los botones **HOTEL v1 — CONFIRMAR/HOLD/CHECKIN/CHECKOUT/CANCELAR/NO SHOW** que usa Ángela |
| CRON activos | 5 | **"HOTEL v1 — Vencer HOLDs y liberar inventario"** cada 15 min — sin esto, el inventario se traba |
| VISTAS (filtros guardados) | 2 | El filtro nuevo de hoy + uno de CCTV |
| GRUPOS/PERMISOS específicos de hotel | 0 | No hay grupos de seguridad custom para hotel todavía |
| ACCIONES DE VENTANA (menús hotel) | 30 | Reservas/Propiedades/Unidades/Tarifas/Políticas de anticipo |

**Esto significa**: si la base expira sin acción, no se pierde "unos
datos de prueba" — se pierde el 100% de la implementación del piloto
(cada automatización, cada botón, cada vista). Reconstruirlo desde cero
en otra base sin Odoo Studio/Enterprise sería un proyecto propio, no un
ajuste.

### Plan de preservación (propuesto, NO ejecutado — decisión del CEO)

1. **Opción más simple y de cero pérdida**: registrar/comprar la
   suscripción sobre esta MISMA base antes de que expire — conserva
   absolutamente todo (Studio, automatizaciones, cron, datos) sin
   migrar nada. Es la única opción que no requiere reconstruir trabajo.
2. Si no se autoriza lo anterior: habría que exportar dato por dato
   (posible vía XML-RPC, ya probado hoy) pero **las 101 automatizaciones
   y 69 acciones de servidor (código Studio) no se exportan por
   XML-RPC** — tocaría recrearlas a mano en otra base, con el
   consiguiente riesgo de discrepancias.
3. No se ejecuta ninguna de las dos sin autorización explícita (orden
   expresa: "NO comprar suscripción", "NO migres a producción sin
   autorización CEO").

## Scripts nuevos (commit `<pendiente>`, rama HOTEL-011)

`diagnostico-selecciones.mjs` (ya existía), `diagnostico-conteo-etapas.mjs`,
`diagnostico-accion-1909.mjs`, `crear-filtro-angela-operacion.mjs`,
`actualizar-filtro-angela-operacion.mjs`, `inventario-staging.mjs`,
`liberar-hold-test.mjs` — todos solo-lectura salvo la creación del
filtro (reversible, documentada arriba) y el ciclo de prueba
(creado y liberado en el mismo paso).
