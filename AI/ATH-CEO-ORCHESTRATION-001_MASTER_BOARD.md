# ATH-CEO-ORCHESTRATION-001 — Tablero maestro

Fecha: 2026-10-01

## Modelo operativo

Un director/orquestador y varios ejecutores paralelos.

- Director: este chat.
- Bus de coordinación: GitHub Issues + ramas + commits + deploys.
- Ejecutor repo/web: Claude Code puede trabajar en su propia rama.
- Ejecutor navegador autenticado: Claude Chrome/Work solo cuando haga falta una sesión web.
- Vercel: Preview y evidencia runtime.
- Odoo STAGING: fuente funcional de hotel.
- Metricool: programación/analítica social cuando las redes estén conectadas.

## Frentes

| Frente | Issue | Responsable principal | Evidencia de avance | Estado actual |
|---|---:|---|---|---|
| WhatsApp natural | #75 | ChatGPT | logs Vercel + respuesta TEST + Odoo STAGING | Odoo SUCCESS; salida Meta 401 |
| OTA Booking/Airbnb | #77 | ChatGPT | matriz IDs + tests anti-overbooking | Gate A activo |
| Web calidad | #78 | Claude Code + ChatGPT director | diff + build + Lighthouse + Preview | auditoría inicial creada |
| Marketing/avatar | #79 | ChatGPT + generación media | avatar aprobado + piezas + Metricool | redes aún no conectadas |
| Google Hotels | ATH-020 | Claude Chrome + ChatGPT director | requisitos + integración compatible | coordinado por matriz maestra |

## Evidencia mínima por frente

Ningún frente puede declarar “listo” sin:
- commit o cambio identificable,
- prueba,
- resultado,
- evidencia observable,
- rollback cuando aplique.

## Reglas de aislamiento

- una rama por frente;
- no mezclar HOTEL-013 con HOTEL-014;
- no mezclar marketing con código hotelero;
- Production bloqueada;
- secretos nunca en chat;
- publicación/campañas/pagos requieren aprobación CEO.

## Cadencia del director

El director debe consolidar el estado en una sola vista:
- VERDE: probado y estable;
- AMARILLO: avanzando con bloqueo conocido;
- ROJO: bloqueado;
- SIGUIENTE: una acción exacta por frente.

## Objetivo operacional

Marlon no debe administrar cinco conversaciones manualmente.
Debe poder decir:
“Avancen todos los frentes”
y recibir un parte ejecutivo con evidencia.

Los chats/agentes especializados pueden existir, pero GitHub es el estado compartido; no la memoria del chat.
