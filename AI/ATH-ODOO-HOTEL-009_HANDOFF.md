# ATH-ODOO-HOTEL-009 — Handoff (2026-09-29)

> Tablero operativo + reserva manual + control gerencial, sobre
> `atheron1-hotel-staging-20260923` exclusivamente. Continua HOTEL-008
> (APROBADO, ver `AI/ATH-ODOO-HOTEL-008_FINAL_APPROVED.md`). Nada de
> produccion, Booking, Airbnb, NOBEDS, WhatsApp real, Meta, DIAN se toca
> en este gate.

## Fase 0 — hecho

- HOTEL-008 documentado como PASS: `AI/ATH-ODOO-HOTEL-008_FINAL_APPROVED.md`
  (commit final 765ac45, arquitectura E2E, 3 bugs corregidos,
  restricciones de produccion respetadas).
- Este archivo es el handoff/estado vivo de HOTEL-009.

## Fase 1 — auditoria operativa de STAGING (parcial, ver bloqueo abajo)

### Lo que YA se confirma con evidencia real (sin inventar nada)

Del propio Gateway (`/hotel/availability`, probado en vivo contra Odoo
STAGING en HOTEL-008), la respuesta real trae por unidad:

```
property_id, property_name, unit_id, nombre, estado
(disponible/no_disponible), capacidad_comercial,
requires_manual_confirmation
```

Inventario piloto confirmado (ver tambien
`AI/ODOO_HOTEL_PROMOTION_MANIFEST.md`, fila 7, y el mapeo ya usado en
codigo `UNIT_ID_MAP`):

| Unidad | unit_id | property | capacidad_comercial (visto en vivo) |
|---|---|---|---|
| 201 | 1 | HOTEL ATHERON SUITE | 2 |
| 202 | 2 | HOTEL ATHERON SUITE | 4 |
| 203 | 3 | HOTEL ATHERON SUITE | 4 |
| 301 | 4 | HOTEL ATHERON SUITE | 7 |
| 302 | 5 | HOTEL ATHERON SUITE | 3 |
| CASA COMPLETA | 6 | HOTEL ATHERON SUITE | 22 |

(Nota: la misma consulta tambien devuelve `CASA COMPLETA` de otras dos
propiedades -- `CASA ALGARRA` unit_id 7 y `CASA NEUSA` unit_id 8 -- que
no son parte del piloto de este gate, documentado por si acaso.)

Del gate4/inverse-gate ya probados (HOTEL-002, HOTEL-008A): el bloqueo
cruzado Casa Completa <-> habitaciones **ya existe y funciona dentro de
Odoo** (accion 1967) -- no hay que reconstruirlo, solo consumirlo desde
la UI nueva.

### Lo que NO se pudo auditar todavia (bloqueo real, ver abajo)

El contrato del Gateway (`availability/quote/hold/status`) es
deliberadamente de minimo privilegio y NO expone:

- modelos/campos internos de Odoo (nombres de tabla, vistas existentes);
- si existe ya un modelo de huesped/contacto (`res.partner` u otro)
  enlazado a la reserva;
- si existe ya un campo de origen/canal, anticipo/saldo, o si hay que
  crearlo;
- grupos/permisos mas alla de los ya documentados (148 Aprobador
  comercial, 149 Hotel v1 / API Sofia);
- acciones automatizadas mas alla de las ya inventariadas en
  `AI/ODOO_HOTEL_PROMOTION_MANIFEST.md`.

