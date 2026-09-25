# ATH-OTA-001 — Matriz maestra OTA ↔ Odoo ↔ Web

> Construida a partir de (a) el contenido real en `src/content/hospedajes/`
> (rama `feature/ath-ota-001-audit`), (b) `AI/ODOO_HOTEL_STATE.md` (rama
> `chore/ai-orchestration-foundation`) y (c) las auditorías públicas de
> `ATH-OTA-001-AUDITORIA-BOOKING.md` y `ATH-OTA-001-AUDITORIA-AIRBNB.md`.
> Ningún dato de esta matriz fue inventado: donde no hay evidencia pública o
> interna, la celda dice `PENDIENTE_VALIDACION` o `NO LOCALIZADO`, nunca un
> valor supuesto.

## Hallazgo estructural previo a la matriz

**Solo Hotel Atheron Suite tiene inventario piloto en Odoo hoy.**
`AI/ODOO_HOTEL_STATE.md` (ATH-ODOO-HOTEL-002, aprobado en staging) declara
exactamente 6 unidades piloto: `201, 202, 203, 301, 302 y CASA COMPLETA`,
todas de Hotel Atheron Suite. **Ninguna otra propiedad** (Hotel Colonial
Confort, Hotel La Margarita, Casa Algarra, Casa Neusa, Edificio Algarra)
tiene `resource.resource` ni calendario en el entorno Odoo Hotel
(`atheron1-hotel-staging-20260923`) según ese mismo documento. Esto es un
prerrequisito de arquitectura, no un detalle menor: antes de conectar
cualquier iCal real de esas 5 propiedades a Odoo, primero tienen que existir
ahí como unidades — ver `ATH-OTA-001-PENDIENTES-HUMANOS.md`.

Por eso, en la columna **UNIT ODOO** de las propiedades sin piloto se anota
`NO EXISTE EN ODOO (fuera del piloto HOTEL-002)` en vez de inventar un
identificador.

## Leyenda de estado

- **CONFIRMADO** — coincide un identificador técnico inequívoco (slug de
  URL, RNT, o ambos) entre la fuente interna y la ficha pública.
- **PROBABLE** — coincidencia fuerte de nombre/dirección/tamaño, sin
  identificador técnico que lo confirme al 100 %.
- **HIPÓTESIS** — similitud débil, mencionada solo para no perderla de
  vista; no debe tratarse como dato operativo.
- **PENDIENTE_VALIDACION** — no hay evidencia suficiente para clasificar.
- **NO LOCALIZADO** — se buscó activamente y no apareció nada plausible.
- **PENDIENTE_AUDITORIA_AUTENTICADA** — requiere login real (extranet
  Booking, panel de host Airbnb); fuera de alcance de esta auditoría.

---

## 1. Hotel Atheron Suite

Web: `hotelesatheron.com/hospedajes/hotel-atheron-suite` · `direccionPublica: true` · Cra. 9 #10-32, Zipaquirá.

