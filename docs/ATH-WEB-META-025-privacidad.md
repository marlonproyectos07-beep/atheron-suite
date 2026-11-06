# ATH-WEB-META-025 — Correcciones técnicas de privacidad (BORRADOR)

Estado: **borrador técnico. No es un texto jurídicamente aprobado. No publicado.** `BORRADOR_LEGAL = true`.
Parte del expediente ATH-WEB-META-024 (hallazgos C1, C2, C3, C4).

## 1. Qué se corrigió

### Google Analytics 4 solo con consentimiento
- **Antes:** `Base.astro` declaraba `gtag.js` en el `<head>` de todas las páginas, así que se descargaba en cada visita antes de cualquier aviso.
- **Ahora:** la librería **ya no está en el HTML**. `public/assets/js/main.js` la inserta únicamente cuando el visitante acepta, y solo en `hotelesatheron.com` (en vistas previas de Vercel el aviso se muestra, pero GA4 nunca se carga).
- **Sin decisión = sin analítica.** Sin JavaScript tampoco hay analítica.

| Estado | Qué ocurre |
|---|---|
| `BORRADOR_LEGAL = true` (hoy) | Modo `apagada`: no se pinta aviso, no hay CSS extra, **GA4 no se carga nunca**. |
| `BORRADOR_LEGAL = false` | Modo `consentimiento`: aviso al pie (Aceptar / Rechazar, mismo estilo), botón «Preferencias de analítica» en el pie legal. |

Decisión guardada en `localStorage` (`atheronAnalitica`, `{d: si|no, t: fecha}`), vigencia 12 meses; vencida = vuelve a preguntar. Rechazar o retirar: `window['ga-disable-G-KXXM0LJKK9'] = true` y se borran las cookies `_ga*`, `_gid`, `_gat*` del sitio.

Archivos: `src/layouts/Base.astro`, `src/components/AvisoAnalitica.astro` (nuevo), `public/assets/css/analitica.css` (nuevo, solo se incrusta con el modo `consentimiento`), `src/components/PieLegal.astro`, `public/assets/js/main.js`.

### Textos de la política de privacidad
- §1: correo `comercialgsc001@gmail.com` como contacto de privacidad (además de WhatsApp).
- §2: se añade el dato que llega desde Booking/Airbnb «cuando la plataforma los entrega».
- §4 y §5: describen **solo** lo comprobado (ver tabla 2).
- §7: analítica desactivada por defecto, cómo aceptar, rechazar y cambiar la decisión.

### Sin cambios (conservados)
RNT 235267 a nombre de persona natural, con la frase «no es de la sociedad»; el nombre completo solo en Información legal. Condiciones comerciales de ATH-WEB-META-022 (anticipo 30–50 %, cancelación genérica, 15:00 / 11:00) intactas.

