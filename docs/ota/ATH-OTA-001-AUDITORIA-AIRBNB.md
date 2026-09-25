# ATH-OTA-001 — Auditoría pública de Airbnb

> Auditoría **de solo lectura**, sobre información pública. No se inició
> sesión en ningún sitio, no se usaron credenciales, no se modificó ningún
> anuncio real. Fecha de consulta: 25/09/2026.

## Limitación metodológica (leer primero)

El proxy de red de este entorno **bloquea el acceso directo (WebFetch) a
airbnb.com** y a todos sus subdominios probados (`www.`, `es-l.`, etc.) con
`EGRESS_BLOCKED`. No es un muro de login: es un bloqueo de infraestructura
que impide abrir cualquier página de Airbnb, incluso pública. No se pudo
verificar directamente dirección exacta, fotos, amenidades completas, reglas
de la casa, check-in/out exactos, política de niños/mascotas, precios con
fecha exacta, reseñas detalladas ni el perfil del anfitrión de ningún
candidato. Todo lo que sigue viene de fragmentos indexados por buscadores
(WebSearch), parciales y a veces desactualizados. Se marca cada hallazgo con
su nivel de confianza. **La auditoría profunda de cada anuncio candidato
debe hacerse desde la cuenta real de Airbnb host de Marlon —
`PENDIENTE_AUDITORIA_AUTENTICADA`.**

## 1. Hotel Atheron Suite (Cra. 9 #10-32)

- **VERIFICADO (vía TripAdvisor/Booking, no vía Airbnb):** la dirección se
  anuncia públicamente como "Hospedaje La Magia de Zipaquirá"; en Booking el
  slug es literalmente `atheron-suite-301` — el nombre comercial interno de
  la Suite 301 ya es la marca pública de **todo** el hospedaje en al menos
  una OTA grande, no solo de esa habitación.
- **Airbnb:** no se localizó un anuncio con ese título exacto ni esa
  dirección confirmada. Candidatos **NO CONFIRMADOS**, solo por similitud
  temática/numérica:
  - "Room 202 Family 4 people shared bathroom" — `airbnb.com/rooms/1213146414477202934` (el número "202" coincide con la numeración interna de habitaciones, sin más confirmación)
  - "Apartment (6 people)" — `airbnb.com/rooms/1554549184471394340`
  - "A magical place within your reach" (boutique hotel, en inglés, $44/noche) — `airbnb.com/rooms/46676166` — coincidencia temática débil con "la magia", no concluyente
- **Riesgo de fotos IA (Suite 301):** PENDIENTE — no se pudo inspeccionar
  ningún candidato.
- **CASA COMPLETA (unidad Odoo):** no se localizó ningún anuncio de "casa
  completa" identificable para este hospedaje en Airbnb.

## 2. Hotel Colonial Confort

Candidato con mayor similitud nominal: "Casona Colonial - Hotel · Zipaquirá"
(también indexado como "Colonial-style house") —
`airbnb.com/rooms/25327465`, ~$49/noche, patio central, estilo colonial.
**NO CONFIRMADO** como el mismo negocio.

Riesgo de confusión adicional: existe un "Hotel Colonial" distinto en
directorio de negocios (Nexdu), en Cl 3 #6-57 — dirección diferente, podría
ser un tercer negocio no relacionado.

## 3. Hotel La Margarita (RNT interno 29756)

- **VERIFICADO:** el RNT 29756 coincide exactamente con el dato interno,
  confirmado de forma independiente en directorios (Páginas Amarillas,
  colombia.com) para "Hotel La Margarita" en Zipaquirá, con dominio propio
  `hotellamargarita.com`.
- **Airbnb:** no se encontró un anuncio confirmable. Candidatos no
  verificados: "Hotel Margarita real" (`airbnb.com/rooms/1211701461550804742`)
  y "Las Margaritas Cabin" (`airbnb.com/rooms/849461762906933007`, categoría
  Guesthouse — el formato cabaña no encaja con un hotel urbano, probablemente
  no relacionado).
- **Conclusión: NO LOCALIZADO** públicamente en Airbnb con confianza.

## 4. Casa Algarra (casa completa para grupos)

Dos candidatos plausibles por tamaño/estructura, **ninguno con "Algarra"
visible** en el fragmento ni dirección confirmada:

- "Vivienda · Zipaquirá · ★4,67 · 4 dormitorios · 14 camas · 2 baños" — `airbnb.es/rooms/1384156995792372484`
- "Hermosa casa vacacional!" — `airbnb.com.co/rooms/1151596660465354140` — hasta 8 huéspedes, 4 habitaciones cada una con baño privado, cuarto y baño de servicio, baño social

HIPÓTESIS, sin confirmar ubicación en el sector Algarra.

## 5. Casa Neusa (vereda Neusa, Cogua; RNT interno 235267)

**Candidato de alta confianza** (no verificado al 100%): "Casa de campo en
Neusa" — `airbnb.com/rooms/1391384242432444637`.

