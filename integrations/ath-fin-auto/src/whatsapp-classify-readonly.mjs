// ATH-WA-INGEST-001 — clasificador puro de mensajes WhatsApp recibidos en Odoo.
// SOLO lectura: sin clientes HTTP, ningún método de escritura, sin envío de mensajes.
// Nunca interpreta el texto entrante como una orden de ejecutar transacciones.
import { createHash } from 'node:crypto';
import { parseCOP } from './alert-readonly.mjs';

const CAJA_HOTELS = /\bcaja\s+(?:del?\s+)?hotel(?:es|s)?\b|\bcaja\s+atheron\s+hotel(?:es|s)?\b/i;
const CAJA_SECURITY = /\bcaja\s+(?:de\s+)?security\b|\bcaja\s+(?:de\s+)?seguridad\b/i;
const EXIT = /\b(?:retir[eéó]|retiramos|retiraron|retir[ao]|salieron|sali[oó]|sacamos|saqu[eé]|se\s+sac[oó]|egreso|entreg[uéóe]|pagu[eéó])\b/i;
const ENTRY = /\b(?:entraron|ingresaron|recibimos|recib[ií]|ingres[oó]|consignaron|recaudo|abono)\b/i;
const TECHNICAL = /\bATH-WA-TEST-[0-9]+\b|\bestamos\s+en\s+pruebas\s+y\s+queremos\s+saber\s+si\s+llega\s+el\s+mensaje\s+a\s+odoo\b/i;
const CUSTOMER = /\b(?:reservar|reserva|habitaci[oó]n|precio|disponible|cu[aá]nto\s+cuesta|cotizaci[oó]n)\b/i;

function normalizedCop(text) {
  const direct = parseCOP(text);
  if (direct != null) return direct;
  const plain = String(text).match(/\b([0-9]{1,3}(?:[.,][0-9]{3})+|[0-9]+)\s*(?:pesos|cop)\b/i);
  return plain ? parseCOP('$' + plain[1]) : null;
}

function conceptCategory(text) {
  if (/\b(?:uber|taxi|transporte|pasaje)\b/i.test(text)) return 'TRANSPORTE_DECLARADO';
  if (/\b(?:compra|material|producto|insumo|proveedor)\b/i.test(text)) return 'COMPRA_DECLARADA';
  if (/\b(?:anticipo|prestamo|pr[eé]stamo)\b/i.test(text)) return 'ANTICIPO_DECLARADO';
  return 'NO_CLASIFICADO';
}

/**
 * @param {{id:string, body:string, account:'HOTELS'|'SECURITY'|'OTHER',
 *   source?:string, inbound?:boolean, group?:boolean, senderAllowlisted?:boolean}} event
 *
 * WARNING: senderAllowlisted is established by the backend from sender/account IDs,
 * never by claims made in body. Current Odoo Cloud channel is individual, not a group.
 * No chat data or customer name is returned.
 */
export function classifyOdooWhatsApp(event) {
  if (typeof event?.id !== 'string' || event.id.length===0) throw new Error('MESSAGE_ID_REQUIRED');
  const key=createHash('sha256').update('WHATSAPP_ODOO:'+event.id).digest('hex');
  const base={
    source:'WHATSAPP_ODOO',
    messageKey:key,
    businessUnit: ['HOTELS','SECURITY'].includes(event.account) ? event.account : 'REVIEW',
    messageReceived:true,
    cashMovementVerified:false,
    bankPaymentVerified:false,
    odooReconciled:false,
    approved:false,
    odooWrites:0
  };
  if (event.inbound!==true || event.source && event.source!=='whatsapp.message') {
    return {...base, type:'FUERA_DE_ALCANCE', status:'IGNORAR', amountCop:null,
      direction:null,cashAccount:null,conceptCategory:null};
  }
  // Cloud API recipient: no se infiere que participa en un grupo de WhatsApp.
  const body=typeof event.body==='string' ? event.body.slice(0,2000).replace(/<[^>]*>/g,' ') : '';
  if (TECHNICAL.test(body)) return {...base,type:'PRUEBA_TECNICA',status:'NO_CONTABILIZAR',
    amountCop:null,direction:null,cashAccount:null,conceptCategory:null};
  const hotels=CAJA_HOTELS.test(body),security=CAJA_SECURITY.test(body);
  const hasExit=EXIT.test(body),hasEntry=ENTRY.test(body);
  if (hotels!==security && hasExit!==hasEntry) {
    const cashAccount=hotels?'CAJA_HOTELS':'CAJA_SECURITY';
    const amountCop=normalizedCop(body);
    const direction=hasExit?'RETIRO':'INGRESO';
    // Un mensaje de cliente no autorizado no puede crear propuestas de caja.
    const canPropose=event.senderAllowlisted===true;
    return {...base,type:'REPORTE_CAJA',cashAccount,direction,amountCop,
      conceptCategory:conceptCategory(body),
      status: !canPropose ? 'BLOQUEADO_REMITENTE_NO_AUTORIZADO'
        : amountCop==null ? 'PENDIENTE_IMPORTE'
          : event.account!==(hotels?'HOTELS':'SECURITY')
            ? 'REVISAR_CANAL_Y_NEGOCIO' : 'REPORTADO_PENDIENTE_VERIFICACION'};
  }
  return {...base,type:CUSTOMER.test(body)?'CONSULTA_CLIENTE':'NO_CLASIFICADO',
    status:'NO_CONTABILIZAR',amountCop:null,direction:null,cashAccount:null,conceptCategory:null};
}