| UNIT ODOO | WEB URL | BOOKING LISTING | AIRBNB LISTING | CAPACIDAD | TIPO | ESTADO | RIESGO | CALENDARIO |
|---|---|---|---|---|---|---|---|---|
| `201` | `/hospedajes/hotel-atheron-suite#201` | Probablemente incluida en "Hospedaje La Magia de Zipaquira" (`apto-turistico-zipaquira-para-6-personas.es.html`, declara "5 habitaciones y 2 apartamentos") | No localizado con confianza | Hasta 2, 1 cama doble, baño compartido con 202 | HABITACION | PENDIENTE_VALIDACION | ALTO — ficha Booking fragmentada, sin vínculo de calendario confirmado | Sin conectar |
| `202` | `/hospedajes/hotel-atheron-suite#202` | Misma ficha fragmentada que 201 (sin desglose por habitación visible) | Candidato NO CONFIRMADO: "Room 202 Family 4 people shared bathroom" (`rooms/1213146414477202934`) — el número coincide, no la evidencia | Hasta 4, 1 doble + 1 camarote, baño compartido con 201 | HABITACION | PENDIENTE_VALIDACION | ALTO | Sin conectar |
| `203` | `/hospedajes/hotel-atheron-suite#203` | Misma ficha fragmentada | No localizado con confianza | Hasta 4, doble + nido extraíble, baño privado | HABITACION | PENDIENTE_VALIDACION | ALTO | Sin conectar |
| `301` ("Suite 301" / marca pública **"La Magia de Zipaquirá"**) | `/hospedajes/hotel-atheron-suite#301` | **CONFIRMADO por slug**: `booking.com/hotel/co/atheron-suite-301.es.html`. También en TripAdvisor como "HOSPEDAJE LA MAGIA DE ZIPAQUIRA" | No localizado con confianza | Hasta 7 (ideal 4–6), doble + camarote + sofá cama, baño privado | HABITACION | **CONFIRMADO (Booking)** | **ALTO — fotos regeneradas por IA con sello C2PA (excepción §23.1 CLAUDE.md); riesgo de que Booking/Airbnb las marquen como generadas por IA, sin verificar visualmente por bloqueo de red** | Sin conectar |
| `302` | `/hospedajes/hotel-atheron-suite#302` | Posiblemente incluida en la ficha fragmentada de 5 habitaciones | No localizado con confianza | Hasta 4 (ideal hasta 3), doble + sofá cama, baño privado | HABITACION | PENDIENTE_VALIDACION | ALTO | Sin conectar |
| `CASA COMPLETA` | Sin página propia en el sitio (el hotel se vende por habitación) | PROBABLE: "Atheron Grand House Zipaquirá de 10 a 20 personas" (URL exacta no localizada). Posible duplicado: "Casa Suite Zipaquira" (espejo vacationcottage.com, BC-13931895, misma dirección, 5 habitaciones) | No localizado | Suma de las 5 habitaciones (sin cifra interna combinada publicada) | CASA_COMPLETA | PROBABLE, con **riesgo de duplicado** | **CRÍTICO — si "Atheron Grand House" y "Casa Suite Zipaquira" son el mismo inventario anunciado dos veces, y ninguno está vinculado a las habitaciones sueltas, el riesgo de overbooking es máximo** | Sin conectar |

Nombre comercial: la marca dominante en OTA para esta dirección es **"La
Magia de Zipaquirá"**, no "Hotel Atheron Suite" — ver inconsistencia en
ambas auditorías.

## 2. Hotel Colonial Confort

Web: `/hospedajes/hotel-colonial-confort` · `direccionPublica: false` · Centro de Zipaquirá.

| UNIT ODOO | WEB URL | BOOKING LISTING | AIRBNB LISTING | CAPACIDAD | TIPO | ESTADO | RIESGO | CALENDARIO |
|---|---|---|---|---|---|---|---|---|
| NO EXISTE EN ODOO | `/hospedajes/hotel-colonial-confort` | NO LOCALIZADO | Candidato débil NO CONFIRMADO: "Casona Colonial - Hotel" (`rooms/25327465`) | 2 habitaciones internas: doble (hasta 2) y familiar (hasta 4) | HOTEL (multi-habitación) | PENDIENTE_VALIDACION | MEDIO — sin presencia OTA confirmada; riesgo de confusión con otro "Hotel Colonial" de dirección distinta y con "Casona Colonial" | Sin conectar |

## 3. Hotel La Margarita

Web: `/hospedajes/hotel-la-margarita` · `publicado: false` (aún no vive en el sitio propio) · Barrio La Esmeralda · **RNT interno 29756**.

