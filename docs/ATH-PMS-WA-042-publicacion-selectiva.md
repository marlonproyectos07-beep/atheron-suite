# ATH-PMS-WA-042 — Preparación selectiva de páginas legales (sin publicar)

**Alcance autorizado:** solamente rama `ath-web-meta-019/paginas-legales` del PR #106. El PR debe seguir en **Draft**; sin fusión a `main` ni despliegue de producción.

## Controles preparados, todos APAGADOS

En `src/data/legal.ts`:

- `PUBLICAR_PRIVACIDAD = false`: controla indexación, banda de borrador, enlaces en el pie, sitemap y la posibilidad de mostrar el aviso de consentimiento GA4.
- `PUBLICAR_ELIMINACION = false`: controla la misma presentación para la página de eliminación.
- `BORRADOR_LEGAL = true`: mantiene **términos e información legal** en borrador, sin indexación, sin enlaces públicos ni sitemap.

Estos controles están preparados para un **cambio futuro distinto**, solo tras revisión de los textos, comprobaciones y autorización expresa. En este commit **NO se ponen en true**.

## Cambios en textos aún no aprobados

- Política §5: la línea WhatsApp Cloud API +57 301 803 5593 sigue **en preparación**; no se afirma que los mensajes ya llegan a Odoo. Se retira la aseveración de que la atención de esa línea ya es humana, porque no se probó.
- Política §1 y pie de privacidad: no se enlaza información legal del RNT mientras su relación con los establecimientos siga pendiente.
- Política §10: se retira la instrucción «BAJA», no implementada.
- Eliminación de datos: canal de solicitud **por ahora** correo comercial y WhatsApp de recepción +57 318 898 3167; se retira la línea 301 hasta verificarla. No se enlaza a la información legal en borrador.
- No se modifican acuerdos con socios, RNT, condiciones comerciales ni plazos.

## Consentimiento y analítica

`Base.astro` activa el aviso y el modo `data-analitica=consentimiento` **solo** cuando `PUBLICAR_PRIVACIDAD = true`. El script existente `main.js` no se modifica; conserva la carga de GA4 únicamente tras la aceptación. En este commit las dos banderas siguen falsas, de modo que la analítica se mantiene apagada **en la rama**.

**Pendiente antes de cualquier publicación:**
1. Aprobación de los textos legales y de contacto, incluyendo vigencia real (hoy `VIGENCIA_LEGAL = null`).
2. Probar en vista previa ambos escenarios con una rama o entorno aislado: sin publicación (ambos controles false) y con solo privacidad/eliminación true; nunca activar términos/RNT por error.
3. Validar visibilidad, `robots`, sitemap, pie, enlaces y GA4 sin consentimiento/aceptación/rechazo; comprobar que el aviso no tapa el contacto flotante.
4. Confirmar tests y build; no usar `npm run prueba` como único sustituto de prueba de navegador.
5. Autorizar de forma separada fusión, despliegue y configuración Live de Meta.

## Restricciones

No tocar Meta, Odoo, WhatsApp, Smoobu, la rama `main` ni despliegues de producción. Un push a la rama PR puede desencadenar una **preview automática** de Vercel según el CI; no constituye despliegue de producción.
