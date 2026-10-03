# Anticipo oficial 50 % — corrección en Odoo STAGING (NO ejecutada)

> Decisión CEO 2026-10-03: el anticipo oficial de reservas directas es **50 %**.
> Estado: **NO ejecutado desde esta sesión** — no hay credenciales ni sesión de
> Odoo STAGING en el entorno cloud. El agente ya usa 50 % por política
> (`src/policy.mjs`) y **marca** `ODOO_DEPOSIT_MISMATCH` si una cotización de
> Odoo exige otro porcentaje, pero **Odoo STAGING pudo seguir en 30 %**.

## Verificar (solo lectura, sin tocar nada)

```bash
cd integrations/whatsapp-shadow-agent
node scripts/check-deposit-policy-live.mjs   # lista los campos "anticipo" por propiedad/política
```

Evidencia previa del 30 % (HOTEL-009, Gate 009-A): propiedad **HOTEL ATHERON SUITE**,
campo *Anticipo mínimo por defecto (%)* = `30,00`; el piloto probó 30 % ($15.000 sobre $50.000).
Además existe el menú **Políticas de anticipo**: puede sobrescribir el de la propiedad.

## Corregir (solo STAGING, con sesión autorizada por Marlon)

1. Entrar a `atheron1-hotel-staging-20260923` (**nunca** `atheron1` = Production).
2. Hotel v1 (Piloto) → **Propiedades** → HOTEL ATHERON SUITE → *Anticipo mínimo por defecto (%)*: `30,00` → `50,00`. Guardar.
3. Hotel v1 (Piloto) → **Políticas de anticipo**: revisar si hay una política que fije 30 % y, si existe, ajustarla a 50 %. Repetir para CASA ALGARRA y CASA NEUSA solo si tienen valor propio.
4. **No tocar tarifas.** Solo el porcentaje.
5. Guardar captura/valor antes y después (evidencia).

## Verificar después

- `node scripts/check-deposit-policy-live.mjs` → `still_30_percent: false`.
- Una cotización/HOLD de prueba **TEST** en STAGING devuelve anticipo = 50 % del total (el agente no debe emitir `ODOO_DEPOSIT_MISMATCH`).

## Rollback

Volver el campo a `30,00` (valor previo registrado en el paso 5).

## Promoción a Production

Fuera de alcance. Requiere orden expresa de Marlon y repetir la verificación allí.
