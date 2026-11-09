# PR (borrador): SIRE/TRA desde Odoo — captura unica, validacion, obligaciones y emisor TRA apagado

**No fusionar ni desplegar** hasta aprobacion de Marlon sobre el resultado probado.

## Que trae
- `src/sire-tra/manifest.mjs`: lo unico que se crea en Odoo (2 modelos, 90 campos, 3 permisos, encuesta de 185 preguntas, 11 acciones, 2 automatizaciones, 11 vistas, 9 acciones de ventana, 9 menus), todo con xmlid `__ath_sire_tra__`.
- `src/sire-tra/applier.mjs`: aplicador repetible (simula por defecto, compatibilidad real de campos, adopcion tras ejecucion parcial, reversion por xmlid).
- `src/sire-tra/tra-emitter.mjs` + `tra-http.mjs`: emisor TRA segun manual oficial de la API (Res. 409 de 2022, version 02-02-2023), apagado por puertas; simulador. Catalogo contrastado con fuentes oficiales en `TRA-CATALOGOS-FUENTES.md` (sigue sin verificar).
- `src/sire-tra/guard.mjs`: produccion bloqueada sin aprobacion escrita; solo copias `atheron1-pruebas-AAAAMMDD`.
- Alerta **Discrepancia de fechas** (`x_date_gap`): compara las fechas que TRA acepto con la estancia posterior (prorroga o salida anticipada). Solo avisa: no borra la aceptacion, no habilita reenvio y no indica como corregir en el portal.
- `.github/workflows/tra-emitter.yml`: manual y apagado (`vars.TRA_EMITTER_ENABLED`).
- `test/p0.test.mjs`: la politica de escrituras ahora recorre subcarpetas y evalua capacidad real (red + mutacion).

## Pruebas
- `npm test`: 410/410.
- Recorrido completo en `atheron1-pruebas-20261108`: ver `SIRE-TRA-PRUEBAS.md`.

## Riesgos y limites
Ver `SIRE-TRA-DESPLIEGUE.md` (efectos al desplegar, reversion que borra datos de campos nuevos, checklist del piloto).
