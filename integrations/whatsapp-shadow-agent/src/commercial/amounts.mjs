/**
 * Montos en pesos colombianos (COP) desde texto de WhatsApp: "$130.000", "130 mil", "40k", "1,5 millones", "130000".
 * Nunca interpreta fechas, anios ni numeros largos (telefonos/cuentas) como dinero. Clasifica cada monto por la
 * palabra clave mas cercana: precio / anticipo / acto de pago / saldo. NUNCA inventa un monto.
 */
import { norm } from '../nlu.mjs';

const KEYWORDS = {
  balance: /\b(saldo|resta|restan|falta|faltan|pendiente|por pagar|a la llegada|al llegar)\b/g,
  deposit: /\b(anticipo|abono|abonar|adelanto|adelantar|separar|separacion|deposito|garantia)\b/g,
  payment_act: /\b(pague|pagamos|consigne|consignamos|transferi|transferimos|abone|abonamos|envie|enviamos|mande|mandamos|hice (?:el )?pago|pago de)\b/g,
  price: /\b(total|precio|valor|tarifa|costo|cuesta|noche|son|sale|queda en|queda por|vale|cobran|en total)\b/g,
};

const lastMatchEnd = (re, s) => { let end = -1; for (const m of s.matchAll(re)) end = m.index + m[0].length; return end; };

/** @returns {{value:number, index:number, end:number, kind:'balance'|'deposit'|'payment_act'|'price'|'unclassified'}[]} */
export function parseCopAmounts(raw) {
  let t = norm(raw);
  t = t.replace(/\b\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}\b/g, (m) => ' '.repeat(m.length)).replace(/\b\d{4}-\d{2}-\d{2}\b/g, (m) => ' '.repeat(m.length)).replace(/\d{10,}/g, (m) => ' '.repeat(m.length));
  const found = [];
  const taken = (i, e) => found.some((f) => i < f.end && e > f.index);
  const push = (value, index, end) => { if (value >= 1000 && value <= 500_000_000 && !taken(index, end)) found.push({ value, index, end }); };
  for (const m of t.matchAll(/(?<![\d.,])(\d+(?:[.,]\d+)?)\s*millon(?:es)?\b/g)) push(Math.round(parseFloat(m[1].replace(',', '.')) * 1e6), m.index, m.index + m[0].length);
  for (const m of t.matchAll(/(?<![\d.,])(\d+(?:[.,]\d+)?)\s*(?:mil|k)\b/g)) push(Math.round(parseFloat(m[1].replace(',', '.')) * 1000), m.index, m.index + m[0].length);
  for (const m of t.matchAll(/(?<![\d.,])(\$\s*)?(\d{1,3}(?:[.,]\d{3})+)(?![\d])/g)) push(Number(m[2].replace(/[.,]/g, '')), m.index, m.index + m[0].length);
  for (const m of t.matchAll(/(?<![\d.,])(\$\s*)?(\d{4,9})(?![\d])(\s*(?:cop|pesos))?/g)) {
    const v = Number(m[2]);
    const hasMark = Boolean(m[1] || m[3]);
    if (!hasMark && ((v >= 1900 && v <= 2100) || v % 100 !== 0)) continue; // anios y numeros sueltos no son dinero
    push(v, m.index, m.index + m[0].length);
  }
  found.sort((a, b) => a.index - b.index);
  return found.map((f) => {
    const left = t.slice(Math.max(0, f.index - 45), f.index);
    const right = t.slice(f.end, f.end + 28);
    let kind = 'unclassified';
    let best = -1;
    for (const [k, re] of Object.entries(KEYWORDS)) {
      const e = lastMatchEnd(new RegExp(re.source, 'g'), left);
      if (e > best) { best = e; kind = k; }
    }
    if (best < 0) {
      let pos = Infinity;
      for (const [k, re] of Object.entries(KEYWORDS)) {
        const m = right.match(new RegExp(re.source));
        if (m && m.index < pos) { pos = m.index; kind = k; }
      }
    }
    return { ...f, kind };
  });
}