`AI/ODOO_HOTEL_PROMOTION_MANIFEST.md` ya deja escrito (seccion 4, "NO
CONFIRMADO") que ni esta sesion ni el usuario tecnico Sofia STAGING
tienen acceso a **Ajustes > Tecnico > Personalizaciones de Studio** --
eso sigue siendo cierto hoy, nada cambio en HOTEL-008.

## BLOQUEO REAL PARA FASE 1 (profunda) / FASE 2-4 / FASE 7

Construir el tablero de Angela, la reserva manual y el tablero gerencial
**dentro de Odoo** (vistas, calendario, lista operativa) requiere
interactuar con la interfaz web de Odoo directamente (tipo Studio o
vistas nativas), lo cual necesita:

1. Una sesion de navegador autenticada contra
   **`atheron1-hotel-staging-20260923`** (staging, NO produccion
   "atheron1") -- hoy no hay ninguna pestana abierta (`tabs_context_mcp`
   confirma: sin grupo de pestanas activo).
2. Un usuario con permisos suficientes para crear/editar vistas
   (idealmente admin en esa base especifica, o Studio habilitado) --
   el unico usuario tecnico documentado (Sofia API STAGING, grupo 149)
   es deliberadamente de minimo privilegio y NO tiene esto.

Esto encaja exactamente con la regla de autonomia del propio CEO:
"Detente unicamente ante: ... credencial que solo Marlon pueda
proporcionar." No es un bloqueo tecnico que pueda resolver programando
mas: es acceso que no existe en este entorno todavia.

**Lo que SI se avanzo sin ese acceso** (Fase 5 parcial y Fase 6
completa) esta abajo.

## Fase 5 (parcial) — modelo de datos gerencial, listo para conectar

Reutilizando integramente `integrations/odoo-hotel-gateway/src/
financial-model.mjs` y `angela-read-model.mjs` (ya construidos y
probados en HOTEL-008 nocturno): el CONTRATO de datos que responde a
las preguntas gerenciales (venta hoy, cobrado hoy, ocupacion, quien
llega/sale, canal) ya existe y esta probado (14+5 tests). Lo que falta
es la FUENTE real: hoy corre sobre fixtures; conectarlo a `sale.order`
real de Odoo es directo una vez haya sesion STAGING para confirmar el
modelo real (Fase 1 profunda).

## Fase 6 — contrato WhatsApp/IA (HOTEL-010), completo

Ver `AI/ATH-ODOO-HOTEL-010_WHATSAPP_CONTRACT.md`. Documentado, NO
activado. Reutiliza integramente el Gateway de HOTEL-007/008 (mismo
contrato `availability/quote/hold/status`, mismo `alternatives-engine`,
mismo `sofia-adapter`), sin inventar nada nuevo.

## Actualizacion 2026-09-29 -- turno autonomo (PROMPT MAESTRO)

Mientras la Fase 1 profunda seguia bloqueada por falta de sesion Odoo
STAGING, se avanzo todo lo que no requiere esa sesion (regla de
bloqueo del propio CEO: un frente bloqueado no detiene el turno):

- **Frente A (diseno UX "modo Angela")**: completo, ver
  `AI/ATH-ODOO-HOTEL-009_ANGELA_UX.md` -- colores/estados (reutilizando
  `ANGELA_STATUSES`, ninguno inventado), layout HOME, cards por unidad,
  evaluacion Kanban/Calendario/Lista/Cards/Dashboard.
- **Frente C (read-model operativo)**: completo y probado,
  `integrations/odoo-hotel-gateway/src/operational-read-model.mjs` (14
  tests) -- TODAY/ARRIVALS/DEPARTURES/IN_HOUSE/HOLDS/PAYMENT_PENDING/
  UPCOMING/AVAILABLE.
- **Frente D (tablero gerencial)**: completo y probado,
  `salesByChannel`/`salesByUnit`/`adr`/`managerDashboard` en
  `financial-model.mjs` (9 tests nuevos).
- **Frente B + E (reserva manual + prueba reina)**: diseno completo,
  ver `AI/ATH-ODOO-HOTEL-009_RESERVA_MANUAL.md`; arnes anti-overbooking
  SIMULADO y probado (`anti-overbooking-harness.mjs`, 6 tests) --
  encontro que el Gateway real NO tiene operacion de cancelacion (ver
  ese documento).
- **Frente F (Casa Completa <-> habitaciones)**: cubierto por los
  tests ya existentes de `odoo-hotel-ical` (28) mas el caso explicito
  de Casa Completa dentro del arnes anti-overbooking.
- **Frentes G-L (WhatsApp/IA de laboratorio)**: completos y probados,
  ver la actualizacion 2026-09-29 en
  `AI/ATH-ODOO-HOTEL-010_WHATSAPP_CONTRACT.md` -- motor conversacional,
  adaptadores de herramientas, handoff humano, eventos de
  observabilidad, simulador (10/10 casos PASS).
- **Frente M (tests adicionales)**: cubiertos por los tests de los
  puntos anteriores mas los ya existentes del Gateway (idempotencia,
  rate limit, contrato, forma de respuesta desconocida/malformada,
  reintentos) -- no se repite lo que ya estaba probado en HOTEL-007/008.

Suite completa del Gateway: **227/227 tests PASS** (167 antes de este
turno + 60 nuevos).

## Frente O -- bloqueo real para Marlon (una sola accion)

Todo lo de arriba se pudo avanzar SIN tocar Odoo. Lo que sigue
bloqueado (Fase 1 profunda, Fase 2-4/7: construir la UI real, conectar
el read-model a datos reales) necesita **una sola cosa** de Marlon:

> **Abrir, en una pestana de Chrome, una sesion iniciada contra Odoo
> STAGING (`atheron1-hotel-staging-20260923`, NO produccion "atheron1"),
> con un usuario que tenga acceso a Studio/vistas.**

Con esa sesion se completa la Fase 1 profunda y se puede empezar a
construir la UI real (Frente A/B) directamente sobre lo ya diseñado y
probado en este documento y en `AI/ATH-ODOO-HOTEL-009_ANGELA_UX.md` /
`AI/ATH-ODOO-HOTEL-009_RESERVA_MANUAL.md`.

## Actualizacion 2026-09-29 (tercera pasada) -- mandato MASTER AUTONOMOUS COMPLETION

`ODOO_STAGING_UI_BLOCKED` sigue vigente (sin cambios desde la
actualizacion anterior). Todo lo construible sin esa sesion para
HOTEL-010 (laboratorio conversacional completo: NLU, politica de
autonomia, handoff ampliado, simulador de 25 casos, E2E sin WhatsApp,
MessagingProvider, copy) ya esta hecho y probado -- ver el detalle en
`AI/ATH-ODOO-HOTEL-010_WHATSAPP_CONTRACT.md`. El unico bloqueo real de
HOTEL-009 sigue siendo exactamente el mismo de arriba (una sesion de
Chrome contra Odoo STAGING). HOTEL-010 tiene un segundo bloqueo,
distinto: la autorizacion explicita de Marlon para conectar WhatsApp
real (Meta), que es una decision de negocio, no tecnica -- no se toca
sin ese permiso.

## Actualizacion 2026-09-30 -- SESION REAL contra Odoo STAGING (bloqueo levantado)

Marlon abrio una sesion de Chrome ya autenticada contra
`atheron1-hotel-staging-20260923` (usuario ATHERON S.A.S, con acceso de
administrador -- confirmado empiricamente: pudo crear/cancelar
registros y ver todas las apps de Ajustes). `ODOO_STAGING_UI_BLOCKED`
queda LEVANTADO desde este punto. Todo lo de abajo es SOURCE_REAL,
verificado en vivo, no inferido.

### Gate 009-A -- auditoria real (app "Hotel v1 (Piloto)")

La app custom `Hotel v1 (Piloto)` (menus: Reservas hotel, Propiedades,
Unidades, Politicas de anticipo, Tarifas) es la fuente real. Hallazgos:

- **Unidades** (`Hotel v1 — Unidades`, 8 registros): 201, 202, 203, 301,
  302 y **3 CASA COMPLETA** (una por propiedad). Cada unidad trae
  `CAPACIDAD_BASE`, `CAPACIDAD_COMERCIAL`, `CAPACIDAD_EXTRAORDINARIA`,
  `REQUIERE_APROBACION_EXTRA`, `Propiedad`, `Recurso`, `Producto`, `Rol
  planning`, `Tipo de unidad` (Fisica/Compuesta), `Unidades hijas` /
  `Unidades compuestas que la contienen`.
- **CASA COMPLETA (HOTEL ATHERON SUITE, record id 6) tiene como
  "Unidades hijas" exactamente 201/202/203/301/302** -- el bloqueo
  cruzado (Gate 009-E) esta modelado como relacion padre-hijo real, no
  hay que inventar ni reimplementar la relacion, ya existe en datos.
- **Propiedades** (3): HOTEL ATHERON SUITE, CASA ALGARRA, CASA NEUSA
  (confirma lo ya documentado arriba).
- **HOTEL ATHERON SUITE** (propiedad), campos reales nuevos:
  `Hora check-in: 15:00`, `Hora check-out: 11:00`,
  `Anticipo minimo por defecto (%): 30,00`,
  `Horas maximas de HOLD: 2,00` (nota real en el campo: "HOTEL-004:
  x_hold_hours es parametro STAGING (PENDIENTE_APROBACION_CEO); vacio =
  valor tecnico 2h del motor" -- confirma que el 2h que ya usabamos en
  DRY_RUN es el valor tecnico real, pendiente de aprobacion formal, no
  inventado), `Capacidad comercial casa completa: 22`,
  `Modelo contractual: OPERACION_DIRECTA_ATHERON`,
  **`Proyecto housekeeping: Limpieza`** con etapas reales
  `LISTA / POR LIMPIAR / EN LIMPIEZA / INCIDENCIA` -- esto es la fuente
  real del estado LIMPIEZA que el diseno UX (Frente A) habia marcado
  como "REQUIERE FUENTE": ya existe, vive en un proyecto de tareas
  (`project.project`), no en el propio registro de unidad.
- **Reservas hotel** (`sale.order` extendido, 234 registros reales al
  cierre de esta auditoria; numeracion `COT/2026/xxxxx`, la misma que
  ya aparecia en los fixtures de `financial-model.mjs` -- confirma que
  esos fixtures SON datos reales de esta base). Pestaña **"Hotel v1"**
  del formulario trae el modelo completo:
  - `Estado Reservacion` (visto: `CONSULTA`; los botones de accion real
    del formulario son **`Hotel: OPCION` / `Hotel: HOLD 2h` /
    `Hotel: CONFIRMAR` / `Hotel: CANCELAR`**, que corresponden a un
    workflow de estado real `Cotizacion -> Cotizacion enviada -> Orden
    de venta -> Cancelado`);
  - `Propiedad hotel`, `Unidad hotel`, `Check-in/Check-out (entrada/
    salida)`, `Numero de Adultos`, `Numero de Ninos`,
    `Capacidad extra aprobada` (checkbox), `Canal de Reserva`;
  - **`HOLD vence`** (timestamp) y **`HOLD vencido`** (checkbox real,
    calculado) -- confirma que la expiracion de HOLD ya es un campo
    real visible, no solo un valor interno del Gateway;
  - `VENTA (total)`, `Politica de anticipo`, `Anticipo requerido (%)`,
    `ANTICIPO requerido` (monto), `COBRADO (pagos registrados)`,
    `SALDO pendiente`, `Anticipo minimo cubierto` (checkbox);
  - `Descuento autorizado (%)` y `Descuento autorizado por` -- SI existe
    un campo real para autorizar un descuento; hoy vacio/0 en los
    registros vistos. Esto no cambia la regla de autonomia de la IA
    (Gate 010-C: descuento siempre HUMAN_REQUIRED) porque autorizarlo
    sigue siendo un acto humano explicito sobre este campo, la IA nunca
    lo toca.

**Conclusion Gate 009-A:** el modelo de datos completo que
`operational-read-model.mjs` y `financial-model.mjs` necesitan para
dejar de correr sobre fixtures YA EXISTE en Odoo, con nombres de campo
confirmados. Conectar esos modulos a datos reales requiere una decision
de arquitectura (ver "Que sigue" abajo), no mas investigacion.

### Gate 009-D -- "prueba reina" REAL (201, ciclo completo con evidencia)

Ejecutada DOS VECES, ambas PASS, contra el Gateway real (LIVE, accion
1967) mas el boton real `Hotel: CANCELAR` de Odoo:

1. **Prueba de esta manana** (ya en el journal local antes de este
   turno, verificada ahora): `hold_id 22223` (habitacion 201,
   `COT/2026/03816`), `hold_id 22222` (Casa Completa,
   `COT/2026/03815`), `hold_id 22224` (302, `COT/2026/03817`). Las tres
   HOLD **expiraron solas a las 2h** (politica real) y el Gateway
   (`status` + `availability`) confirmo `hold_expired` +
   disponibilidad restaurada -- verificado con
   `node scripts/live-hotel-008a-runner.mjs verify-expiration`, PASS.
2. **Prueba fresca de este turno** (fechas 2027-01-28/29, nunca usadas
   antes): `node scripts/live-hotel-008a-runner.mjs inverse-gate` ->
   `quote_id 139`, `hold_id 22225` (201, `COT/2026/03818`),
   `casa_completa_blocked: true`, 202/203/301/302 `available: true` ->
   overall `PASS`. Liberacion: en vez de esperar 2h, se uso el boton
   REAL `Hotel: CANCELAR` sobre este registro (Odoo lo paso a estado
   `Cancelado`); `node scripts/prueba-reina-201.mjs` confirmo
   inmediatamente despues que 201 y CASA COMPLETA volvieron a
   `disponible`. El `status` del Gateway para ese hold ahora reporta
   `"cancelled"` (distinto de `"hold_expired"` -- hallazgo real: Odoo
   distingue ambos estados terminales).

**Hallazgo clave (responde la pregunta abierta de donde debe vivir la
cancelacion):** la cancelacion YA EXISTE, pero vive como una accion de
workflow real dentro de Odoo (`Hotel: CANCELAR`, botón del formulario),
NO como una operacion del contrato del Gateway. Esto es coherente con
el hallazgo anterior de este mismo gate (agregar `cancel` como
operacion del Gateway choco con una prueba deliberada de HOTEL-007) --
la arquitectura real ya resuelve esto sin que el Gateway necesite
exponerlo: cancelar es, a proposito, un acto humano (o de un futuro
proceso Odoo-side), nunca algo que la IA/Gateway dispare por su cuenta.

`scripts/prueba-reina-201.mjs` (nuevo, commiteado) deja el chequeo de
disponibilidad post-liberacion reproducible para el proximo ciclo de
prueba reina.

### Gate 009-E -- Casa Completa <-> habitaciones, REAL

Confirmado con evidencia real (no solo con el modelo de datos de
arriba): la prueba de esta manana incluyo tambien la fase `gate4`
-- HOLD de Casa Completa bloqueo **las 5 habitaciones Y la propia Casa
Completa** (`no_disponible` en las 6 unidades) -- y la de este turno
(`inverse-gate`) confirmo la direccion opuesta: HOLD de una habitacion
(201) bloquea Casa Completa pero NO bloquea las habitaciones hermanas.
Ámbas direcciones PASS, con datos reales, mismo motor ya aprobado en
HOTEL-002 (accion 1967) -- no se reimplemento nada.

### Gate 010-F -- E2E conversacional REAL (no simulado)

`scripts/e2e-conversational-live.mjs` (nuevo, commiteado): conecta
`conversation-engine.mjs` (el mismo motor del laboratorio HOTEL-010,
sin cambios de logica) contra el Gateway LIVE real. Mensaje de prueba:
fechas 2027-02-10/11, 1 huesped. Resultado real: 201 aparecio NO
disponible para esas fechas (dato real, no forzado), el motor ofrecio
alternativas reales (202/203/301/302), selecciono 202, cotizo real
($50.000 COP, `quote_id 140`) y creo HOLD real (`hold_id 22226`,
`COT/2026/03819`) -- estado final `HOLD_CREATED`. Liberado despues con
el mismo boton real `Hotel: CANCELAR`; el Gateway confirmo 202 e
disponible de nuevo (201 seguia no disponible por una reserva real
ajena a esta prueba, y Casa Completa por lo tanto tambien -- consistente
con el bloqueo cruzado, no es un error).

**Hallazgo real y correccion aplicada:** al conectar esto contra el
Gateway real se encontro que `createHoldTool`
(`src/ai-tool-adapters.mjs`) no reenviaba `unit` -- el contrato real de
`hold` exige `unit_id` ademas de `quote_id` (`src/contract.mjs`), y los
tests con fakes no lo habian detectado porque los fakes ignoraban el
campo. Corregido (`conversation-engine.mjs` ahora pasa
`{quoteId, unit}` a `createHoldTool`), con test de regresion nuevo.
267/267 tests PASS despues del fix.

### Gates 009-B/C/F (Modo Angela real, reserva manual real, tablero
gerencial real) -- evaluados, NO construidos todavia

