# ATH-OTA-001 — Auditoría pública de Booking.com

> Auditoría **de solo lectura**, sobre información pública. No se inició
> sesión en ningún sitio, no se usaron credenciales, no se modificó ningún
> anuncio real. Fecha de consulta: 25/09/2026.

## Limitación metodológica (leer primero)

El proxy de red de este entorno **bloquea el acceso directo (WebFetch) a
booking.com** y a varios agregadores (tripadvisor.com, genesishotel.co,
sun-ski.com, wikipedia.org) con `EGRESS_BLOCKED`. No fue posible abrir
directamente ninguna ficha de Booking ni sus fotos. Todo lo que sigue viene
de resultados de búsqueda (WebSearch) — resúmenes y caché de terceros, a
veces contradictorios entre sí (p. ej. la política de mascotas de la Suite
301). Se marca cada hallazgo con su nivel de confianza. **Recomendación
operativa: verificación manual desde navegador o desde la extranet de
Booking antes de tomar cualquier decisión comercial.**

## 1. Hotel Atheron Suite (Cra. 9 #10-32, Zipaquirá)

**PROBABLE, fragmentado en 3–5 fichas distintas para la misma dirección.**

| Ficha Booking | URL | Datos visibles | Confianza |
|---|---|---|---|
| "Hotel Atheron suite La Magia de Zipaquirá" (alias interno "ApartaHotel 90 Grados" — el slug conserva el nombre antiguo) | `booking.com/hotel/co/apartahotel-90-grados.html` | Check-in 15:00 / check-out 11:00. Wifi, cocina, lavadora, parqueadero privado de pago | PROBABLE |
| "Hospedaje La Magia de Zipaquira" | `booking.com/hotel/co/apto-turistico-zipaquira-para-6-personas.es.html` | "5 habitaciones y 2 apartamentos", control de acceso con reconocimiento facial. Puntuación citada 8.1–8.4 (cifras inconsistentes entre fuentes) | PROBABLE |
| "Hospedaje la Magia de Zipaquirá" = **Suite 301** | `booking.com/hotel/co/atheron-suite-301.es.html` | El slug `atheron-suite-301` coincide con la unidad interna Suite 301. También indexada en TripAdvisor como "HOSPEDAJE LA MAGIA DE ZIPAQUIRA" (categoría hostal) | **CONFIRMADO por slug** |
| "Atheron Grand House Zipaquirá de 10 a 20 personas" | no localizada URL exacta | Probable equivalente a la unidad interna CASA COMPLETA | HIPÓTESIS |
| "Casa Suite Zipaquira" (espejo en vacationcottage.com, código BC-13931895) | — | Misma dirección exacta, 5 habitaciones, sin mascotas. Posible duplicado de "Atheron Grand House" bajo otro nombre | HIPÓTESIS |

- **RNT visible en Booking:** no visible en ningún fragmento consultado.
- **Genius:** no confirmado visualmente (requiere abrir la ficha).
- **Riesgo de fotos IA (Suite 301, excepción §23.1 de CLAUDE.md):** NO
  verificado — no se pudo inspeccionar el contenido de las fotos por el
  bloqueo de red. Pendiente de revisión visual manual.
- **Política de mascotas:** fuentes contradictorias — una dice "no se
  permiten", otra "sí, mediante solicitud especial". Sin resolver.

## 2. Hotel Colonial Confort (Centro de Zipaquirá)

**NO LOCALIZADO públicamente en Booking.com.** Existen anuncios de terceros
de "zona colonial" en Zipaquirá sin evidencia de vínculo con Atheron — riesgo
de confusión de nombre, no de identidad confirmada.

## 3. Hotel La Margarita (Barrio La Esmeralda; RNT interno 29756)

**NO LOCALIZADO en Booking.com.** Sí existe un sitio web independiente
`hotellamargarita.com`, con **RNT 29756 — coincide exactamente con el dato
interno**. Datos públicos adicionales: dirección Cl 12 #9-31, Zipaquirá;
teléfono 8524934; 18 habitaciones declaradas.

**Nota para Marlon:** hay que aclarar la relación entre ese sitio web
independiente y la ficha "publicado: false" de `hotelesatheron.com` — no se
puede asumir cuál es la fuente comercial activa sin confirmación.

## 4. Casa Algarra (casa completa para grupos)

**PROBABLE.** Ficha localizada: "Casa turística elegante" —
`booking.com/hotel/co/casa-algarra-3.es.html` (el slug coincide con el
nombre interno). 5 dormitorios, 2 baños, cocina equipada.

Posibles sub-fichas relacionadas, **sin confirmar si son habitaciones del
mismo anuncio o anuncios separados**: "Habitación Elegante", "Habitaciones
Deluxe", "Casa Elegante Familiar hasta 20 personas". Los datos de distancia
citados por distintas fuentes son inconsistentes entre sí (39 km vs 45 km a
Unicentro), lo que sugiere que podrían corresponder a fichas distintas mal
agrupadas por el buscador.

## 5. Casa Neusa (vereda Neusa, Cogua; RNT interno 235267)

**NO LOCALIZADA** bajo ese nombre ni con el RNT 235267 en Booking.com.
Existen resultados de "Neusa" de terceros sin relación demostrada.

**Hallazgo a verificar:** Trivago ubica "Hotel Atheron suite La Magia de
Zipaquirá" en **Cogua** en vez de Zipaquirá — posible error de
geocodificación del agregador. No se confirmó si ese mismo error se replica
directamente en Booking.com.

## 6. Edificio Algarra / "Apartamentos en Algarra"

**NO LOCALIZADO** en Booking.com. Solo aparecen portales inmobiliarios de
compraventa/arriendo de largo plazo (no turísticos), que no son OTA. No se
puede descartar que alguna de las sub-fichas "elegante" del punto 4
corresponda en realidad a este edificio en vez de a Casa Algarra: ambos
están en el mismo sector y el nombre no alcanza para distinguirlos desde
fuera.

## Duplicados / ambigüedades

- Hotel Atheron Suite aparece fragmentado en **3 a 5 fichas con nombres
  distintos** para la misma dirección física — máximo riesgo de
  overbooking si no hay vínculo de calendarios entre ellas.
- Ambigüedad Casa Algarra vs. sub-fichas "elegante" vs. Edificio Algarra:
  mismo sector, nombres no distintivos.
- Nombres coincidentes con terceros no relacionados: "Hotel Colonial" (otro
  negocio, otra dirección), variantes de "Neusa" y "La Margarita" en otros
  contextos/países.

## Inconsistencias frente al sitio Atheron

- El nombre comercial dominante en Booking.com para Hotel Atheron Suite es
  **"La Magia de Zipaquirá"** (y el slug técnico `atheron-suite-301`), no
  "Hotel Atheron Suite"/"Atheron Suite" como en la web propia. Un huésped
  que busque "Atheron" en Booking probablemente no reconozca el anuncio.
- Posible error de ciudad (Cogua vs. Zipaquirá) en al menos un agregador.
- El RNT de Hotel La Margarita coincide y tiene presencia pública madura
  (dominio propio) por fuera de `hotelesatheron.com`, donde la ficha todavía
  no está publicada.

## Pendientes de auditoría autenticada

`PENDIENTE_AUDITORIA_AUTENTICADA` — requieren extranet de Booking o
navegación manual autenticada: tarifas negociadas, mensajería, fotos reales
de cada ficha (en particular el riesgo IA de Suite 301), confirmación de
Genius, RNT visible en cada ficha, y si las fichas fragmentadas del punto 1
comparten o no un mismo panel de administración.
