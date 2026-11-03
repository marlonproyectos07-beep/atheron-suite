# ATH-WEB-META-019 — Paginas legales y pie con identificacion (BORRADOR)

Rama: `ath-web-meta-019/paginas-legales` (desde `main`). **No publicada, no fusionada.**

## Que hay
- `src/data/legal.ts` — fuente unica de datos legales y **interruptor `BORRADOR_LEGAL`** (hoy `true`).
- `src/pages/informacion-legal.astro`, `politica-de-privacidad.astro`, `terminos-y-condiciones.astro`.
- `src/components/PaginaLegal.astro`, `PieLegal.astro` (el pie se enlaza desde `Pie.astro`), `public/assets/css/legal.css`.
- `sitemap.xml.ts`: agrega las tres paginas solo cuando `BORRADOR_LEGAL = false`.

Con `BORRADOR_LEGAL = true` las paginas salen `noindex, nofollow` con banda de borrador, no se enlazan
y no estan en el sitemap. El pie visible no cambia. Unica diferencia en las paginas existentes: ~330 bytes de CSS
incrustado (`.pie-legal`) en `componentes.css`.

## Datos confirmados (RUT + Camara de Comercio de Bogota, expedida 10/10/2026)
ATHERON S.A.S. · NIT 901.881.946-1 · Carrera 9 N.º 10-32, Zipaquirá · WhatsApp +57 318 898 3167.

## RNT 235267
Titular **persona natural**, categoria **Casa Turistica**, vence 31/03/2027. Se presenta aparte, nunca como
registro de la sociedad, solo en paginas legales/pie (no en una ficha concreta: el certificado no nombra un
establecimiento). Nombre del titular autorizado para mostrar en la pagina legal (`mostrarNombreTitular: true`), sin activar la publicacion.

## Decisiones de gerencia — ATH-WEB-META-022 (incorporadas, aun sin publicar)
- Correo de contacto y privacidad: `comercialgsc001@gmail.com`.
- RNT 235267: mostrar nombre completo del titular persona natural solo en informacion legal, diferenciado de ATHERON S.A.S.
- Anticipo en reservas directas: 30 % a 50 % segun condiciones informadas en cada cotizacion o confirmacion.
- Cancelaciones y devoluciones: condiciones particulares comunicadas y aceptadas para la reserva; sin plazos o porcentajes generales no aprobados.
- Check-in habitual 15:00; check-out habitual 11:00, excepciones previa confirmacion.
- Reserva: solo confirmada tras validar disponibilidad y condiciones aplicables, incluido anticipo verificado cuando corresponda, y confirmacion expresa por escrito.

## Aun pendiente de direccion
1. Medios de pago aceptados, cambios de fecha, menores, mascotas y normas de convivencia.
2. A que hospedaje(s) corresponde el RNT 235267 y vinculo entre su titular y ATHERON S.A.S.
3. Fecha de entrada en vigencia de los textos (`VIGENCIA_LEGAL`, sigue null).
4. Codigo postal 250251 cargado en Meta: confirmar contra el RUT.
5. Revision juridica final antes de activar la publicacion.

## Requiere revision juridica
1. Contenido minimo de la politica (Ley 1581/2012, Decreto 1377/2013 compilado en Decreto 1074/2015) y plazos de
   consulta/reclamo citados (10 y 15 dias habiles).
2. Obligacion de inscribir bases de datos en el RNBD (segun tamaño de la empresa).
3. Mecanismo de autorizacion del titular al escribir por WhatsApp (aviso de privacidad / enlace en el primer mensaje).
4. Datos de menores (la politica solo dice que no se piden datos sensibles; falta decidir texto sobre menores).
5. Transmision/transferencia internacional (Meta, Google, Odoo, Smoobu): el texto los cita de forma generica
   (WhatsApp/Meta y Google Analytics); Odoo y Smoobu no se nombran.
6. Plazo de conservacion (el texto no fija numero: "el que exijan las normas").
7. Google Analytics 4 (G-KXXM0LJKK9) sin banner de consentimiento: evaluar.
8. Clausulas de ley aplicable/jurisdiccion y responsabilidad de los terminos.

## Para publicar (con orden expresa de Marlon)
1. Completar los datos del punto "aprobacion" y la revision juridica.
2. En `src/data/legal.ts`: `BORRADOR_LEGAL = false` y `VIGENCIA_LEGAL`.
3. `npm run build` + `npm run prueba` + revisar `/informacion-legal`, `/politica-de-privacidad`, `/terminos-y-condiciones`.
4. Vista previa en Vercel → revisar → merge a `main` (Vercel despliega).
5. Verificar en produccion y solo entonces verificar el dominio en Meta (TXT en Cloudflare).
