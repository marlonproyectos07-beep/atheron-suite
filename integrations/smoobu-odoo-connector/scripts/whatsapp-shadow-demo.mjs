#!/usr/bin/env node
// Demo completamente local. Solo mensajes y tarifas SINTÉTICAS; nunca utiliza secretos o red.
import { advanceInquiry, previewAvailability } from '../src/whatsapp-pilot-shadow.mjs';
const today='2026-11-07';
const first=advanceInquiry({message:'Hola, somos 2 personas',messageId:'wamid.DEMO01',accountId:7,today});
const second=advanceInquiry({message:'Del 2026-11-09 al 2026-11-10',messageId:'wamid.DEMO02',accountId:7,today,previous:first.state});
const preview=previewAvailability({inquiry:second,rates:{'3557506':{'2026-11-09':{available:1,price:95000,min_length_of_stay:1}}}});
console.log(JSON.stringify({scenario:'SYNTHETIC_OFFLINE_ONLY',first:{kind:first.kind,draft:first.draft},second:{kind:second.kind,readOnlyRequest:second.readOnlyRequest},preview:{kind:preview.kind,draft:preview.draft,candidates:preview.candidates,unresolved:preview.unresolved},outboundMessages:0,bookingWrites:0,odooWrites:0},null,2));
