# Despliegue minimo TRA Grupo 1 en produccion y fusion de la PR #124 (25/11/2026)

Autorizado por Marlon el 25/11/2026 a las 17:27 (Bogota). Condiciones: SHA completo verificado, codigo igual al
ensayado y sin cambios nuevos incompatibles. Repositorio publico: solo ids y codigos. Se mantuvieron
`TRA_EMITTER_ENABLED`, `TRA_AUTO_SEND` y `TRA_ENABLED` en `no`. No se transmitio nada. Smoobu -> Odoo y SIRE sin
cambios.

## 1. Condiciones verificadas antes de escribir
- Cabeza de la PR = `2411e3a95228025c431cac4fb642a475d0c341f3` (GitHub y local). `main` sin cambios (`e93ea57`).
- Codigo del despliegue igual al ensayado: `delta.mjs`, `delta-base-2026-11-24.mjs`, `manifest.mjs`, `applier.mjs`,
  `guard.mjs`, `browser-entry.mjs`, `prod-browser-entry.mjs` y `errors.mjs` sin diferencias entre `4584d2b` (ensayado
  en la copia) y `2411e3a`.
- `npm test` en un arbol limpio de `2411e3a` (Node 22): 479/479.
- Paquete de produccion armado en la pagina con los archivos del commit, leidos de raw.githubusercontent.com:
  122 486 bytes, sha256 `73db2d3fc43c39caf25e58bd21e7c83a73e973d51ec6a960514cb9434ff1d9d3`, igual al local.
- Produccion sin deriva: `planDelta` dio 5 cambios y 0 bloqueos, identico al ensayo.
- Estado de GitHub antes de fusionar:
  - el estado "Vercel - atheron-mobile-mcp-preview" falla, como en `main` (e93ea57); no lo causa esta PR;
  - "Vercel - atheron-suite" en verde;
  - la PR solo toca `integrations/smoobu-odoo-connector/` y `.github/workflows/tra-emitter.yml` (comentarios);
  - ningun flujo de trabajo se dispara con un push a `main`.

## 2. Respaldo
- `snapshot()` a las 22:28:55 UTC:
  - conteos: `sale.order` 1587, `x_guests_line` 7, `survey.user_input` 25, `account.move` 5315, `account.payment` 2531;
  - 139 campos propios, 113 automatizaciones activas y 363 xmlid;
  - 62 352 bytes; sha256 (16) `4b2e39a20a7e4b0a`.
- Respaldo exacto de lo reemplazado: `deploy/tra-delta-respaldo-produccion-2026-11-25.json` (2 991 bytes, sha256 (16)
  `f6ec7eca818aafe9`). Se comprobo en la pagina que es identico, byte a byte, al respaldo de `planDelta`. Contiene el
  codigo de la accion 2040 y la arquitectura de las vistas 6872 y 6873 antes del cambio. Ninguno incluye datos de
  huespedes.

## 3. Aplicacion (4,4 s)
| Objeto | Resultado |
|---|---|
| `x_tra_amount.x_excludes_taxes` | creado, id 49415, con xmlid |
| `x_tra_amount.x_covers_all_guests` | creado, id 49417, con xmlid |
| Accion 2040 "Confirmar importe pagado (con evidencia)" | codigo reescrito |
| Vista 6872 (formulario de importes) | arquitectura reescrita |
| Vista 6873 (lista de importes) | arquitectura reescrita |

## 4. Verificacion
- `verifyDelta`: `ok: true`, 5 de 5 hechos, 0 pendientes, 0 bloqueos.
- Automatizaciones (id, activa, fecha de escritura): identicas antes y despues; `au_amount_guard` sigue activa.
- Cron 48: activo antes y despues, misma proxima ejecucion.
- Permisos de `x_tra_amount`: identicos (sin escritura ni borrado).
- Conteos iguales al respaldo. Campos propios 139 -> 141; xmlid 363 -> 365 (solo los dos campos).
- Las vistas cargan con los campos nuevos. Importes: 0. Intentos: 0. Establecimiento: `x_tra_mode=api`,
  `x_tra_config_verified=false` (sin cambios).

## 5. Fusion
- PR #124 marcada lista y fusionada con comprobacion del SHA de cabeza (`2411e3a...`), como commit de fusion
  `893422951d6f16deda98acd4d9c11d404ced1641`. El arbol es identico al de `2411e3a`.
- Punto de restauracion: rama `checkpoint/main-2026-11-25-pre-pr124` = `e93ea57` (el entorno no permite subir tags).

## 6. Reversion (conservada; no ejecutada)
En la consola de atheron1.odoo.com, con el paquete de produccion de `main` (sha256 comprobado):
```
p = ATH_SIRE_TRA_PROD.bootProduction(window, <frase de aprobacion>)
await p.revertDelta(<contenido de deploy/tra-delta-respaldo-produccion-2026-11-25.json>)
await p.planDelta()   // debe dar 3 cambios (accion y vistas) y 0 bloqueos: base restaurada
```
- La reversion solo actua si la accion y las vistas siguen con el contenido desplegado.
- Los dos campos se conservan, sin uso.
- Para el codigo: `git revert -m 1 8934229` o volver a `checkpoint/main-2026-11-25-pre-pr124`.
- Ensayada en la copia `atheron1-pruebas-20261125` (ver `tra-delta-ensayo-copia-2026-11-25.md`).

## 7. Suscripcion de Odoo
El aviso de "Vencido" es de **produccion** (atheron1 > Mi suscripcion), no de la copia:
- "Vence el November 24, 2026", suscripcion mensual, plan personalizado con las etiquetas "En curso" y "Vencido";
- parametros de produccion: `database.expiration_date = 2027-01-02 00:00:00` y `database.expiration_reason = renewal`.
La base funciona hoy y la renovacion esta pendiente; Odoo indica el 02/01/2027 como fecha de expiracion por
renovacion. No se pago ni se contrato nada.
