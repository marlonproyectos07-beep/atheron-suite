#!/usr/bin/env bash
# ATH-STAGING-RECOVERY — extractor de SOLO LECTURA sobre una copia LOCAL del dump (sin Odoo).
# Uso:  PGDATABASE=old_staging_ro bash recovery/extract/extract.sh   (restaurado antes con psql < dump.sql)
# Genera AI/recovery-extract/*.json según recovery/EXTRACT-CONTRACT.md.
# ESTADO: NO PROBADO. INCOMPLETO: no produce los campos derivados del contrato (action_names, inherit_xmlid, parent_path_names...).
# ESTADO (detalle): NO PROBADO (no hay dump ni PostgreSQL servidor en la nube). Cada consulta usa to_jsonb(t) para no
# depender de nombres de columna; las uniones por tablas intermedias llevan "VERIFICAR" donde el nombre de la
# tabla de relación depende de la versión de Odoo: ejecutar primero discover.sql.
set -euo pipefail
: "${PGDATABASE:?define PGDATABASE (copia local)}"
OUT="$(cd "$(dirname "$0")/../../../.." && pwd)/AI/recovery-extract"
mkdir -p "$OUT"
q() { psql -X -q -At -v ON_ERROR_STOP=1 -c "SET default_transaction_read_only = on; $2" > "$OUT/$1"; }
BAD='password|secret|token|api_key|inbound|ical_url'
# Guardia: no exportar columnas sensibles
psql -X -q -At -c "select table_name||'.'||column_name from information_schema.columns where table_schema='public' and column_name ~* '$BAD' and table_name in ('x_hotel_ota_feed','ir_act_server','base_automation','ir_cron')" > /tmp/cols_sensibles.txt || true

q models.json "select coalesce(jsonb_agg(to_jsonb(t)),'[]') from ir_model t where model like 'x\_hotel\_%'"
q fields.json "select coalesce(jsonb_agg(to_jsonb(f)),'[]') from ir_model_fields f where f.state='manual' and (f.model like 'x\_hotel\_%' or (f.model in ('planning.slot','sale.order') and f.name like 'x\_%'))"
q selections.json "select coalesce(jsonb_agg(to_jsonb(s)||jsonb_build_object('field_model',f.model,'field_name',f.name)),'[]') from ir_model_fields_selection s join ir_model_fields f on f.id=s.field_id where f.state='manual' and (f.model like 'x\_hotel\_%' or (f.model in ('planning.slot','sale.order') and f.name like 'x\_%'))"
q server_actions.json "select coalesce(jsonb_agg(to_jsonb(a)||jsonb_build_object('model',m.model)),'[]') from ir_act_server a join ir_model m on m.id=a.model_id where (a.name->>'en_US' ~ '^(HOTEL|ATHERON|ROLLBACK COPY)' or a.name::text ~ 'HOTEL|ATHERON') and (m.model in ('planning.slot','sale.order','product.template') or m.model like 'x\_hotel\_%')"
# VERIFICAR: nombre de la tabla de relación automatización<->acción (base_automation_ir_actions_server_rel o similar). Ver discover.sql.
q automations.json "select coalesce(jsonb_agg(to_jsonb(b)||jsonb_build_object('model',m.model)),'[]') from base_automation b join ir_model m on m.id=b.model_id where m.model in ('planning.slot','sale.order') or m.model like 'x\_hotel\_%'"
q crons.json "select coalesce(jsonb_agg(to_jsonb(c)),'[]') from ir_cron c where c.cron_name::text ~ 'HOTEL|ATHERON'"
q views.json "select coalesce(jsonb_agg(to_jsonb(v)),'[]') from ir_ui_view v where v.model in ('sale.order','planning.slot') or v.model like 'x\_hotel\_%' and (v.arch_db ~ 'x_hotel|x_reservation|HOTEL' or v.model like 'x\_hotel\_%')"
q actions_window.json "select coalesce(jsonb_agg(to_jsonb(a)),'[]') from ir_act_window a where a.res_model like 'x\_hotel\_%' or a.name::text ~ 'Hotel v1'"
q menus.json "select coalesce(jsonb_agg(to_jsonb(m)),'[]') from ir_ui_menu m where m.name::text ~ 'Hotel'"
q filters.json "select coalesce(jsonb_agg(to_jsonb(f)),'[]') from ir_filters f where f.model_id in ('sale.order','planning.slot') or f.model_id like 'x\_hotel\_%'"
q groups.json "select coalesce(jsonb_agg(to_jsonb(g)),'[]') from res_groups g where g.name::text ~* 'hotel'"
q xmlids.json "select coalesce(jsonb_agg(to_jsonb(d)),'[]') from ir_model_data d where d.model in ('ir.model','ir.model.fields','ir.actions.server','base.automation','ir.ui.view','ir.ui.menu','ir.actions.act_window','ir.filters','ir.cron') and d.name ~* 'hotel|x_hotel'"
echo "Extracto en $OUT. Revisar a mano: sin PII, sin secretos. Faltan: ota_feeds.json (solo con autorización R8)."
