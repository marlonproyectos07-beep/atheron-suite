import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeMobileNight } from '../src/mobile-availability.mjs';
const date = '2026-11-10';
const base = {
  result: 'CONCILIACION_POR_IDS_EN_MEMORIA', window: {from:date,to:date},
  safety: {writesEnabled:false,releaseUnlocked:false},
  counts: {blocksActive:1},summary:{CONFLICT:0},smoobuOverbooking:[],
  perReservation:[{unit:'201',arrival:date,departure:'2026-11-11',smoobuStatus:'ACTIVE',verdict:'MATCH'}],
};
test('Vigente sin PII ni disponibilidad certificada',()=>{
  const r=summarizeMobileNight(base,date,'2026-11-09T18:00:00Z');
  assert.equal(r.unidades[0].estado,'RESERVA_ACTIVA');
  assert.equal(r.unidades[1].estado,'SIN_RESERVA_ACTIVA_EN_LISTADO');
  assert.equal(r.disponibilidadCertificada,false);
  assert.equal(r.escrituras,0);
  assert.doesNotMatch(JSON.stringify(r),/documento|correo|huesped/i);
});
test('Cancelada no ocupa; casa completa obliga revisar todas',()=>{
  const cancelled={...base,perReservation:[{...base.perReservation[0],smoobuStatus:'CANCELLED'}]};
  assert.equal(summarizeMobileNight(cancelled,date,'x').unidades[0].estado,'SIN_RESERVA_ACTIVA_EN_LISTADO');
  const casa={...base,perReservation:[{...base.perReservation[0],unit:'CASA'}]};
  assert.equal(summarizeMobileNight(casa,date,'x').unidades[4].estado,'CASA_RESERVADA_REVISAR');
});
test('Falla cerrado si fechas o control de escrituras incorrectos',()=>{
  assert.equal(summarizeMobileNight({...base,window:{from:'2026-11-09',to:date}},date,'x'),null);
  assert.equal(summarizeMobileNight({...base,safety:{writesEnabled:true,releaseUnlocked:false}},date,'x'),null);
});
