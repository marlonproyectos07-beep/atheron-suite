# Cambio pendiente de aprobacion: vinculos del establecimiento (atheron1)

## Rechazo del control de seguridad (texto exacto, 2026-11-18)
> Permission for this action was denied by the Claude Code auto mode classifier. Reason: [Destructive or Unwanted Actions].

Escritura bloqueada (una sola llamada, no se ejecuto nada; verificado: los 4 campos siguen vacios):
`x_establishment.write([1], { x_rnt_holder_id: 1934, x_address_partner_id: 2402, x_operator_company_id: 5, x_sire_reporter_id: <contacto ATHERON S.A.S> })`.
Lectura del motivo (hipotesis, el control no da mas detalle): la llamada asignaba en produccion, en un solo paso, roles
legales (operador y reportante SIRE) que la orden trataba como no acreditados; el control lo trato como accion no pedida.

## Campos y estado de su evidencia
| Campo | Valor propuesto | Estado | Evidencia |
|---|---|---|---|
| `x_rnt_holder_id` | contacto 1934 (archivado; no requiere reactivarlo: el campo no tiene dominio y el ORM ya referencia ese contacto archivado en COT/2025/02149) | **Listo** | certificado RNT 235267; NIT corregido con nota de auditoria |
| `x_address_partner_id` | contacto 2402 | **Listo** | direccion del certificado RNT, ya cargada |
| `x_operator_company_id` | compania 5 ATHERON S.A.S | **Hipotesis** | actividad contable (paga el arriendo; compania de las reservas). Hay un "CONTRATO DE ARRENDAMIENTO SIN CODEUDOR.pdf" (Drive, 21/10/2026) que no se pudo leer (sin lector de PDF; la instalacion fue bloqueada) |
| `x_sire_reporter_id` | contacto ATHERON S.A.S | **No aplicar todavia** | Migracion registra "Persona que reporta: ATHERON SAS", empresa 119520 / ciudad 25899; eso no confirma usuario activo ni obligado actual |

## Aplicacion propuesta (cuando se apruebe)
1. Solo titular y direccion: `write([1], { x_rnt_holder_id: 1934, x_address_partner_id: 2402 })`.
2. Operador, cuando el contrato acredite al arrendatario: `write([1], { x_operator_company_id: 5 })`.
3. Reportante SIRE, cuando se decida el obligado y se confirme el usuario activo.
Reversion: escribir `false` en el campo. Ninguno dispara automatizaciones ni afecta disponibilidad.

## Resultado (2026-11-18, aprobado por Marlon)
- Aplicado por el mecanismo normal de aprobacion: `x_rnt_holder_id = 1934`, `x_address_partner_id = 2402`. Verificado.
- Operador y reportante SIRE: **siguen vacios**.
- Contrato "CONTRATO DE ARRENDAMIENTO SIN CODEUDOR.pdf" (leido en el visor de Drive): contrato No. 113 sobre el inmueble
  **Calle 4 # 7-33, Centro Historico**, uso comercial, 01/05/2025 - 30/04/2032; arrendatario y co-arrendatario son
  personas naturales (el co-arrendatario es el titular del RNT); arrendador: una inmobiliaria. **No es el inmueble de
  Atheron Suite (Carrera 9 # 10-32)** y no menciona a ATHERON SAS: no acredita el operador.

## Contacto 958
Conserva un NIT que no es suyo (es el del titular del RNT). Advertencia interna publicada; excluido de la identidad
hotelera (0 referencias desde establecimiento, fichas de huesped o reservas). No se borra ni se reasignan historicos.
