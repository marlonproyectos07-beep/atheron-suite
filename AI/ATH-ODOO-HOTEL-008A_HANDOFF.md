# ATH-ODOO-HOTEL-008A — Handoff (auditoria autonoma, 27/09/2026)

> Escrito para que otra sesion (Claude, ChatGPT, Codex o Marlon) pueda
> continuar sin reconstruir este contexto. Todo lo de abajo es HECHO o
> VERIFICADO salvo que se marque explicitamente HIPOTESIS o PENDIENTE.

## Estado general

Tecnicamente PASS salvo UNA accion humana pendiente (ver mas abajo). Nada de
lo hecho hoy toco produccion, Atheron Security, permisos, usuarios ni Odoo en
vivo (esta sesion nunca tuvo credenciales reales de Odoo).

## Que se confirmo (lectura de codigo + evidencia ya capturada, sin red)

- El motor de precios vive ENTERAMENTE dentro de Odoo, detras de
  `ir.actions.server` id 1967. El gateway (`integrations/odoo-hotel-gateway`)
  es un passthrough: nunca calcula ni sustituye `precio_total`
  (`src/odoo-adapter.mjs`, `src/contract.mjs` bloquea 'price'/'tax' desde el
  cliente).
- `x_hotel_rate` / `base_plus_extra` no existen en NINGUN archivo de este
  repositorio (grep sobre todo el historial git): son datos/codigo que viven
  solo dentro de Odoo. Ni esta sesion ni el usuario tecnico Sofia tienen
  acceso a Studio/Ajustes tecnicos alli (ya documentado en
  `AI/ODOO_HOTEL_PROMOTION_MANIFEST.md`).
- HOTEL-005 (`AI/ODOO_HOTEL_STATE.md`, rama `chore/ai-orchestration-foundation`)
  ya dejo cerrado: "el cotizador funciona solo con APPROVED, sin preview".
  VALIDATED no puede cotizar. Esto no es un bug, es gobernanza ya aprobada.

## Fixes aplicados hoy (codigo, sin tocar Odoo)