La app nativa `Hotel v1` YA cubre, de forma basica, el ciclo operativo
completo: lista de reservas, formulario con todos los campos
necesarios, y los 4 botones de workflow real
(`OPCION/HOLD/CONFIRMAR/CANCELAR`) que de hecho SON una reserva manual
funcional hoy mismo (Angela podria usarla ya, sin nada nuevo que
construir, aunque sin la simplicidad visual que pide el Frente A).

No se construyeron vistas Kanban/Dashboard nuevas ni cambios de Studio
en este turno, a proposito: las interacciones de busqueda/agrupacion
avanzada mostraron comportamiento inestable en esta sesion de
automatizacion de navegador (timeouts de captura de pantalla, un
"Agrupar por" que aplico multiples niveles de golpe) y construir vistas
compartidas equivocadas en una base que ya usa un piloto real es un
riesgo que no vale la pena correr sin control mas fino que clicks de
coordenadas. **Recomendacion:** dedicar una sesion enfocada (idealmente
con Studio, no solo agrupaciones de lista) para construir la Kanban de
Angela y el dashboard gerencial sobre este modelo de datos ya
confirmado -- el diseno (`ATH-ODOO-HOTEL-009_ANGELA_UX.md`) no necesita
cambios, solo ejecucion.

Para el tablero gerencial real (Gate 009-F), conectar
`operational-read-model.mjs`/`financial-model.mjs` a estos datos reales
requiere decidir COMO leerlos: (a) una nueva operacion de lectura en el
contrato del Gateway (cambio de contrato, requiere decision de Marlon,
igual que el hallazgo de `cancel`), o (b) lectura directa via
XML-RPC/`search_read` con el usuario tecnico (permisos no probados
todavia). Se deja como **PENDIENTE_DECISION_CEO**, no como bloqueo
tecnico -- la fuente de datos y sus nombres de campo ya estan
confirmados arriba, falta decidir el canal de lectura.

