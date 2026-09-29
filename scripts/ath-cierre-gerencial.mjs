import fs from 'node:fs/promises';
import path from 'node:path';
import { HttpOdooTransport } from '../integrations/odoo-hotel-gateway/src/odoo-transport.mjs';
import { ReadonlyOdooClient, safeFieldList } from '../integrations/odoo-hotel-gateway/src/readonly-odoo.mjs';

const PENDING = 'PENDIENTE_DE_VERIFICAR';

function parseArgs(argv) {
  const out = {};
  for (const item of argv) {
    if (!item.startsWith('--')) continue;
    const parts = item.slice(2).split('=');
    out[parts.shift()] = parts.join('=') || true;
  }
  return out;
}

function validateDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) throw new Error('DATE_REQUIRED_YYYY_MM_DD');
  return value;
}

function nextDate(date) {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function uniqById(rows) {
  const map = new Map();
  for (const row of rows || []) map.set(row.id ?? JSON.stringify(row), row);
  return [...map.values()];
}

function sum(rows, field) {
  return (rows || []).reduce((acc, row) => {
    const value = Number(row?.[field]);
    return acc + (Number.isFinite(value) ? value : 0);
  }, 0);
}

async function readModel(client, model, domain, candidates, options = {}) {
  try {
    const fieldMap = await client.fields(model);
    const fields = safeFieldList(fieldMap, candidates);
    const rows = await client.searchRead(model, domain, fields, options);
    return { model, status: 'OK', fields, rows };
  } catch (error) {
    return {
      model,
      status: 'QUERY_BLOCKED',
      error: error?.message || String(error),
      fields: [],
      rows: [],
    };
  }
}

function markdown(report) {
  const s = report.summary;
  const lines = [
    '# ATH Cierre Gerencial — ' + report.date,
    '',
    'Estado: **' + report.status + '**',
    '',
    '## Resumen',
    '',
    '- Ventas: ' + s.ventas,
    '- Facturado: ' + s.facturado,
    '- Cobrado: ' + s.cobrado,
    '- Pendiente por cobrar: ' + s.pendiente,
    '- Movimientos bancarios sin conciliar: ' + s.movimientos_sin_conciliar,
    '',
    '## Evidencia recuperada',
    '',
  ];
  for (const [name, block] of Object.entries(report.evidence || {})) {
    lines.push('### ' + name, '', 'Estado: ' + block.status, 'Registros: ' + (block.rows?.length ?? 0));
    if (block.error) lines.push('Error: ' + block.error);
    lines.push('');
  }
  lines.push('## Notas', '');
  for (const note of report.notes || []) lines.push('- ' + note);
  return lines.join('\n') + '\n';
}

async function writeBlocked(outputDir, date, missing) {
  const result = {
    task_id: 'ATH-ODOO-HOTEL-008-F1',
    status: 'AUTH_BLOCKED',
    date,
    missing_secret_names_only: missing,
    note: 'No network call was attempted. Inject credentials from a secure local store; never paste them into chat or Git.',
  };
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(path.join(outputDir, 'ATH_CIERRE_GERENCIAL_' + date + '.json'), JSON.stringify(result, null, 2) + '\n');
  await fs.writeFile(
    path.join(outputDir, 'ATH_CIERRE_GERENCIAL_' + date + '.md'),
    '# ATH Cierre Gerencial — ' + date + '\n\nEstado: **AUTH_BLOCKED**\n\nNo se intentó ninguna conexión. Faltan: ' + missing.join(', ') + '.\n',
  );
  console.log(JSON.stringify(result));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const date = validateDate(String(args.date || process.env.ATH_CLOSE_DATE || ''));
  const refs = String(args.refs || process.env.ATH_CLOSE_REFS || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
  const outputDir = path.resolve(String(args.out || process.env.ATH_CLOSE_OUTPUT_DIR || 'tmp/ath-odoo-hotel'));

  const required = ['ODOO_BASE_URL', 'ODOO_DATABASE', 'ODOO_TECHNICAL_USER', 'ODOO_TECHNICAL_SECRET'];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length) {
    await writeBlocked(outputDir, date, missing);
    process.exitCode = 2;
    return;
  }

  const transport = new HttpOdooTransport({ baseUrl: process.env.ODOO_BASE_URL });
  const client = new ReadonlyOdooClient({
    transport,
    database: process.env.ODOO_DATABASE,
    user: process.env.ODOO_TECHNICAL_USER,
    secret: process.env.ODOO_TECHNICAL_SECRET,
  });
  await client.login();

  const next = nextDate(date);
  const dayStart = date + ' 00:00:00';
  const nextStart = next + ' 00:00:00';
  const evidence = {};

  evidence.planning = await readModel(
    client,
    'planning.slot',
    [['start_datetime', '<', nextStart], ['end_datetime', '>=', dayStart]],
    ['id','name','start_datetime','end_datetime','resource_id','role_id','employee_id','partner_id','sale_line_id','state','x_studio_estado','x_studio_cliente','x_studio_canal','x_studio_referencia','x_studio_personas'],
    { order: 'start_datetime asc' },
  );

  const saleFields = ['id','name','date_order','partner_id','state','amount_untaxed','amount_tax','amount_total','invoice_status','invoice_ids','client_order_ref','origin','note','user_id','team_id'];
  const salesByDay = await readModel(
    client,
    'sale.order',
    [['date_order','>=',dayStart],['date_order','<',nextStart]],
    saleFields,
    { order: 'date_order asc' },
  );
  let salesByRefs = { model: 'sale.order', status: 'OK', fields: salesByDay.fields, rows: [] };
  if (refs.length) {
    salesByRefs = await readModel(client, 'sale.order', [['name','in',refs]], saleFields, { order: 'name asc' });
  }
  evidence.sales = {
    ...salesByDay,
    rows: uniqById([...(salesByDay.rows || []), ...(salesByRefs.rows || [])]),
    refs_requested: refs,
  };

  const orderIds = evidence.sales.rows.map((row) => row.id).filter(Boolean);
  evidence.sale_lines = orderIds.length
    ? await readModel(
        client,
        'sale.order.line',
        [['order_id','in',orderIds]],
        ['id','order_id','product_id','name','product_uom_qty','price_unit','discount','price_subtotal','price_tax','price_total'],
        { order: 'order_id asc,id asc' },
      )
    : { model: 'sale.order.line', status: 'SKIPPED_NO_ORDERS', fields: [], rows: [] };

  const invoiceDomain = refs.length
    ? ['|', ['invoice_date','=',date], ['invoice_origin','in',refs]]
    : [['invoice_date','=',date]];
  evidence.invoices = await readModel(
    client,
    'account.move',
    invoiceDomain,
    ['id','name','move_type','state','invoice_date','date','partner_id','invoice_origin','payment_reference','amount_untaxed','amount_tax','amount_total','amount_residual','payment_state','journal_id','currency_id'],
    { order: 'date asc,id asc' },
  );

  evidence.payments = await readModel(
    client,
    'account.payment',
    [['date','=',date]],
    ['id','name','date','partner_id','amount','currency_id','state','journal_id','payment_type','partner_type','ref','is_reconciled'],
    { order: 'date asc,id asc' },
  );

  evidence.bank = await readModel(
    client,
    'account.bank.statement.line',
    [['date','=',date]],
    ['id','date','name','payment_ref','partner_id','amount','currency_id','journal_id','is_reconciled','move_id'],
    { order: 'date asc,id asc' },
  );

  evidence.journals = await readModel(
    client,
    'account.journal',
    [],
    ['id','name','code','type','active','currency_id'],
    { limit: 200, order: 'id asc' },
  );

  evidence.resources = await readModel(
    client,
    'resource.resource',
    [],
    ['id','name','active','resource_type','calendar_id','company_id'],
    { limit: 300, order: 'name asc' },
  );

  const linkedSales = refs.length ? evidence.sales.rows.filter((row) => refs.includes(row.name)) : [];
  const invoiceRows = (evidence.invoices.rows || []).filter(
    (row) => ['out_invoice','out_refund'].includes(row.move_type) && row.state === 'posted',
  );
  const linkedInvoices = refs.length ? invoiceRows.filter((row) => refs.includes(row.invoice_origin)) : [];

  const report = {
    task_id: 'ATH-ODOO-HOTEL-008-F1',
    status: 'READ_ONLY_EVIDENCE_COLLECTED',
    generated_at: new Date().toISOString(),
    date,
    database: process.env.ODOO_DATABASE,
    refs_requested: refs,
    summary: {
      ventas: linkedSales.length ? sum(linkedSales, 'amount_total') : PENDING,
      facturado: linkedInvoices.length ? sum(linkedInvoices, 'amount_total') : PENDING,
      cobrado:
        linkedInvoices.length && linkedInvoices.every((row) => Number.isFinite(Number(row.amount_residual)))
          ? sum(linkedInvoices, 'amount_total') - sum(linkedInvoices, 'amount_residual')
          : PENDING,
      pendiente: linkedInvoices.length ? sum(linkedInvoices, 'amount_residual') : PENDING,
      movimientos_sin_conciliar:
        evidence.bank.status === 'OK'
          ? evidence.bank.rows.filter((row) => row.is_reconciled === false).length
          : PENDING,
    },
    evidence,
    notes: [
      'VENTA, COBRO, MOVIMIENTO BANCARIO y CONCILIACION se mantienen separados.',
      'Los totales solo se calculan para referencias explicitamente solicitadas y relaciones verificables.',
      'Si Odoo no expone un filtro fiable de hotel, el agregado global permanece PENDIENTE_DE_VERIFICAR.',
      'No se realizaron create/write/unlink/reconcile/action_post ni ninguna otra mutacion.',
    ],
  };

  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(path.join(outputDir, 'ATH_CIERRE_GERENCIAL_' + date + '.json'), JSON.stringify(report, null, 2) + '\n');
  await fs.writeFile(path.join(outputDir, 'ATH_CIERRE_GERENCIAL_' + date + '.md'), markdown(report));
  console.log(JSON.stringify({ status: report.status, summary: report.summary, outputDir }));
}

main().catch((error) => {
  console.error(JSON.stringify({ status: 'FAIL', error: error?.message || String(error) }));
  process.exitCode = 1;
});
