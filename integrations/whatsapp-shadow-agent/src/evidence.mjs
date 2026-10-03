/**
 * Observabilidad sin PII ni secretos. conversation_id se anonimiza con hash;
 * telefonos, correos y nombres se enmascaran en cualquier texto.
 */
import { createHash } from 'node:crypto';
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { sanitizeContext } from './context.mjs';

const SALT = 'atheron-shadow-evidence-v1'; // no es un secreto: solo evita hashes triviales

export function anonymizeId(id) {
  return `conv_${createHash('sha256').update(`${SALT}:${id}`).digest('hex').slice(0, 12)}`;
}

export function scrub(text) {
  if (text == null) return text;
  return String(text)
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[EMAIL]')
    .replace(/\+?\d[\d\s().-]{7,}\d/g, (m) => (/^\d{4}-\d{2}-\d{2}$/.test(m.trim()) ? m : '[TEL]'));
}

function scrubDeep(value) {
  if (typeof value === 'string') return scrub(value);
  if (Array.isArray(value)) return value.map(scrubDeep);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, scrubDeep(v)]));
  return value;
}

export function buildRecord({ conversationId, response, contextBefore, latencyMs, testId = null, passFail = null }) {
  const entities = { ...(response.entities ?? {}) };
  if (entities.nombre) entities.nombre = '[NOMBRE]';
  return { conversation_id: anonymizeId(conversationId), ...scrubDeep({
    ts: response.ts,
    classification: response.classification,
    intent: response.intents,
    entities,
    context_before: sanitizeContext(contextBefore),
    context_after: sanitizeContext(response.context),
    odoo_called: response.odoo.called,
    odoo_result_sanitized: response.odoo.result,
    response_proposed: response.text,
    escalation: response.escalation !== null,
    escalation_reason: response.escalation?.reason ?? null,
    latency: latencyMs,
    test_id: testId,
    pass_fail: passFail,
  }) };
}

export class JsonlEvidenceSink {
  constructor(path) { this.path = path; mkdirSync(dirname(path), { recursive: true }); }
  write(record) { appendFileSync(this.path, `${JSON.stringify(record)}\n`); }
}
export class MemoryEvidenceSink {
  records = [];
  write(record) { this.records.push(record); }
}
