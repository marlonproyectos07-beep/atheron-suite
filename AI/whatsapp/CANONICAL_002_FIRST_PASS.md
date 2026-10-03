# GOAL-WHATSAPP-CANONICAL-002 — FIRST_PASS_GENERALIZATION

20 mensajes nuevos (`integrations/whatsapp-shadow-agent/test/generalization-canonical.mjs`),
escritos y ejecutados **una sola vez, antes de corregir**, contra la línea canónica `bdb6a4c`.

**Resultado de primera pasada: 7/20 = 35 %** (criterio estricto: intención + escalamiento + Odoo + línea + texto).

Fallos (sin maquillar):

| ID | Causa |
|---|---|
| C01 | "este sábado" pregunta confirmación de fecha en vez de consultar (hoy es sábado: ambigüedad real) |
| C02 | etiqueta de intención distinta (`CONSULTA_PRECIO`); el comportamiento fue correcto (consultó Odoo) |
| C07, C18 | "a qué horas puedo llegar" / "toca desocupar" no se reconoce como check-in/check-out → escala |
| C08, C09 | pregunta de anticipo en Airbnb/Booking: respondió "50 %" sin distinguir canal |
| C12 | alarmas/cámaras de seguridad no ruteadas a Atheron Security |
| C14 | "quedamos 3" no se reconoce como número de personas |
| C15 | etiqueta distinta (`GRUPO`); comportamiento correcto (escaló) |
| C16 | "les consigné por nequi el anticipo" no se reconoce como comprobante |
| C17 | "no me llegó la reserva… no me han respondido" no se reconoce como reclamo |
| C19 | etiqueta distinta (`MASCOTA`); comportamiento correcto |
| C20 | pregunta turística fuera de alcance tratada como disponibilidad |

Etiquetas distintas pero comportamiento correcto: C02, C15, C19 (3 de los 13 fallos).
Fallos de comportamiento reales: 10. Estas cifras son la medida independiente;
tras corregir causas generales los 20 casos ya NO son ciegos.
