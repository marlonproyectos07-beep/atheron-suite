/**
 * redactPII() v2 -- redaccion de datos personales y sensibles ANTES de cualquier envio a un proveedor
 * (hoy no hay ninguno) y antes de guardar texto del cliente. No intenta resolver identidades.
 *
 * Marcadores: [PHONE] [EMAIL] [DOCUMENT] [NAME] [ACCOUNT] [CARD] [ADDRESS] [URL] [RESERVATION_REF] [ACCESS_CODE]
 *
 * FALLO CERRADO: si se detecta algo sensible (tarjeta, cuenta, documento, codigo de acceso/secreto, o un dato
 * de pago/numero largo que no se reconoce con seguridad) el resultado trae `sensitive:true` y
 * `external_provider_allowed:false`: el mensaje NO se envia a ningun proveedor y pasa a una persona.
 * Se prefiere no enviar antes que arriesgar PII. Telefonos, correos, nombres, direcciones, URLs y referencias
 * de reserva se redactan pero no bloquean.
 *
 * Es un filtro de mejor esfuerzo, no una garantia (limites en AI/whatsapp/PRIVACIDAD_HYBRID.md).
 */

export const PLACEHOLDERS = Object.freeze(['PHONE', 'EMAIL', 'DOCUMENT', 'NAME', 'ACCOUNT', 'CARD', 'ADDRESS', 'URL', 'RESERVATION_REF', 'ACCESS_CODE']);
/** Tipos que bloquean el envio a cualquier proveedor. */
export const SENSITIVE_TYPES = Object.freeze(['CARD', 'ACCOUNT', 'DOCUMENT', 'ACCESS_CODE', 'UNRECOGNIZED_SENSITIVE']);

const NAME_STOP = new Set(['y', 'e', 'o', 'para', 'que', 'de', 'del', 'el', 'la', 'los', 'las', 'mi', 'mis', 'es', 'por', 'en', 'con', 'quiero', 'queria', 'quisiera', 'tengo', 'necesito', 'una', 'un', 'se', 'ya', 'si', 'no', 'hay', 'tienen', 'tiene', 'puedo', 'podemos', 'somos', 'soy', 'vamos', 'voy', 'estoy', 'reserva', 'reserve', 'habitacion', 'cupo', 'disponible', 'manana', 'hoy', 'noche', 'favor', 'buenas', 'hola', 'gracias', 'desde', 'hasta', 'al', 'a', 'le', 'me', 'te', 'nos', 'ayuda', 'ayudar', 'cliente', 'huesped', 'agencia', 'aliado', 'del', 'como', 'cuando', 'donde', 'cuanto', 'cual', 'estamos', 'llamo', 'llega', 'llego', 'llegamos', 'saber', 'consultar', 'pagar', 'pague', 'pago', 'cancelar', 'cambiar', 'tarjeta', 'cuenta', 'numero', 'nequi', 'bancolombia', 'davivienda']);
const ROLE_WORDS = new Set(['cliente', 'huesped', 'aliado', 'aliada', 'nuevo', 'nueva', 'de', 'del', 'el', 'la', 'un', 'una', 'yo', 'hotel', 'agencia', 'operador', 'proveedor', 'turista', 'viajero', 'padre', 'madre', 'amigo', 'amiga', 'familiar', 'empleado', 'gerente', 'administrador', 'recepcionista', 'persona', 'tu', 'su', 'mi', 'quien', 'ese', 'esa', 'el', 'solo', 'sola', 'mayor', 'menor']);

const asciiFold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Normaliza trucos de ofuscacion: ancho completo, caracteres invisibles, espacios raros. */
export function normalizeForScan(input) {
  return String(input ?? '')
    .normalize('NFKC')
    .replace(/[​-‏‪-‮⁠﻿­]/g, '')
    .replace(/[  -   　]/g, ' ');
}

const DIGIT_WORDS = /\b(?:(?:cero|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve)[\s,.-]*){8,}\b/i;

