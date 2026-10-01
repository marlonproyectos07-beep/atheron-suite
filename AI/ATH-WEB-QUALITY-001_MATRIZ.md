# ATH-WEB-QUALITY-001 — Matriz por propiedad y pendientes

Fecha: 2026-10-01 · Rama: `audit/ath-web-quality-001` · Sin cambios en Production, sin merge a `main`.

Leyenda: **COMPLETO** · **INCOMPLETO** · **FALTA DATO** · **FALTA FOTO** · **FALTA VALIDACIÓN**

## 1. Matriz por propiedad

| Propiedad | Estado ficha | Capacidad | Habitaciones / camas / baños | Tarifa | Grupos | Mascotas | Parqueadero | Check-in / out | Fotos | SEO | Veredicto |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Hotel Atheron Suite | Publicada | 22 (maestra, ver §4) | 5 unidades, camas y baño: COMPLETO | por habitación: COMPLETO | COMPLETO | bajo consulta | COMPLETO | 15:00 / 11:00 | 5 hab. con foto | COMPLETO | **COMPLETA**, con FALTA VALIDACIÓN de capacidad vs Odoo/Booking |
| Casa Algarra | Publicada | 22 | 5 hab., 3 baños: COMPLETO | desde 8 personas (COMPLETO) | COMPLETO | **FALTA DATO** | COMPLETO | **FALTA DATO** | 5 hab. + galería 13 | COMPLETO | **INCOMPLETA** (mascotas, check-in/out, FAQ) |
| Casa Neusa (Cogua) | Publicada | 8 cómodos, 9–10 bajo consulta | casa entera, 1 baño: COMPLETO | COMPLETO | n/a | bajo consulta | **FALTA DATO** | 15:00 / 11:00 | galería 11 | COMPLETO | **INCOMPLETA** (parqueadero) |
| Apartamentos en Algarra (edificio) | Publicada | 43 | 6 apartamentos: COMPLETO | por unidad | COMPLETO | bienvenidas | COMPLETO | 15:00 / 11:00 | 6 hab. + galería 10 | meta description larga (181) | **COMPLETA** |
| Hotel Colonial Confort | Publicada | 28 (30 con colchoneta) | 13 hab. (12 dobles + 1 de 2 camas): COMPLETO | COMPLETO | COMPLETO | no se admiten | COMPLETO (aliado externo) | 18:00 / 10:00 | galería 2; **FALTA FOTO** de las 2 tipologías de habitación | COMPLETO | **INCOMPLETA** (FALTA FOTO) |
| Hotel La Margarita | Borrador (`publicado: false`) | 52 reportada | 18 comerciales (8 familiares + 10 dobles), baño privado: COMPLETO | desde $ 65.000 p/p | cotización especial | bajo consulta | COMPLETO | 14:00 / 11:00 | 6 en galería; **FALTA FOTO** fachada y doble | COMPLETO | **INCOMPLETA** (FALTA FOTO + FALTA VALIDACIÓN, §2) |
| Apartamentos 201, 301, 302, 401, 402, dúplex | Borrador (`noindex`) | **FALTA DATO** (sin capacidad en ficha) | sin habitaciones cargadas | pendiente | — | declarado | **FALTA DATO** | 15:00 / 11:00 | 201: 0 fotos (FALTA FOTO); resto galería 8 | noindex (correcto) | **INCOMPLETAS** (siguen como borrador) |
| Hospedaje 02 a 07 | Borrador de relleno (`noindex`, no enlazadas) | "N" | "N" | "$ ---" | — | — | — | — | sin fotos | noindex | **INCOMPLETAS / placeholders**: no se publican; sin decisión pendiente salvo retirarlas |
| Casa Colonial Centro | Proyecto (`noindex, nofollow`) | n/a | unidad piloto 208 (12 camas) es propuesta | n/a | n/a | n/a | n/a | n/a | estado actual + representaciones etiquetadas | noindex (correcto) | **PROYECTO / OPORTUNIDAD**: separada del inventario reservable |

