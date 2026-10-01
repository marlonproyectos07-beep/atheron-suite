# ATH-ODOO-HOTEL-012 — Rollback de la acción 1902 (STAGING)

Acción: `ir.actions.server` id **1902**, "HOTEL v1 — CHECKOUT", modelo `sale.order`.

## Cuándo

Solo si el CHECKOUT ajustado causa problemas. Esto es un **cambio en Odoo**: lo
ejecuta una persona con acceso, en **STAGING**, con autorización de Marlon.
Nunca en Production sin orden expresa.

## Pasos exactos

1. Odoo STAGING (`atheron1-hotel-staging-20260923`, **no** `atheron1`) → modo
   desarrollador → Ajustes → Técnico → Acciones → **Acciones de servidor**.
2. Abrir la acción **id 1902**.
3. **Antes de tocar:** copiar el campo *Código* actual a un archivo aparte
   (debería coincidir con `AI/hotel-012-snapshots/ACTION_1902_CURRENT.py`).
4. Reemplazar **solo el campo Código** con el contenido de
   `AI/hotel-012-snapshots/ACTION_1902_ORIGINAL.py`, **sin las líneas de
   comentario de cabecera** (las que empiezan por `#`; el código empieza en
   `LABEL = {`).
5. Guardar. **No modificar ningún otro campo** (nombre, modelo, grupos, etc.).

## Validación posterior

- Un CHECKOUT deja `x_occupancy = vacant`.
- La tarea abierta pasa a **POR LIMPIAR**.
- **No** cambia `x_estado_limpieza`.
- **No** renombra la tarea.
- **No** crea duplicados.

## Qué NO deshace el rollback

Los datos ya modificados por la versión ajustada (rol 29 `sucia`, nombre de la
tarea 2294) se quedan como están; corregir a mano si hace falta. Con el código
original, una tarea cancelada puede volver a reutilizarse (el filtro por
`state` desaparece): tenerlo en cuenta antes de volver atrás.

## Para volver a la versión actual

Repetir los pasos con `ACTION_1902_CURRENT.py`.