## Actualizacion 2026-09-30 (turno nocturno) -- Prioridad 1 resuelta: tableros reales CONECTADOS

### Decision tomada: opcion "D" (combinacion segura), no A ni B solas

Se investigaron las 3 rutas reales pedidas:

- **(A) Nueva operacion HTTP en el Gateway** -- descartada para este
  uso: expondria lectura masiva de reservas al mismo nivel de
  privilegio que `availability/quote/hold` a identidades externas
  (Sofia/web), cuando el consumidor real (tablero gerencial/Angela) es
  Marlon/recepcion, no un canal de IA.
- **(B) XML-RPC directo** -- probado en SOLO LECTURA
  (`scripts/diagnostico-permisos-xmlrpc.mjs`): el usuario tecnico YA
  TIENE permiso `search_read` sobre `sale.order`, `x_hotel_unit`,
  `x_hotel_property` (`ALLOWED` en los 3). Riesgo real confirmado:
  `sale.order` es COMPARTIDO con otra linea de negocio de ATHERON S.A.S
  (CCTV/Syscom -- campos reales `x_modo_syscom`/`x_is_mixed_rama`
  confirman que la misma tabla mezcla hotel y seguridad electronica).
  Leer sin filtrar expondria datos ajenos al hotel.
- **(D) implementada**: B, pero SIEMPRE con dominio fijo
  `x_order_involves_room = true` (campo real que Odoo ya usa para
  marcar "esto es una reserva de hotel") + lista fija de campos +
  SOLO como modulo/scripts locales de reporteria con la credencial
  tecnica ya existente (nunca una operacion HTTP nueva). Implementado
  en `integrations/odoo-hotel-gateway/src/odoo-reporting-reader.mjs`
  (5 tests, con `FakeOdooTransport` y la forma real de fila confirmada
  via `fields_get`).

