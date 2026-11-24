# Plan de publicación y reversión — PR #121 (ATHERON HOTELS)

Estado: PLAN. No se ha fusionado ni desplegado nada. El PR #121 sigue en borrador.

## Punto de partida (verificado el 23-nov-2026)

| Dato | Valor |
|---|---|
| Producción actual | commit `36c7f03` (cabeza de `main`, fusión del PR #118) |
| Despliegue de producción vigente | `atheron-suite-dqqza909v-marlon-atheron.vercel.app`, creado 2026-11-19 00:43 UTC (GitHub deployment 7900559481) |
| Despliegue de producción anterior | commit `fe64f05`, creado 2026-11-18 18:25 UTC (GitHub deployment 7892371061) |
| Rama del PR | `seo/ubicacion-google-y-redirects-odoo` (idéntica a `preparacion/correcciones-auditoria`) |
| `public/admin/config.yml` línea 45 | `branch: main` (correcto; no hay que cambiarlo) |
| Producción hoy | título antiguo «Atheron Suite \| Hospedajes con alma…»; `/shop` da 404 |

El nombre exacto del despliegue anterior a `dqqza909v` en el panel de Vercel no se pudo
leer: el panel pide iniciar sesión y no se introducen credenciales. La lista anterior sale
de la API de GitHub.

## Antes de publicar

1. Dirección aprueba el informe final y las decisiones pendientes.
2. Punto de restauración: crear la etiqueta `checkpoint/main-pre-atheron-hotels-2026-11-23` en `36c7f03`.
   **No se pudo crear desde esta sesión** (GitHub devolvió 403 al subir etiquetas): lo hace dirección o se autoriza otra vía.
   Mientras tanto, `36c7f03` es el punto de restauración de hecho.
3. Confirmar que `main` no se movió (`git merge-base origin/main <rama>` debe seguir en `36c7f03`).
   Si el panel `/admin` guardó algo, hay que reconciliar antes.
4. Vista previa del último commit del PR: revisar portada, `/hospedajes`, una ficha y el blog.
5. Marcar el PR como «listo para revisión» (hoy lo impide la API GraphQL desde esta sesión; se hace en GitHub).

## Publicación

1. Fusionar con **commit de fusión** (no *squash*): así un solo `git revert -m 1` lo deshace entero.
2. Vercel despliega `main` a producción de forma automática. No tocar dominio ni DNS.
3. Esperar a que el despliegue termine en verde.

## Verificación inmediata (primeros 15 minutos)

- `https://hotelesatheron.com/` muestra el título «Hoteles en Zipaquirá \| ATHERON HOTELS».
- Los 8 redirects responden: `/shop`, `/shop/x`, `/contactus`, `/website/social/x`,
  `/hospedajes/la-magia-de-zipaquira` (con y sin `.html`), `/hospedajes/plantilla-hospedaje`, `/blog/plantilla-articulo`.
- Las 23 URLs del sitemap responden 200; `robots.txt` y `sitemap.xml` intactos.
- Un botón de WhatsApp por ficha abre `wa.me/573188983167` con el mensaje del alojamiento.
- `/hospedajes/hotel-la-margarita` lleva `noindex` y no aparece en el sitemap.
- Lighthouse contra la URL real, además de la medida local (el sitio antiguo ya no se sirve).

## Después (días 1 a 7)

- Search Console: inspeccionar y solicitar indexación de `/`, `/hospedajes`, `/landing/hospedaje-en-zipaquira`; reenviar el sitemap.
- Vigilar clics e impresiones de «hotel en Zipaquirá», «hoteles en Zipaquirá», «alojamiento en Zipaquirá».
- Odoo, WhatsApp y Google Business se tratan aparte, con su propia autorización.

## Reversión

Disparadores: algún redirect en bucle o 404, ficha principal caída, botón de WhatsApp con número
equivocado, Lighthouse por debajo de 95, o error de datos estructurados en Search Console.

**Opción A — la más rápida (2 minutos): *Instant Rollback* en Vercel.**
Panel de Vercel > proyecto `atheron-suite` > Deployments > despliegue `dqqza909v` (commit `36c7f03`) > Promote / Instant Rollback.
Requiere sesión iniciada. Ojo: tras un rollback manual Vercel puede dejar de asignar solo
los dominios a los despliegues nuevos; habrá que volver a promover para retomar el flujo normal.

**Opción B — por Git (5 minutos):**
`git checkout main && git revert -m 1 <commit-de-fusion> && git push origin main`.
Vercel despliega el estado anterior.

**Opción C — volver al punto de restauración:** el commit `36c7f03` (o su etiqueta, cuando exista).

Qué NO se revierte con nada de esto: Google Business (fichas ya corregidas), Odoo, WhatsApp.
Esos no se tocan en esta publicación.