Datos del fragmento:
- Anfitrión llamado **"Marlon"** — coincide con el nombre del CEO. 2 años
  como anfitrión, 40 reseñas acumuladas entre sus propiedades, 4.48/5
  promedio, 93 % tasa de respuesta, responde en menos de 1 hora.
- Ubicación: Cogua, ~1 h de Bogotá, cerca de Plazuela Alta / Parque Río
  Neusa — coincide con "vereda Neusa, Cogua".
- Capacidad: 2 huéspedes, 2 habitaciones, 2 camas, 1 baño. Mascotas
  permitidas (con costo extra). Amenidades: cocina, wifi, zona de trabajo,
  parqueadero gratis, chimenea, zona de BBQ/fogata.
- RNT 235267 no confirmable en el propio anuncio (bloqueado).

**Posible inconsistencia a marcar:** si Casa Neusa internamente es una casa
más grande, una capacidad de solo 2 huéspedes/2 habitaciones en Airbnb
podría indicar que el anuncio cubre solo parte de la propiedad, o que la
capacidad está sub-declarada — a confirmar con Marlon.

El hecho de que el anfitrión "Marlon" tenga 40 reseñas repartidas en varias
propiedades sugiere que la misma cuenta podría tener otros anuncios de
Zipaquirá entre los candidatos listados arriba, pero no se pudo abrir el
perfil del anfitrión para confirmarlo (bloqueado).

## 6. Edificio Algarra / "Apartamentos en Algarra"

**NO LOCALIZADO.** Las búsquedas solo devuelven proyectos inmobiliarios de
venta no relacionados ("Algarras Living", "Edificio Palacio de Algarra",
desarrollos "Algarra III") — ruido, no alquiler vacacional.

## CASA COMPLETA vs. HABITACIONES

No se pudo verificar en ningún caso si existen pares de anuncios "casa
completa" + "habitación individual" para la misma propiedad física (misma
dirección/fotos), porque no se pudo abrir ninguna página de Airbnb para
comparar. **Este es precisamente el escenario de mayor riesgo de
overbooking que pide la Fase 6 de la tarea, y es el que menos se pudo
auditar por el bloqueo de red.**

Recomendación: auditar desde la cuenta host real de Airbnb (login de
Marlon), revisando:
1. si "Room 202" y anuncios similares numerados por habitación pertenecen a
   Atheron Suite;
2. si hay un anuncio de "casa completa" para la misma dirección;
3. si sus calendarios están vinculados (Airbnb permite enlazar el calendario
   del anuncio de casa completa con los de habitación para evitar
   overbooking) — si no lo están, una reserva de "casa completa" no bloquea
   automáticamente las habitaciones individuales y viceversa.

`PENDIENTE_AUDITORIA_AUTENTICADA`.

## Duplicados / ambigüedades

- "Colonial": conviven (a) Hotel Colonial Confort (interno), (b) un "Hotel
  Colonial" de directorio en otra dirección, y (c) "Casona Colonial" en
  Airbnb — podrían ser 1, 2 o 3 negocios distintos. Alto riesgo de confusión
  de marca: "colonial" es un adjetivo genérico muy usado en una ciudad
  colonial como Zipaquirá.
- "La Margarita": Hotel La Margarita (RNT verificado) vs. candidatos de
  Airbnb sin relación confirmada.
- "Algarra": el sector tiene múltiples desarrollos inmobiliarios de venta
  que contaminan cualquier búsqueda de Casa Algarra / Edificio Algarra en
  Airbnb.
- Ningún candidato de Airbnb pudo confirmarse como duplicado exacto de otro
  anuncio, por la imposibilidad de abrir páginas.

## Inconsistencias frente al sitio Atheron

- La marca pública dominante para la dirección Cra. 9 #10-32 es "Hospedaje
  La Magia de Zipaquirá" (slug de Booking `atheron-suite-301`), mientras la
  web propia usa "Hotel Atheron Suite" — inconsistencia de nomenclatura
  entre canales, coincidente con lo encontrado en la auditoría de Booking.
- Hotel La Margarita tiene presencia pública más madura (dominio propio,
  directorios, RNT verificable) que su propia ficha en `hotelesatheron.com`
  (todavía no publicada).
- No se pudo confirmar ni descartar riesgo de fotos IA en ningún anuncio de
  Airbnb (fotos bloqueadas).

## Propiedades no localizadas públicamente en Airbnb (tras búsqueda)

- Hotel La Margarita: no localizado con confianza.
- Edificio Algarra: no localizado en absoluto.
- Hotel Atheron Suite / CASA COMPLETA: no localizado un anuncio de "casa
  completa" claro.
- Los candidatos para Hotel Atheron Suite, Hotel Colonial Confort y Casa
  Algarra existen pero ninguno pasó de HIPÓTESIS a VERIFICADO.
- Casa Neusa es el único caso con indicios fuertes (nombre del anfitrión +
  ubicación), tampoco 100 % verificado.
