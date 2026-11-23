import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {createWahaGroupReceiver} from '../src/waha-group-ingest-readonly.mjs';

const SECRET='S'.repeat(48);
const GROUP='123456789012345@g.us';
const OTHER_GROUP='9999999999999@g.us';
const STAFF='573000000001@c.us';
const STRANGER='573000000002@c.us';
const msg=()=>({
 event:'message',session:'atheron-group',payload:{
  id:'false_123456789012345@g.us_AABBCCDD01020304',
  timestamp:1795300000,chatId:GROUP,from:GROUP,
  participant:STAFF,fromMe:false,
  body:'Retiré 90.000 de Caja Hotels para compra de aseo',
  hasMedia:false
 }});
const sign=payload=>{
 const rawBody=Buffer.from(JSON.stringify(payload));
 const signature=createHmac('sha512',SECRET).update(rawBody).digest('hex');
 return {rawBody,headers:{'X-Webhook-Hmac':signature,'X-Webhook-Hmac-Algorithm':'sha512'}};
};
function receiver(storeOnce=async()=>true,overrides={}){
 return createWahaGroupReceiver({
  hmacSecret:SECRET,allowedGroupId:GROUP,allowedSenders:[STAFF],
  storeOnce,...overrides
 });
}

test('HMAC verified group message stored exactly once; no accounting or public details',async()=>{
 const received=[];
 const ret=await receiver(async value=>{received.push(value);return true})(sign(msg()));
 assert.deepEqual(ret,{status:202,code:'ACCEPTED_PRIVATE'});
 assert.equal(received.length,1);
 assert.equal(received[0].body.includes('Caja Hotels'),true);
 assert.equal(received[0].approved,false);
 assert.equal(received[0].bankConfirmed,false);
 assert.equal(received[0].odooWrites,0);
 assert.equal(JSON.stringify(ret).includes('Caja Hotels'),false);
 assert.equal(JSON.stringify(ret).includes(STAFF),false);
 assert.equal(JSON.stringify(received[0]).includes(STAFF),false);
 assert.equal(JSON.stringify(received[0]).includes(GROUP),false);
});

test('duplicate by durable store returns ALREADY_SEEN, not a second insert',async()=>{
 const seen=new Set();
 const store=async x=>{if(seen.has(x.eventKey))return false;seen.add(x.eventKey);return true};
 const ingest=receiver(store);
 assert.equal((await ingest(sign(msg()))).code,'ACCEPTED_PRIVATE');
 assert.equal((await ingest(sign(msg()))).code,'ALREADY_SEEN');
 assert.equal(seen.size,1);
});

test('invalid signature blocks event before parsing or saving',async()=>{
 let count=0;
 const ingest=receiver(async()=>{count++;return true});
 const bad=sign(msg());
 bad.headers['X-Webhook-Hmac']='f'.repeat(128);
 assert.equal((await ingest(bad)).status,401);
 assert.equal(count,0);
});

test('missing signature, algorithm or payload blocks without saving',async()=>{
 let count=0;
 const ingest=receiver(async()=>{count++;return true});
 for(const bad of [
  {rawBody:Buffer.from('{}'),headers:{}},
  {rawBody:Buffer.from('{}'),headers:{'X-Webhook-Hmac':'a'.repeat(128)}},
  {rawBody:Buffer.alloc(128*1024+1),headers:{}},
  {rawBody:Buffer.alloc(0),headers:{}}
 ]){
  const r=await ingest(bad); assert.ok([401,413].includes(r.status));
 }
 assert.equal(count,0);
});

test('rejects other groups and direct messages even with correct signature',async()=>{
 let count=0;const ingest=receiver(async()=>{count++;return true});
 for(const changed of [
  {chatId:OTHER_GROUP,from:OTHER_GROUP},
  {chatId:'573000111222@c.us',from:'573000111222@c.us'},
  {chatId:GROUP,from:OTHER_GROUP}
 ]){
  const event=msg();Object.assign(event.payload,changed);
  const ret=await ingest(sign(event));
  assert.equal(ret.code,'GROUP_OUT_OF_SCOPE');
 }
 assert.equal(count,0);
});

test('rejects unapproved sender, unknown participant, or outbound event',async()=>{
 let count=0;const ingest=receiver(async()=>{count++;return true});
 for(const changed of [
  {participant:STRANGER},{participant:null},{participant:'Juan'},
  {fromMe:true}
 ]){
  const event=msg();Object.assign(event.payload,changed);
  const ret=await ingest(sign(event));
  assert.equal(ret.status,202);
 }
 assert.equal(count,0);
});

test('only message event in chosen session is processed',async()=>{
 let count=0;const ingest=receiver(async()=>{count++;return true});
 for(const changed of [
  {event:'message.any'}, {session:'other-session'}, {event:'group.v2.participants'}
 ]){
  const event={...msg(),...changed};
  const ret=await ingest(sign(event));
  assert.equal(ret.code,'EVENT_OUT_OF_SCOPE');
 }
 assert.equal(count,0);
});

test('valid media is marked pending; untrusted media.url not used or copied',async()=>{
 let copy;
 const ingest=receiver(async rec=>{copy=rec;return true});
 const event=msg();
 event.payload.hasMedia=true;event.payload.body='';
 event.payload.media={
  mimetype:'image/jpeg',
  url:'http://169.254.169.254/latest/meta-data/iam/security-credentials'
 };
 const ret=await ingest(sign(event));
 assert.equal(ret.code,'ACCEPTED_PRIVATE');
 assert.equal(copy.type,'MEDIA_PENDING_SECURE_FETCH');
 assert.equal(copy.hasMedia,true);
 assert.equal(copy.mediaType,'image/jpeg');
 assert.equal(JSON.stringify(copy).includes('169.254'),false);
});

test('never acknowledges an unpersisted message',async()=>{
 const ret=await receiver(async()=>{throw new Error('DB_DOWN')})(sign(msg()));
 assert.deepEqual(ret,{status:503,code:'PRIVATE_STORE_UNAVAILABLE'});
});

test('rejects construction without private config or durable sink',()=>{
 for(const x of [
  {hmacSecret:'short'}, {allowedGroupId:'human group name'},
  {allowedSenders:[]},{allowedSenders:['open group']},
  {storeOnce:null}
 ]){
  assert.throws(()=>receiver(undefined,x),/PRIVATE_CONFIG_OR_DURABLE_STORE_REQUIRED/);
 }
});

test('event keys separate same amount with different message IDs',async()=>{
 const results=[];
 const ingest=receiver(async r=>{results.push(r);return true});
 const a=msg(),b=msg();
 b.payload.id+='ZZ';
 await ingest(sign(a));await ingest(sign(b));
 assert.equal(results.length,2);
 assert.notEqual(results[0].eventKey,results[1].eventKey);
});
