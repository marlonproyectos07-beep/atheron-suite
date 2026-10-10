#!/usr/bin/env node
// ATH-STAGING-RECOVERY — R0: preflight SOLO LECTURA sobre el staging NUEVO.
// El ejecutor está limitado por lista blanca a métodos de lectura; ni con --apply puede escribir.
// Informa qué existe ya (posible trabajo previo de Codex) ANTES de cualquier escritura.
// Uso (cuando Marlon lo autorice; variables puestas por él, fuera del chat):
//   RECOVERY_TARGET_DB=atheron1-hotel-staging-20261009 ODOO_BASE_URL=https://atheron1-hotel-staging-20261009.odoo.com \
//   ODOO_TECHNICAL_USER=... ODOO_TECHNICAL_SECRET=... node recovery/r0-preflight-readonly.mjs
import { HttpOdooTransport } from '../src/odoo-transport.mjs';
import { loadRecoveryConfig, makeExecutor, readBackup, main, READ_CTX } from './recovery-lib.mjs';

main(async () => {
  const cfg = loadRecoveryConfig();
  const t = new HttpOdooTransport({ baseUrl: cfg.baseUrl });
  const uid = await t.call('common', 'login', [cfg.db, cfg.user, cfg.secret]);
  const ex = makeExecutor(t, cfg, uid, { write: false }); // jamás write
  const out = { database: cfg.db };
  const sr = (model, domain, fields, extra = {}) => ex(model, 'search_read', [domain], { fields, context: READ_CTX, ...extra });
  const names = async (model, list) => (await sr(model, [['name', 'in', list]], ['name'])).map((r) => r.name);

  const v = await t.call('common', 'version', []).catch(() => null);
  out.odoo_version = v ? { server_version: v.server_version } : 'NO_DISPONIBLE';
  out.modules = await sr('ir.module.module', [['name', 'in', ['sale_renting', 'planning', 'web_studio', 'sale_management', 'project', 'base_automation', 'hr']]], ['name', 'state']);

  const WANT_MODELS = ['x_hotel_property', 'x_hotel_unit', 'x_hotel_rate', 'x_hotel_rate_line', 'x_hotel_deposit_policy', 'x_hotel_quote', 'x_hotel_ota_feed', 'x_hotel_api_log'];
  const present = (await sr('ir.model', [['model', 'in', WANT_MODELS]], ['model'])).map((m) => m.model);
  out.hotel_models = { present, missing: WANT_MODELS.filter((m) => !present.includes(m)) };

  const soFields = readBackup('ir-model-fields-sale-order-custom.json').map((f) => f.name);
  const have = new Set((await sr('ir.model.fields', [['model', '=', 'sale.order'], ['name', 'in', soFields]], ['name'])).map((f) => f.name));
  out.sale_order_fields = { expected: soFields.length, present: have.size, missing: soFields.filter((n) => !have.has(n)) };

  // Los campos de planning.slot que usan los scripts del repo (nombres tomados del código, no de una definición).
  const slotNeeded = ['x_hotel_block_kind', 'x_channel', 'x_bloqueo_ref', 'x_bloqueo_src_id', 'x_hotel_is_test'];
  const slotHave = (await sr('ir.model.fields', [['model', '=', 'planning.slot'], ['name', 'in', slotNeeded]], ['name'])).map((f) => f.name);
  out.planning_slot_fields = { present: slotHave, missing: slotNeeded.filter((n) => !slotHave.includes(n)) };

  if (present.includes('x_hotel_unit')) out.units = await sr('x_hotel_unit', [], ['x_name', 'x_unit_type', 'x_active']);
  if (present.includes('x_hotel_property')) out.properties = (await sr('x_hotel_property', [], ['x_name'])).map((p) => p.x_name);

  const autos = readBackup('base-automation.json').filter((a) => /HOTEL v1|ATHERON - Casa|Habitacion bloquea|Anti-doble/.test(a.name)).map((a) => a.name);
  const fa = await names('base.automation', autos);
  out.automations = { expected: autos.length, present: fa.length, missing: autos.filter((n) => !fa.includes(n)) };
  const acts = readBackup('ir-actions-server-hotel.json').filter((a) => a.name.startsWith('HOTEL v1')).map((a) => a.name);
  const fs = await names('ir.actions.server', acts);
  out.server_actions = { expected: acts.length, present: fs.length, missing: acts.filter((n) => !fs.includes(n)) };
  out.menus = await names('ir.ui.menu', ['Hotel v1 (Piloto)', 'Reservas hotel']);
  out.filters = await names('ir.filters', ['Operación del día (sin canceladas)']);
  out.cron_hold = await names('ir.cron', ['HOTEL v1 — Vencer HOLDs y liberar inventario (STAGING)']);
  out.planning = {
    roles: (await sr('planning.role', [], ['name'])).map((r) => r.name),
    resources_magia_casa: (await sr('resource.resource', [], ['name'])).map((r) => r.name).filter((n) => /magia|casa/i.test(n)),
  };
  // Sin PII: no se leen partners, reservas ni pagos.
  console.log(JSON.stringify(out, null, 2));
});
