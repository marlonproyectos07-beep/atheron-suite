# ATH-ODOO-HOTEL-012 — SAFE WRITE PLAN (2026-09-30)

> Plan de escritura para housekeeping (tablero maestro + limpieza), **NO
> ejecutado todavía**. Incorpora las 4 decisiones CEO aprobadas en este
> gate. Ningún paso de este documento se ha aplicado en Odoo. Requiere
> autorización explícita adicional antes de cualquier escritura real.

## Decisiones CEO ya aprobadas (referencia)

1. **Etapa housekeeping**: secuencia conceptual de 5 pasos —
   `POR LIMPIAR → EN LIMPIEZA → LISTA PARA REVISAR → LISTA` (más
   `INCIDENCIA` como rama lateral desde cualquier etapa activa). No se
   crea en Odoo todavía.
2. **Incidencias — Regla v1**: una incidencia abierta SIEMPRE impide el
   paso automático a estado entregable/LISTA; queda `decision_required`
   hasta que un humano autorizado decida. Ninguna categoría
   (BAÑO/DUCHA/LENCERÍA/ELECTRICIDAD/DAÑO/OTRO) se asume irrelevante por
   defecto. El modelo debe permitir severidad/reglas por categoría más
   adelante, sin rediseñar.
3. **Creación de tareas**: prioridad absoluta a automatización nativa de
   Odoo. Antes de crear cualquier regla nueva, auditar a fondo las 3 ya
   existentes. No crear script externo de escritura. No duplicar.
4. **Algarra / Neusa**: HOTEL-012 v1 solo tiene housekeeping para Atheron
   Suite. Las otras dos propiedades siguen visibles en disponibilidad,
   sin proyecto/etapas de limpieza por ahora.

## 1. Cambios exactos que serían necesarios en Odoo (propuesta, no ejecutada)

| # | Cambio | Objeto | Tipo |
|---|---|---|---|
| A | Agregar una etapa Kanban `LISTA PARA REVISAR` al proyecto "Limpieza" (Atheron Suite), posicionada entre `EN LIMPIEZA` y `LISTA` | `project.task.type` (nuevo registro, mismo `project.project` existente) | Aditivo, bajo riesgo |
| B | Ajustar (o confirmar que ya sirve) la regla `Crear Tarea al Confirmar Reserva Atheron Suite` para que la tarea de limpieza se cree en la etapa `POR LIMPIAR` del proyecto "Limpieza" al hacer check-out, vinculada a la unidad/reserva | `base.automation` existente (posible edición de dominio/acción) | Modificación de config existente — **depende 100% de la auditoría pendiente** |
| C | Ningún campo nuevo en `sale.order`, ningún modelo nuevo, ninguna vista nueva | — | No aplica en v1 |

Nada de esto se ejecuta en este turno.

## 2. Objetos/modelos/vistas/automatizaciones afectados

- `project.project` "Limpieza" (Atheron Suite) — posible nueva etapa.
- `project.task.type` — un registro nuevo (la etapa), si se confirma el cambio A.
- `base.automation` — posible ajuste de una regla existente (cambio B), nunca una regla nueva sin antes confirmar que no exista ya.
- `x_hotel_property` (HOTEL ATHERON SUITE) — sin cambios de campo (los 5 campos de housekeeping ya existen y ya apuntan al proyecto/etapas correctos).
- `sale.order` — **solo lectura**, fuente de verdad del checkout; HOTEL-012 nunca escribe aquí directamente.
- Vista Kanban `ir.ui.view` id 6833 (Reservas hotel) — sin cambios.

## 3. Qué ya existe y se reutilizará

- Las 3 automatizaciones ya existentes (ver sección "Auditoría" abajo) — objetivo es reutilizar, no reemplazar.
- El proyecto "Limpieza" y sus 3 etapas activas hoy (`LISTA`/`POR LIMPIAR`/`EN LIMPIEZA`/`INCIDENCIA` — 4 en total).
- El motor real de disponibilidad/exclusión Casa Completa (acción 1967) — sin tocar.
- El patrón de lectura read-only (`odoo-reporting-reader.mjs`, dominio fijo) para cualquier consumo futuro del tablero.

