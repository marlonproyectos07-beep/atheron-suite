# ATH-DEV-140 — Piloto aislado de contacto por WhatsApp

Estado: **desarrollo y simulación. No fusionado. Sin escrituras posibles hoy** (`PILOT_WA_ARMED = false`).

## Para qué

Probar, con UNA reserva real elegida por ID, que Odoo crea el borrador y la nota interna con el enlace `wa.me`, sin repetir
ATH-DEV-118 (ya ejecutado el 2026-10-31, COT/2026/03847, agotado) y sin tocar la sincronización programada.

## Aislamiento

| Tema | Piloto aislado (este) | Sincronización programada | Piloto ATH-DEV-118 |
|---|---|---|---|
| Interruptor | `PILOT_WA_ARMED` (constante, hoy `false`) | `SYNC_ARM` | `PILOT_ARMED` |
| Frase de armado | propia (`PILOT_WA_ARM_PHRASE`) | `SYNC_ARM_PHRASE` | `PILOT_ARM_PHRASE` |
| Aprobación | desafío público `-WA-` **+ autorización privada HMAC** (ver abajo) | no aplica | token `APROBADO-PILOTO-...` |
| Bloqueo #101 / `SYNC_DESBLOQUEO` | no lo lee ni lo cambia | lo respeta | no aplica |
| Selección de reserva | **por ID** (`PILOT_WA_ID`) | imposible | por clave |
| Disparo | solo `workflow_dispatch`, sin `schedule` | cron | manual |

El workflow `smoobu-odoo-pilot-wa.yml` no usa `SYNC_*`, no tiene permiso de escritura en el repositorio ni en incidencias. Ninguna
frase ni token de otro mecanismo arma este cliente (probado).

## Autorización: los tokens de Actions NO autorizan por sí solos

Los textos `APROBADO-PILOTO-WA-<clave>-<huella>` y `APROBADO-ADMIN-WA-...` que muestra la simulación son **desafíos públicos: identificadores
NO secretos** (cualquiera que lea la ejecución los ve). Solo prueban que la aprobación se refiere a esa operación y a ese estado de la reserva.

La **escritura real exige además una autorización privada**: un código firmado con HMAC-SHA256 con la clave `PILOT_WA_AUTH_KEY`, que solo tiene
gerencia (secreto de GitHub, nunca en el chat). Cada código va ligado a **ID + operación + huella del estado + tipo + caducidad**:

| Código | Para qué | Cuándo hace falta |
|---|---|---|
| `AUT-WA-E-<AAAAMMDDTHHMM>-<mac>` | ejecutar la prueba | siempre en modo real |
| `AUT-WA-A-...` | segunda aprobación | solo si la clave de Odoo es de administrador |
| `EXC-WA-<1-6>-...` | excepción al margen de 7 días | opcional (ver abajo) |

Caducan **como máximo 60 minutos** tras emitirse (más vigencia se rechaza), no valen para otra reserva ni si la reserva cambia (precio, fechas,
teléfono), y el piloto se consume tras un uso. Un código filtrado en un log no sirve para otra cosa. Si falta la clave, el código o no coincide:
`PILOTO_AUTORIZACION_PRIVADA_INVALIDA`, 0 escrituras. La simulación (que no puede escribir) no la necesita. Se emiten **en la máquina de gerencia**:

```
PILOT_WA_AUTH_KEY=<clave privada> npm run sync-pilot-wa-autoriza -- --id <ID> --clave <16 hex> --huella <12 hex> [--admin] [--margen N] [--minutos 30]
```

(`--clave` y `--huella` salen del resumen de la simulación.) La herramienta no usa red ni Odoo y no imprime la clave. Limitación honesta: los códigos
se pegan como entrada del workflow y quedan visibles en su ejecución; por eso caducan pronto y van atados a una sola reserva y estado.
Ni este PR ni su autor crean la clave ni emiten códigos: es decisión de gerencia (paso C).

## Margen de 7 días: fijo

El modo real **y** la simulación exigen llegada ≥ 7 días. El workflow ya no tiene `min_days`. La única forma de bajarlo es una **excepción explícita
y verificable de gerencia**: un código `EXC-WA-<días>-...` firmado con la misma clave, para esa reserva y estado, vigente ≤ 60 min, de 1 a 6 días
(no se puede emitir 0, 7 ni más). Una excepción presente pero inválida **detiene** la ejecución (no se ignora). Llegar hoy o antes nunca es válido.

## Qué se valida antes de escribir (18 controles, todos deben dar OK)

Selección única en el plan · operación CREATE_ORDER lista · desafío público ligado al estado actual de la reserva · desafío de
administrador si la clave lo es · reserva vigente · teléfono válido (E.164) e igual al del plan · enlace WhatsApp posible ·
llegada futura con **margen de 7 días** (fijo; solo excepción firmada) · habitación · fechas · importe coherente (Booking: base + impuestos) ·
sin pedido duplicado en Odoo · sin conflicto con otras reservas del plan ni con **Casa Completa** · sin conflicto con pedidos ya
existentes en Odoo (también borradores) · disponibilidad · identidad del contacto · tope de 3 escrituras.
Si una lectura es incompleta, se detiene. Si cualquier control falla: 0 escrituras. La autorización privada se verifica antes que estos controles en modo real.

## Límites que se conservan

