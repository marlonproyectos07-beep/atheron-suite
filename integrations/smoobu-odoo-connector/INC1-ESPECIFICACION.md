# Incremento 1: estructura vacia (SIRE/TRA)

Crea SOLO (lista cerrada en `src/inc1-spec.mjs`): el modelo `x_establishment` (15 campos), 3 campos en `resource.resource` y 18 en `x_guests_line`. Sin vistas, sin automatizaciones, sin datos, sin valores predeterminados (el codigo SIRE va vacio, por establecimiento). No modifica ni borra nada existente; solo `create` en `ir.model` e `ir.model.fields`.
Repetible: el plan se calcula contra lo existente (`computePlan`); la segunda pasada es vacia.
Bitacora: solo nombres tecnicos y conteos; nunca datos personales ni secretos.
Por verificar en la copia: que Odoo Online acepte crear `ir.model`/`ir.model.fields` por JSON-2 con este usuario y que el many2many de `resource.resource` a si mismo se cree con la tabla indicada. Si falla, la ruta alternativa es Studio manual en la copia.
Impacto: escribir `x_establishment_id` no se hace (solo se crean columnas); crear campos no dispara automatizaciones. Las vistas llegan en el incremento 1b.
Pruebas: `test/inc1.test.mjs` (11), sin red.