## 2. Tratamientos: qué está comprobado y qué no
| Tratamiento | Comprobado | Fuente | Cómo se redactó |
|---|---|---|---|
| El formulario del sitio no envía datos a servidores propios; la consulta se envía por WhatsApp al pulsar | Sí | `formularioContactoActivo = false` en `src/data/ajustes.ts`; `wa.me` en el HTML | Afirmado |
| Conversaciones por WhatsApp (Meta) | Sí | Enlaces `wa.me` del sitio | Afirmado |
| Reservas gestionadas en Smoobu (incluye Booking/Airbnb) | Sí | Conector Smoobu→Odoo, lecturas de la API de Smoobu | Afirmado |
| Clientes, cotizaciones y facturación en Odoo | Sí | Conector; piloto ATH-DEV-118 (COT/2026/03847) | Afirmado |
| Teléfono y correo de reservas de Booking | **Parcial**: la API suele devolverlos vacíos (reserva 162332151) | `CONTACTO-WHATSAPP.md` | «cuando la plataforma los entrega» |
| Copia **automática** Smoobu→Odoo | **No activa**: escrituras bloqueadas (#101) | Issue #101 | **No se afirma.** Actualizar el texto al activar |
| WhatsApp Business Platform de Odoo, plantillas, correos automáticos de Odoo o Smoobu | **No verificado** (WA-005 en curso) | — | **No se menciona**; añadir al activarlo |
| Ubicación de los servidores de Meta, Google, Odoo, Smoobu | **No verificada** | — | «pueden estar ubicados fuera de Colombia» |
| Cookies reales y retención de GA4 | **No verificado** (se mira en la consola de Analytics) | — | Texto genérico; confirmar |

## 3. Configuración del CMS (`public/admin/config.yml`)
- **Hallazgo:** en esta rama `branch: main` ya está en la línea 45 (se cambió en `adc1d7c`). La advertencia de `CLAUDE.md` («cambiar de `astro` a `main`») **ya está cumplida en esta base**; no hace falta cambiarla para fusionar este PR.
- **Texto desactualizado** en los comentarios del mismo archivo («AHORA: astro … AL FUSIONAR: cambiar a main»). Es solo comentario, no afecta; conviene limpiarlo en otro cambio. No se tocó aquí.
- El panel no edita `legal.ts` ni las páginas legales: los textos legales cambian solo por PR.
- La URL de autenticación del panel (`sveltia-cms-auth.comercialgsc001.workers.dev`) y su lista blanca de dominios no se modificaron.

## 4. Pruebas realizadas
- `npm run build`, `npm run prueba` (incluye `scripts/prueba-analitica.mjs`, 23 comprobaciones sobre el código) y `npm test` del conector.
- Prueba en navegador real (Chromium, dominio simulado), compilando temporalmente con `BORRADOR_LEGAL = false` (revertido después, no está en el commit): sin decisión 0 peticiones a Google; Rechazar 0; Aceptar 1; recarga con «sí» activa sin aviso; Preferencias reabre el aviso; retirar activa `ga-disable`; decisión caducada vuelve a preguntar; teclado; vista previa: nunca carga Google. Con `BORRADOR_LEGAL = true`: sin aviso, `data-analitica="apagada"`, 0 peticiones.

## 5. Efectos a conocer antes de fusionar
1. **Con `BORRADOR_LEGAL = true` la analítica queda apagada en todo el sitio.** Al fusionar este PR, hotelesatheron.com deja de medir hasta publicar los textos legales y que los visitantes acepten. Antes de pagar publicidad hay que decidir si se acepta una ventana sin medición.
2. Al activar el aviso, el porcentaje de visitas medidas bajará (solo quienes aceptan).
3. El aviso es una barra fija inferior; hasta que el visitante decide, tapa el botón flotante de contacto en esa franja. No cambia el diseño (posición fija, sin desplazamiento).
4. Google Tag Assistant ya no detecta la etiqueta en el HTML inicial (se inserta tras aceptar). Para validar GA4 hay que aceptar primero.

## 6. Pendiente de validación jurídica
1. ¿La opción «aceptar / rechazar con aviso previo» basta como autorización según la Ley 1581 y la guía de la SIC? ¿Es válido el aviso sin lista de cookies?
2. Vigencia de la decisión (12 meses) y texto del aviso.
3. Si debe describirse a Odoo y Smoobu como encargados y cómo (transmisión internacional).
4. Si «cuando la plataforma los entrega» es suficiente para los datos de Booking/Airbnb.
5. Autorización en el primer mensaje de WhatsApp y aviso de privacidad (sin implementar).
6. Plazo de conservación, menores, registro de huéspedes y RNBD (sin cambios aquí).
7. Cancelación y cambios de fecha (sin cambios aquí; ver expediente META-024).
8. Vínculo del RNT 235267 con el establecimiento y con ATHERON S.A.S.

## 7. Para publicar (con orden expresa de Marlon)
1. Resolver los puntos de §6 y los pendientes de `ATH-WEB-META-019-legal.md`.
2. `BORRADOR_LEGAL = false` y `VIGENCIA_LEGAL` en `src/data/legal.ts`.
3. `npm run build`, `npm run prueba`, Lighthouse (móvil, con el aviso visible) y revisión en la vista previa de Vercel aceptando y rechazando.
4. Confirmar en la consola de GA4 que no hay eventos antes de aceptar.
5. Merge, comprobación en producción y solo entonces verificación del dominio en Meta.