## 4. Qué habría que crear realmente (solo si la auditoría lo confirma)

- La etapa Kanban `LISTA PARA REVISAR` (cambio A) — casi seguro necesaria, ninguna de las 3 automatizaciones conocidas la menciona.
- Posible ajuste de una automatización existente (cambio B) — **no confirmado todavía**; podría no hacer falta nada si `Crear Tarea al Confirmar Reserva Atheron Suite` ya crea la tarea correcta y solo falta que `Limpieza: Al entrar`/`Al salir` la muevan de etapa.

## 5. Riesgos de duplicación

- `Crear Tarea al Confirmar Reserva Atheron Suite` ya crea un `project.task` genérico (nombre "Tarea") disparado 3h después de la última actualización de la reserva — si se agrega una regla nueva para el checkout sin revisar esta primero, una misma reserva podría terminar con **dos tareas de limpieza**.
- `Limpieza: Al entrar` / `Limpieza: Al salir` ya manipulan algo llamado "recursos" (`Marcar recursos como ocupados/disponibles`) — no se confirmó todavía si eso es el mismo `project.task` de housekeeping o un objeto distinto (`resource.resource`/`planning.slot`). Tocar la etapa antes de saberlo arriesga romper una transición automática que ya funciona.
- Mismo patrón de riesgo que ya vivió HOTEL-009 con Studio: el clasificador automático de riesgo puede bloquear "Modify Shared Resources" y pedir que Marlon pegue el cambio él mismo — no es un bloqueo nuevo, es esperado.

## 6. Rollback de cada cambio

| Cambio | Rollback |
|---|---|
| A — nueva etapa Kanban | Aditivo: eliminar o archivar la etapa si queda sin tareas asignadas. Cero riesgo sobre las 4 etapas existentes. |
| B — ajuste de automatización existente | Capturar snapshot exacto (dominio, acción, condición) de la regla **antes** de tocarla — mismo método que HOTEL-009 usó para el XML del Kanban — y restaurarlo literal si algo falla. |
| Cualquier dato de prueba (`project.task` TEST) | Eliminar la tarea TEST al cerrar el ciclo, igual que las reservas TEST de HOTEL-009 quedan en estado terminal limpio. |

No hay migración de datos ni cambio de esquema — todo es configuración reversible.

## 7. Orden exacto de ejecución (cuando se autorice)

1. Auditar a fondo las 3 automatizaciones existentes (lectura, sin escribir) hasta entender trigger/dominio/acción/proyecto/etapa/registro creado por cada una — **condición de salida obligatoria antes de seguir**.
2. Con esa información, decidir si el cambio B es necesario o si ya existe cobertura suficiente.
3. Si falta la etapa `LISTA PARA REVISAR` (cambio A): snapshot del proyecto "Limpieza" actual, crear la etapa en Studio, verificar que las 4 etapas anteriores no se movieron.
4. Si falta el ajuste de automatización (cambio B): snapshot de la regla actual, modificarla, probar de inmediato (ver sección 8).
5. Nunca combinar los pasos 3 y 4 en la misma sesión sin confirmación explícita de Marlon entre uno y otro.

## 8. Pruebas después de cada paso

- Tras el cambio A: confirmar visualmente que `LISTA`/`POR LIMPIAR`/`EN LIMPIEZA`/`INCIDENCIA` siguen intactas y que ninguna tarea real cambió de etapa sola.
- Tras el cambio B: crear una reserva **TEST** (prefijo "TEST", igual que todo HOTEL-009), simular checkout, verificar en el chatter que se creó/movió **exactamente una** tarea, en la etapa esperada, vinculada a la unidad correcta — nunca con huésped/teléfono real.
- Reconfirmar anti-overbooking con `scripts/prueba-reina-201.mjs` para asegurar que el cambio de housekeeping no tocó el motor de reservas.
- `npm test` en el gateway debe seguir en verde (no debería verse afectado, ya que estos cambios son Odoo-side, no de código).

