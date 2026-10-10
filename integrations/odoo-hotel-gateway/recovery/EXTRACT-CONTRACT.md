# Contrato de `AI/recovery-extract/` (lo que debe traer el dump)

Los scripts R1/R4/R7 **no inventan** nada: leen estos archivos. Si falta uno, o contiene la cadena `__PLACEHOLDER_DUMP__`, terminan con `BLOCKED` sin tocar Odoo.

**Campos derivados** (los marcados como lista de nombres, `*_xmlid`, `parent_path_names`, `action_ref`, `binding_model`, `model` técnico): `extract.sh` exporta las filas crudas y **todavía NO produce estos derivados**, porque dependen de tablas de relación cuyo nombre se confirma con `extract/discover.sql` sobre el dump real. Hasta entonces R4/R7 se detienen con `BLOCKED: falta campo derivado X`. Completarlos es la única pieza de extracción pendiente.

Se generan con `recovery/extract/extract.sh` contra una copia **local** del dump en PostgreSQL (solo lectura, sin Odoo). Cada archivo es un **arreglo JSON** de filas `to_jsonb(tabla)`, es decir, con las columnas reales de esa versión de Odoo (no se adivinan nombres de columna). Los textos traducibles (`name`, `field_description`) vienen como objeto `{"en_US": "...", "es_CO": "..."}`: los scripts usan `en_US` y, si no existe, el primer valor.

| Archivo | Tabla / filtro | Lo usa | Notas |
|---|---|---|---|
| `models.json` | `ir_model` donde `model LIKE 'x\_hotel\_%'` **o** `model = 'x_guests_line'` | R1 | `model`, `name`, `state='manual'`, `order`, `transient` |
| `fields.json` | `ir_model_fields` de esos modelos **más** los `x_*` manuales de `planning.slot`, `sale.order` y `account.payment` (el lector usa `account.payment.x_hotel_sale_order_id`) | R1 | `model`, `name`, `field_description`, `ttype`, `relation`, `relation_field`, `required`, `readonly`, `store`, `copied`, `index`, `size`, `translate`, `help`, `compute`, `depends`, `domain`, `on_delete`, `state='manual'` |
| `selections.json` | `ir_model_fields_selection` de esos campos | R1 | `field_id`→ se resuelve a `(model,name)` en el extractor; columnas `value`, `name`, `sequence` |
| `server_actions.json` | `ir_act_server` cuyo `model_id` ∈ {planning.slot, sale.order, x_hotel_*, product.template} y nombre ∈ {`HOTEL%`, `ATHERON%`, `ROLLBACK COPY%`} | R4 | `name`, `model` (nombre técnico), `state`, `code`, `binding_type`, `binding_model` (nombre técnico o null) |
| `automations.json` | `base_automation` de esos modelos | R4 | `name`, `model` (técnico), `trigger`, `active`, `filter_domain`, `filter_pre_domain`, `trigger_field_names` (lista de nombres), `action_names` (lista de nombres de acciones enlazadas, en orden), `on_change_field_names` |
| `crons.json` | `ir_cron` con nombre `HOTEL%` o `ATHERON%` | R4 | `cron_name`, `action_name` (acción de servidor), `interval_number`, `interval_type`, `active`. **No** `lastcall`/`nextcall` |
| `views.json` | `ir_ui_view` con `model` ∈ {sale.order, planning.slot, x_hotel_*} y (`arch_db` ~ `x_hotel\|x_reservation\|HOTEL`) | R7 | `name`, `model`, `type`, `mode`, `priority`, `active`, `arch_db`, `inherit_xmlid` (XMLID de la vista padre) |
| `actions_window.json` | `ir_act_window` de modelos hotel | R7 | `name`, `res_model`, `view_mode`, `domain`, `context`, `search_view_xmlid`, `view_ids` (lista de `{view_mode, view_name}`) |
| `menus.json` | `ir_ui_menu` con `name` ∈ {Hotel, Hotel v1 (Piloto), Reservas hotel, …} y descendientes | R7 | `name`, `parent_path_names` (lista de nombres, de raíz a padre), `sequence`, `action_ref` (`{type, name}`), `groups_names` |
| `filters.json` | `ir_filters` de sale.order / planning.slot / x_hotel_* | R7 | `name`, `model_id`, `domain`, `context`, `sort`, `is_default`, `action_name`, `user_ids=[]` |
| `groups.json` | `res_groups` + `ir_model_access` + `ir_rule` con nombre `%hotel%` | R6 | hoy el respaldo dice que **no existen**; si el dump lo confirma, el archivo es `[]` y eso es un resultado válido |
| `xmlids.json` | `ir_model_data` de todo lo anterior | todos | `module`, `name`, `model`, `res_name` — para preferir XMLID sobre nombre |
| `ota_feeds.json` | `x_hotel_ota_feed` **sin** columnas que contengan `inbound`, `secret`, `token`, `url`, `key` | R8 (fuera de alcance) | solo estructura |

**Exclusiones obligatorias:** ningún archivo contiene `res_partner`, `account_payment`, `ir_attachment`, `res_users.password`, claves API, `ir_config_parameter`, ni referencias iCal/inbound. El extractor falla si una columna coincide con `password|secret|token|api_key|inbound|ical_url`.