Nombres tecnicos reales descubiertos (nunca adivinados, ver
`scripts/diagnostico-campos-hotel.mjs` / `diagnostico-selecciones.mjs`):
`x_reservation_status` (10 valores reales: `draft`→CONSULTA,
`opcion`→OPCION, `hold`→HOLD, `confirmed`→CONFIRMADA,
`pre_checkin`→PRE_CHECKIN, `checked_in`→CHECKIN,
`checked_out`→CHECKOUT, `closed`→CERRADA, `cancelled`→CANCELADA,
`no_show`→NO_SHOW -- este ultimo no estaba en nuestro diseno de
Angela, se documenta como hallazgo), `x_booking_source` (canal:
direct/booking_com/airbnb/phone/whatsapp/agencia/otro),
`x_hold_origin` (staff/web/sofia/ota/qa -- `sofia` coincide
exactamente con el `source_channel` que el Gateway ya fuerza),
`x_hotel_paid`, `x_hotel_balance`, `x_hotel_deposit_required`,
`x_checkin`/`x_checkout`, `x_num_adults`/`x_num_children`,
`x_nombre_cliente`/`x_telf_cliente`, `x_hold_expires`/`x_hold_expired`.

### Tableros REALES corriendo (evidencia, no simulada)

- **`scripts/manager-dashboard-live.mjs`**: lee reservas reales,
  alimenta `managerDashboard()` (ya probado con fixtures, sin ningun
  cambio de logica) y solo imprime AGREGADOS (nunca huesped/telefono
  individual). Corrida real (referencia 2026-09-29):
  `total_reservations_read: 300` (ver limite abajo),
  `sales_created_today_total: 200000` (2 ventas reales),
  `accounts_receivable: 27132720.7`,
  `sales_by_unit`/`sales_by_channel` reales.
