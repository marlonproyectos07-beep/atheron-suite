# ATH-WEB-DIRECT-BOOKING-003 — hotelesatheron.com → motor de solicitudes de Beds24

URL oficial (única, con idioma): `https://beds24.com/booking2.php?propid=359051&lang=es` — definida una sola vez en `src/data/beds24.ts`.
Rama: `feature/ath-odoo-hotel-017-booking-airbnb-level1` (sin merge a main, sin PR).

## 1. Qué cambió (solo código del sitio)

| CTA | Antes | Ahora |
|---|---|---|
| Cabecera global (escritorio **y menú móvil**), usada en home, blog, eventos y guías | «Ver disponibilidad» → WhatsApp | «Consultar disponibilidad» → Beds24 |
| Home, hero (CTA principal) | «Ver hospedajes» + «Cotizar mi grupo» | «Consultar disponibilidad» → Beds24 (primario) + «Ver hospedajes» |
| Home, cierre | «Ver disponibilidad» → WhatsApp | «Solicitar reserva» → Beds24, con el mensaje comercial y el aviso del 50 % |
| Ficha Hotel Atheron Suite: cabecera, hero, tarjetas de habitación (mini y detalle) | WhatsApp | Beds24 («Solicitar reserva» / «Consultar disponibilidad»); aviso breve bajo el hero |
| Catálogo `/hospedajes`: tarjeta del Hotel Atheron Suite | WhatsApp | Beds24 |

**Se mantienen en WhatsApp (contacto humano), a propósito:** Casa Completa (ficha y detalle), todos los demás hospedajes (el motor `propid=359051` solo conoce los 5 apartamentos del Hotel Atheron Suite), cabecera y cierre del catálogo, botón flotante, cotización de grupos, «Escribir por WhatsApp» de la ficha.

**Decisión a revisar:** en el hero de la home quité el botón «Cotizar mi grupo»: duplicaba el enlace «¿Viajan 5 o más personas?», que va al mismo WhatsApp y sigue en su sitio. Restituirlo es trivial si dirección lo prefiere.

Lenguaje: «Consultar disponibilidad», «Solicitar reserva», nunca «pagar». Texto comercial añadido una vez en la home (cierre) y una vez en la ficha: «Consulta disponibilidad en tiempo real y solicita tu reserva. La solicitud queda sujeta a confirmación por Hoteles Atheron. Para confirmar reservas directas se requiere un anticipo del 50%.»

## 2. Analítica
Ya existe GA4 (en `main.js`, solo en el dominio de producción). Se añadió un único oyente que, **si `gtag` existe**, envía `booking_request_click` (origen, propiedad, página, `destination_host: beds24.com`). Sin dependencias nuevas, sin datos personales. Cada botón lleva `data-evento="booking_request_click"` y `data-evento-origen`.

## 3. Verificación

| Prueba | Resultado |
|---|---|
| `npm run build` | OK |
| `npm run prueba` (contenido y habitaciones) | 42/42 |
| Todas las URL a Beds24 del sitio construido | 42 enlaces, **todos** con `propid=359051&lang=es` (ninguno sin `lang`) |
| Casa Completa y demás hospedajes | siguen en `wa.me`; ninguna otra ficha contiene Beds24 |
| Móvil (captura 390 px, build local) | CTA principal grande y visible sin desplazarse, en home y en ficha |
| Prueba de noviembre en el motor real (10 nov 2026, 1 noche, 2 adultos; 80/160/160/350/140 mil; botón «Solicitar») | **NO EJECUTADA** (ver §4) |
| Prueba en `hotelesatheron.com` en vivo | **NO EJECUTABLE** (ver §4) |

Capturas: `AI/ATH-WEB-DIRECT-BOOKING-003_evidence/` (home y ficha, escritorio y móvil). Nota: la captura móvil se hizo con Chromium sin cabeza, que impone un ancho mínimo y recorta el borde derecho; la visibilidad del CTA es válida, la maquetación de texto no es una medición fiel de móvil real.

## 4. Lo que NO pude verificar y por qué
1. **El motor de Beds24 no es accesible desde esta sesión** (el proxy devuelve 403 para `beds24.com`), así que no pude abrir el motor, confirmar el idioma, hacer la búsqueda de noviembre, ver los precios ni el botón «Solicitar». No se envió ninguna solicitud.
2. **`hotelesatheron.com` sigue sirviendo el sitio antiguo** (rama `main`) hasta que Marlon ordene el merge; este cambio vive en la rama Astro. Probar la home real no es posible antes del merge. Recordatorio de `CLAUDE.md`: antes de ese merge, `public/admin/config.yml` línea 45 debe pasar de `branch: astro` a `branch: main`.
3. Los precios (201 = 80.000 … 302 = 140.000) son datos de Beds24: no se tocaron ni se verificaron.

## 5. Checklist para quien pruebe en vivo (2 minutos)
1. Abrir el sitio (vista previa de Vercel o dominio tras el merge) → pulsar «Consultar disponibilidad» → debe abrir Beds24 en una pestaña nueva, en español.
2. Buscar 10 nov 2026, 1 noche, 2 adultos → comprobar 201 = 80.000, 202 = 160.000, 203 = 160.000, 301 = 350.000, 302 = 140.000.
3. Confirmar que el botón final dice «Solicitar». **No enviar.**
4. Repetir en el celular. Comprobar que Casa Completa abre WhatsApp.
5. Con GA4 activo, en tiempo real debe aparecer `booking_request_click`.

## 6. Riesgos
- Nada impide que el visitante pida una fecha ya cubierta por otra vía mientras Beds24 no esté enlazado con Booking/Airbnb (ATH-BEDS24-GO-LIVE-QA-001: hoy 0 canales enlazados). La solicitud queda sujeta a confirmación, pero conviene enlazar canales antes de pagar publicidad.
- La meta-descripción de la ficha aún dice «Consulta disponibilidad por WhatsApp»: no se tocó (SEO); WhatsApp sigue existiendo como canal.
