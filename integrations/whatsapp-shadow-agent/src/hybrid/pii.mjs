/**
 * redactPII(): se aplica ANTES de cualquier envio a un proveedor externo (hoy no hay ninguno)
 * y antes de guardar texto del cliente. Elimina telefonos, correos, documentos, cuentas/tarjetas,
 * URLs y nombres introducidos con una formula ("me llamo...", "a nombre de..."). Conserva lo que el
 * agente necesita para entender: fechas, numero de personas, montos y palabras de intencion.
 * Es un filtro de mejor esfuerzo, NO una garantia: ver AI/whatsapp/PRIVACIDAD_HYBRID.md.
 */
const NAME_STOP = new Set(['y', 'e', 'para', 'que', 'de', 'del', 'el', 'la', 'mi', 'es', 'por', 'en', 'con', 'quiero', 'tengo', 'necesito', 'una', 'un', 'las', 'los', 'se', 'ya', 'si', 'no']);

const RULES = [
  ['email', /[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[EMAIL]'],
  ['url', /\bhttps?:\/\/\S+|\bwww\.\S+/gi, '[URL]'],
  ['documento', /\b(c\.?c\.?|cedula|cédula|nit|pasaporte|t\.?i\.?|documento)\s*[:#.]?\s*\d[\d.\s-]{5,14}\d/gi, '[DOCUMENTO]'],
  ['tarjeta', /\b(?:\d[ -]?){13,19}\b/g, '[TARJETA]'],
  ['telefono', /(?:\+?\s?57[\s-]?)?\b3\d{2}[\s.-]?\d{3}[\s.-]?\d{4}\b/g, '[TELEFONO]'],
  ['telefono', /\b\d{3}[\s.-]\d{3}[\s.-]\d{4}\b/g, '[TELEFONO]'],
  ['cuenta', /\b\d{10,20}\b/g, '[CUENTA]'],
];

export function redactPII(input) {
  let text = String(input ?? '');
  const redactions = {};
  const bump = (k) => { redactions[k] = (redactions[k] ?? 0) + 1; };
  for (const [kind, re, token] of RULES) text = text.replace(re, () => { bump(kind); return token; });
  // nombres tras una formula explicita (hasta 3 palabras, sin conectores)
  text = text.replace(/\b(me llamo|mi nombre es|a nombre de|le habla|le escribe)\s+((?:[A-Za-zÁÉÍÓÚÑáéíóúñ]+\s*){1,3})/gi, (full, trig, names) => {
    const words = names.trim().split(/\s+/);
    const kept = [];
    for (const w of words) { if (NAME_STOP.has(w.toLowerCase())) break; kept.push(w); }
    if (!kept.length) return full;
    bump('nombre');
    const rest = words.slice(kept.length).join(' ');
    return `${trig} [NOMBRE]${rest ? ` ${rest}` : ' '}`;
  });
  return { text: text.replace(/\s+/g, ' ').trim(), redactions, redacted: Object.keys(redactions).length > 0 };
}
