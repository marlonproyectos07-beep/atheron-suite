import test from 'node:test';
import assert from 'node:assert/strict';
import { createOdooWhatsAppReader } from '../src/odoo-whatsapp-reader.mjs';
import { pollAuthorizedWhatsApp } from '../src/odoo-whatsapp-poller.mjs';

const config = {
 baseUrl:'https://atheron1.odoo.com',database:'atheron1',apiKey:'x'.repeat(40)
};
const params = {
 model:'whatsapp.message',method:'search_read',
 params:{
   domain:[['wa_account_id','=',81],['message_type','=','inbound'],
           ['mobile_number','in',['+573001112233']],['create_date','>=','2026-11-21 00:00:00']],
   fields:['id','wa_account_id','mobile_number','message_type','create_date','body'],
   order:'create_date asc,id asc',limit:50
 }
};
function mockResponse(payload=[]){
 return {ok:true,status:200,headers:{get:()=>null},
   text:async()=>JSON.stringify(payload)};
}
test('client only makes JSON-2 search_read request with bearer token to authorized hostname',async()=>{
  const calls=[];
  const client=createOdooWhatsAppReader({...config,fetchImpl:async(url,options)=>{
    calls.push({url,options});return mockResponse([{id:901}]);
  }});
  const d=await client(params);
  assert.deepEqual(d,[{id:901}]);
  assert.equal(calls.length,1);
  assert.equal(calls[0].url,'https://atheron1.odoo.com/json/2/whatsapp.message/search_read');
  assert.equal(calls[0].options.method,'POST');
  assert.equal(calls[0].options.redirect,'error');
  assert.equal(calls[0].options.headers['X-Odoo-Database'],'atheron1');
  assert.equal(calls[0].options.headers.Authorization,'bearer '+config.apiKey);
  assert.equal(calls[0].options.body.includes(config.apiKey),false);
});
test('client denies other hosts, redirects, db and missing API key before network',()=>{
 for(const patch of [{baseUrl:'https://attacker.example'},
                     {baseUrl:'http://atheron1.odoo.com'},
                     {baseUrl:'https://atheron1.odoo.com.evil.com'},
                     {baseUrl:'https://atheron1.odoo.com/redirect'},
                     {database:'different-database'},
                     {apiKey:'short'}]){
   assert.throws(()=>createOdooWhatsAppReader({...config,...patch,fetchImpl:async()=>mockResponse()}));
 }
});
test('client rejects all writes, other models and queries without sender filter',async()=>{
 let calls=0;
 const client=createOdooWhatsAppReader({...config,fetchImpl:async()=>{
   calls++;return mockResponse();
 }});
 const invalid=[
  {...params,method:'create'},
  {...params,model:'account.move'},
  {...params,params:{...params.params,domain:[]}},
  {...params,params:{...params.params,domain:[
    ['wa_account_id','=',81],['message_type','=','inbound'],
    ['mobile_number','in',[]],['create_date','>=','2026-11-21 00:00:00']
  ]}},
  {...params,params:{...params.params,domain:[
    ['wa_account_id','=',81],['message_type','=','outbound'],
    ['mobile_number','in',['+573001112233']],['create_date','>=','2026-11-21 00:00:00']
  ]}},
  {...params,params:{...params.params,fields:['id','body']}}
 ];
 for(const bad of invalid)await assert.rejects(client(bad),/READ_ONLY_ALLOWLIST_VIOLATION/);
 assert.equal(calls,0);
});
test('client fails closed on remote errors or oversized responses',async()=>{
 for(const response of [
   {ok:false,status:403,headers:{get:()=>null}},
   {ok:true,status:200,headers:{get:()=> '500000'}},
   {ok:true,status:200,headers:{get:()=>null},text:async()=>'{malformed'},
   mockResponse({error:'No rights'}),
 ]){
   const client=createOdooWhatsAppReader({...config,fetchImpl:async()=>response});
   await assert.rejects(client(params),/ODOO_READ_FAILED|ODOO_BAD_RESPONSE/);
 }
});
test('full reader + poller classifies only authorized synthetic staff report',async()=>{
 const fetchImpl=async(url,options)=>{
  const q=JSON.parse(options.body);
  assert.equal(q.domain[2][0],'mobile_number');
  assert.deepEqual(q.domain[2][2],['+573001112233']);
  return mockResponse([{
   id:901,wa_account_id:[81,'Cuenta simulada'],
   mobile_number:'+573001112233',message_type:'inbound',
   create_date:'2026-11-21 16:35:00',body:'Retiré $90.000 de Caja Hotels para transporte'
  }]);
 };
 const reader=createOdooWhatsAppReader({...config,fetchImpl});
 const r=await pollAuthorizedWhatsApp({
  reader,accounts:[{accountId:81,businessUnit:'HOTELS',senders:['+573001112233']}],
  sinceUtc:'2026-11-21 00:00:00'
 });
 assert.equal(r.messages.length,1);
 assert.equal(r.messages[0].status,'REPORTADO_PENDIENTE_VERIFICACION');
 assert.equal(r.messages[0].amountCop,90000);
 assert.equal(r.odooWrites,0);
});
