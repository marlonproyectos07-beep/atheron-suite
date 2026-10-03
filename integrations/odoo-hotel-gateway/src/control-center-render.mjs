/**
 * ATH-ODOO-HOTEL-012 V2 -- informe HTML del Control Center (estatico, sin
 * dependencias, sin red). NO es un frontend paralelo ni un PMS aparte: es
 * la representacion del MISMO contrato `buildControlCenter()` que la
 * vista de Odoo debe seguir, util para revisar el diseno, para el
 * informe local de gerencia y como evidencia reproducible. Nunca se
 * publica un informe con huespedes reales: los telefonos ya vienen
 * enmascarados desde el modelo.
 *
 * Estados siempre con TEXTO ademas de color (accesibilidad).
 */

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const cop = (n) => (n == null ? '—' : `$${Math.round(n).toLocaleString('es-CO')}`);
const pctTxt = (n) => (n == null ? '—' : `${n}%`);
const dash = (v) => (v == null || v === '' ? '—' : esc(v));

const STATE_LABEL = {
  DISPONIBLE: 'Disponible',
  RESERVADO: 'Reservado',
  OCUPADO: 'Ocupado',
  HOLD: 'HOLD',
  BLOQUEADO: 'Bloqueado',
  ASEO_PENDIENTE: 'Aseo pendiente',
  LISTO: 'Listo',
  FUERA_DE_SERVICIO: 'Fuera de servicio',
};

