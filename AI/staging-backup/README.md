# Respaldo real de Odoo STAGING (2026-09-30)

> Generado el mismo día que se detectó que la base expira en 7 días
> (banner real de Odoo: "Tu prueba gratis expirará en 7 días"). Todo lo
> de aquí es de **solo lectura contra Odoo** — nada se modificó, nada
> se borró. Base: `atheron1-hotel-staging-20260923`.

## Qué hay aquí

| Archivo | Contenido real | Cómo se generó |
|---|---|---|
| `odoo-studio-customizations-2026-09-30.zip` | Módulo Odoo instalable real (`studio_customization`), generado por el **exportador nativo de Studio** (Estudio → Exportar). Incluye `ir_model_fields.xml` (97 campos), `ir_ui_view.xml` (78 vistas, incluido el Kanban enriquecido de HOTEL-009), `ir_actions_act_window.xml`, `ir_default.xml`. | Botón real "Exportar" de Odoo Studio, vía navegador. |
| `base-automation.json` | 101 automatizaciones (nombre, modelo, disparador, activa). | XML-RPC `search_read`. |
| `ir-actions-server-hotel.json` | 81 acciones de servidor de los modelos hotel, **incluye el código Python real** de cada botón (`HOTEL v1 — CONFIRMAR/HOLD/CHECKIN/CHECKOUT/CANCELAR/...`). | XML-RPC `search_read`, campo `code`. |
| `ir-cron.json` | 5 cron activos, incluido "HOTEL v1 — Vencer HOLDs y liberar inventario" (cada 15 min). | XML-RPC. |
| `ir-filters-sale-order.json` | Los 2 filtros guardados sobre `sale.order` (incluye "Operación del día (sin canceladas)"). | XML-RPC. |
| `master-data-x_hotel_property.json` | 3 propiedades reales. | XML-RPC. |
| `master-data-x_hotel_unit.json` | 8 unidades reales (incluida la relación CASA COMPLETA ↔ habitaciones, vía sus propios campos). | XML-RPC. |
| `master-data-x_hotel_rate.json` / `..._rate_line.json` | 12 tarifas + 47 líneas de tarifa por ocupación. | XML-RPC. |
| `master-data-x_hotel_deposit_policy.json` | 2 políticas de anticipo. | XML-RPC. |
| `ir-model-fields-sale-order-custom.json` | Definición completa de los 97 campos `x_*` de `sale.order` (tipo, relación, selección, ayuda). | XML-RPC. |
| `ir-ui-view-sale-order-inherited.json` | Las 78 vistas heredadas de `sale.order`, **arch XML completo** (incluye el Kanban real de HOTEL-009, recuperable tal cual). | XML-RPC. |
| `ir-actions-act-window-hotel.json` | 34 acciones de ventana (menús) de los modelos hotel. | XML-RPC. |
| `ir-ui-menu-hotel.json` | 4 entradas de menú "Hotel". | XML-RPC. |

Generado con `integrations/odoo-hotel-gateway/scripts/respaldo-staging-completo.mjs`
(reproducible: se puede volver a correr mientras STAGING exista).

## Clasificación (pedida por el CEO)

- **REPRODUCIBLE_DESDE_REPO**: toda la lógica del Gateway/pipeline
  WhatsApp/IA (`integrations/odoo-hotel-gateway/src/`), ya está en el
  repo y no depende de STAGING para nada.
- **SOLO_ODOO_STAGING** (lo que este respaldo preserva): los 97 campos,
  78 vistas, 101 automatizaciones, 69 acciones de servidor, 5 cron, la
  master data de propiedades/unidades/tarifas/anticipo. Sin este
  respaldo, se perdía todo si la base expira.
- **EXPORTABLE** (y ya exportado aquí): todo lo de la tabla de arriba.
- **NO_EXPORTABLE / REQUIERE_RECONSTRUCCIÓN**:
  - El **enlace exacto automatización↔acción de servidor** no salió
    limpio por XML-RPC (el campo cambió de nombre en esta versión de
    Odoo) — se preserva cada lista por separado; reconstruir el enlace
    exacto requeriría revisar cada automatización una por una en Odoo
    antes de que expire, o volver a exportar con Studio.
  - El módulo `studio_customization` **depende de `web_studio`**
    (Enterprise) — solo se puede reinstalar en una base Odoo Enterprise
    con Studio habilitado, no en Community.
  - Los grupos/permisos: **hoy no existe ningún grupo de seguridad
    específico de hotel** (se usa el acceso general de Ventas) — no hay
    nada que respaldar ahí todavía; es un hallazgo, no un respaldo
    pendiente.
  - Reinstalar el módulo exportado en una base nueva probablemente
    requiere ajustar dependencias/IDs a mano — no es "un clic", es
    trabajo real de migración.

## Plan de preservación recomendado (no ejecutado, decisión CEO)

La opción de **cero pérdida y cero trabajo de reconstrucción** sigue
siendo registrar/pagar la suscripción sobre esta MISMA base antes de
que expire. Este respaldo es el plan B si esa opción no se toma a
tiempo — reduce el riesgo de "perder todo" a "reconstruir con estos
archivos como referencia exacta", pero no es un reemplazo de la base
viva.
