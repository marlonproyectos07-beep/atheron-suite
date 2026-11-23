import test from 'node:test';
import assert from 'node:assert/strict';
import { pollAuthorizedWhatsApp } from '../src/odoo-whatsapp-poller.mjs';

const ACCOUNT = { accountId: 81, businessUnit:'HOTELS', senders:['+573001112233'] };
const SINCE='2026-11-21 00:00:00';
const one = (overrides={})=>({
  id:901, wa_account_id:[81,'Hotel de prueba'],
  mobile_number:'+573001112233', message_type:'inbound',
  create_date:'2026-11-21 16:35:00',
  body:'Retiré $90.000 de Caja Hotels para transporte Uber',...overrides
});
const params = (more={})=>({accounts:[ACCOUNT],sinceUtc:SINCE,...more});

test('sin allowlist no consulta el servidor Odoo ni toca datos ajenos',async()=>{
  let calls=0;
  await assert.rejects(pollAuthorizedWhatsApp(params({
    accounts:[],reader:async()=>{calls++;return [one()]}
  })),/ACCOUNT_ALLOWLIST_REQUIRED/);
  assert.equal(calls,0);
});

test('rechaza teléfono remitente abierto, no autorizado o con comodines',async()=>{
  let calls=0;
  for(const invalid of [[],['*'],[''],['300 111 2233'],['+573001112233','+573001112233']]){
    await assert.rejects(pollAuthorizedWhatsApp(params({
      accounts:[{...ACCOUNT,senders:invalid}],
      reader:async()=>{calls++;return [one()]}
    })),/STAFF_PHONE_ALLOWLIST_REQUIRED/);
  }
  assert.equal(calls,0);
});

test('consulta Odoo CON filtro cuenta, inbound, remitente interno y fecha antes de leer body',async()=>{
  const calls=[];
  const reader=async args=>{calls.push(args);return [one()]};
  const r=await pollAuthorizedWhatsApp(params({reader}));
  assert.equal(calls.length,1);
  assert.equal(calls[0].model,'whatsapp.message');
  assert.equal(calls[0].method,'search_read');
  assert.deepEqual(calls[0].params.domain,[
    ['wa_account_id','=',81],['message_type','=','inbound'],
    ['mobile_number','in',['+573001112233']],['create_date','>=',SINCE]
  ]);
  assert.deepEqual(calls[0].params.fields,['id','wa_account_id','mobile_number','message_type','create_date','body']);
  assert.equal(r.inspectedAuthorizedMessages,1);
  assert.equal(r.coverage,'VENTANA_CONSULTADA');
  assert.equal(r.messages[0].status,'REPORTADO_PENDIENTE_VERIFICACION');
  assert.equal(r.messages[0].cashAccount,'CAJA_HOTELS');
  assert.equal(r.messages[0].amountCop,90000);
  assert.equal(r.messages[0].odooWrites,0);
  assert.equal(JSON.stringify(r).includes('573001112233'),false);
  assert.equal(JSON.stringify(r).includes('transporte Uber'),false);
});

test('si una respuesta incluye mensaje de cliente no autorizado, aborta sin resultados',async()=>{
  const reader=async()=>[one({mobile_number:'+573009998877',body:'Un cliente pregunta por la tarifa'})];
  await assert.rejects(pollAuthorizedWhatsApp(params({reader})),/SOURCE_SCOPE_VIOLATION/);
});

test('si hay mensajes de otra cuenta Odoo, no los clasifica',async()=>{
  const reader=async()=>[one({wa_account_id:[82,'Otra cuenta']})];
  await assert.rejects(pollAuthorizedWhatsApp(params({reader})),/SOURCE_SCOPE_VIOLATION/);
});

test('cualquier mensaje saliente queda fuera del alcance',async()=>{
  const reader=async()=>[one({message_type:'outbound'})];
  await assert.rejects(pollAuthorizedWhatsApp(params({reader})),/SOURCE_SCOPE_VIOLATION/);
});

