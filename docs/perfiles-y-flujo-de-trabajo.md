# Perfiles de Google, referentes y flujo de trabajo

> Documento de trabajo. 18 de agosto de 2026.

---

## 1. Diagnóstico de tus perfiles

**No pude abrir los enlaces `share.google` que me pasaste**: Google bloquea el acceso automatizado (error 429). Así que lo que sigue viene de dos fuentes que sí pude consultar: tu captura de pantalla y las plataformas de reserva donde tu propiedad está listada.

### Lo que encontré

Tu propiedad existe con **al menos tres nombres distintos** circulando:

| Dónde | Cómo aparece |
|---|---|
| Google (tu captura) | **Atheronsas** |
| Booking.com | Hospedaje la Magia de Zipaquirá |
| Trivago, Bed&Breakfast, otros | Hotel Atheron suite La Magia de Zipaquirá |
| Sitio anterior (Odoo) | Hospedaje La Magia de Zipaquirá |
| Instagram | atheron_suite |

**Esto es el problema más grave que tienes ahora mismo**, y no es de diseño: es de identidad.

Se llama consistencia **NAP** (*Name, Address, Phone*). Google usa la coincidencia de esos tres datos en todas las plataformas para confirmar que un negocio es real y para saber a qué entidad atribuir las señales. Cuando el mismo negocio aparece con cuatro nombres, esas señales se reparten en cuatro entidades débiles en vez de acumularse en una fuerte.

### Segundo problema: la ubicación

En tu captura, Google sitúa el resultado en **Cogua, Cundinamarca**. Trivago también lista la propiedad bajo **Cogua**. Pero la dirección que muestra la ficha es **Cra. 9 #10-32, Zipaquirá**.

Cogua y Zipaquirá son municipios distintos. Si Google cree que estás en Cogua, no vas a salir en las búsquedas de "hospedaje en Zipaquirá" — que es exactamente lo que queremos ganar. **Hay que verificar esto y corregirlo.**

### Tercer problema: confusión con Atheron Security

En la misma búsqueda aparece un segundo perfil, **"Atheron Se..."** (aparentemente Atheron Security). Dos negocios con la misma raíz de marca compitiendo en los mismos resultados se canibalizan: Google no sabe cuál mostrar para "Atheron".

### Cuarto dato: solo 1 reseña

La ficha muestra **5,0 estrellas con 1 opinión**. Cinco estrellas está bien, pero una sola reseña no genera confianza ni peso de ranking. Recuerda el hallazgo: **la velocidad de reseñas pesa más que el total histórico**. En una plataforma agregadora vi mención de 17 opiniones, lo que sugiere que tienes reseñas dispersas en Booking que no están llegando a Google.

---

## 2. Recomendación: cuál perfil tomar

