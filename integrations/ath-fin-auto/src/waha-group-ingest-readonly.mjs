// ATH-WA-GROUP-001
// HTTPS webhook handler core for a private WAHA receiver (read-only, no outbound).
// Text payloads remain in private process memory and go ONLY into a caller-provided
// encrypted private sink. Do not log inputs, phone numbers, group IDs or body.
// WARNING: WAHA is an unofficial WhatsApp Web bridge. Never link critical hotel number.
import {createHash, createHmac, timingSafeEqual} from 'node:crypto';

const MAX_PAYLOAD_BYTES = 128 * 1024;
const GROUP_ID = /^[0-9]{6,24}@g\.us$/;
const MEMBER_ID = /^[0-9]{6,24}@(c\.us|lid)$/;
const SHA512_HEX = /^[a-fA-F0-9]{128}$/;

const hash = s => createHash('sha256').update(s).digest('hex');

function getHeader(headers, key) {
  if (typeof headers?.get === 'function') return headers.get(key) ?? '';
  if (!headers || typeof headers !== 'object') return '';
  return Object.entries(headers).find(([k])=>k.toLowerCase()===key.toLowerCase())?.[1] || '';
}

function rejected(status, code) {
  // Never return raw event data, account IDs, phone numbers, or error objects.
  return {status, code};
}

/**
 * `storeOnce` MUST guarantee atomic insert by eventKey in a durable,
 * encrypted, private database. It returns true (new) or false (duplicate).
 * Caller must refuse to start the listener until a real private store exists.
 * The groupId and sender IDs must come from verified private deployment config.
 */
export function createWahaGroupReceiver({
  hmacSecret, allowedGroupId, allowedSenders, storeOnce, expectedSession='atheron-group'
}) {
  if (typeof hmacSecret !== 'string' || Buffer.byteLength(hmacSecret) < 32 ||
      !GROUP_ID.test(allowedGroupId) || !Array.isArray(allowedSenders) ||
      allowedSenders.length<1 || allowedSenders.length>25 ||
      allowedSenders.some(s=>!MEMBER_ID.test(s)) ||
      new Set(allowedSenders).size!==allowedSenders.length ||
      typeof storeOnce!=='function' ||
      typeof expectedSession!=='string' || !/^[a-z0-9_-]{3,48}$/i.test(expectedSession)) {
    throw new Error('PRIVATE_CONFIG_OR_DURABLE_STORE_REQUIRED');
  }
  const allowed = new Set(allowedSenders);

  return async function receive({rawBody, headers}) {
    if (!Buffer.isBuffer(rawBody) || rawBody.length===0 ||
        rawBody.length>MAX_PAYLOAD_BYTES) return rejected(413, 'INVALID_BODY');
    if (String(getHeader(headers,'X-Webhook-Hmac-Algorithm')).toLowerCase()!=='sha512')
      return rejected(401,'SIGNATURE_REQUIRED');
    const signed = String(getHeader(headers,'X-Webhook-Hmac'));
    if (!SHA512_HEX.test(signed)) return rejected(401,'SIGNATURE_REQUIRED');
    const calculated=createHmac('sha512',hmacSecret).update(rawBody).digest();
    if (!timingSafeEqual(Buffer.from(signed,'hex'),calculated))
      return rejected(401,'INVALID_SIGNATURE');

    let event;
    try { event=JSON.parse(rawBody.toString('utf8')); }
    catch { return rejected(400,'MALFORMED_JSON'); }

    // HMAC authenticity is not authorization. Both session and chat *ID* checked.
    if (event?.event!=='message' || event.session!==expectedSession)
      return rejected(202,'EVENT_OUT_OF_SCOPE');

    const p=event.payload;
    if (!p || typeof p !== 'object') return rejected(400,'INVALID_MESSAGE');
    // WAHA may supply chatId, from, or to; group must be an EXACT match,
    // and not inferred from the human-readable group title.
    const chatIds=[...new Set([p.chatId,p.from,p.to]
      .filter(s=>typeof s==='string' && GROUP_ID.test(s)))];
    if (chatIds.length!==1 || chatIds[0]!==allowedGroupId)
      return rejected(202,'GROUP_OUT_OF_SCOPE');
    if (p.fromMe===true) return rejected(202,'OUTGOING_IGNORED');

    // WAHA group participants can have a hidden @lid identifier. No display
    // name or phone-number inference. Unknown sender -> quarantine by rejection.
    if (!MEMBER_ID.test(p.participant || '') || !allowed.has(p.participant))
      return rejected(202,'SENDER_OUT_OF_SCOPE');
    if (typeof p.id!=='string' || p.id.length<10 || p.id.length>512 ||
        !Number.isFinite(p.timestamp) || p.timestamp<=0)
      return rejected(422,'INVALID_MESSAGE');

    const hasMedia=p.hasMedia === true;
    const body=typeof p.body==='string' ? p.body.slice(0,8000) : '';
    if (!hasMedia && body.trim().length===0) return rejected(202,'EMPTY_CONTENT');

    const mediaType=hasMedia && typeof p.media?.mimetype==='string'
      ? p.media.mimetype.slice(0,80) : null;
    const type=hasMedia ? 'MEDIA_PENDING_SECURE_FETCH' : 'TEXT';
    // For media, only mark pending. Never fetch arbitrary p.media.url here:
    // media download needs a separately authenticated, SSRF-safe worker.
    const eventKey=hash('WAHA_GROUP:' + allowedGroupId + ':' + p.id);
    const record={
      eventKey,
      source:'WHATSAPP_GROUP_WAHA',
      groupKey:hash(allowedGroupId),
      senderKey:hash(p.participant),
      dateUtc:new Date(p.timestamp*1000).toISOString(),
      type,
      body, // sensitive: only into encrypted, private sink; NEVER log
      hasMedia,
      mediaType,
      status:'REPORTADO_PENDIENTE_REVISION',
      bankConfirmed:false,
      odooReconciled:false,
      approved:false,
      odooWrites:0
    };
    try {
      const stored=await storeOnce(record);
      if (typeof stored!=='boolean') throw new Error('STORE_CONTRACT_VIOLATION');
      return {status:stored?202:200,code:stored?'ACCEPTED_PRIVATE':'ALREADY_SEEN'};
    } catch {
      // A failed store must be retried by WAHA; do not falsely acknowledge.
      return rejected(503,'PRIVATE_STORE_UNAVAILABLE');
    }
  };
}