- **`scripts/angela-dashboard-live.mjs`**: mismo patron para
  `operational-read-model.mjs` (TODAY/ARRIVALS/DEPARTURES/HOLDS/
  PAYMENT_PENDING/UPCOMING). Enmascara telefono (`****1234`) y reduce
  el nombre a inicial incluso en su propia salida -- pensado para
  correr local (PowerShell de Marlon), nunca para pegar la salida
  cruda en un chat sin revisar.

**Limite conocido, no bug:** `fetchHotelReservations` trae hasta 300
filas por corrida (`limit` configurable). Con 234+ reservas ya en
STAGING, una ventana mas larga (ej. todo un trimestre) necesitaria
paginar (`offset`) o filtrar por fecha en el propio `domain` -- se deja
como mejora simple, no bloqueante, para cuando el volumen real lo
requiera.

### Prioridad 2 -- KPIs gerenciales, fuente real por KPI

| KPI | Estado | Fuente real |
|---|---|---|
| VENTAS HOY | `REAL_SOURCE_CONNECTED` | `amount_total` + `create_date` (`sale.order`) |
| COBROS HOY | `REAL_SOURCE_MISSING` | Existe `x_hotel_paid` (monto acumulado COBRADO), pero **no hay un campo real de fecha de cobro** -- no se puede saber que se cobro HOY especificamente, solo el acumulado a la fecha. `financial-model.mjs` ya distingue esto (requiere `collected_date`, que no llega de la fuente) -- no se inventa. |
| SALDOS | `REAL_SOURCE_CONNECTED` | `x_hotel_balance` (ya calculado por Odoo) |
| RESERVAS NUEVAS | `REAL_SOURCE_CONNECTED` | `create_date` |
| OCUPACION | `REAL_SOURCE_CONNECTED` | `x_checkin`/`x_checkout` |
| CHECK-INS / CHECK-OUTS | `REAL_SOURCE_CONNECTED` (programados) | `x_checkin`/`x_checkout`. Nota: existen ademas `x_checkin_actual`/`x_checkout_actual`/`x_checkin_done`/`x_checkout_done` (check-in/out REAL vs programado) -- no conectados todavia, mejora futura para distinguir "debia llegar hoy" de "ya llego". |
| VENTAS POR CANAL | `REAL_SOURCE_CONNECTED` | `x_booking_source` |
| VENTAS POR ALOJAMIENTO | `REAL_SOURCE_CONNECTED` | `x_hotel_unit_id` |
| ADR | `REAL_SOURCE_CONNECTED` (con matiz) | Derivado de `amount_total`/noches; `amount_total` es el total de la orden completa (podria incluir extras no separados por noche) -- razonable como aproximacion, no exacto al centavo. |