| UNIT ODOO | WEB URL | BOOKING LISTING | AIRBNB LISTING | CAPACIDAD | TIPO | ESTADO | RIESGO | CALENDARIO |
|---|---|---|---|---|---|---|---|---|
| NO EXISTE EN ODOO | `/hospedajes/hotel-la-margarita` (borrador) | NO LOCALIZADO en Booking | NO LOCALIZADO con confianza en Airbnb | Por confirmar en la ficha interna (varias habitaciones "por confirmar") | HOTEL (18 habitaciones según fuente externa) | **RNT CONFIRMADO** (29756, coincide con directorios externos) pero **listing OTA no localizado** | MEDIO-ALTO — presencia pública fuerte por fuera de Atheron (dominio propio `hotellamargarita.com`, tel. 8524934, dirección Cl 12 #9-31) mientras la web propia sigue en borrador; aclarar relación comercial | Sin conectar |

## 4. Casa Algarra

Web: `/hospedajes/casa-algarra` · `direccionPublica: false` · casa completa para grupos, sector Algarra.

| UNIT ODOO | WEB URL | BOOKING LISTING | AIRBNB LISTING | CAPACIDAD | TIPO | ESTADO | RIESGO | CALENDARIO |
|---|---|---|---|---|---|---|---|---|
| NO EXISTE EN ODOO | `/hospedajes/casa-algarra` | **PROBABLE por slug**: "Casa turística elegante" (`casa-algarra-3.es.html`) | Dos candidatos débiles NO CONFIRMADOS (`airbnb.es/rooms/1384156995792372484`, `airbnb.com.co/rooms/1151596660465354140`) | 5 habitaciones internas (201, 202, 203 Principal, 204, 205) | CASA_COMPLETA con habitaciones internas (201/202 comparten baño social) | PROBABLE | ALTO — posibles sub-fichas "Habitación Elegante"/"Habitaciones Deluxe"/"Casa Elegante Familiar hasta 20 personas" con datos de distancia inconsistentes entre sí; podrían pertenecer a Edificio Algarra en vez de a esta propiedad | Sin conectar |

## 5. Casa Neusa

Web: `/hospedajes/casa-neusa` · `direccionPublica: false` · vereda Neusa, Cogua (Cundinamarca, **no** Zipaquirá) · **RNT interno 235267**.

| UNIT ODOO | WEB URL | BOOKING LISTING | AIRBNB LISTING | CAPACIDAD | TIPO | ESTADO | RIESGO | CALENDARIO |
|---|---|---|---|---|---|---|---|---|
| NO EXISTE EN ODOO | `/hospedajes/casa-neusa` | NO LOCALIZADA bajo ese nombre ni RNT | **PROBABLE, alta confianza**: "Casa de campo en Neusa" (`rooms/1391384242432444637`), anfitrión "Marlon", ubicación Cogua | Interno: hasta 8–10 huéspedes (bajo consulta). **Airbnb declara solo 2 huéspedes/2 habitaciones/1 baño** | CASA_COMPLETA | PROBABLE (Airbnb) / NO LOCALIZADA (Booking) | MEDIO — **discrepancia de capacidad entre el dato interno (hasta 8–10) y el anuncio candidato de Airbnb (2 huéspedes)**; a confirmar con Marlon si es la misma unidad, una versión antigua del anuncio, o un listing distinto | Sin conectar |

## 6. Edificio Algarra ("Apartamentos en Algarra")

Web: `/hospedajes/edificio-algarra` (página del edificio publicada; las fichas individuales de cada apartamento están `publicado: false`) · Algarra, Zipaquirá. **Propiedad distinta de Casa Algarra**, mismo sector.

| UNIT ODOO | WEB URL | BOOKING LISTING | AIRBNB LISTING | CAPACIDAD | TIPO | ESTADO | RIESGO | CALENDARIO |
|---|---|---|---|---|---|---|---|---|
| NO EXISTE EN ODOO | `/hospedajes/edificio-algarra` | NO LOCALIZADO (solo portales inmobiliarios de venta, no turísticos) | NO LOCALIZADO (mismo ruido inmobiliario: "Algarras Living", "Algarra III", etc.) | Apartamentos 201, 301, 302, 401, 402 y dúplex — fichas individuales aún no publicadas en el sitio propio | APARTAMENTOS independientes | NO LOCALIZADO | ALTO — máxima ambigüedad de nombre frente a Casa Algarra; una sub-ficha de Booking podría pertenecer a cualquiera de las dos | Sin conectar |

---

## Resumen ejecutivo de la matriz

| Propiedad | En Odoo | Booking | Airbnb | Riesgo dominante |
|---|---|---|---|---|
| Hotel Atheron Suite | SÍ (piloto HOTEL-002) | CONFIRMADO (Suite 301) + fragmentado | No localizado | Fragmentación + posible duplicado CASA COMPLETA |
| Hotel Colonial Confort | NO | No localizado | Candidato débil | Confusión de marca ("colonial" genérico) |
| Hotel La Margarita | NO | No localizado | No localizado | Presencia pública fuera de Atheron (RNT confirmado, sitio propio ajeno) |
| Casa Algarra | NO | PROBABLE | Candidatos débiles | Ambigüedad con Edificio Algarra |
| Casa Neusa | NO | No localizada | PROBABLE (alta confianza) | Discrepancia de capacidad |
| Edificio Algarra | NO | No localizado | No localizado | Sin presencia OTA detectada; máxima ambigüedad de nombre |

**Ninguna unidad de esta matriz tiene hoy un vínculo de calendario real entre
Odoo, Booking y Airbnb.** Toda la columna CALENDARIO dice "Sin conectar" a
propósito: conectar cualquiera de estos feeds reales queda fuera de alcance
de ATH-OTA-001 (Fase 7: "NO conectar feeds reales todavía") y requiere que
las filas correspondientes pasen primero de PROBABLE/PENDIENTE_VALIDACION a
CONFIRMADO mediante auditoría autenticada.
