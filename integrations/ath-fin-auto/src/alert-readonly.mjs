// ATH-FIN-AUTO-001: piloto de clasificación bancaria. 100 % local, sin red ni escrituras.
// ENTRADA: texto de una alerta Gmail obtenido por un conector autorizado, nunca un pantallazo
// como evidencia suficiente para acreditar un pago.
// SALIDA: solo metadatos mínimos; jamás devuelve el cuerpo, remitente, nombres o contrapartes.
import { createHash } from 'node:crypto';

const BANK_MARKER = /bancolombia\s*:/i;
const FINANCIAL_PATTERNS = Object.freeze([
  { pattern: /\btransferiste\b/i, type: 'TRANSFERENCIA_SALIENTE', direction: 'SALIDA' },
  { pattern: /\bretiraste\b/i, type: 'RETIRO_EFECTIVO', direction: 'SALIDA' },
  { pattern: /\brecibiste\s+un\s+pago\b/i, type: 'PAGO_RECIBIDO', direction: 'ENTRADA' },
  { pattern: /\brecibiste\b[\s\S]{0,100}\bpor\s+qr\b/i, type: 'RECAUDO_QR', direction: 'ENTRADA' },
  { pattern: /\brecibiste\b/i, type: 'ABONO_RECIBIDO', direction: 'ENTRADA' },
  { pattern: /\bpagaste\b/i, type: 'PAGO_SALIENTE', direction: 'SALIDA' },
]);
const NON_FINANCIAL = /\b(te\s+identificaste|cambiaste\s+tu\s+clave|inicio\s+de\s+sesi[oó]n|codigo\s+de\s+seguridad)\b/i;

function narrativeOnly(body) {
  // No se conserva contenido HTML, links de marketing ni pie de correo.
  const plain = String(body ?? '')
    .replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/gi, '$1')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const match = BANK_MARKER.exec(plain);
  if (!match) return null;
  let narrative = plain.slice(match.index + match[0].length, match.index + match[0].length + 640);
  narrative = narrative.split(/¿\s*dudas\?|si\s+tienes\s+dudas|¿\s*no\s*fuiste\s+t[uú]\?/i)[0];
  return narrative;
}

function parseCOP(text) {
  // Bancolombia sends both Colombian-style ($125.000,00) and US-style
  // ($54,000.00, $1,000,000) notifications. Reject ambiguous malformed values.
  const match = String(text).match(/\$\s*([0-9][0-9.,]*)/);
  if (!match) return null;
  const raw = match[1].replace(/[.,]+$/, '');
  if (!/^\d[\d.,]*$/.test(raw)) return null;

  const hasComma = raw.includes(',');
  const hasDot = raw.includes('.');
  let normalized;

  if (hasComma && hasDot) {
    const decimal = raw.lastIndexOf(',') > raw.lastIndexOf('.') ? ',' : '.';
    const thousands = decimal === '.' ? ',' : '.';
    const idx = raw.lastIndexOf(decimal);
    const integer = raw.slice(0, idx);
    const fraction = raw.slice(idx + 1);
    const quoted = thousands === '.' ? '\\.' : ',';
    if (!/^\d{1,2}$/.test(fraction) ||
        !new RegExp(`^\\d{1,3}(?:${quoted}\\d{3})+$`).test(integer)) return null;
    normalized = integer.split(thousands).join('') + '.' + fraction;
  } else if (hasComma || hasDot) {
    const sep = hasComma ? ',' : '.';
    const groups = raw.split(sep);
    if (/^\d{1,3}$/.test(groups[0]) && groups.slice(1).every((s) => /^\d{3}$/.test(s))) {
      normalized = groups.join('');
    } else if (groups.length === 2 && /^\d+$/.test(groups[0]) && /^\d{1,2}$/.test(groups[1])) {
      normalized = groups[0] + '.' + groups[1];
    } else {
      return null;
    }
  } else {
    normalized = raw;
  }
  const val = Number(normalized);
  return Number.isFinite(val) && val > 0 ? val : null;
}

function accountUsed(narrative) {
  // Solo cuenta PROPIA explícita. 'a la cuenta *1234' es un destinatario externo.
  // No asocia cuentas por nombre de beneficiario ni por el destinatario.
  const match = narrative.match(/\b(?:desde|en|a)\s+tu\s+cuenta\s+\*+([0-9]{4})\b/i);
  return match ? match[1] : null;
}

