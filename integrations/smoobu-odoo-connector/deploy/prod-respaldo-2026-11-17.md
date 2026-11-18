# Respaldo de configuracion de produccion antes de instalar SIRE/TRA (atheron1, 2026-11-17)

Tomado con `bootProduction(...).snapshot()` (commit `6b0159a`, paquete sha256 `9218cf44617dce14094bd8392a88f335c84a936029b36fbf266934af3b5347a1`)
el 2026-11-18T00:29:19Z (UTC). Sin datos personales.

## Estado anterior
- Registros con xmlid `__ath_sire_tra__`: **0** (nada instalado antes).
- Conteos: sale.order 1544, x_guests_line 4, survey.user_input 4, account.move 5055, account.payment 2518.
- Campos `x_` existentes en los modelos que se tocan: 24 (x_guests_line 13, resource.resource 11; ninguno en
  survey.user_input, res.country, l10n_latam.identification.type). Ninguno coincide con los del manifiesto.
- Automatizaciones activas en esos modelos: 26 (resource.resource, on_create_or_write), 27 (resource.resource,
  on_unlink), 61 (survey.user_input, on_write; filtro `survey_id = 1`, materiales de campo: no aplica a la encuesta nueva).
- Automatizaciones activas en toda la base (110): 1,2,4,5,10-37 (salvo 38-39), 40,44,45,46,47,49,51,52,55,56,57,60,61,63,
  64-69,71,78-82,93,94,98,107,113,118,121,132,135,137,139,141,143,144,151,157-159,161-173,184,187-190,192-200,202-208.
  Lista exacta: `1,2,4,5,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,40,44,45,46,47,49,51,52,55,56,57,60,61,63,64,65,66,67,68,69,71,78,79,80,81,82,93,94,98,107,113,118,121,132,135,137,139,141,143,144,151,157,158,159,161,162,163,164,165,166,167,168,169,170,171,172,173,184,187,188,189,190,192,193,194,195,196,197,198,199,200,202,203,204,205,206,207,208`.

## Simulacion previa
325 creaciones (2 modelos, 90 campos, 3 permisos, 1 encuesta + 185 preguntas, 12 acciones, 3 automatizaciones
APAGADAS, 11 vistas, 9 acciones de ventana, 9 menus), 0 bloqueos, 0 adopciones, 0 reutilizados. Ningun registro
existente se modifica.

## Reversion
- Suave (recomendada, no borra): `p.disable({ apply: true })` apaga automatizaciones y menus y quita las acciones
  del menu *Accion*. Historicos intactos.
- Una sola regla: `p.setAutomation('au_invite', false)`.
- Dura (borra solo `__ath_sire_tra__`): no expuesta en el procedimiento de produccion; requiere decision expresa
  de Marlon y exportacion previa de los datos de huespedes.
- Respaldo diario de Odoo Online: **no verificado** en esta sesion (odoo.com pide contrasena).
- Git: etiqueta `checkpoint/sire-tra-pre-prod-2026-11-17` = commit `40c5a0d` (antes de esta sesion).