const CSS = `
:root{--bg:#f6f4ef;--surface:#fff;--ink:#1d2330;--muted:#5f6675;--line:#e3dfd5;--brand:#23463d;--ok:#1f7a4d;--ok-bg:#e3f4ea;--info:#1f5fa8;--info-bg:#e4effb;--busy:#a8321f;--busy-bg:#fbe7e3;--hold:#8a5a00;--hold-bg:#fdf1d6;--block:#4a4f5c;--block-bg:#e8e9ee;--clean:#7a3f9d;--clean-bg:#f1e6f8;--ready:#0e7a78;--ready-bg:#dcf3f2;--oos:#6b6b6b;--oos-bg:#ececec;--alta:#b3261e;--media:#9a6a00;--baja:#4a4f5c}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#12161d;--surface:#1b212b;--ink:#eceff4;--muted:#a3abba;--line:#2c3441;--brand:#7fcbb4;--ok:#6fd49a;--ok-bg:#16301f;--info:#7db4f0;--info-bg:#15283d;--busy:#f08b7b;--busy-bg:#3a1c17;--hold:#f0c260;--hold-bg:#382c10;--block:#b7bccb;--block-bg:#262b36;--clean:#d3a6ee;--clean-bg:#2d1d3a;--ready:#6fdcd9;--ready-bg:#123332;--oos:#b0b0b0;--oos-bg:#2a2a2a;--alta:#ff8f86;--media:#f0c260;--baja:#b7bccb}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.wrap{max-width:1240px;margin:0 auto;padding:20px 16px 56px}
header.top{display:flex;flex-wrap:wrap;justify-content:space-between;gap:12px;align-items:flex-end;margin-bottom:16px}
h1{font-size:22px;margin:0;color:var(--brand);letter-spacing:.2px}h2{font-size:15px;margin:0 0 10px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}
.sub{color:var(--muted);font-size:13px}
.chips{display:flex;flex-wrap:wrap;gap:6px}.chip{border:1px solid var(--line);background:var(--surface);border-radius:999px;padding:3px 10px;font-size:12px;color:var(--muted)}.chip.on{background:var(--brand);color:var(--bg);border-color:var(--brand)}
.card{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:16px;margin-bottom:14px}
.strip{display:grid;grid-template-columns:repeat(auto-fit,minmax(118px,1fr));gap:10px;margin-bottom:14px}
.tile{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:10px 12px;border-left:5px solid var(--line)}
.tile b{display:block;font-size:26px;line-height:1.1}.tile span{font-size:12px;color:var(--muted)}
.t-ok{border-left-color:var(--ok)}.t-info{border-left-color:var(--info)}.t-busy{border-left-color:var(--busy)}.t-hold{border-left-color:var(--hold)}.t-block{border-left-color:var(--block)}.t-clean{border-left-color:var(--clean)}.t-ready{border-left-color:var(--ready)}
.grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:14px}
.units{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:10px}
.unit{border:1px solid var(--line);border-radius:12px;padding:10px 12px;background:var(--surface);border-top:5px solid var(--line);font-size:13px}
.unit h3{margin:0 0 2px;font-size:16px;display:flex;justify-content:space-between;gap:8px}.unit .st{font-size:11px;font-weight:700;padding:2px 8px;border-radius:999px;white-space:nowrap;align-self:flex-start}.unit h3 span:first-child{min-width:0;overflow-wrap:anywhere}.tile.money b{font-size:19px}
.unit dl{margin:6px 0 0;display:grid;grid-template-columns:auto 1fr;gap:1px 8px}.unit dt{color:var(--muted)}.unit dd{margin:0;text-align:right}
.s-DISPONIBLE{border-top-color:var(--ok)}.s-DISPONIBLE .st{background:var(--ok-bg);color:var(--ok)}
.s-RESERVADO{border-top-color:var(--info)}.s-RESERVADO .st{background:var(--info-bg);color:var(--info)}
.s-OCUPADO{border-top-color:var(--busy)}.s-OCUPADO .st{background:var(--busy-bg);color:var(--busy)}
.s-HOLD{border-top-color:var(--hold)}.s-HOLD .st{background:var(--hold-bg);color:var(--hold)}
.s-BLOQUEADO{border-top-color:var(--block)}.s-BLOQUEADO .st{background:var(--block-bg);color:var(--block)}
.s-ASEO_PENDIENTE{border-top-color:var(--clean)}.s-ASEO_PENDIENTE .st{background:var(--clean-bg);color:var(--clean)}
.s-LISTO{border-top-color:var(--ready)}.s-LISTO .st{background:var(--ready-bg);color:var(--ready)}
.s-FUERA_DE_SERVICIO{border-top-color:var(--oos)}.s-FUERA_DE_SERVICIO .st{background:var(--oos-bg);color:var(--oos)}
.legend{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px;font-size:12px}.legend i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:4px;vertical-align:-1px}
table{width:100%;border-collapse:collapse;font-size:13px}th,td{padding:6px 8px;border-bottom:1px solid var(--line);text-align:left}th{color:var(--muted);font-weight:600;font-size:12px}td.n,th.n{text-align:right;font-variant-numeric:tabular-nums}
.bar{height:8px;background:var(--line);border-radius:4px;overflow:hidden}.bar>i{display:block;height:100%;background:var(--brand)}
.alert{display:flex;gap:10px;padding:7px 10px;border-radius:8px;border:1px solid var(--line);margin-bottom:6px;font-size:13px;align-items:baseline}.alert b{font-size:11px;min-width:54px}.a-ALTA b{color:var(--alta)}.a-MEDIA b{color:var(--media)}.a-BAJA b{color:var(--baja)}
.warn{border-left:5px solid var(--hold);background:var(--hold-bg);padding:10px 12px;border-radius:8px;font-size:13px;margin-top:8px}
.nr{border:2px dashed var(--line);border-radius:12px;padding:12px;font-size:13px;color:var(--muted)}.nr b{color:var(--ink)}
.flow{display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-size:12px;margin-bottom:10px}.flow span{padding:3px 10px;border-radius:999px;border:1px solid var(--line)}.flow em{color:var(--muted);font-style:normal}
.spark{display:flex;gap:3px;align-items:flex-end;height:70px}.spark div{flex:1;background:var(--info);border-radius:3px 3px 0 0;min-height:2px;position:relative}.spark div.valle{background:var(--busy)}.spark div.nodata{background:var(--line)}
.big{font-size:34px;font-weight:700;line-height:1}.demo{background:var(--busy-bg);color:var(--busy);border:2px solid var(--busy);padding:8px 12px;border-radius:10px;font-weight:700;margin-bottom:14px}
details{margin-top:6px}summary{cursor:pointer;color:var(--muted);font-size:13px}code{font-size:12px}
@media (max-width:560px){h1{font-size:19px}.tile b{font-size:22px}}
`;