function localReceivedDate(isoTime) {
  if (typeof isoTime !== 'string' || !isoTime) return null;
  const parsed = new Date(isoTime);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Bogota',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(parsed);
}

/**
 * Clasificar UN correo. El mensaje Gmail sirve como INDICIO, nunca como
 * certificación bancaria. El cuerpo nunca sale en el resultado.
 *
 * @param {{messageId:string,body:string,receivedAt?:string}} email
 * @param {{businessAccounts?:string[]}} options
 */
export function classifyBankEmail(email, { businessAccounts = ['0136'] } = {}) {
  if (typeof email?.messageId !== 'string' || email.messageId.trim().length === 0) {
    throw new Error('GMAIL_MESSAGE_ID_REQUIRED');
  }
  const messageKey = createHash('sha256').update(email.messageId).digest('hex');
  const narrative = narrativeOnly(email.body);
  const base = {
    source: 'GMAIL_ALERTA_NO_VERIFICADA',
    messageKey,
    emailReceivedDateBogota: localReceivedDate(email.receivedAt),
    bankEventDateVerified: false,
    bankTransactionReferenceVerified: false,
    paymentConfirmed: false,
    accountingApproved: false,
    writesToOdoo: 0,
  };
  if (!narrative) {
    return { ...base, type: 'NO_ES_ALERTA_BANCARIA_IDENTIFICABLE', direction: null,
      amountCop: null, ownAccountLast4: null, accountClass: 'DESCONOCIDA',
      status: 'IGNORAR_O_REVISAR_MANUAL' };
  }
  if (NON_FINANCIAL.test(narrative)) {
    return { ...base, type: 'AVISO_SEGURIDAD', direction: null,
      amountCop: null, ownAccountLast4: null, accountClass: 'NO_APLICA',
      status: 'IGNORAR_NO_FINANCIERO' };
  }
  const financial = FINANCIAL_PATTERNS.find(({ pattern }) => pattern.test(narrative));
  const amountCop = parseCOP(narrative);
  const ownAccountLast4 = accountUsed(narrative);
  const accountClass = !ownAccountLast4 ? 'CUENTA_NO_IDENTIFICADA'
    : businessAccounts.includes(ownAccountLast4) ? 'CANDIDATA_ATHERON'
      : 'OTRA_CUENTA_REQUIERE_TITULARIDAD';
  let status = 'REVISAR_MANUAL';
  if (financial && amountCop !== null) {
    status = accountClass === 'CANDIDATA_ATHERON'
      ? 'PENDIENTE_CONFIRMACION_BANCARIA'
      : accountClass === 'CUENTA_NO_IDENTIFICADA' ? 'BLOQUEADO_CUENTA_DESCONOCIDA'
        : 'BLOQUEADO_TITULARIDAD';
  }
  return {
    ...base,
    type: financial?.type ?? 'DESCONOCIDO',
    direction: financial?.direction ?? null,
    amountCop,
    ownAccountLast4,
    accountClass,
    status,
  };
}

/** Repetidos del mismo correo: sí. Coincidencias de importe/fecha: solo avisar, nunca fusionar. */
export function classifyBankBatch(emails, options = {}) {
  if (!Array.isArray(emails)) throw new Error('EMAIL_LIST_REQUIRED');
  const seen = new Set();
  const records = [];
  let sameMessageDuplicates = 0;
  for (const email of emails) {
    const r = classifyBankEmail(email, options);
    if (seen.has(r.messageKey)) { sameMessageDuplicates += 1; continue; }
    seen.add(r.messageKey);
    records.push(r);
  }
  const candidates = new Map();
  for (const r of records) {
    if (!r.direction || r.amountCop === null || !r.ownAccountLast4 ||
        !r.emailReceivedDateBogota) continue;
    const key = [r.emailReceivedDateBogota, r.direction, r.amountCop, r.ownAccountLast4].join('|');
    candidates.set(key, (candidates.get(key) ?? 0) + 1);
  }
  // Posibles duplicados NO son duplicados demostrados: sin referencia bancaria
  // no se descarta ninguna de las dos notificaciones.
  return {
    mode: 'SOLO_LECTURA',
    writesToOdoo: 0,
    totalMessages: emails.length,
    uniqueEmails: records.length,
    sameMessageDuplicates,
    possibleCollisions: [...candidates.values()].filter((count) => count > 1).length,
    records,
  };
}
