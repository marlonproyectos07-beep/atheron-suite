# ATH-PMS-WA-051 — Preparación técnica para publicación en Meta

**ESTADO: SOLO RAMA DRAFT DEL PR #106. NO PUBLICADO. NO HACER MERGE SIN OTRA AUTORIZACIÓN.**

Esta operación, autorizada por gerencia, prepara **únicamente**:
- Política de privacidad: `PUBLICAR_PRIVACIDAD = true` en la rama Draft.
- Eliminación de datos: `PUBLICAR_ELIMINACION = true` en la rama Draft.
- Versión `1.2`, sin etiqueta de borrador.
- Vigencia propuesta `6 de noviembre de 2026`, **provisional**, a comprobar y cambiar a la fecha real de publicación si el despliegue ocurre después.
- `BORRADOR_LEGAL = true`: términos, información legal y RNT permanecen noindex, fuera del sitemap y sin enlace en el pie.

Los dos interruptores a true **harán públicas estas páginas si se fusiona la rama**. Por tanto, el merge debe permanecer bloqueado hasta autorización de gerencia y revisión jurídica.

## Criterios de aceptación previos a merge
1. Revisión jurídica final del tratamiento de datos, responsables y alojamientos aliados.
2. Confirmación de correo `comercialgsc001@gmail.com` y canales de atención.
3. Confirmación del día real de publicación y actualización de `VIGENCIA_LEGAL`.
4. `npm run prueba`, `npm run comprueba`, `npm run build`, comprobación de preview de dos páginas indexables; términos y RNT ocultos; GA4 no carga hasta consentimiento.
5. Autorización expresa de merge/despliegue por gerencia.
6. Verificar rutas públicas y luego introducir URLs en Meta con nueva autorización; activar Live solo con nueva autorización.

**URLs previstas**: https://hotelesatheron.com/politica-de-privacidad y https://hotelesatheron.com/eliminacion-de-datos.

**Prohibido en ATH-PMS-WA-051**: merge, deploy producción, cambios en Meta/Odoo/Smoobu/WhatsApp, mensajes y pagos.
