-- ATH-STAGING-RECOVERY — descubrimiento SOLO LECTURA sobre la copia local (antes de extract.sh).
-- 1) tablas de relación de automatizaciones
select table_name from information_schema.tables where table_schema='public' and (table_name like 'base_automation%' or table_name like '%ir_actions_server%rel%');
-- 2) columnas de las tablas clave (para confirmar nombres en esta versión)
select table_name, string_agg(column_name, ', ' order by ordinal_position) from information_schema.columns
 where table_schema='public' and table_name in ('base_automation','ir_act_server','ir_cron','ir_filters','ir_ui_view','ir_model_fields','ir_model_fields_selection') group by 1;
-- 3) modelos x_hotel_* realmente presentes
select model, state from ir_model where model like 'x\_hotel\_%' order by 1;
-- 4) versión del módulo base (confirma la versión de Odoo del dump)
select latest_version from ir_module_module where name='base';
