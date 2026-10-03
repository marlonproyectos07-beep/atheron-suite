/**
 * Arquitectura preparada para audio (SIN voz en produccion):
 *   audio inbound -> media -> transcripcion -> intencion/contexto -> Odoo/Playbook -> SHADOW_RESPONSE textual.
 * Infraestructura reutilizable encontrada en el repo: ninguna de transcripcion
 * (HOTEL-016 tiene catalogo de medios SALIENTES y adaptador Cloud API, no STT).
 * No se contrata ni se usa ningun servicio de pago.
 *
 * Contrato del puerto:  transcribe({media_id, mime}) -> {ok, text, confidence}
 */
export class NullTranscription {
  available = false;
  async transcribe() { return { ok: false, text: null, confidence: 0, reason: 'TRANSCRIPTION_NOT_CONFIGURED' }; }
}

export function assertTranscriptionPort(p) {
  if (typeof p?.transcribe !== 'function') throw new Error('TRANSCRIPTION_PORT_MISSING_METHOD: transcribe');
  return true;
}

/** Un mensaje de audio se convierte en texto solo si hay transcripcion confiable. */
export async function audioToText(message, port = new NullTranscription(), minConfidence = 0.7) {
  assertTranscriptionPort(port);
  const r = await port.transcribe({ media_id: message.media_id, mime: message.mime });
  if (r.ok && r.text && r.confidence >= minConfidence) return { ok: true, text: r.text, confidence: r.confidence };
  return { ok: false, text: null, confidence: r.confidence ?? 0, reason: r.reason ?? 'LOW_CONFIDENCE' };
}
