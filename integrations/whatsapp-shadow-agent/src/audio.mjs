/**
 * Puerto de audio (interfaz segura para el futuro; portado a mano desde la
 * referencia 4935d59 con el umbral 0.6 de CANONICAL-002):
 *   audio inbound -> transcripcion futura -> intencion/contexto -> SHADOW_RESPONSE
 * Sin proveedor externo, sin compra, sin API real, sin audio real, sin outbound.
 * Con confianza < 0.6 (o sin transcripcion) el mensaje pasa a ESCALATE_HUMAN.
 *
 * Contrato: transcribe({media_id, mime}) -> {ok, text, confidence, reason?}
 */
import { processMessage } from './agent.mjs';

export const AUDIO_MIN_CONFIDENCE = 0.6;

export class NullTranscription {
  available = false;
  async transcribe() {
    return { ok: false, text: null, confidence: 0, reason: 'TRANSCRIPTION_NOT_CONFIGURED' };
  }
}

export function assertTranscriptionPort(port) {
  if (typeof port?.transcribe !== 'function') throw new Error('TRANSCRIPTION_PORT_MISSING_METHOD: transcribe');
  return true;
}

export async function audioToText(message, port = new NullTranscription(), minConfidence = AUDIO_MIN_CONFIDENCE) {
  assertTranscriptionPort(port);
  const r = await port.transcribe({ media_id: message.media_id, mime: message.mime });
  if (r?.ok && r.text && r.confidence >= minConfidence) return { ok: true, text: r.text, confidence: r.confidence };
  return { ok: false, text: null, confidence: r?.confidence ?? 0, reason: r?.reason ?? 'LOW_CONFIDENCE' };
}

export async function processAudioMessage(session, message, deps, port = new NullTranscription()) {
  const t = await audioToText(message, port);
  const d = await processMessage(session, {
    type: 'audio',
    transcript: t.ok ? t.text : null,
    confidence: t.confidence,
    duration_s: message.duration_s,
  }, deps);
  d.audio = { transcribed: t.ok, confidence: t.confidence, reason: t.ok ? null : t.reason };
  return d;
}