/** Redacta nombres tras formulas explicitas; nunca adivina nombres sueltos. */
function redactNames(text, bump) {
  let out = text;
  const PARTICLES = new Set(['de', 'del', 'la', 'las', 'los', 'van', 'von', 'da']);
  const KIN = /^\s*(?:(?:de\s+)?(?:mi|su|nuestro|nuestra)\s+)?(?:esposa|esposo|mama|papa|hijo|hija|hermano|hermana|amigo|amiga|jefe|novio|novia|padre|madre|tio|tia|abuelo|abuela|primo|prima|suegro|suegra)\s+/i;
  const nameTokens = (rest, { titleOnly, max }) => {
    const body = rest.replace(KIN, ' ');
    const toks = body.match(/^(?:\s*[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]{2,})+/)?.[0] ?? '';
    const words = toks.trim().split(/\s+/).filter(Boolean);
    const kept = [];
    for (let i = 0; i < words.length; i += 1) {
      const w = words[i];
      const isTitle = /^[A-ZÁÉÍÓÚÜÑ]/.test(w);
      // particulas de apellido ("de la Hoz") solo entre palabras con mayuscula inicial
      if (PARTICLES.has(asciiFold(w)) && kept.length && /^[A-ZÁÉÍÓÚÜÑ]/.test(kept.at(-1))) {
        let j = i;
        while (j < words.length && PARTICLES.has(asciiFold(words[j]))) j += 1;
        if (j < words.length && /^[A-ZÁÉÍÓÚÜÑ]/.test(words[j])) { kept.push(...words.slice(i, j)); i = j - 1; continue; }
      }
      if (NAME_STOP.has(asciiFold(w))) break;
      if (titleOnly && !isTitle) break;
      kept.push(w);
      const core = kept.filter((x) => !PARTICLES.has(asciiFold(x)));
      if (core.length >= (core.every((x) => /^[A-ZÁÉÍÓÚÜÑ]/.test(x)) ? 5 : Math.min(max, 3))) break;
    }
    return kept;
  };
  const apply = (re, { titleOnly = false, max = 4 } = {}) => {
    out = out.replace(re, (full, trigger, rest, offset, whole) => {
      const kept = nameTokens(rest, { titleOnly, max: titleOnly ? 4 : Math.min(max, 3) });
      if (!kept.length) return full;
      if (titleOnly && ROLE_WORDS.has(asciiFold(kept[0]))) return full;
      bump('NAME');
      const consumed = kept.join(' ');
      const body = rest.replace(KIN, ' ').replace(/^\s*/, '');
      const tail = body.slice(body.indexOf(consumed) + consumed.length);
      return `${trigger} [NAME]${tail ? (/^[\s,.;:!?)]/.test(tail) ? '' : ' ') + tail : ''}`;
    });
  };
  // formulas explicitas: acepta minusculas (los mensajes reales suelen venir en minuscula)
  apply(/\b(me llamo|mi nombre es|mi nombre completo es|a nombre de|titular de la (?:cuenta|reserva|tarjeta)(?: es)?|titular(?: es)?|se llama|le habla|le escribe|le saluda)\b[:\s]+((?:\s*[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]{2,}){1,7})/gi);
  apply(/\b(sr\.?|sra\.?|senor|señor|senora|señora|don|dona|doña)\s+((?:\s*[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]{2,}){1,6})/gi, { titleOnly: false, max: 2 });
  // "soy ..." solo con nombre propio en mayuscula inicial (evita "soy de una agencia", "soy el hijo de...")
  apply(/\b(soy)\s+((?:\s*[A-ZÁÉÍÓÚÜÑ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ]{1,}){1,7})/g, { titleOnly: true });
  return out;
}

/**
 * @param {string} input texto del cliente
 * @returns {{text:string, redactions:Object<string,number>, redacted:boolean, sensitive:boolean, sensitive_reasons:string[], external_provider_allowed:boolean}}
 */