function tile(cls, value, label) {
  return `<div class="tile ${cls}"><b>${value == null ? '—' : esc(value)}</b><span>${esc(label)}</span></div>`;
}

function unitCard(u) {
  const dl = [
    ['Capacidad', u.capacity != null ? `${u.capacity} pers.` : 'sin dato'],
    ['Huésped', u.guest ? `${u.guest}` : null],
    ['Referencia', u.reference],
    ['Canal', u.channel],
    ['Check-in', u.checkin],
    ['Check-out', u.checkout],
    ['Personas', u.guests],
    ['Valor', u.total != null ? cop(u.total) : null],
    ['Pago', u.payment_status ? `${u.payment_status}${u.balance ? ` · saldo ${cop(u.balance)}` : ''}` : null],
    ['Bloqueada por', u.blocked_by ? `${u.blocked_by.unit} · ${u.blocked_by.reference}` : null],
    ['Aseo', u.state === 'OCUPADO' ? null : u.housekeeping?.label],
    ['Responsable', u.state === 'OCUPADO' ? null : u.housekeeping?.assignee],
  ].filter(([, v]) => v !== null && v !== undefined && v !== '');
  const flags = [u.sale_hoy ? 'SALE HOY' : null, u.llega_hoy ? 'LLEGA HOY' : null, u.via === 'CASA_COMPLETA' ? 'vía CASA COMPLETA' : null, u.via === 'HABITACION' ? 'por habitación tomada' : null].filter(Boolean);
  const next = !u.reference && u.next_arrival ? `<div class="sub">Próx.: ${esc(u.next_arrival.date)} · ${esc(u.next_arrival.status)}</div>` : '';
  return `<article class="unit s-${esc(u.display_state)}"><h3><span>${esc(u.label)}</span><span class="st">${esc(STATE_LABEL[u.display_state] ?? u.display_state)}</span></h3>
<div class="sub">${esc(u.property)}${flags.length ? ` · <b>${esc(flags.join(' · '))}</b>` : ''}</div>${next}
<dl>${dl.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl></article>`;
}

function list(rows, empty) {
  if (!rows.length) return `<p class="sub">${esc(empty)}</p>`;
  return `<table><thead><tr><th>Unidad</th><th>Ref.</th><th>Canal</th><th class="n">Pers.</th><th>Pago</th><th class="n">Saldo</th></tr></thead><tbody>${rows
    .map((r) => `<tr><td>${esc(r.unit)}</td><td>${esc(r.reference)}</td><td>${esc(r.channel)}</td><td class="n">${dash(r.guests)}</td><td>${dash(r.payment_status)}</td><td class="n">${r.balance ? cop(r.balance) : '—'}</td></tr>`)
    .join('')}</tbody></table>`;
}