## 2. Hotel La Margarita

**Implementado** (`src/content/hospedajes/hotel-la-margarita.md`): nombre, dirección (Calle 12 #9-31), RNT 29756, 18 habitaciones comerciales (8 familiares con cama doble + camarote; 10 dobles con cama doble), baño privado y wifi en todas, capacidad total reportada 52, tarifa desde $ 65.000 por persona por noche, niños 5–13 años 50 % y desde 14 tarifa adulto, grupos por cotización especial (sin tarifa), mascotas bajo consulta (sin recargo), check-in 2:00 p. m., check-out 11:00 a. m., atención 6:00 a. m.–11:00 p. m., parqueadero (motos gratis en el hotel; carros en aliado cercano a $ 18.000/noche), referencias (terminal y plaza de mercado a ~1 cuadra, restaurante 24 h al frente), FAQ, condiciones, CTA WhatsApp (consulta y cotización), JSON-LD con `streetAddress`, check-in/out y `priceRange` al publicarse.

**Retirado por no estar confirmado**: «Barrio La Esmeralda», «grupos de hasta 40», «televisión por cable», «cerca de la Catedral de Sal», «registro vigente», cuenta de 40 personas.

**Dato interno (NO publicado en el sitio)**: contacto operativo del aliado, Omar Valbuena, +57 301 393 2412. Las 2 habitaciones arrendadas de forma fija no se cuentan: el sitio habla de 18, no de 20.

**Fotos usadas** (reales, ya en el repo): habitación familiar, recepción, zona común, escaleras, pasillo superior, pasillo de habitaciones. **Retiradas de la galería por duplicada**: `…-04-acceso-interior.webp` y `…-08-acceso-recepcion.webp` (mismo pasillo/puerta; los archivos se conservan).

**Fotos que faltan** y dónde van:
1. Fachada → `fotoPrincipal`/`fotoTarjeta` y `heroFoto: true` (hoy `heroFoto: false` porque no hay fachada; las fotos disponibles son verticales de baja calidad y recortarlas en la franja del hero no luce).
2. Habitación doble → campo `foto` de «Habitación doble» (hoy la tarjeta va sin foto, sin hueco).
3. Zonas comunes de mejor calidad / más recepción si existen en Drive (no hay acceso a Drive desde esta sesión).
Cada foto debe pasar por `npm run foto` (CLAUDE.md) antes de entrar.

**FALTA VALIDACIÓN**: (a) personas por habitación (el 52 cuadra con 8×4 + 10×2, pero es una inferencia: no se publicó); (b) niños menores de 5 años; (c) recargo o condiciones de mascotas; (d) distancia real a la Catedral de Sal y al centro histórico; (e) coordenadas para el mapa; (f) la dirección se publica por instrucción (en los demás aliados se entrega al confirmar): decidir; (g) la foto de recepción muestra un cartel de tarifas de 2023 (ilegible); (h) servicios (TV, agua caliente, desayuno): no confirmados, no publicados.

**Estado de publicación**: `publicado: false` (noindex, fuera del sitemap) a la espera de las fotos y de las validaciones. Para publicarlo: `publicado: true`, quitar `avisoBorrador` y confirmar con Marlon.

## 3. Contradicciones y hallazgos para decisión del CEO

| Prioridad | Hallazgo |
|---|---|
| Alto | La portada dice «7 Hospedajes» y la landing de hospedaje «Siete hospedajes… 7 opciones… Ver los 7 hospedajes», pero hay 5 publicados + 1 borrador visible en `/hospedajes`. La landing de grupos tenía «4» escrito a mano (ahora se calcula). **No se cambió el copy de 7 sin autorización.** |
| Alto | Hotel Atheron Suite: «Hasta 22 huéspedes» (casa completa) vs. «ideal para cuatro a seis» / tarifa hasta 7 en Suite 301 (auditoría inicial). Alinear con Odoo/Booking antes de campañas. |
| Alto | Landing de hospedaje afirma «24 h tiempo de respuesta objetivo» y «0 costos ocultos», sin respaldo documentado. |
| Medio | Casa Algarra sin mascotas ni check-in/out. Casa Neusa sin parqueadero. Colonial Confort sin fotos de habitación. |
| Medio | Hospedajes 02–07 son páginas de relleno accesibles por URL (noindex). |
| Medio | Sin imagen Open Graph en landings, blog, guía y eventos. |
| Mejora | 3 meta descriptions aún por encima de 160 (edificio 181, Casa Neusa 176, Casa Algarra 169). |
| Mejora | Casa Colonial: el interruptor `BORRADOR` y el flujo de aprobación siguen como estaban; no se tocaron cifras. |

## 4. Medición (GA4 ya instalado, `G-KXXM0LJKK9`, solo en hotelesatheron.com)

Capa semántica en `public/assets/js/main.js`, controlada por `data-evento-intencion` (`src/data/whatsapp.ts`). Sin datos personales.

| Evento | Cuándo |
|---|---|
| `view_property` | carga de una ficha (`<main data-vista>`) |
| `view_room` | una habitación entra en pantalla (60 %) o se abre «Ver fotos y detalles» |
| `click_whatsapp_property` | clic en WhatsApp con intención `propiedad` |
| `booking_intent` | lo anterior, solo desde fichas (`ficha_*`) |
| `start_quote` | cotización de grupo o CTA de tarifas / casa completa |
| `click_whatsapp_group` | clic en WhatsApp con intención `grupo` |
| `lead_group` | envío del formulario de grupos |
| `lead_individual` | envío del formulario de contacto (hoy inactivo: `formularioContactoActivo`) |
| `investment_interest` | **todo** clic de Casa Colonial; nunca emite `booking_intent` ni `click_whatsapp_property` |

El evento histórico `whatsapp_click` se conserva. Verificado con `gtag` simulado en Chromium (hero, tarifas, cabecera, scroll de habitaciones, Casa Colonial, grupos).

## 5. Correcciones transversales

- Tildes/eñes en todo el copy visible (≈1.000 reemplazos, solo texto: sin tocar claves, ids, clases ni rutas) y en `main.js`.
- Interrogativas sin tilde y sin «¿» en las landings.
- «banos» visible junto a «Baño privado» en todas las fichas (`dato(h.banos,'bano','banos')`).
- `dato(h.huéspedes…)` apuntaba a una propiedad inexistente: las tarjetas de habitación nunca mostraban el número de huéspedes; ahora sí.
- Casa Colonial: CTAs «Solicitar información» (no «Reservar»).

## 6. Lighthouse (móvil, build local servido con gzip, 2026-10-01)

Orden: Rendimiento / Accesibilidad / Buenas prácticas / SEO.

| Página | Puntajes | LCP | CLS |
|---|---|---|---|
| Portada | 99/96/96/100 | 2,1 s | 0 |
| /hospedajes | 99/100/96/100 | 2,1 s | 0 |
| Hotel Atheron Suite | 99/100/96/100 | 2,0 s | 0 |
| Casa Algarra | 99/100/96/100 | 2,0 s | 0 |
| Casa Neusa | 98/100/96/100 | 2,3 s | 0 |
| Apartamentos en Algarra | 97/100/96/100 | 2,6 s | 0 |
| Hotel Colonial Confort | 99/100/96/100 | 1,9 s | 0,028 |
| Hotel La Margarita | 100/100/96/69 | 1,7 s | 0,001 |
| Landing grupos | 100/100/96/100 | 1,4 s | 0,003 |
| Landing hospedaje | 100/100/96/100 | 1,3 s | 0,002 |
| /grupos | 99/100/96/100 | 1,8 s | 0,001 |
| Casa Colonial Centro | 99/100/96/69 | 2,1 s | 0,003 |

SEO 69 en La Margarita y Casa Colonial es esperado: son borradores con `noindex`. Todo ≥ 95 salvo ese caso. Buenas prácticas en 96 (no investigado el 4 % restante). No se midieron blog, guía ni eventos.
