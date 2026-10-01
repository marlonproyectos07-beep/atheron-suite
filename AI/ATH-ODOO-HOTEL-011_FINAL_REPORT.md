# ATH-ODOO-HOTEL-011 — CIERRE DEL PILOTO WHATSAPP TEST

Fecha de cierre: 2026-10-01
Estado: COMPLETADO EN PREVIEW / TEST
Producción: NO TOCADA

## Objetivo validado

Demostrar de punta a punta el flujo controlado:

WhatsApp TEST -> Meta -> Vercel Preview HOTEL-011 -> Gateway -> Odoo STAGING -> respuesta por WhatsApp TEST.

## Evidencia final

Deployment final validado:
- Deployment: dpl_BFFxenNQs44beH7xg4N3MvJpFXU9
- URL deployment: atheron-suite-9alben1ly-marlon-atheron.vercel.app
- Alias estable de rama: atheron-suite-git-feature-ath-odoo-hotel-7c1f17-marlon-atheron.vercel.app
- Rama: feature/ath-odoo-hotel-011-whatsapp-controlled-pilot
- Commit funcional probado: d65067e08897b093502c33cf878bea499c843a37

Prueba final controlada:
- POST /api/hotel/webhook: 200
- sender_allowlist_match: true
- text_allowlist_match: true
- ODOO_STEP: started
- ODOO_STEP: success
- evento: availability_checked
- OUTBOUND_STEP: 200
- respuesta recibida en WhatsApp por Marlon
- opción devuelta: unidad 201, hasta 4 personas
- reintento posterior detectado como duplicate y no reprocesado

## Seguridad y límites respetados

- Solo Preview HOTEL-011.
- Solo número TEST autorizado.
- App Meta permaneció en Development.
- No Production.
- No Atheron Security.
- No HOLD.
- No reservas.
- No pagos.
- No clientes reales.
- Secretos no documentados ni expuestos en este archivo.

## Incidencias resueltas durante el piloto

1. Callback Meta apuntaba a un Preview anterior.
2. META_VERIFY_TOKEN fue rotado después de exposición accidental.
3. WHATSAPP_ACCESS_TOKEN TEST produjo 401 y fue reemplazado.
4. Allowlist exacta rechazó variantes de texto; comportamiento esperado del gate controlado.
5. Se verificó que una frase con fechas completas y huéspedes dispara la consulta real a Odoo.
6. La respuesta final de Meta fue aceptada con HTTP 200 y recibida por WhatsApp.

## Limitaciones conocidas

- La allowlist del piloto acepta frases exactas; no es todavía una experiencia conversacional natural.
- El token TEST de Meta puede caducar y debe considerarse temporal.
- El estado conversacional actual es en memoria por instancia.
- No se autoriza todavía automatización de HOLD, reserva o pago desde WhatsApp.
- El piloto valida disponibilidad; no equivale a autorización de Producción.

## Decisión de cierre

HOTEL-011 se considera 100% completado respecto a su alcance de piloto controlado end-to-end en TEST/Preview.

El siguiente gate debe evolucionar desde frases rígidas hacia conversación natural, manteniendo la regla:

> La IA conversa. Odoo decide.

Siguiente frente: ATH-ODOO-HOTEL-013 — conversación natural WhatsApp, availability-only.
