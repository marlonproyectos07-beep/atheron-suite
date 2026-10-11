import { WINDOW_NAMES } from '../angela-board-model.mjs';

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cop = (n) => `$${Math.round(n).toLocaleString('es-CO')}`;
const CLS = { FREE: 'free', OCCUPIED: 'occ', ARRIVAL: 'arr', DEPARTURE: 'dep', HOLD: 'hold', BLACKOUT: 'black', OVERBOOKING: 'over', ROOM_MOVE: 'move' };
const who = (arr, f) => (arr.length ? arr.map(f).join('; ') : '—');

function kpiHtml(win) {
  const group = { OPERACION_COMERCIAL: 'Operación', INVENTARIO_NO_VENDIBLE: 'No vendible', FINANCIERO: 'Financiero' };
  return `<div class="kpis">${win.kpi_row.map((k) => `<div class="kpi g-${esc(k.group)}"><b>${k.key === 'SALDO_PENDIENTE' ? cop(k.value) : esc(k.value)}</b><span>${esc(k.label.replace('_', ' '))}</span><i>${esc(group[k.group])} · ${esc(k.unit)}</i></div>`).join('')}</div>`;
}

export function renderDashboardHtml(ops, { title = 'CENTRO DE OPERACIONES ATHERON' } = {}) {
  const a = ops.answers;
  const head = ops.gridDates.map((d) => `<th>${esc(d.slice(5))}</th>`).join('');
  const rows = ops.grid.map((g) => `<tr><th>${esc(g.room)}</th>${g.cells.map((c) => `<td class="${CLS[c.primary]}" title="${esc(c.states.join(' + '))} ${esc(c.stays.join(','))}">${esc(c.primary === 'FREE' ? '' : c.primary.replace('ROOM_MOVE', 'MOVE').slice(0, 4))}</td>`).join('')}</tr>`).join('');
  const stays = ops.stays.filter((s) => s.status !== 'CANCELLED' && (s.check_out_global ?? '') >= ops.asOf).map((s) => `<article class="stay"><h3>${esc(s.stay_id)} <small>${esc(s.status)}</small></h3>
<dl><dt>Huésped</dt><dd>${esc(s.guest)}</dd><dt>Origen</dt><dd>${esc(s.source)}</dd>
<dt>Entrada / salida global</dt><dd>${esc(s.check_in_global)} → ${esc(s.check_out_global)} (${esc(s.total_nights)} noches)</dd>
<dt>Venta total</dt><dd>${cop(s.total_sale)}</dd><dt>Pago confirmado</dt><dd>${cop(s.payment_confirmed)}${s.payment_reported_unconfirmed ? ` <em>(+${cop(s.payment_reported_unconfirmed)} reportado, sin confirmar)</em>` : ''}</dd>
<dt>Saldo</dt><dd><b>${cop(s.balance)}</b></dd><dt>Próximo pago</dt><dd>${s.next_payment_date ? `${esc(s.next_payment_date)} · ${cop(s.next_payment_amount)}` : '—'}${s.payment_overdue ? ' <strong class="bad">VENCIDO</strong>' : ''}</dd>
<dt>Habitación actual</dt><dd>${esc(s.current_room ?? '—')}</dd><dt>Siguiente</dt><dd>${esc(s.next_room ?? '—')}${s.next_move_date ? ` el ${esc(s.next_move_date)}` : ''}</dd></dl>
<table class="seg"><tr><th>Habitación / lugar</th><th>Desde</th><th>Hasta</th><th>Noches</th></tr>${s.room_segments.map((r) => `<tr><td>${esc(r.room_location)}</td><td>${esc(r.segment_checkin)}</td><td>${esc(r.segment_checkout)}</td><td>${esc(r.nights)}</td></tr>`).join('')}</table></article>`).join('');
  const wins = WINDOW_NAMES.map((n) => `<section class="win" id="w-${WINDOW_NAMES.indexOf(n)}"><h2>${esc(n)} <small>${esc(ops.windows[n].window.start)} → ${esc(ops.windows[n].window.end)}</small></h2>${kpiHtml(ops.windows[n])}</section>`).join('');
  const nav = WINDOW_NAMES.map((n, i) => `<a href="#w-${i}">${esc(n)}</a>`).join('');
  const bad = a.sobreventas.length ? `<p class="bad">⚠ SOBREVENTA: ${a.sobreventas.length} noche(s)-habitación en conflicto</p>` : '';

  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>:root{--bg:#fff;--fg:#1b1b1b;--mut:#666;--line:#ddd;--free:#e8f5e9;--occ:#bbdefb;--arr:#81c784;--dep:#ffe082;--hold:#fff59d;--black:#bdbdbd;--over:#ef5350;--move:#ce93d8}
@media(prefers-color-scheme:dark){:root{--bg:#161616;--fg:#eee;--mut:#aaa;--line:#444;--free:#1e3a24;--occ:#1f3b57;--arr:#2e6b3a;--dep:#6b5a1a;--hold:#6b6420;--black:#555;--over:#a02828;--move:#5d3a6b}}
body{font:15px/1.4 system-ui,sans-serif;background:var(--bg);color:var(--fg);margin:0 auto;padding:16px;max-width:1100px}
h1{font-size:1.4rem}h2{font-size:1.1rem;margin:1.2rem 0 .4rem}small,i{color:var(--mut);font-weight:400;font-style:normal}
nav a{margin-right:12px}.win{display:none}.win:target{display:block}#w-0{display:block}.wins:has(.win:target) #w-0:not(:target){display:none}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px}.kpi{border:1px solid var(--line);border-radius:8px;padding:8px}
.kpi b{display:block;font-size:1.5rem}.kpi span{font-weight:600;font-size:.8rem}.kpi i{display:block;font-size:.7rem}
table{border-collapse:collapse;width:100%}td,th{border:1px solid var(--line);padding:3px 4px;text-align:center;font-size:.75rem}.grid{overflow-x:auto}
td.free{background:var(--free)}td.occ{background:var(--occ)}td.arr{background:var(--arr)}td.dep{background:var(--dep)}td.hold{background:var(--hold)}td.black{background:var(--black)}td.over{background:var(--over);font-weight:700}td.move{background:var(--move)}
.stay{border:1px solid var(--line);border-radius:8px;padding:10px;margin:10px 0}dl{display:grid;grid-template-columns:max-content 1fr;gap:2px 12px;margin:0 0 8px}dt{color:var(--mut)}dd{margin:0}
.bad{color:#d32f2f}.q li{margin:2px 0}.seg td,.seg th{font-size:.8rem}</style></head><body>
<h1>${esc(title)}</h1><p><small>Lectura de Beds24 (solo lectura) · fecha ${esc(ops.asOf)} · Beds24 no se modifica desde aquí</small></p>${bad}
<nav>${nav}</nav><div class="wins">${wins}</div>
<h2>Hoy en una mirada</h2><ul class="q">
<li><b>Libres hoy:</b> ${esc(a.libres_hoy.join(', ') || 'ninguna')}</li>
<li><b>Llegan:</b> ${esc(who(a.llegadas_hoy, (x) => `${x.guest} → ${x.room}`))}</li>
<li><b>Salen:</b> ${esc(who(a.salidas_hoy, (x) => x.guest))}</li>
<li><b>Alojados:</b> ${esc(who(a.alojados, (x) => `${x.guest} (${x.room})`))}</li>
<li><b>En otra propiedad esta noche:</b> ${esc(who(a.en_externo, (x) => x.guest))}</li>
<li><b>Cambian de habitación hoy:</b> ${esc(who(a.cambios_hoy, (x) => `${x.guest}: ${x.from} → ${x.to}`))}</li>
<li><b>Cambian mañana:</b> ${esc(who(a.cambios_manana, (x) => `${x.guest}: ${x.from} → ${x.to}`))}</li>
<li><b>Deben pagar:</b> ${esc(who(a.deben_pagar, (x) => `${x.guest} ${cop(x.balance)} (próx. ${x.next_payment_date ?? '—'})${x.overdue ? ' VENCIDO' : ''}`))}</li>
<li><b>Sobreventa:</b> ${esc(who(a.sobreventas, (x) => `${x.room} ${x.date}`))}</li>
<li><b>Bloqueos:</b> ${esc(who(a.bloqueos, (x) => `${x.unit} ${x.from}→${x.to}`))}</li>
<li><b>HOLD:</b> ${esc(who(a.holds, (x) => `${x.guest} ${x.unit} hasta ${x.expires ?? '?'}`))}</li></ul>
<h2>Habitaciones por fecha</h2><div class="grid"><table><tr><th></th>${head}</tr>${rows}</table></div>
<p><small>FREE vacío · OCCU ocupada · ARRI llegada · DEPA salida · HOLD · BLAC bloqueo · OVER sobreventa · MOVE cambio de habitación</small></p>
<h2>Estadías</h2>${stays}
${ops.anomalies.length ? `<h2>Avisos de datos</h2><ul>${ops.anomalies.map((x) => `<li>${esc(x.code)} · ${esc(x.ref)} ${esc(x.detail)}</li>`).join('')}</ul>` : ''}
</body></html>`;
}
