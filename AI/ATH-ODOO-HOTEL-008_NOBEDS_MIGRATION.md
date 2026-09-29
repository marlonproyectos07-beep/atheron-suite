# ATH-ODOO-HOTEL-008 — NOBEDS: auditoria de migracion (Fase 1)

> Creado 2026-09-29. Alcance: SOLO auditar NOBEDS para poder migrar sin
> perder proteccion de inventario. No se desarrolla NADA nuevo sobre
> NOBEDS. No se apaga. No se modifica.
>
> Clasificacion: **LEGACY_ACTIVE**. NOBEDS es una prueba anterior, no es
> ni sera la arquitectura objetivo (decision del CEO), pero hoy sigue
> activo y probablemente protegiendo inventario real — no se toca sin
> reemplazo probado.

## Incidente a declarar (transparencia obligatoria)

Durante la auditoria, para inspeccionar el contenido de la accion de
servidor interna que dispara el cron de NOBEDS (`ir.actions.server` id
1654), se navego por error a `https://atheron1.odoo.com/odoo/action-1654`
en vez de abrir su formulario de edicion. Esa URL puede haber EJECUTADO la
accion en lugar de solo mostrarla (a diferencia de las acciones de menu
tipo ventana, las acciones de servidor accedidas por URL directa corren
su codigo). No se confirmo si corrio ni que efecto tuvo. Por lo que se
alcanzo a leer del cron que la dispara, esa accion especifica solo
"refresca" un feed iCal de salida (recalcula que fechas aparecen
bloqueadas en el iCal que NOBEDS expone hacia las OTA) — no crea, cancela
ni modifica reservas — por lo que el riesgo estimado es bajo, pero no se
puede dar por HECHO sin verificarlo. **No se repitio esa navegacion** una
vez detectado el riesgo. Marlon deberia confirmar (via logs de NOBEDS o
revisando si algo cambio) que no hubo efecto no deseado.

## Que es NOBEDS, con evidencia real (Odoo produccion "atheron1", modo
desarrollador, 2026-09-29)

Menu `Reservacion > Reservas OTA (NOBEDS)` (acción Odoo `action-1847`):
bandeja de "bloques fantasma" — reservas que entraron por iCal desde
Airbnb/Booking, identificadas por el campo `x_nobeds_id`, sin
`sale.order` asociado. Vacia al momento de revisar (0 fantasmas
pendientes) — no es prueba de salud general, solo de que hoy no hay
nada atascado.

### Crons relacionados (Ajustes > Tecnico > Acciones planificadas, modo
desarrollador)

| Nombre | Modelo | Intervalo | Activo | Siguiente ejecucion (al revisar) | Que hace (leido del campo Codigo) |
|---|---|---|---|---|---|
| ATHERON - Refrescar iCal NOBEDS (salida) | Planificacion de turnos (`planning.slot`) | 5 minutos | **SI** | 29 sep 2026, 1:55am | Delega en `ir.actions.server` id 1654 (`env['ir.actions.server'].sudo().browse(1654).run()`); no se inspecciono el contenido completo de 1654 tras el incidente de arriba, evitando volver a ejecutarlo por accidente |
| ATHERON - Sincronizar reservas hotel al calendario | Orden de venta (`sale.order`) | 5 minutos | **NO** (desactivado) | 7 jul 2026 (quedo en el pasado, senal de que lleva tiempo apagado) | Busca `sale.order` con `state in (sale, done)` y `x_checkin`/`x_checkout` definidos; por cada linea con `planning_role_id` en el producto, crea un `planning.slot` (checkin 15:00, checkout 11:00) si no existe ya uno para esa linea |
| ATHERON PMS — Verificacion de Consistencia NOBEDS | Planificacion de turnos (`planning.slot`) | 4 horas | **NO** (desactivado) | 19 may 2026 (tambien quedo en el pasado) | Nombre sugiere que validaba consistencia entre NOBEDS y Planning; contenido no revisado para evitar mas ejecuciones accidentales |

**Lectura**: el mecanismo activo hoy es unidireccional documentado como
"salida" (Odoo -> iCal, cada 5 min, vivo). El puente inverso explicito
"reservas -> calendario" y el verificador de consistencia estan
**apagados hace meses** (fechas de "siguiente ejecucion" quedaron en el
pasado, lo que en Odoo significa que el cron no se re-planifico porque
esta inactivo). Esto es coherente con el gap ya detectado: la reserva de
Camilo (Airbnb, 27-29 sep 2026) no aparece como `sale.order` en Odoo.

### Que NO se pudo confirmar en esta sesion

- Contenido completo de la accion de servidor 1654 (el "cerebro" real de
  NOBEDS) — evitado a proposito tras el incidente de ejecucion accidental.
- Si NOBEDS es un modulo instalado (de la lista de Apps) o codigo custom
  vinculado por Studio/consultor externo — no se reviso Apps por no
  desviar el alcance de esta auditoria puntual.
- URLs de los feeds iCal de entrada/salida por unidad (201/202/203/301/
  302/Casa Completa) — viven presumiblemente en `ir.config_parameter` o
  en el propio codigo de la accion 1654; **no se exponen aqui a
  proposito** aunque se hubieran visto, por la regla de no pegar
  secretos/URLs sensibles.
- Ultima ejecucion real exitosa vs. fallida del cron activo (el campo
  visible es "siguiente ejecucion", no un log de corridas; el log
  detallado de crons vive en otra vista no revisada por tiempo).

## Plan de migracion (Fase 1 del nivel 1, NO ejecutar sin aprobacion)

1. **Inventariar** (esta tabla + accion 1654 completa + feeds por unidad)
   — falta cerrar el punto de la accion 1654 con precaucion (abrir su
   formulario de EDICION, no su URL de ejecucion — en Odoo eso se hace
   desde Tecnico > Acciones del servidor, buscando el id 1654, con clic
   dentro de la lista, nunca `/odoo/action-1654` directo).
2. **Construir reemplazo**: worker propio, con Odoo como fuente unica
   (ver Fase 5 del prompt maestro), probado primero en staging.
3. **Probar reemplazo** en paralelo, sin apagar NOBEDS todavia.
4. **Detener el worker NOBEDS** (desactivar el cron "Refrescar iCal
   NOBEDS (salida)") solo cuando el reemplazo este verificado.
5. **Conservar NOBEDS apagado** como rollback (no borrar registros,
   modelos ni cron).
6. **Eliminar NOBEDS** solo en una fase futura y con autorizacion expresa
   del CEO.

## Que NO se debe reconstruir

- El feed de salida (Odoo -> iCal) ya existe y corre cada 5 min: no hay
  que inventar un mecanismo de exportacion desde cero, hay que entender
  el de la accion 1654 y decidir si se reutiliza su logica o se reemplaza
  con contrato mas claro.
- El modelo de "reservas OTA sin sale.order" (`x_nobeds_id`, vista
  `Reservas OTA (NOBEDS)`) ya resuelve deteccion de huerfanos — un
  reemplazo deberia mantener una funcion equivalente, no reinventarla
  distinto sin necesidad.