- 3 escrituras como máximo: `res.partner.create`, `sale.order.create` (borrador, sin impuestos) y `message_post` interno.
- Nunca confirma, cancela, modifica, factura, cobra, borra ni crea turnos. Nunca envía mensajes: el chat se abre con un clic y envía una persona.
- La nota solo es válida si es de esa reserva, HTML con **una** ancla `wa.me` cuyo número es el del huésped.
- El cliente queda **consumido** tras el primer uso o ante cualquier error; repetirlo no duplica (lectura previa) y la recuperación cierra INTENT sin borrar nada.
- Los pedidos históricos (COT/2026/03847 y 03848) no se leen para escribir ni se modifican.

## Procedimiento exacto

**A. Elegir la reserva (solo lectura).** Criterios: directa o Airbnb con teléfono; llegada ≥ 7 días; una habitación (no Casa Completa);
sin otra reserva solapada. Obtener su ID de Smoobu (solo dígitos, 6–12).

**B. Simular (sin riesgo).** Actions → *Piloto aislado WhatsApp* → Run workflow: `reservation_id` = ID, `modo` = **simulacion**.
Lee Smoobu y Odoo, no escribe nada. El resumen muestra la lista de controles (`OK` o el código del fallo), los hechos de la nota
(`anchors:1, host:wa.me, phoneMatches:true`) y el **desafío público** (clave de operación + huella; no secretos).
Si algún control falla o sale `PILOTO_NO_APTO`, elegir otra reserva: no se continúa.

**C. Autorizar (gerencia, en privado).** Gerencia revisa B y, solo si aprueba: (1) guarda una vez el secreto `PILOT_WA_AUTH_KEY` en GitHub
(≥ 32 caracteres, generado por ella; nunca en el chat); (2) emite **justo antes de ejecutar** los códigos con `npm run sync-pilot-wa-autoriza`.
Si la reserva cambia (precio, fechas, teléfono) la huella cambia y los códigos dejan de valer: repetir B y C.

**D. Armar (PR aparte, fusión por orden de gerencia).** Un PR que cambie solo `PILOT_WA_ARMED = true` y una ventana
`PILOT_WA_NOT_BEFORE/AFTER` de **máx. 15 minutos**. Gerencia crea la variable `PILOT_WA_ARM` con la frase propia. No se tocan `SYNC_*` ni #101.
El usuario técnico/credenciales de escritura de Odoo los provee gerencia; no se generan aquí.

**E. Ejecutar una vez.** Dentro de la ventana: Run workflow con el mismo ID, `modo` = **real**, `approval`/`admin_approval` (desafíos de B), `auth_code` y, si la clave es de administrador, `admin_auth_code`; `lead_exception` solo si gerencia concedió excepción al margen.
Resultado esperado: `APLICADA`, pasos `partner.create, sale.order.create, note`, 3 escrituras.

**F. Verificar.** Abrir el borrador en Odoo: estado borrador, sin factura ni pago, sin turno; en el chatter, la nota con "Abrir chat de WhatsApp"
clicable que abre el chat con el mensaje escrito. Confirmar que COT/2026/03847 y 03848 no cambiaron. No enviar el mensaje salvo decisión de gerencia.

**G. Desarmar.** Revertir `PILOT_WA_ARMED = false` y la ventana a `null` (PR), borrar la variable `PILOT_WA_ARM`. Si algo falló: `FALLO_PARCIAL`,
no reintentar; revisar el diario (artefacto) y corregir a mano; el cliente ya está consumido.

## Riesgos conocidos

- Los códigos de autorización quedan visibles como entradas de la ejecución hasta que caducan; no son reutilizables (reserva, estado, ≤ 60 min, un solo uso).
- Quien tenga la clave privada puede emitir autorizaciones: guardarla solo como secreto de GitHub y en la máquina de gerencia.
- La nota con `wa.me` y la lectura del diario contienen datos del huésped: solo internos, nunca en reportes públicos (el script publica hechos, no PII).
- Booking casi nunca trae teléfono: esas reservas no son aptas para esta prueba.
- El enlace de check-in no llega por la API en la reserva observada: el mensaje saldrá sin él.
- Que el enlace sea clicable en Odoo está probado por código y pruebas; la primera comprobación en pantalla es el paso F.
- La ventana de conflictos en Odoo lee hasta 50 pedidos; si hay más, se detiene (`LECTURA_INCOMPLETA`).

## Pruebas

`test/sync-pilot-wa.test.mjs` (29 pruebas, datos sintéticos): simulación completa con 0 cambios en Odoo; cada fallo de verificación previa
(teléfono vacío/sin país/distinto, llegada pasada/< 7 días, cancelada, habitación, fechas, importe, duplicado, Casa Completa, misma
habitación); selección única y ejecución solo de la elegida; tokens (los del piloto anterior no valen, cambio de estado los invalida, doble
aprobación); borrador completo con nota HTML y consumo; alcance (otra reserva, otro número, nota sin `wa.me`); recuperación sin duplicados;
desarmado (0 llamadas de red); **autorización privada** (sin clave/código/con el desafío público como código = 0 escrituras; clave, reserva, operación,
huella, tipo, caducidad y vigencia > 60 min; administrador); **margen** (6 días falla, 7 pasa, simulación y real; excepción válida/ inválida/ de otra
reserva/ vencida; imposible emitir 0 ni 7+; llegar hoy nunca); herramienta de gerencia; aislamiento del workflow y de los módulos; privacidad.
Se comprobó por mutación que desactivar cualquiera de las dos barreras hace fallar las pruebas. Suite completa: 405/405.