1. **`ODOO_ACTION_ID` explicito, obligatorio en LIVE.**
   `src/odoo-adapter.mjs` y `src/bootstrap.mjs` ya NO caen en silencio a 1967
   si falta la variable de entorno — coherente con el guardrail ya escrito en
   `AI/ATH-ODOO-HOTEL-008A_LIVE.md` ("ODOO_ACTION_ID debe ser explicito; no
   usar fallback"), que el codigo hasta hoy no cumplia. Test:
   `test/odoo-adapter.test.mjs` ("LIVE mode without an explicit actionId...").

2. **Bug real de idempotencia corregido.** `correlation_id` (generado al
   azar por el gateway cuando el cliente no manda el suyo — el caso normal)
   se colaba en el hash de comparacion de idempotencia. Un reintento
   LEGITIMO del mismo `hold`/`quote` con la misma `idempotency_key` recibia
   `IDEMPOTENCY_KEY_REUSED` en vez de un replay — justo lo contrario de para
   que sirve la idempotencia. Corregido en `src/gateway.mjs` (se compara sin
   `correlation_id`, se ejecuta con el objeto completo). Tests de regresion
   en `test/gateway.test.mjs`.

3. **Suite offline: 87/87 PASS** (antes de hoy: 71/71; +16 tests nuevos entre
   el runner LIVE y las regresiones de idempotencia/actionId). Todo corrido
   local, sin red, sin secretos.

## Runner LIVE fail-closed (preparado, NO ejecutado — sin credenciales aqui)

`integrations/odoo-hotel-gateway/scripts/live-hotel-008a-runner.mjs` +
`test/live-runner.test.mjs` (14 tests offline sobre su logica, con
`FakeOdooTransport`, ya en verde).

Fases: `price-tiers` (cotiza Casa Completa 10/11/12/22 huespedes y compara
`precio_total` real de Odoo contra la expectativa comercial del CEO, SIN
sustituirla nunca), `gate4` (HOLD Casa Completa -> 5 habitaciones
`no_disponible`), `inverse-gate` (HOLD una habitacion -> Casa Completa no
disponible, las demas intactas), `create-holds-for-expiration` /
`verify-expiration` (crea un HOLD "sujeto" + uno "de control" en una unidad
no relacionada; la verificacion, horas despues, confirma que expirar el
sujeto no libero el control).

Guardrails: se niega a correr si `ODOO_DATABASE` != la base de staging
autorizada; exige `ODOO_ACTION_ID` explicito; NUNCA inventa `unit_id` (si
falta la variable de entorno correspondiente, esa fase queda `SKIPPED` con el
motivo exacto, nunca un id adivinado). No existe fase de "cleanup" activa
porque el contrato del gateway no expone `cancel` (bloqueado a proposito, ver
`src/contract.mjs`): la limpieza es la expiracion automatica ya documentada
(cron 155).

Como correrlo (variables reales, nunca en un chat ni commiteadas):
```
cd integrations/odoo-hotel-gateway
ODOO_DATABASE=atheron1-hotel-staging-20260923 \
ODOO_ACTION_ID=1967 \
ODOO_BASE_URL=... ODOO_TECHNICAL_USER=... ODOO_TECHNICAL_SECRET=... \
UNIT_ID_202=... UNIT_ID_203=... UNIT_ID_301=... UNIT_ID_302=... \
UNIT_ID_CASA_COMPLETA=... \
  node scripts/live-hotel-008a-runner.mjs all
```
Y 2 horas o mas despues (puede ser otra sesion, el estado queda en
`scripts/live-runner-state.local.json`, gitignored, sin secretos):
```
node scripts/live-hotel-008a-runner.mjs verify-expiration
```

**Dato que NADIE debe inventar:** el unico mapeo `unit_id` real confirmado es
201 = unit_id 1 (evidencia real capturada, hold_id 22216). Los de
202/203/301/302/Casa Completa se desconocen desde este repositorio; hay que
confirmarlos contra Odoo antes de correr `gate4`/`inverse-gate`/expiracion
(si faltan, esas fases se auto-marcan `SKIPPED`, no fallan ni inventan).

## Bloqueado / pendiente de Marlon (HIPOTESIS, no verificable sin su sesion)

Por que no aparecen los botones DRAFT->VALIDATED->APPROVED para
`x_hotel_rate` id 31 (RATE-AHS-CASA-BASE10-ADD): se le entrego un checklist
de 4 pasos de diagnostico (grupo 148 "Aprobador comercial" en ESA base
especifica / vista Formulario vs Lista / menu de Acciones-engranaje /
statusbar de estados). Todavia no respondio. Sin esas respuestas no se puede
saber cual de las causas es la real ni proponer el patch minimo con
confianza.

## HOTEL-GOV-TAX-001 / HOTEL-GOV-UI-001

Ninguno de los dos existe como gate formal en este repositorio (grep sobre
todo el historial: 0 resultados) — son nombres nuevos, no gates ya cerrados.

- **TAX-001**: lo unico confirmado y repetido es `tax_status:
  PENDING_TAX_DEFINITION` en toda respuesta real capturada, y que
  'tax'/'impuesto' ya estan bloqueados para el cliente
  (`src/contract.mjs`). Es el mismo pendiente CEO #4 de HOTEL-006
  ("definicion de impuestos"). Patch recomendado: NINGUNO todavia — depende
  de una decision de negocio (tasa, base gravable) que no es tecnica; no se
  toca sin que el CEO decida el IVA/impuesto real.
- **UI-001**: ver seccion "Bloqueado" arriba. Patch recomendado (condicional
  a la respuesta de Marlon, NO aplicado): si es grupo 148 -> re-agregar su
  usuario al grupo en ESA base; si es vista -> corregir el `states=`/`groups=`
  del boton en Studio; si es mecanismo distinto -> documentar que la
  aprobacion vive en el menu de Acciones, no en el header. Ninguna de las
  tres se ejecuto (requiere admin/Studio en Odoo, fuera de esta sesion).

## Unica accion humana requerida (objetivo del CEO)

1. Responder el diagnostico de 4 pasos (arriba) si los botones siguen sin
   aparecer, o directamente
2. **Aprobar `RATE-AHS-CASA-BASE10-ADD` (x_hotel_rate id 31)** en Odoo.

Despues de eso, la secuencia completa (cotizacion 10/11/12/22 -> GATE 4 ->
expiracion -> auditoria -> PASS/FAIL) se ejecuta con los dos comandos de la
seccion "Runner LIVE" de arriba, sin pasos manuales adicionales, siempre que
los `UNIT_ID_*` reales se hayan confirmado antes.

## Archivos tocados en esta auditoria (ninguno commiteado)

`integrations/odoo-hotel-gateway/src/odoo-adapter.mjs`,
`.../src/bootstrap.mjs`, `.../src/gateway.mjs`,
`.../test/odoo-adapter.test.mjs`, `.../test/odoo-live-pipeline.test.mjs`,
`.../test/gateway.test.mjs` (nuevo), `.../test/live-runner.test.mjs` (nuevo),
`.../scripts/live-hotel-008a-runner.mjs` (nuevo), `.../.gitignore` (nuevo),
este archivo (nuevo).