VENTA != COBRO se mantiene estrictamente: `sales_created_today_total`
y `collected_today` siguen siendo campos separados en
`managerDashboard()`, nunca mezclados.

### Prioridad 3 -- prueba reina endurecida (doble intento REAL)

`scripts/prueba-doble-intento-real.mjs`: dos "clientes" (cotizacion +
intento de HOLD) sobre la MISMA unidad/fechas, en secuencia inmediata,
contra Odoo real. Resultado real: cliente A gano el HOLD (`hold_id
22227`, `COT/2026/03820`, unidad 203); cliente B fallo con
`NOT_QUOTED` (Odoo invalido su cotizacion al detectar que la
disponibilidad ya habia cambiado) -- **cero sobreventa**, confirmado
con datos reales, no simulados. Liberado despues con `Hotel: CANCELAR`.

Los demas casos pedidos (repeticion, idempotencia, HOLD expirado,
cancelacion, error de Gateway, recuperacion, Casa Completa vs
habitaciones) ya estaban cubiertos -- por evidencia REAL donde aplica
(HOLD expirado y cancelacion: ver actualizacion anterior; Casa
Completa: Gate 009-E) y por el arnes SIMULADO
(`anti-overbooking-harness.mjs`, 6 tests) donde una corrida real
repetida no aportaria informacion nueva (ej. reintento con la misma
`idempotency_key` ya esta probado exhaustivamente en
`test/idempotency.test.mjs` desde HOTEL-007).

