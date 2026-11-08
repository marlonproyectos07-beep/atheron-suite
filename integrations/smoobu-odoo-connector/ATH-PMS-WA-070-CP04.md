# ATH-PMS-WA-070 CP-04 — ControlGate (implementación en rama, no desplegada)

## Rama y alcance
- Rama: `ath-pms-wa-070/cp04-controlgate`
- Base: `ath-pms-wa-061/availability-readonly` (rama del trabajo apilado sobre PR #110).
- No se fusionó PR #110, no se desplegó y no se modificó Odoo.
- Los nodos de producción permanecen apagados; época reportada por CP-04: 2.

## Lectura del Centro de Control
El componente `src/control-gate.mjs` consulta exclusivamente:
- `x_ath_state`, registro ID 1: `x_epoch`, `x_emergency`.
- `x_ath_node`, nivel `cuenta`, relación `x_wa_account_id = 7`: `x_eff_auto_reply`, `x_eff_auto_booking`, `x_eff_status`.

Se confía en los campos efectivos calculados por Odoo para incorporar los niveles superiores. La puerta falla cerrada si hay error de red/API, respuesta ausente/ambigua/malformada o lectura que exceda 3 segundos. No almacena estado en caché.

## Integración
- `whatsapp-agent-run.mjs` construye ControlGate y lo inyecta al runner.
- `runAgent` detiene el procesamiento antes de leer mensajes si la respuesta automática efectiva no está habilitada; vuelve a comprobar antes de publicar un borrador interno.
- `whatsapp-agent-send-sim.mjs` y `whatsapp-agent-send-once.mjs` inyectan ControlGate.
- `planSend` termina sin consultar Smoobu si el gate bloquea.
- `sendOnce` vuelve a consultar ControlGate antes de reservar idempotencia y antes de la llamada de envío.
- La reserva automática no existe en este agente; cualquier futuro ejecutor de reservas debe invocar ControlGate con `requireBooking: true` antes de consultar/crear la reserva y justo antes de la escritura.

## Pruebas agregadas

- GitHub Actions ejecutó el workflow de pruebas de la PR: **429 tests aprobados, 0 fallidos**. El log confirma las pruebas CP-04 del runner, sender y ControlGate. Esta ejecución corresponde a la revisión inicial; el último ajuste añadió una prueba adicional de valores efectivos malformados y requiere nueva ejecución.
- Pruebas unitarias de estado activo, apagado, emergencia, reservas deshabilitadas, estado ausente/ambiguo/malformado, desconexión y lentitud.
- Prueba del runner: el bloqueo detiene el agente antes de leer mensajes o consultar Smoobu.
- Prueba del sender: el bloqueo detiene el plan antes de consultar Smoobu y sin escrituras.

## Validación manual de Odoo

Se añadió `.github/workflows/ath-pms-wa-070-control-gate-readonly.yml` con disparador manual (`workflow_dispatch`) y el script `scripts/control-gate-readonly.mjs`. Lee el estado global y el nodo de cuenta con las variables ODOO existentes; no escribe en Odoo y reporta únicamente epoch, ID de nodo, interruptores efectivos y resultado. Debe ejecutarse desde GitHub Actions para validar la credencial y el esquema real.

## Limitaciones y validaciones pendientes
- No se ejecutó GitHub Actions en esta entrega; por tanto no se declara que las pruebas del repositorio estén aprobadas.
- No se hizo una llamada real de lectura al Centro de Control desde Actions. Falta comprobar el usuario/API key de Actions contra los permisos reales de Odoo.
- El informe CP-04 reportó `x_level='cuenta'` y `x_wa_account_id=7`; debe confirmarse que la selección devuelve exactamente un nodo en la lectura real.
- El ControlGate exige `x_eff_auto_reply=true` para el runner de borradores; dado que producción está apagada, debe bloquear y no crear borradores. Esto es intencional hasta que Gerencia habilite el interruptor.
- El sender one-shot queda bloqueado mientras la cuenta esté apagada; no se habilitó ningún envío.
- La lectura usa el secreto ODOO_API_KEY existente en Actions. Antes de activar automatización real, se recomienda reemplazarlo por una credencial dedicada de solo lectura limitada a estos dos modelos.
- La puerta no detiene un envío que ya fue aceptado por Meta antes de que se active una emergencia. Se comprueba de nuevo inmediatamente antes de la llamada, pero permanece la carrera inevitable entre la última lectura y la petición externa.

## Estado
Implementación propuesta en rama aislada. Sin merge, despliegue, cambios de Odoo ni mensajes enviados.
