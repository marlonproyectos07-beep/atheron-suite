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
