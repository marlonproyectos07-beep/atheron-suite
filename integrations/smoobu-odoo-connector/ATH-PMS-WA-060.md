# ATH-PMS-WA-060 — verificacion real de tarifas Smoobu (07/11/2026)

## Evidencia verificable

- Run GitHub Actions: https://github.com/marlonproyectos07-beep/atheron-suite/actions/runs/42379694119
- Commit de ejecucion: `284d23b1fca23eabc284283c81937f4324d11b4d`.
- Se ejecuto **una unica solicitud** `GET /api/rates`, fecha inicial `2026-11-09` y final `2026-11-10` para exactamente cinco IDs: 3557506, 3557511, 3557516, 3557521, 3557526.
- Suite de pruebas local GitHub Actions: **388/388 aprobadas**.
- Resultado del script: `READ_ONLY_RATES`, `requests=1`, `apartmentCount=5`; no POST, Odoo, Meta ni escrituras.

## Resumen seguro (sin afirmar precio comercial)

| Habitacion | Smoobu ID | Estado normalizado | Motivo |
|---|---:|---|---|
| 201 | 3557506 | unavailable | UNAVAILABLE_NIGHT |
| 202 | 3557511 | unavailable | UNAVAILABLE_NIGHT |
| 203 | 3557516 | unavailable | UNAVAILABLE_NIGHT |
| 301 | 3557521 | unavailable | UNAVAILABLE_NIGHT |
| 302 | 3557526 | unknown | PRICE_UNVERIFIED |

**Interpretacion:** ninguna habitacion es apta para presentarse como disponible y cotizable durante esta noche. `PRICE_UNVERIFIED` no significa que 302 este reservada ni que su tarifa sea cero; falta informacion fiable del precio.

## Controles

- La prueba encontro un control CI que impide duplicar credenciales Smoobu en otros workflows. El primer intento se detuvo antes de hacer una llamada a Smoobu.
- Se rehizo en la rama experimental reutilizando el workflow autorizado `smoobu-odoo-diagnose.yml`, sin duplicar referencias de secretos y con bloqueo exacto por mensaje del commit.
- Tras obtener evidencia, se **restablece el workflow al contenido anterior**, retirando el disparador excepcional de push. No queda un proceso que haga llamadas automaticas futuras.
- Este PR contiene reporte y evidencia. No fusionar sin revisar. No modifica disponibilidad, reservas, webhooks ni pagos.

## Siguiente prueba comercial

- Probar una noche distinta, con el mismo tipo de consulta de lectura autorizada, para localizar una habitacion candidata y validar precio, moneda, ocupacion, impuestos y restricciones antes de mostrar tarifa en WhatsApp.
- En caso de cinco bloqueadas o tarifas incompletas, el flujo WhatsApp debe responder con borrador de derivacion a recepcion; nunca confirmar disponibilidad sin evidencia.
- Integrar primero mensajes en modo sombra sin publicar ni enviar; despues habilitar salidas con autorizacion separada.