**Quédate con el perfil que tiene la dirección de Zipaquirá (Cra. 9 #10-32) y la reseña.**

Razón: un perfil antiguo con historial y una reseña real vale más que uno nuevo perfecto. Google le da peso a la antigüedad y a la actividad acumulada. Crear uno nuevo es empezar de cero.

Lo que hay que hacer con él, en este orden:

1. **Renombrarlo.** De "Atheronsas" a un nombre limpio y consistente. Mi recomendación: **Atheron Suite** a secas, o **Atheron Suite - Hospedaje Zipaquirá**.
   > Cuidado: Google prohíbe meter palabras clave de relleno en el nombre ("Atheron Suite Hotel Barato Cerca Catedral de Sal" es motivo de suspensión). El nombre debe ser el nombre real del negocio.

2. **Corregir la ubicación.** Verificar que el pin del mapa esté en Zipaquirá y no en Cogua. Este es el punto más urgente.

3. **Unificar el nombre en todas partes.** Booking, Trivago, Instagram y el sitio web deben decir exactamente lo mismo. Sé que cambiar el nombre en Booking cuesta trabajo, pero es la diferencia entre acumular señales o dispersarlas.

4. **Separar Atheron Security.** Si es un negocio tuyo distinto, que su perfil tenga categoría y dirección claramente diferentes. Si no lo usas, cerrarlo.

5. **Completar la ficha:** categoría correcta, horarios, teléfono +57 318 898 3167, enlace al sitio, atributos (wifi, parqueadero, cocina).

6. **Fotos.** Es lo que más mueve un perfil. Subir fotos nuevas cada semana, no una vez y ya.

7. **Pedir reseñas.** Empezando por los huéspedes que ya tuviste.

### Decisión que sigue pendiente

¿Un perfil para la marca Atheron Suite, o siete perfiles (uno por hospedaje)?

Mi recomendación: **empieza con uno bien hecho**. Siete perfiles a medias rankean peor que uno completo, y mantener siete es mucho trabajo. Cuando ese esté sólido y con reseñas fluyendo, abres el segundo.

---

## 3. Datos reales que encontré (verificar antes de publicar)

Estos datos están publicados en plataformas de reserva sobre tu propiedad. **No los di por ciertos ni los puse en el sitio** — confírmalos tú y los cargamos:

| Dato | Lo que aparece publicado |
|---|---|
| Distancia a la Catedral de Sal | ~0,9 millas (~1,4 km), unos 16 minutos a pie |
| Wifi | Gratis en toda la propiedad |
| Netflix | Incluido en los apartamentos |
| Cocina | Compartida, equipada |
| Vistas | A la montaña |
| Mascotas | No se admiten |
| Parqueadero | Disponible |
| Check-in / check-out | 15:00 / 11:00 |
| Distancia a Bogotá | 43 km al C.C. Andino, 46 km al Campín |

Si confirmas esto, tenemos con qué llenar buena parte de la primera ficha de hospedaje y el JSON-LD.

---

## 4. Estudio del referente: @danillamazares

### Qué hace

No pude acceder al perfil directamente (TikTok bloquea el acceso automatizado), pero sí identifiqué sus videos y su temática a través de búsqueda. Es un creador en español enfocado en **SEO local y el modelo "rank and rent"**. Videos identificados:

- *"Cómo generar más de 10.000 € mensuales con una web de bajo tráfico"* — etiquetas: `#rankandrent` `#seolocal` `#sectoreslucrativos` `#posicionamientogoogle`
- *"4 formas de ganar dinero con SEO: AdSense, afiliación, leads, posts patrocinados"*

### Qué es "rank and rent"

Es un modelo de negocio: construyes una web de un servicio local, la posicionas en Google, y **le alquilas los clientes que genera** a un negocio de la zona. En vez de vender un producto, creas un activo digital que produce clientes de forma recurrente.

Los cuatro pasos del modelo son: crear la web enfocada en un servicio local → posicionarla con SEO local → validar que genera contactos → monetizar (alquiler mensual fijo o pago por cliente generado).

### Por qué te sirve — y en qué se diferencia tu caso

**Tú no necesitas alquilar los clientes: tú eres el negocio local.** Aplicas exactamente el mismo manual, pero te quedas con los clientes en vez de revenderlos. Es el mismo trabajo con mejor margen.

Y aquí está lo interesante para tu visión del ecosistema: **lo que describes con los restaurantes ES rank and rent, pero interno.** Posicionas el activo (el contenido de Zipaquirá), y cuando entra un servicio nuevo, ya tienes el tráfico esperándolo. La única diferencia es que el "inquilino" eres tú mismo.

Esa es la razón técnica de por qué construir el blog ahora, antes de tener los restaurantes, es la decisión correcta y no una pérdida de tiempo.

### La advertencia importante

Del mismo análisis del modelo en 2026 sale este matiz, y es crítico:

> Los resúmenes de IA están reduciendo los clics orgánicos en las búsquedas informativas. Hay que elegir nichos donde sobrevivan los clics del *map pack* y las llamadas telefónicas.

Traducido a tu caso: **el blog construye autoridad, pero el dinero entra por el perfil de Google y por WhatsApp.** No inviertas todo en artículos esperando que la gente haga clic desde una guía. El artículo te da credibilidad y le enseña a Google que sabes de Zipaquirá; la conversión ocurre en el mapa y en el botón de WhatsApp.

Por eso el orden de prioridades es: **perfil de Google primero, WhatsApp segundo, blog tercero.**

### Qué copiar de su método

- Enfoque en **una zona geográfica concreta**, no en general
- Contenido que responde búsquedas con intención, no contenido de marca
- Medir qué páginas generan contactos, no cuántas visitas hay
- Paciencia: el modelo funciona a 3-6 meses

### Qué NO copiar

- La monetización por AdSense y afiliación no aplica: tú no vendes tráfico, vendes noches
- No armes muchas webs. Una sola, bien hecha, es tu caso

---

## 5. Flujo de trabajo

### Ritmo semanal sugerido

| Cuándo | Qué | Tiempo |
|---|---|---|
| Lunes | Subir 2-3 fotos al perfil de Google | 10 min |
| Lunes | Revisar Search Console | 10 min |
| Miércoles | Responder reseñas y preguntas | 10 min |
| Cada 15 días | Escribir un artículo | 2-3 h |
| Al cerrar cada estancia | Pedir reseña por WhatsApp | 2 min |

Lo importante no es el volumen, es que no se rompa la cadena. Google premia la actividad sostenida.

### Cómo se agrega un artículo

1. Copiar `blog/plantilla-articulo.html` y renombrarlo con la palabra clave
2. Escribir siguiendo las tres reglas (ver más abajo)
3. Enlazarlo desde `blog/index.html` y desde la caja "cluster" de `blog/guia-de-zipaquira.html`
4. Añadir su dirección a `sitemap.xml`
5. `git add -A` → `git commit` → `git push` (se publica solo)

### Las tres reglas de cada artículo

1. **Las primeras 200 palabras responden la pregunta completa.** Nada de introducciones. Es lo que decide si un asistente de IA te cita.
2. **Datos concretos siempre**: kilómetros, minutos, pesos, horarios. Añadir datos concretos mejora la visibilidad en buscadores de IA un 41%.
3. **Nunca inventes un dato.** Si no lo verificaste, márcalo como pendiente y publica sin él.

### División de trabajo

**Tú:** perfil de Google, reseñas, fotos, datos reales, responder WhatsApp, decidir el dominio.

**Yo:** el código, la estructura de cada artículo, el SEO técnico, y convertir tus datos en páginas.

---

## 6. Prioridades, en orden

1. **Corregir la ubicación del perfil de Google** (Cogua → Zipaquirá). Es lo más urgente: sin esto, nada del resto sirve para búsquedas en Zipaquirá.
2. Renombrar el perfil a "Atheron Suite"
3. Probar el botón de WhatsApp (ya está en vivo con tu número)
4. Comprar el dominio
5. Unificar el nombre en Booking e Instagram
6. Search Console
7. Datos de los 7 hospedajes
8. Primer artículo del blog

---

## Fuentes

- [Rank and Rent en Español — qué es y cómo funciona](https://xn--rankandrentenespa%C3%B1ol-c4b.com/que-es-rank-and-rent/)
- [Rank-and-Rent SEO: How the Model Works 2026 — RankLocal](https://ranklocal.cc/blog/how-rank-and-rent-seo-works)
- [Rank and Rent Websites — The Lead Guy](https://theleadguy.online/rank-and-rent-websites/)
- [Hospedaje la Magia de Zipaquirá — Booking.com](https://www.booking.com/hotel/co/atheron-suite-301.es.html)
- [Hotel Atheron suite La Magia de Zipaquirá — Bed&Breakfast.eu](https://www.bedandbreakfast.eu/en/a/lHpivr8cGyTK/hotel-atheron-suite-la-magia-de-zipaquira)
- [Hotel Atheron suite La Magia de Zipaquirá — Trivago](https://www.trivago.com.co/es-CO/oar/casa-o-apartamento-entero-hotel-atheron-suite-la-magia-de-zipaquir%25C3%25A1-cogua?search=100-40022258)
