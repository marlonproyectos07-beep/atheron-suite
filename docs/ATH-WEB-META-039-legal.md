# ATH-WEB-META-039 — Textos legales completados (BORRADOR)

Rama: `ath-web-meta-019/paginas-legales` (PR #106, **Draft**). `BORRADOR_LEGAL = true`. **No fusionado, no publicado.**
Los textos siguen sin ser definitivos: pendientes de aprobación de gerencia y revisión jurídica. `VIGENCIA_LEGAL = null` (sin fecha inventada).

## Qué cambió
| Archivo | Cambio |
|---|---|
| `src/pages/politica-de-privacidad.astro` | Reescrita (12 puntos): responsable y separación del RNT; datos (contacto, reserva, conversaciones, facturación/anticipo, plataformas, navegación); WhatsApp Cloud API y línea +57 301 803 5593; Odoo y Smoobu; cookies/GA4; derechos; conservación sin plazos inventados; enlace a eliminación. |
| `src/pages/eliminacion-de-datos.astro` | **Nueva.** Cómo pedirla, qué datos aportar, verificación sin documentos, qué se elimina, qué puede conservarse, terceros, respuesta y plazos (Ley 1581/2012 arts. 14 y 15). |
| `src/data/legal.ts` | Ruta `eliminacion`, constante `LINEA_CLOUD_API`, versión `1.1 (borrador)`. Sin cambios en `BORRADOR_LEGAL`, `VIGENCIA_LEGAL`, `CONDICIONES_RESERVA`, `RNT` ni `EMPRESA`. |
| `src/pages/terminos-y-condiciones.astro`, `informacion-legal.astro`, `PieLegal.astro`, `sitemap.xml.ts` | Solo enlaces a la nueva página (el sitemap la incluye únicamente con `BORRADOR_LEGAL = false`). |
| `scripts/prueba-legal.mjs`, `package.json` | 35 comprobaciones nuevas, incluidas en `npm run prueba`. |

## Cómo se describen los procesos (solo lo comprobado)
- **WhatsApp Cloud API:** línea +57 301 803 5593 «se está habilitando» con la WhatsApp Business Platform de Meta; los mensajes llegan a Odoo y los lee el equipo. **Atención humana hoy; no se afirman respuestas automáticas, IA ni reservas automáticas.** Se promete actualizar la política antes de activarlas. El canal +57 318 898 3167 se menciona como recepción actual, sin cambios.
- **Odoo:** clientes, cotizaciones, facturación y comunicaciones comerciales.
- **Smoobu:** reservas, disponibilidad y canales (Booking.com y Airbnb solo como origen de los datos que entregan).
- **Smoobu→Odoo:** el texto dice que la conexión «está en desarrollo» y que hoy la copia no es automática (escrituras bloqueadas, issue #101). Actualizar al activarla.
- **Identificación de huéspedes / menores:** NO se afirma que se recojan. Solo hay una frase condicional («si fuera necesario por exigencia de la normativa… se le informará»). Pendiente de confirmar el proceso real.

## Decisiones pendientes de gerencia
1. Aprobar `comercialgsc001@gmail.com` como contacto público de privacidad (figura en Meta; provisional).
2. Relación jurídica entre el titular persona natural del RNT 235267, ATHERON S.A.S. y el establecimiento concreto.
3. Condiciones sin definir (siguen en `null`, no se muestran): medios de pago, cambios de fecha, cancelaciones/devoluciones específicas, menores y mascotas, normas de convivencia.
4. Fecha de vigencia (`VIGENCIA_LEGAL`).
5. Código postal 250251 de Meta frente al RUT (no se inventó ni se usa en los textos).
6. Si el proceso real pide documentos de identidad a huéspedes (y para qué) y si se tratan datos de menores.
7. Plazos de conservación de registros comerciales, contables y de alojamiento (no se citan números sin soporte).

## Requiere revisión jurídica (además de lo de META-019/025)
- Plazos de 10/15 días hábiles (+5/+8) de la página de eliminación.
- Transmisión/transferencia internacional (Meta, Google, Odoo, Smoobu) y calificación de encargados.
- Autorización al escribir por WhatsApp (aviso en el primer mensaje, sin implementar).
- RNBD, y cláusulas de ley aplicable/responsabilidad de los términos.

## Google Analytics 4
Sin cambios en el mecanismo de consentimiento (23 pruebas de `prueba-analitica.mjs` pasan). Con `BORRADOR_LEGAL = true` la analítica queda apagada en todo el sitio al fusionar (ver `ATH-WEB-META-025-privacidad.md` §5); no se tocó. El consentimiento se verificó solo sobre el código y el HTML generado, no en navegador en esta tarea.
