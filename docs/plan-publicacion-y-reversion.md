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
2. Punto de restauración: la rama `restore/main-pre-atheron-hotels-2026-11-24` apunta a `36c7f03` y ya existe en GitHub.
   La etiqueta no se pudo subir desde esta sesión (403); la rama la sustituye. No borrarla ni moverla.
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

Qué está comprobado y qué no:

| Vía | Estado |
|---|---|
| `git revert -m 1` de la fusión | **Simulado en local**: el árbol resultante es idéntico al de `36c7f03`. `main` no está protegida y la cuenta de trabajo puede empujar. |
| Despliegues anteriores de Vercel | **Verificado**: `atheron-suite-dqqza909v` (36c7f03) abre y muestra el sitio antiguo. El anterior, `atheron-suite-bvrq4ggq9` (fe64f05), no se abrió. |
| *Instant Rollback* del panel de Vercel | **No probado**: el panel pide iniciar sesión. Solo lo puede hacer dirección. |
| Rama `restore/main-pre-atheron-hotels-2026-11-24` | **Verificada** en GitHub. |

**Opción A — por Git (5 minutos):**
`git checkout main && git revert -m 1 <commit-de-fusion> && git push origin main`.
Vercel despliega el estado anterior.

**Opción B — *Instant Rollback* en Vercel (2 minutos, no probado):**
Panel > proyecto `atheron-suite` > Deployments > `dqqza909v` > Promote / Instant Rollback.
Tras un rollback manual Vercel puede dejar de asignar solo los dominios a los despliegues nuevos;
habrá que volver a promover para retomar el flujo normal.

**Opción C — restaurar desde la rama de restauración:** llevar `main` a `36c7f03` (requiere autorización, porque reescribe historia).

Qué NO se revierte con nada de esto: Google Business (fichas ya corregidas), Odoo, WhatsApp.
Esos no se tocan en esta publicación.
