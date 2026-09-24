# ATH-ODOO-HOTEL-007 — Gateway técnico Odoo Hotel

Estado: **scaffold local / no desplegado / no conectado a Odoo**.

Este directorio define el contrato mínimo para eliminar la dependencia de una sesión de navegador autenticada.

## Objetivo
Permitir que agentes autorizados (ChatGPT, Claude, Codex/OpenCode y posteriormente Sofía) utilicen un contrato único de mínimo privilegio para:

1. consultar disponibilidad;
2. solicitar cotización;
3. crear HOLD idempotente;
4. consultar estado.

El gateway **no** confirma reservas, no aprueba tarifas/capacidad extraordinaria y no acepta precio, descuento, impuesto, canal ni overrides enviados por el cliente.

## Fuente transaccional
Odoo Hotel sigue siendo la fuente de verdad de:
- inventario;
- disponibilidad;
- cotización;
- HOLD;
- bloqueo;
- reglas APPROVED.

El gateway no recalcula estos datos.

## Seguridad
- Nunca guardar credenciales, cookies, API keys o tokens en este repositorio.
- El secreto futuro debe vivir en el secret manager del runtime.
- `source_channel` se fuerza internamente a `sofia`.
- Inputs desconocidos se rechazan (fail closed).
- `quote` y `hold` exigen idempotency key.
- La autorización real deberá mapear al mismo mínimo privilegio definido para el grupo 149 `Hotel v1 / API Sofía`.

## Endpoints propuestos
- `POST /hotel/availability`
- `POST /hotel/quote`
- `POST /hotel/hold`
- `POST /hotel/status`

Ver `openapi.yaml`.

## Estado actual
Este scaffold no abre puertos ni llama Odoo. Solo fija y prueba el contrato.

Pruebas locales:

```bash
cd integrations/odoo-hotel-gateway
npm test
```

Resultado inicial: 8/8 PASS.

## Siguiente paso cuando HOTEL-006 cierre
Implementar un adapter que invoque exclusivamente la puerta Odoo aprobada (gateway/action 1967 o su reemplazo estable), con autenticación técnica revocable, auditoría y sin acceso administrativo general.