test('una prueba técnica recibida no se contabiliza',async()=>{
  const reader=async()=>[one({body:'Hola, estamos en pruebas y queremos saber si llega el mensaje a odoo'})];
  const r=await pollAuthorizedWhatsApp(params({reader}));
  assert.equal(r.messages[0].type,'PRUEBA_TECNICA');
  assert.equal(r.messages[0].status,'NO_CONTABILIZAR');
  assert.equal(r.odooWrites,0);
});

test('mensaje del huésped en canal permitido no produce asiento ni propuesta contable',async()=>{
  const reader=async()=>[one({body:'Hola, quiero reservar habitación 201 para mañana'})];
  const r=await pollAuthorizedWhatsApp(params({reader}));
  assert.equal(r.messages[0].type,'CONSULTA_CLIENTE');
  assert.equal(r.messages[0].status,'NO_CONTABILIZAR');
  assert.equal(r.messages[0].amountCop,null);
});

test('si hay 2 alertas distintas de mismo valor no las une',async()=>{
  const reader=async()=>[one(),one({id:902,create_date:'2026-11-21 16:36:00'})];
  const r=await pollAuthorizedWhatsApp(params({reader}));
  assert.equal(r.messages.length,2);
  assert.notEqual(r.messages[0].messageKey,r.messages[1].messageKey);
});

test('si un mensaje idéntico se entrega 2 veces en el lote se deduplica por id',async()=>{
  const reader=async()=>[one(),one()];
  const r=await pollAuthorizedWhatsApp(params({reader}));
  assert.equal(r.messages.length,1);
});

test('lote lleno no garantiza cobertura, debe paginarse antes de darlo por completo',async()=>{
  const reader=async()=>[one()];
  const r=await pollAuthorizedWhatsApp(params({reader,maxPerAccount:1}));
  assert.equal(r.coverage,'INCOMPLETA_REQUIERE_PAGINACION');
  assert.equal(r.odooWrites,0);
});

test('no permite fechas o IDs inválidos ni llamadas ilimitadas',async()=>{
  let calls=0;
  for(const bad of [
    {sinceUtc:'ayer'},
    {maxPerAccount:1000},
    {accounts:[{...ACCOUNT,accountId:0}]},
    {accounts:[{...ACCOUNT,businessUnit:'CLIENTS'}]}
  ]){
    await assert.rejects(pollAuthorizedWhatsApp(params({...bad,reader:async()=>{calls++;return []}})));
  }
  assert.equal(calls,0);
});

test('si falla Odoo, no presenta el lote como procesado',async()=>{
  const reader=async()=>{throw new Error('NETWORK_DOWN')};
  await assert.rejects(pollAuthorizedWhatsApp(params({reader})),/NETWORK_DOWN/);
});

test('si el servidor devuelve mensajes sin body o demasiado grandes se detiene',async()=>{
  for(const body of [null, 'x'.repeat(12000)]){
    const reader=async()=>[one({body})];
    await assert.rejects(pollAuthorizedWhatsApp(params({reader})),/SOURCE_SCOPE_VIOLATION/);
  }
});

test('dos empresas pueden compartir receptor, sin mezclar cuentas ni mensajes',async()=>{
  const security={accountId:82,businessUnit:'SECURITY',senders:['+573004445566']};
  const calls=[];
  const reader=async ({params})=>{
    calls.push(params.domain);
    return params.domain[0][2]===81 ? [one()] : [one({
      id:903,wa_account_id:[82,'Security de prueba'],
      mobile_number:'+573004445566',
      body:'Entregué $125.000 de Caja Security para material'
    })];
  };
  const r=await pollAuthorizedWhatsApp(params({accounts:[ACCOUNT,security],reader}));
  assert.equal(r.messages.length,2);
  assert.equal(r.messages[0].cashAccount,'CAJA_HOTELS');
  assert.equal(r.messages[1].cashAccount,'CAJA_SECURITY');
  assert.equal(r.messages[1].status,'REPORTADO_PENDIENTE_VERIFICACION');
  assert.equal(calls.length,2);
  assert.equal(r.odooWrites,0);
});

test('si hay resultados fuera de fecha se aborta en vez de dar auditoría falsa',async()=>{
  await assert.rejects(pollAuthorizedWhatsApp(params({
    reader:async()=>[one({create_date:'2026-11-20 22:00:00'})]
  })),/SOURCE_SCOPE_VIOLATION/);
});