export function renderControlCenterHtml(cc, { title = 'Atheron Hotel Control Center', demo = false } = {}) {
  const h = cc.headline;
  const inv = cc.inventory;
  const f = cc.finance;
  const k = cc.horizon_kpis;
  const ri = cc.revenue_intelligence;
  const hk = cc.housekeeping;
  const filters = Object.entries(cc.meta.filters || {}).filter(([, v]) => v && (!Array.isArray(v) || v.length));

  const properties = [...new Set(cc.units.map((u) => u.property))];
  const unitsHtml = properties
    .map((p) => `<h2 style="margin-top:12px">${esc(p)}</h2><div class="units">${cc.units.filter((u) => u.property === p).map(unitCard).join('')}</div>`)
    .join('') || '<p class="sub">Ninguna unidad coincide con los filtros.</p>';

  const maxCh = Math.max(1, ...cc.channels.map((c) => c.ingresos));
  const channelsHtml = cc.channels.length
    ? `<table><thead><tr><th>Canal</th><th class="n">Reservas</th><th class="n">Noches</th><th class="n">Ingresos</th><th style="width:22%"></th></tr></thead><tbody>${cc.channels
        .map((c) => `<tr><td>${esc(c.channel)}</td><td class="n">${c.reservas}</td><td class="n">${c.noches}</td><td class="n">${cop(c.ingresos)} <span class="sub">${pctTxt(c.pct_ingresos)}</span></td><td><div class="bar"><i style="width:${Math.round((c.ingresos / maxCh) * 100)}%"></i></div></td></tr>`)
        .join('')}</tbody></table>`
    : '<p class="sub">Sin reservas vendidas con estancia en el periodo.</p>';

  const alertsHtml = cc.alerts.length
    ? cc.alerts.slice(0, 30).map((a) => `<div class="alert a-${esc(a.severity)}"><b>${esc(a.severity)}</b><span>${esc(a.message)}</span></div>`).join('') + (cc.alerts.length > 30 ? `<p class="sub">+${cc.alerts.length - 30} más</p>` : '')
    : '<p class="sub">Sin alertas con la información disponible.</p>';

  const maxVend = Math.max(1, ...ri.proximos_30_dias.map((d) => d.vendidas), inv.vendibles);
  const spark = ri.proximos_30_dias
    .map((d) => `<div class="${d.dia_valle ? 'valle' : d.dia_valle === null ? 'nodata' : ''}" style="height:${Math.max(4, Math.round((d.vendidas / maxVend) * 100))}%" title="${esc(d.date)} ${esc(d.weekday)}: ${d.vendidas} vendidas${d.esperada_pct != null ? `, esperado ${d.esperada_pct}%` : ''}"></div>`)
    .join('');
  const weekday = ri.por_dia_semana
    .map((w) => `<tr><td>${esc(w.label)}</td><td class="n">${w.dias}</td><td class="n">${pctTxt(w.ocupacion_pct)}</td><td class="n">${cop(w.adr)}</td></tr>`)
    .join('');
  const costs = ri.costos_requeridos.map((c) => `<li>${c.disponible ? '✓' : '✗'} ${esc(c.label)}</li>`).join('');

  const saldos = f.saldos;
  const gaps = cc.data_gaps.map((g) => `<li><code>${esc(g.code)}</code> — ${esc(g.detail)}</li>`).join('');
  const kpiDefs = cc.kpi_definitions
    .map((d) => `<tr><td><b>${esc(d.label)}</b></td><td>${esc(d.source)}</td><td>${esc(d.domain)}</td><td>${esc(d.formula)}</td><td>${esc(d.validation)}</td></tr>`)
    .join('');
  const checks = cc.validation.checks.map((c) => `<li>${c.ok ? '✓' : '✗'} <code>${esc(c.id)}</code> — ${esc(c.detail)}</li>`).join('');

  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${CSS}</style></head><body><div class="wrap">
${demo ? '<div class="demo">DATOS FICTICIOS DE DEMOSTRACIÓN — no son reservas ni huéspedes reales. Sirve solo para revisar el diseño.</div>' : ''}
<header class="top"><div><h1>${esc(title)}</h1><div class="sub">Hoy ${esc(cc.meta.reference_date)} · Periodo ${esc(cc.meta.horizon.from)} → ${esc(cc.meta.horizon.to)} (${cc.meta.horizon.days} d) · solo lectura · Odoo STAGING</div></div>
<div class="chips">${['HOY', 'MANANA', '7_DIAS', 'MES_ACTUAL', 'RANGO'].map((p) => `<span class="chip ${cc.meta.horizon.preset === p ? 'on' : ''}">${esc(p.replace('_', ' '))}</span>`).join('')}${filters.map(([key, v]) => `<span class="chip on">${esc(key)}: ${esc(Array.isArray(v) ? v.join(',') : v)}</span>`).join('')}</div></header>

<section class="strip" aria-label="Resumen de 5 segundos">
${tile('t-ok', h.disponibles, 'Disponibles')}${tile('t-info', h.vendido, 'Vendido (reservado)')}${tile('t-busy', h.ocupado, 'Ocupado')}${tile('t-block', h.bloqueado, 'Bloqueado')}${tile('t-hold', h.hold, 'En HOLD')}
${tile('t-info', h.llegan_hoy, 'Entran hoy')}${tile('t-busy', h.salen_hoy, 'Salen hoy')}${tile('t-clean', h.requieren_aseo, 'Requieren aseo')}${tile('t-ready', h.listas, 'Listas')}
${tile('money', cop(h.vendido_periodo), 'Vendido (periodo)')}${tile('money', h.cobrado != null ? cop(h.cobrado) : 'sin dato', 'Cobrado (fecha real)')}${tile('', pctTxt(h.ocupacion_unidades_pct), 'Ocupación unidades')}${tile('', pctTxt(h.ocupacion_personas_pct), 'Ocupación personas')}${tile(h.alertas ? 't-busy' : 't-ok', h.alertas, 'Atención')}
</section>

<section class="card"><h2>Qué requiere atención</h2>${alertsHtml}</section>

<section class="card"><h2>Inventario de hoy</h2>
<div class="legend">${Object.entries(STATE_LABEL).map(([s, l]) => `<span><i style="background:var(--${{ DISPONIBLE: 'ok', RESERVADO: 'info', OCUPADO: 'busy', HOLD: 'hold', BLOQUEADO: 'block', ASEO_PENDIENTE: 'clean', LISTO: 'ready', FUERA_DE_SERVICIO: 'oos' }[s]})"></i>${esc(l)}</span>`).join('')}</div>
${unitsHtml}
<p class="sub">CASA COMPLETA ↔ habitaciones: son el mismo inventario. Si la casa está vendida, sus 5 habitaciones aparecen con su estado; si una habitación está tomada, la casa aparece bloqueada. Bloqueado ≠ ocupado · HOLD ≠ vendido · reserva ≠ pago.</p></section>

<div class="grid2">
<section class="card"><h2>Ocupación hoy</h2>
<div class="big">${pctTxt(cc.occupancy.rooms.pct)}</div><div class="sub">Unidades: ${cc.occupancy.rooms.ocupadas} ocupadas / ${cc.occupancy.rooms.vendibles} vendibles · vendida (con reservadas) ${pctTxt(cc.occupancy.rooms.vendida_pct)}</div>
<div class="big" style="margin-top:12px">${pctTxt(cc.occupancy.pax.pct)}</div><div class="sub">Personas: ${cc.occupancy.pax.personas} / ${cc.occupancy.pax.capacidad_vendible} de capacidad vendible${cc.occupancy.pax.parcial ? ' (parcial: hay propiedades sin capacidad confirmada)' : ''}</div>
<table style="margin-top:8px"><thead><tr><th>Propiedad</th><th class="n">Unidades</th><th class="n">Personas</th></tr></thead><tbody>${cc.occupancy.pax.by_property.map((p, i) => `<tr><td>${esc(p.property)}</td><td class="n">${pctTxt(cc.occupancy.rooms.by_property[i].pct)}</td><td class="n">${p.pct != null ? `${p.pct}%` : 'sin dato'}</td></tr>`).join('')}</tbody></table>
<p class="sub">Fórmulas: unidades ocupadas / vendibles × 100 · personas alojadas / capacidad vendible × 100.</p></section>

<section class="card"><h2>Aseo (housekeeping)</h2>
<div class="flow"><span>CHECK-OUT</span><em>→</em><span style="color:var(--clean)">ASEO PENDIENTE</span><em>→</em><span>EN LIMPIEZA</span><em>→</em><span>POR REVISAR</span><em>→</em><span style="color:var(--ready)">LISTA</span><em>→</em><span>CHECK-IN</span></div>
${hk.datos_disponibles
    ? `<div class="strip" style="margin:0 0 8px">${tile('', hk.aseos_hoy, 'Aseos hoy')}${tile('t-clean', hk.pendientes, 'Pendientes')}${tile('t-info', hk.en_limpieza + hk.por_revisar, 'En proceso')}${tile('t-ready', hk.completados, 'Completados')}${tile('', pctTxt(hk.pct_completados), '% completados')}</div>
<p class="sub">Habitaciones no listas: <b>${esc((hk.habitaciones_no_listas || []).join(', ') || 'ninguna')}</b></p>
${hk.proximos_checkin_no_listos.length ? `<div class="warn"><b>Próximo check-in con habitación no lista:</b> ${hk.proximos_checkin_no_listos.map((p) => `${esc(p.unit)} (llega ${esc(p.llegada)}, ${esc(p.estado_aseo)})`).join(' · ')}</div>` : ''}
<table style="margin-top:8px"><thead><tr><th>Unidad</th><th>Estado</th><th>Responsable</th><th>Hora</th></tr></thead><tbody>${hk.detalle.map((d) => `<tr><td>${esc(d.unit)}</td><td>${esc(d.label)}</td><td>${dash(d.responsable)}</td><td>${dash(d.hora)}</td></tr>`).join('') || '<tr><td colspan="4" class="sub">Sin aseos hoy.</td></tr>'}</tbody></table>`
    : '<div class="nr"><b>SIN DATO:</b> no se leyeron las tareas de aseo (project.task). Aseos y “listas” no se asumen.</div>'}
<p class="sub">Housekeeping solo está configurado en: ${esc(hk.configurado_en.join(', '))}. Sin housekeeping: ${esc(hk.sin_housekeeping.join(', ') || '—')} (DATA_GAP).</p></section>
</div>

<div class="grid2">
<section class="card"><h2>Hoy en la casa</h2>
<h2 style="margin-top:8px">Llegan (${cc.lists.llegan_hoy.length})</h2>${list(cc.lists.llegan_hoy, 'Nadie llega hoy.')}
<h2 style="margin-top:12px">Salen (${cc.lists.salen_hoy.length})</h2>${list(cc.lists.salen_hoy, 'Nadie sale hoy.')}
<h2 style="margin-top:12px">En casa · ${cc.en_casa.reservas} reservas, ${cc.en_casa.personas} personas</h2>${list(cc.lists.en_casa, 'Sin huéspedes en casa.')}
<h2 style="margin-top:12px">HOLD vigentes (${cc.lists.holds.length})</h2>${list(cc.lists.holds, 'Sin HOLD vigentes.')}</section>

<section class="card"><h2>Dinero</h2>
<table><tbody>
<tr><td>Ventas del día</td><td class="n">${cop(f.ventas_dia.amount)} <span class="sub">(${f.ventas_dia.count})</span></td></tr>
<tr><td>Reservas creadas hoy</td><td class="n">${f.reservas_dia.total}</td></tr>
<tr><td>Reservas activas</td><td class="n">${f.reservas_activas}</td></tr>
<tr><td>Ingresos del periodo (devengado)</td><td class="n">${cop(f.ingresos_periodo)}</td></tr>
<tr><td>Cobrado acumulado de esas reservas</td><td class="n">${cop(f.cobrado_acumulado)}</td></tr>
<tr><td>Pendiente de esas reservas</td><td class="n">${cop(f.pendiente_periodo)}</td></tr>
<tr><td>Cobrado hoy (fecha real de pago)</td><td class="n">${f.cobrado_hoy_real != null ? cop(f.cobrado_hoy_real) : 'sin dato'}</td></tr>
<tr><td>Noches vendidas · ADR · RevPAR</td><td class="n">${k.noches_vendidas} · ${cop(k.adr)} · ${cop(k.revpar)}</td></tr>
<tr><td>Ocupación vendida del periodo</td><td class="n">${pctTxt(k.ocupacion_vendida_pct)}</td></tr>
</tbody></table>
<h2 style="margin-top:14px">Saldos por cobrar</h2>
<div class="big">${cop(saldos.operativo.amount)}</div><div class="sub">${saldos.operativo.count} reservas vendidas con saldo · en casa/futuras ${cop(saldos.en_casa_o_futuras.amount)} (${saldos.en_casa_o_futuras.count}) · estancias terminadas ${cop(saldos.estancias_terminadas.amount)} (${saldos.estancias_terminadas.count})</div>
<div class="warn">Pipeline <b>no vendido</b> (no es cartera): HOLD ${cop(saldos.pipeline_no_vendido.hold.valor)} (${saldos.pipeline_no_vendido.hold.count}) · opción ${cop(saldos.pipeline_no_vendido.opcion.valor)} (${saldos.pipeline_no_vendido.opcion.count}) · consulta ${cop(saldos.pipeline_no_vendido.consulta.valor)} (${saldos.pipeline_no_vendido.consulta.count}).<br>La fórmula antigua sumaba todo: ${cop(saldos.formula_hotel009.amount)} (${saldos.formula_hotel009.count}); diferencia ${cop(saldos.diferencia_vs_formula_hotel009)}.</div>
<p class="sub">${esc(saldos.scope)}</p></section>
</div>

<section class="card"><h2>Canales · reservas e ingresos del periodo</h2>${channelsHtml}</section>

<section class="card"><h2>Revenue Intelligence <span class="chip">solo lectura · no modifica tarifas</span></h2>
<div class="grid2"><div><div class="sub">Próximos 30 días — noches vendidas por día (rojo = día valle, gris = sin patrón histórico suficiente)</div><div class="spark" aria-label="Próximos 30 días">${spark}</div>
<p class="sub">Más bajos: ${ri.dias_mas_bajos.map((d) => `${esc(d.date)} ${esc(d.weekday)} (${pctTxt(d.ocupacion_proyectada_pct)})`).join(' · ')}</p>
<p class="sub">Booking pace: ${ri.booking_pace.noches_habitacion_captadas_en_ventana} noches-habitación captadas en los últimos ${ri.booking_pace.ventana_dias} días para los próximos 30 · comparativo ${esc(ri.booking_pace.comparativo)}</p></div>
<div><table><thead><tr><th>Día</th><th class="n">Muestras</th><th class="n">Ocupación</th><th class="n">ADR</th></tr></thead><tbody>${weekday}</tbody></table><p class="sub">Histórico: ${ri.historico.dias} días desde ${esc(ri.historico.desde ?? '—')} · ADR ${cop(ri.historico.adr)} · RevPAR ${cop(ri.historico.revpar)} · patrón ${ri.patron_listo ? 'listo' : 'NO listo'}</p></div></div>
<div class="nr" style="margin-top:10px"><b>${ri.tarifa_piso.status === 'READY' ? `TARIFA PISO ${cop(ri.tarifa_piso.tarifa_piso)} · noches de equilibrio ${ri.tarifa_piso.noches_equilibrio ?? '—'}` : 'DATA NOT READY — tarifa piso y punto de equilibrio'}</b>
${ri.tarifa_piso.status === 'READY' ? '' : `<br>No se inventa ninguna tarifa. Falta registrar:<ul>${costs}</ul>`}</div></section>

<section class="card"><h2>Calidad del dato</h2><ul style="margin:0;padding-left:18px;font-size:13px">${gaps || '<li>Sin brechas declaradas.</li>'}</ul>
<details><summary>Validaciones cruzadas (${cc.validation.ok ? 'todas OK' : 'HAY FALLOS'})</summary><ul style="font-size:13px">${checks}</ul></details>
<details><summary>Definición de cada KPI: SOURCE · DOMAIN · FORMULA · VALIDATION</summary><div style="overflow-x:auto"><table><thead><tr><th>KPI</th><th>Source</th><th>Domain / filtro</th><th>Fórmula</th><th>Validación</th></tr></thead><tbody>${kpiDefs}</tbody></table></div></details></section>
</div></body></html>`;
}