### Prioridad 4 -- E2E conversacional, escenarios ampliados (REAL)

`scripts/e2e-conversational-scenarios-live.mjs`, 6/6 PASS contra Odoo
real, CERO huellas nuevas en "Reservas hotel" (ninguno llega a
`requestBooking`, y `quote()` en LIVE no crea un registro visible --
solo `hold()` lo hace, confirmado empiricamente): fechas disponibles,
selección directa de unidad, cambio de fechas a mitad de conversacion
(vuelve a consultar disponibilidad real), cambio de numero de personas
(recalcula la unidad candidata real -- de 201 paso a CASA_COMPLETA al
subir a 12 huespedes), mensaje repetido (cero llamadas duplicadas al
Gateway real, confirmado contando invocaciones), y cotizacion real via
pregunta de precio ($80.000 COP real).

### Prioridad 6 -- ficha de handoff, campos completados

`human-handoff.mjs` ahora incluye tambien `origen` (canal de la
conversacion) y `estado` (estado del motor al momento de escalar),
cerrando la lista completa pedida: Cliente/Telefono/Fechas/Personas/
Unidad-opcion/Cotizacion/HOLD/Estado/Saldo/Origen/Motivo/Ultimo
mensaje.

### Prioridades 7-8 -- resiliencia y seguridad, verificado sin cambios de codigo

Resiliencia: timeout/error de Gateway (propagan, nunca inventan
resultado), respuesta malformada (fail-closed), duplicado/mensaje
repetido (idempotente, ahora tambien confirmado real), HOLD expirado
(real, dos veces), cambio de fechas/personas (real), abandono/reanudacion
(el estado persiste entre llamadas, ya probado), dos clientes misma
unidad (real, Prioridad 3 arriba) -- todo cubierto, sin regresiones.

Seguridad: 0 `console.log` en `src/` (grep repetido), 0 secretos en
todo el stage de este turno (`scan-for-secret-leak.mjs`), los nuevos
scripts de lectura real enmascaran telefono y nunca imprimen huesped/
telefono en el tablero gerencial (solo agregados). No se toco el `.env`
antiguo de Downloads ni `ConsoleHost_history` (siguen fuera de alcance,
solo reportados en HOTEL-008).

272/272 tests PASS.
