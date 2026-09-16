# Google Business Profile — paquete de aplicación (Hoteles Atheron)

Fuente de verdad: `src/content/hospedajes/hotel-atheron-suite.md`,
`src/data/whatsapp.ts`, `src/pages/hospedajes/[slug].astro`.
Preparado el 16/09/2026. **Nada de aquí está inventado**: cada línea sale del
contenido publicado del sitio. Lo no verificable se marca NO DECLARAR.

## 0. Consistencia NAP — VERIFICADO

| Campo | GBP (según brief) | Sitio | Estado |
|---|---|---|---|
| Nombre | Hoteles Atheron | Hotel Atheron Suite (ficha de hospedaje) | Coherente, no tocar |
| Dirección | Cra. 9 #10-32, Zipaquirá, Cundinamarca | `Cra. 9 #10-32, Zipaquirá` | Coincide |
| Teléfono | 318 8983167 | `+57 318 898 3167` | Coincide |
| Web | /hospedajes/hotel-atheron-suite | Existe y publica | Coincide |
| Coordenadas | — | 5.027763, -74.000194 | Referencia para el pin |

## 1. Descripción (pegar tal cual, 690 caracteres)

Hoteles Atheron ofrece alojamiento en Zipaquirá, Cundinamarca, en la Carrera 9
#10-32, a 1,4 km de la Catedral de Sal: unos 16 minutos caminando. Contamos con
cinco unidades entre habitaciones y suite, para parejas, familias y grupos, con
Wi-Fi, Netflix, agua caliente y cocina compartida con estufa. Tres de las cinco
unidades disponen de baño privado, y la Suite 301 cuenta con automatización
mediante Alexa y acceso con código. También ofrecemos alojamiento para grupos de
hasta 22 huéspedes reservando las cinco habitaciones. Check-in desde las 15:00 y
check-out hasta las 11:00.

> Mejora sobre la base del brief: se añaden distancia a la Catedral de Sal,
> Netflix, agua caliente y el dato exacto de baños privados (203, 301, 302),
> todos verificados en la web. Sin keyword stuffing: "Zipaquirá" aparece una vez.

## 2. Check-in / check-out — VERIFICADO
- Check-in: 15:00
- Check-out: 11:00

## 3. Horarios generales
El hospedaje opera por reserva y coordinación por WhatsApp; **no hay recepción
24 h verificada**. Opción segura: declarar "Abierto 24 horas" NO; declarar la
franja de atención real la debe confirmar Marlon antes de guardar.
→ CAMPO QUE REQUIERE DECISIÓN HUMANA.

## 4. Amenities a MARCAR (solo verificados)
- Wi-Fi / Internet — sí (gratis, toda la propiedad)
- Cocina compartida — sí, únicamente en el atributo hotelero de cocina
  compartida/común. No marcar "cocina en la habitación" como general: la
  minicocina es exclusiva de la Suite 301 y no tiene estufa.
- Televisión / streaming — sí (TV pantalla plana + Netflix)
- Agua caliente — sí
- Baño privado — solo si el atributo admite "en algunas habitaciones" (203, 301, 302)
- No fumadores — sí ("No se permite fumar dentro del establecimiento")
- Custodia de equipaje — solo si el atributo permite "según disponibilidad";
  si es binario, NO MARCAR (los domingos depende de la operación)

## 5. Amenities a NO marcar (regla anti-invención)
parqueadero gratuito propio · restaurante · desayuno · piscina · spa · gimnasio ·
aire acondicionado · recepción 24 h · ascensor · mascotas admitidas libremente

- **Parqueadero**: no hay propio. Existe parqueadero aliado de pago (~$15.000 la
  noche para carro; moto suele ser sin costo según disponibilidad). Marcar SOLO
  si Google ofrece exactamente "parqueadero de pago fuera de las instalaciones".
  En cualquier otro caso, dejar vacío.
- **Mascotas**: solo bajo consulta. No marcar pet friendly ni "no se admiten".
  Dejar sin declarar — el sitio ya omite el campo a propósito
  (ver comentario en el frontmatter sobre `petsAllowed` en JSON-LD).

## 6. Accesibilidad — NO MARCAR ACCESIBLE
Todas las unidades son "solo escaleras, sin ascensor". No declarar entrada
accesible ni habitación accesible. Si Google permite declarar "sin ascensor",
es dato veraz y conviene.

## 7. Políticas del hotel (verificadas)
- No se fuma dentro del establecimiento.
- Aseo y ropa de cama incluidos; en estadías largas, servicio ~cada 3 días.
- Grupos de 8 a 10 requieren camas adicionales, se coordina directamente.
- Casa completa hasta 22 huéspedes, bajo confirmación de disponibilidad.

## 8. Salud y seguridad — NO DECLARAR
No hay dato verificable en la web. Dejar vacío.

## 9. Pagos — NO DECLARAR
No hay evidencia de medios de pago en el sitio. Dejar vacío.

## 10. Enlaces de reserva
El canal real es WhatsApp (+57 318 898 3167), no un motor de reservas. Si Google
exige URL de reserva, usar la landing:
https://hotelesatheron.com/hospedajes/hotel-atheron-suite
No declarar OTA no verificada.

## 11. SEO local — sin keyword stuffing
Las búsquedas objetivo (hotel/hoteles/alojamiento/hospedaje en Zipaquirá, hotel
cerca de la Catedral de Sal) quedan cubiertas por la descripción + categoría
Hotel + dirección + la mención única de la Catedral de Sal. **No** añadir
palabras clave al nombre comercial.

## 12. Publicación sugerida (borrador, datos verificados)
Título: A 16 minutos caminando de la Catedral de Sal
Texto: En Hoteles Atheron te quedas en el centro de Zipaquirá, a 1,4 km de la
Catedral de Sal. Wi-Fi, Netflix y cocina compartida con estufa; tres unidades
con baño privado y la Suite 301 con control por voz mediante Alexa. Check-in
15:00, check-out 11:00. Escríbenos por WhatsApp al 318 898 3167.
CTA: Más información → la landing.

## 13. Lo que NO se puede hacer sin el navegador local
Fotos (calidad, clasificación, duplicados), reseñas sin responder, preguntas y
respuestas, alertas del panel, cambios pendientes o rechazados, y la
comprobación de aparición pública en Search/Maps: todo exige sesión de Google.