export function redactPII(input) {
  let text = normalizeForScan(input);
  const redactions = {};
  const bump = (k) => { redactions[k] = (redactions[k] ?? 0) + 1; };
  const sub = (kind, re, token = `[${kind}]`) => { text = text.replace(re, () => { bump(kind); return token; }); };

  // 1. secretos / tokens (siempre sensibles)
  sub('ACCESS_CODE', /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g);
  sub('ACCESS_CODE', /\b(?:sk-[A-Za-z0-9_-]{16,}|AKIA[0-9A-Z]{16}|EAA[A-Za-z0-9]{30,}|ghp_[A-Za-z0-9]{30,}|xox[abpr]-[A-Za-z0-9-]{10,}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]*)/g);
  sub('ACCESS_CODE', /\bbearer\s+[A-Za-z0-9._~+/-]{16,}=*/gi);
  sub('ACCESS_CODE', /\b(?:api[ _-]?key|secret|token)\s*[:=]?\s*[A-Za-z0-9_\-./+]{12,}/gi);
  // 2. codigos de acceso / claves / OTP (valor con al menos un digito)
  text = text.replace(/\b(codigo de acceso|codigo de la puerta|codigo de verificacion|codigo de seguridad|codigo|clave|contrasena|contraseña|password|passcode|pin|otp)(?![A-Za-zñ])(\s+(?:de(?:l| la)?\s+(?:puerta|cerradura|wifi|red|acceso|entrada|caja(?: fuerte)?|app|cuenta|banco|tarjeta)\s*)?)?\s*(?:es|era|:|=|#)?\s*([A-Za-z0-9*#._-]{3,})/gi, (full, kw, mid, val) => {
    if (!/\d/.test(val)) return full;
    if (/^(?:de\s+)?reserva$/i.test((mid ?? '').trim())) return full;
    bump('ACCESS_CODE');
    return '[ACCESS_CODE]';
  });
  text = text.replace(/\b(?:codigo|numero)\s+(?:que\s+)?(?:me\s+)?llego\s*(?:es|:)?\s*\d{4,8}\b/gi, () => { bump('ACCESS_CODE'); return '[ACCESS_CODE]'; });
  // 3. datos de tarjeta: cvv, vencimiento
  sub('CARD', /\b(?:cvv2?|cvc2?|cid)\s*(?:es|:|=)?\s*\d{3,4}\b/gi);
  sub('CARD', /\b(?:vence|vencimiento|expira|fecha de vencimiento|exp)\s*(?:el|es|:|=)?\s*\d{1,2}\s*[\/-]\s*\d{2,4}\b/gi);
  // 4. correo (incluye ofuscado "arroba/punto")
  sub('EMAIL', /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g);
  sub('EMAIL', /\b[\w.+-]+\s*(?:arroba|\(at\)|\[at\])\s*[\w-]+\s*(?:punto|\(dot\)|\[dot\])\s*[\w.]+/gi);
  // 5. URLs
  sub('URL', /\b(?:https?:\/\/|www\.)\S+/gi);
  // 6. documentos (cedula, NIT, pasaporte, etc.)
  sub('DOCUMENT', /\b(?:c\.?\s?c\.?|cedula(?: de ciudadania)?|cédula(?: de ciudadanía)?|nit|nuip|dni|pasaporte|passport|t\.?\s?i\.?|documento(?: de identidad)?|identificacion|identificación)\s*(?:numero|no\.?|nro\.?|n°|nº)?\s*[:#.]?\s*[A-Z]{0,2}\d[\d.\s-]{4,14}\d\b/gi);
  sub('DOCUMENT', /\b[A-Z]{2}\d{6,7}\b/g); // pasaporte con formato reconocible (2 letras + 6-7 digitos)
  // 7. referencias de reserva (Booking / Airbnb): innecesarias para entender
  text = text.replace(/\b(codigo de reserva|numero de reserva|nro\.? de reserva|n° de reserva|confirmacion|confirmation|localizador|reservation(?: id| code| number)?|booking(?: id| number| nº| n°)?|reserva (?:numero|nro\.?|no\.?))\s*(?:es|era|:|#)?\s*((?=[A-Z0-9-]*\d)[A-Z0-9][A-Z0-9-]{5,})/gi, (full, kw, val) => {
    if (!/\d/.test(val)) return full;
    bump('RESERVATION_REF');
    return `${kw} [RESERVATION_REF]`;
  });
  sub('RESERVATION_REF', /\bHM[A-Z0-9]{8,10}\b/g);
  // 8. tarjetas: 13-19 digitos, con o sin separadores (siempre CARD: fallo cerrado)
  text = text.replace(/(?<![\d$])(?:\d[ -]?){12,18}\d(?!\d)/g, (m) => {
    const digits = m.replace(/\D/g, '');
    if (digits.length >= 13 && digits.length <= 19) { bump('CARD'); return '[CARD]'; }
    return m;
  });
  // 9. telefonos
  sub('PHONE', /(?<![\d$])(?:\+?\s?57[\s.-]?)?\(?3\d{2}\)?[\s.-]?\d{3}[\s.-]?\d{4}(?!\d)/g);
  sub('PHONE', /(?<![\d$])\(?60\d\)?[\s.-]?\d{3}[\s.-]?\d{4}(?!\d)/g);
  sub('PHONE', /(?<![\d$])\+\d{1,3}[\s.-]?\(?\d{2,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{3,4}(?!\d)/g);
  // 10. cuentas: 10-20 digitos continuos o agrupados; 9 digitos si hay contexto bancario
  text = text.replace(/(?<![\d$])\d{10,20}(?!\d)/g, () => { bump('ACCOUNT'); return '[ACCOUNT]'; });
  text = text.replace(/(?<![\d$-])\d{3,6}(?:[ -]\d{2,6}){2,5}(?![\d-])/g, (m) => {
    const d = m.replace(/\D/g, '').length;
    if (d >= 10 && !/^\d{4}-\d{2}-\d{2}/.test(m) && !/^\d{1,2}[ -]\d{1,2}[ -]\d{2,4}/.test(m)) { bump('ACCOUNT'); return '[ACCOUNT]'; }
    return m;
  });
  text = text.replace(/\b(cuenta(?: de ahorros| corriente| bancaria)?|ahorros|corriente|iban|swift)\s*(?:numero|no\.?|nro\.?|n°|es|:)?\s*(\d[\d -]{7,}\d)\b/gi, (_, kw) => { bump('ACCOUNT'); return `${kw} [ACCOUNT]`; });
  // 11. direcciones
  sub('ADDRESS', /\b(?:calle|cll|cl|carrera|cra|crr|kr|cr|avenida|av|diagonal|diag|dg|transversal|tv|autopista|circular|km)\.?\s*\d+\s*[a-z]?(?:\s*(?:bis|sur|norte|este|oeste))?(?:\s*(?:#|no\.?|n°|nº)\s*\d+\s*[a-z]?\s*[-–]\s*\d+)?(?:\s*(?:apto|apartamento|torre|casa|interior|int|manzana|mz|lote|bloque)\.?\s*\w+)*/gi);
  sub('ADDRESS', /#\s*\d+\s*[a-z]?\s*[-–]\s*\d+/gi);
  text = text.replace(/\b(mi direccion(?: es)?|direccion de (?:entrega|facturacion|residencia)(?: es)?|vivo en|resido en|residencia en)\s*:?\s*([^.,;\n?!]{4,60}?)(?=\s+(?:y|e|pero|para|que|porque|ya)\s|[.,;\n?!]|$)/gi, (_, kw) => { bump('ADDRESS'); return `${kw} [ADDRESS]`; });
  // 12. nombres con contexto explicito
  text = redactNames(text, bump);
  text = text.replace(/\s+/g, ' ').trim();

  // ---- fallo cerrado: lo que sigue sin reconocer con seguridad -------------------------------------------------------
  const reasons = new Set(Object.keys(redactions).filter((k) => SENSITIVE_TYPES.includes(k)));
  const probe = text;
  if (/(?<![\d$])\d(?:[\s.\-_]?\d){8,}(?!\d)/.test(probe.replace(/\b\d{4}-\d{2}-\d{2}\b/g, ''))) reasons.add('UNRECOGNIZED_SENSITIVE'); // numero largo no clasificado
  if (DIGIT_WORDS.test(probe)) reasons.add('UNRECOGNIZED_SENSITIVE'); // numero deletreado ("tres uno cero cinco...")
  const ctx = asciiFold(probe).match(/\b(cel|celular|telefono|whatsapp|llamame|numero|nequi)\b([^.?!]*)/);
  if (ctx && (ctx[2].match(/\b(?:cero|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|veinte|treinta|cuarenta|cincuenta|sesenta|setenta|ochenta|noventa|cien|ciento|\d+)\b/g) ?? []).length >= 7) reasons.add('UNRECOGNIZED_SENSITIVE'); // numero de contacto deletreado en mezcla
  if (/\b(tarjeta|cuenta|clave|contrasena|contraseña|password|cvv|cvc|pin|token|iban|swift|otp)\b/i.test(asciiFold(probe)) && /(?<![$\d.])\b\d{4,}\b(?![.,]\d)/.test(probe)) reasons.add('UNRECOGNIZED_SENSITIVE'); // contexto de pago/secreto + digitos
  const sensitive_reasons = [...reasons];
  return {
    text,
    redactions,
    redacted: Object.keys(redactions).length > 0,
    sensitive: sensitive_reasons.length > 0,
    sensitive_reasons,
    external_provider_allowed: sensitive_reasons.length === 0,
  };
}
