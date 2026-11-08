import test from 'node:test';
import assert from 'node:assert/strict';
import { ControlGate } from '../src/control-gate.mjs';

const goodState = [{id:1,x_epoch:2,x_emergency:false}];
const goodNode = [{id:4,x_eff_auto_reply:true,x_eff_auto_booking:true,x_eff_status:'ACTIVO'}];
function client({states=goodState,nodes=goodNode,fail=false,delay=0}={}) {
 let t=1000;
 return {now:()=>t, odoo:{searchRead:async(model)=>{if(fail)throw Error('offline'); if(delay)t+=delay; return model==='x_ath_state'?states:nodes;}}};
}
test('permite solo cuando estado global y nodo cuenta están activos',async()=>{
 const f=client(); const g=new ControlGate(f.odoo,{now:f.now}); assert.equal((await g.check()).allowed,true);
});
test('bloquea por defecto efectivo apagado',async()=>{
 const f=client({nodes:[{...goodNode[0],x_eff_auto_reply:false}]}); const r=await new ControlGate(f.odoo,{now:f.now}).check(); assert.equal(r.code,'AUTO_REPLY_DISABLED');
});
test('emergencia global bloquea incluso con nodo encendido',async()=>{
 const f=client({states:[{id:1,x_epoch:3,x_emergency:true}]}); const r=await new ControlGate(f.odoo,{now:f.now}).check(); assert.equal(r.code,'EMERGENCY_ACTIVE');
});
test('bloquea reserva si interruptor de reservas está apagado',async()=>{
 const f=client({nodes:[{...goodNode[0],x_eff_auto_booking:false}]}); const r=await new ControlGate(f.odoo,{now:f.now}).check({requireReply:false,requireBooking:true}); assert.equal(r.code,'AUTO_BOOKING_DISABLED');
});
test('bloquea estado ausente, ambiguo o malformado',async()=>{
 for(const opts of [{states:[]},{nodes:[]},{states:[{id:1,x_epoch:0,x_emergency:false}]}]) {
  const f=client(opts); assert.equal((await new ControlGate(f.odoo,{now:f.now}).check()).allowed,false);
 }
});
test('bloquea desconexión y lecturas lentas',async()=>{
 const f=client({fail:true}); assert.equal((await new ControlGate(f.odoo,{now:f.now}).check()).code,'CONTROL_READ_FAILED');
 const slow=client({delay:4000}); assert.equal((await new ControlGate(slow.odoo,{now:slow.now}).check()).code,'CONTROL_READ_TOO_SLOW');
});
