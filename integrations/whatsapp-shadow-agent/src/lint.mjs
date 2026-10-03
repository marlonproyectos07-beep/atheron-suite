/**
 * Reglas duras de estilo y seguridad (Playbook s7.2 y s8) aplicadas a
 * CADA respuesta propuesta. Devuelve la lista de violaciones; vacia = OK.
 */
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu;

export function lintReply(reply, { userUsedEmoji = false, allowedAmounts = [] } = {}) {
  if (reply === null || reply === undefined) return [];
  const v = [];
  const lines = String(reply).split('\n').filter((l) => l.trim() !== '');
  if (lines.length > 3) v.push('MAS_DE_3_LINEAS');
  if (String(reply).length > 420) v.push('DEMASIADO_LARGO');
  if ((String(reply).match(/¿/g) ?? []).length > 1) v.push('MAS_DE_UNA_PREGUNTA');
  const emojis = String(reply).match(EMOJI) ?? [];
  if (emojis.length > 1 || (emojis.length === 1 && !userUsedEmoji)) v.push('EMOJIS');
  if (/estimad[oa] cliente|con gusto le informamos|apreciad[oa] (cliente|huesped)/i.test(reply)) v.push('TONO_CORPORATIVO');
  if (/te garantizo|garantizad[oa]|reembolso (total|completo)|te devolvemos|te hago (un )?\d+ ?%|descuento del/i.test(reply)) v.push('PROMESA_NO_AUTORIZADA');
  if (/\b\d{8,}\b/.test(reply)) v.push('POSIBLE_NUMERO_DE_CUENTA_O_DOCUMENTO');
  if (/\b(clave|contrase[nñ]a|password|pin)\b\s*[:=]/i.test(reply)) v.push('CLAVE_EXPUESTA');
  // Cifras de dinero: solo las que vienen de Odoo / del anticipo calculado sobre un total de Odoo / datos verificados.
  const amounts = [...String(reply).matchAll(/\$\s?([\d.]+)/g)].map((m) => Number(m[1].replace(/\./g, '')));
  for (const a of amounts) if (!allowedAmounts.includes(a)) v.push(`MONTO_NO_VERIFICADO:${a}`);
  if (/(?:^|\s)(ya )?reserva(da)? confirmada\b/i.test(reply) && !/te la confirm|cuando (el equipo|se) (valide|confirm)/i.test(reply)) v.push('CONFIRMA_RESERVA_SIN_PAGO_VERIFICADO');
  return v;
}
