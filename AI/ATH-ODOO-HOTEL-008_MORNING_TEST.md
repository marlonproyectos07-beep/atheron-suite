# ATH-ODOO-HOTEL-008 — Morning Test Runbook (2026-09-29, 08:00)

> Para Marlon. Qué correr, qué esperar, qué significa cada resultado.
> Nada de esto toca produccion, Booking, Airbnb ni NOBEDS.

## 1. Ver la prueba local (ya corrida y en verde anoche)

```bash
cd integrations/odoo-hotel-gateway
npm install    # solo si es la primera vez en esta maquina
npm test       # 156/156 esperado
npm run hotel:morning-smoke   # 8/8 fases PASS esperado
```

```bash
cd integrations/odoo-hotel-ical
npm test       # 28/28 esperado
```

Si algo sale FAIL: revisar `AI/ATH-ODOO-HOTEL-008_NIGHT_RUN_REPORT.md`
seccion `KNOWN_RISKS` antes de asumir que es un bug nuevo.

## 2. Que significa cada fase de `hotel:morning-smoke`

| Fase | Que prueba | Si falla, mirar |
|---|---|---|
| `inventory_baseline` | 201 disponible sin reservas | `odoo-hotel-ical/src/inventory-model.mjs` |
| `gate_201_hold` | HOLD simulado deja 201 no disponible | idem |
| `cross_blocking` | Casa Completa se bloquea, 202/203/301/302 NO | idem (regla ya aprobada en HOTEL-002) |
| `alternatives` | motor de alternativas ofrece 202/203/301/302 | `odoo-hotel-gateway/src/alternatives-engine.mjs` |
| `release_hold` | liberar el HOLD de prueba restaura el inventario | idem |
| `camilo_financial` | venta=comision+payout, venta nunca es el payout neto | `odoo-hotel-gateway/src/financial-model.mjs` |
| `paola_whole_house` | Casa Completa bloquea las 5 habitaciones (fixture real) | `odoo-hotel-ical` + fixture Booking real |
| `management_close` | cierre gerencial no lanza error, marca lo no verificado | `odoo-hotel-gateway/src/financial-model.mjs` |

## 3. Ejecutar lo mismo contra Odoo STAGING real (cuando haya credenciales)

Esto **no se hizo anoche** (regla: produccion/staging por red congelada
sin sesion segura). Cuando se tengan las variables `ODOO_*` autorizadas
para `atheron1-hotel-staging-20260923` cargadas en el entorno (nunca
pegadas en chat):

```bash
cd integrations/odoo-hotel-gateway
node scripts/live-hotel-008a-runner.mjs all
```

Esto es el runner YA EXISTENTE y probado de HOTEL-008A (no se reconstruyo
nada). Documentacion completa en `AI/ATH-ODOO-HOTEL-008A_HANDOFF.md`.

## 4. Que preguntar/decidir hoy (requiere al CEO)

1. Confirmar si hubo algun efecto visible del incidente con
   `ir.actions.server` id 1654 (ver
   `AI/ATH-ODOO-HOTEL-008_NOBEDS_MIGRATION.md`, seccion "Incidente a
   declarar").
2. Dar acceso a una sesion segura de Odoo STAGING (no produccion) para
   poder ejecutar el runner real y completar Fase 2 (unit_id reales de
   202/203/301/302/Casa Completa) y Fase 7 (test Paola reproducible en
   staging).
3. Decidir si se autoriza empezar a construir la UI del tablero de Angela
   en Odoo Studio (staging) sobre el contrato de datos ya listo
   (`odoo-hotel-gateway/src/angela-read-model.mjs`).
4. Decidir si se autoriza conectar de verdad el primer feed iCal (Booking
   o Airbnb) al importador ya construido, empezando por una sola unidad de
   prueba.

## 5. Que NO se hizo anoche (a proposito, por la regla de produccion
congelada)

- No se apago NOBEDS.
- No se toco Booking ni Airbnb real.
- No se envio ningun WhatsApp real.
- No se escribio nada en Odoo (ni staging ni produccion) por red.
- No se construyo la UI de Odoo del tablero de Angela (solo su contrato
  de datos).
- No se cableó el sitio hotelesatheron.com al gateway (solo quedo lista
  la capacidad para hacerlo).

## 6. Estado de la rama

```
Rama: night/ath-odoo-hotel-008-level1-20260929
Base: feature/ath-odoo-hotel-008a-live (sin merge, sin force-push)
```

Ver `AI/ATH-ODOO-HOTEL-008_NIGHT_RUN_REPORT.md` para el detalle completo
de archivos, tests y porcentaje de avance.