## 9. Qué puede hacerse primero solo en código/Preview, sin escribir Odoo

Esto es seguro y reversible **hoy mismo**, sin sesión Odoo, y queda
como recomendación para la siguiente autorización (no ejecutado en este
turno porque el pedido de este turno fue el plan, no la implementación):

- Activar formalmente el estado `LISTA_PARA_REVISAR` en
  `src/housekeeping-model.mjs` (hoy documentado como
  `LISTA_PARA_REVISAR_PENDIENTE_CEO`, ya aprobado en Decisión 1), con la
  transición `EN_LIMPIEZA → LISTA_PARA_REVISAR → LISTA` y sus tests.
- Ajustar `reportIncident()` para reflejar la Regla v1 de la Decisión 2:
  cualquier incidencia abierta bloquea el paso automático a `LISTA`
  (nunca solo algunas categorías por defecto), dejando la puerta abierta
  a severidad/reglas por categoría después, sin romper el contrato
  actual.
- Todo esto se prueba con `npm test`, sin tocar STAGING, sin Studio, sin
  push.

## 10. Separación explícita respecto a HOTEL-011

- Este plan toca como máximo: `project.project` "Limpieza",
  `project.task.type` (etapas), y posiblemente el dominio/acción de UNA
  automatización ya existente sobre `sale.order` — nunca campos
  `x_hold_*`, `x_reservation_status` de escritura, WhatsApp ni Meta.
- HOTEL-011 no usa `project.project`/`project.task` en absoluto; su
  integración vive en el Gateway + Vercel + lectura de
  `sale.order`/campos ya usados por HOTEL-009. Este plan no modifica
  ninguno de esos campos, solo los lee si hace falta confirmar algo.
- Ningún paso de este plan toca la rama, el worktree ni ningún commit de
  `feature/ath-odoo-hotel-011-whatsapp-controlled-pilot`.
- Si la auditoría pendiente revela que alguna de las 3 automatizaciones
  también es usada por el flujo de WhatsApp, el plan se detiene y se
  reporta antes de tocar nada — regla heredada directamente de la
  restricción del gate anterior ("si detectas que HOTEL-012 necesitaría
  escribir sobre un objeto compartido con HOTEL-011, no lo hagas,
  repórtalo").

## Auditoría de las 3 automatizaciones — estado actual

**BLOQUEADO en este turno.** Se intentó 3 veces (clic en la misma fila,
tras captura de pantalla fresca cada vez) y las 3 veces se abrió un
registro distinto al esperado ("Motor de reservación: Marcar
disponibilidades para volver a calcular", no relacionado con
housekeeping) — comportamiento reproducible, no aleatorio, consistente
con la inestabilidad ya documentada en `AI/ATH-ODOO-HOTEL-009_HANDOFF.md`
("timeouts de captura de pantalla... comportamiento inestable en esta
sesión de automatización de navegador"). No se intentó una cuarta vez ni
se improvisó ninguna acción de escritura para compensar.

Lo único confirmado hasta ahora (sesión anterior, ver
`AI/ATH-ODOO-HOTEL-012_DIAGNOSTICO.md` §6), sin detalle de dominio/campo
exacto:

| Regla | Modelo | Trigger | Acción (nombre visible) |
|---|---|---|---|
| `Crear Tarea al Confirmar Reserva Atheron Suite` | `sale.order` | "3 horas después de la última actualización" | "Crear Tarea con el nombre Tarea" |
| `Limpieza: Al entrar` | `sale.order` | "Al guardar" | "Limpieza: Marcar recursos como ocupados" |
| `Limpieza: Al salir` | `sale.order` | "Al guardar" | "Limpieza: Marcar recursos como disponibles" |

**Pendiente real** (próxima sesión con Odoo estable): abrir cada una y
confirmar (1) dominio exacto, (2) a qué proyecto/etapa apunta la tarea
creada, (3) si "recursos" se refiere a `project.task` o a otro modelo
(`resource.resource`/`planning.slot`), (4) qué registro queda creado
tras una corrida TEST.
