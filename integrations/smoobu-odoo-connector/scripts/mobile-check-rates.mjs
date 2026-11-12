#!/usr/bin/env node
// ATH-MOBILE-001: comprueba una noche por habitacion con GET /api/rates y GET reservas.
// Solo publica disponibilidad sintetica (sin huespedes ni IDs).
import { readFileSync } from 'node:fs';
import { SmoobuClient } from '../src/smoobu-client.mjs';
import { loadSmoobuConfig } from '../src/config.mjs';
import { classifyBooking, KINDS } from '../src/classify.mjs';
import { MOBILE_ROOMS } from '../src/mobile-availability.mjs';
import { unitForName } from '../src/unit-map.mjs';
import { isIsoDate, addDays } from '../src/window.mjs';

const PATH = new URL('../../atheron-mobile-api/requests/consulta.json', import.meta.url);
const fail = (code) => { console.log('ATHERON_CHECK_RESULT=' + JSON.stringify({ ok:false, error:code, writes:0 })); process.exitCode = 1; };
try {
  const body = JSON.parse(readFileSync(PATH,'utf8'));
  if (body.operacion !== 'VERIFICAR_DISPONIBILIDAD' || !Array.isArray(body.consultas) || body.consultas.length === 0 || body.consultas.length > 2 ||
      !body.consultas.every((q)=> isIsoDate(q.fecha) && MOBILE_ROOMS.includes(q.habitacion))) throw new Error('SOLICITUD_INVALIDA');
  const sc=loadSmoobuConfig(process.env);
  const client=new SmoobuClient({...sc,pathPrefix:'/api'});
  const results=[];
  for (const { fecha, habitacion } of body.consultas) {
    const apartment=unitForName(habitacion)?.smoobuApartmentId;
    if (!apartment) throw new Error('HABITACION_NO_CONFIGURADA');
    const rates=await client.get('/rates',{'apartments[]':String(apartment),start_date:fecha,end_date:fecha});
    const day=rates?.data?.[String(apartment)]?.[fecha];
    // La doc oficial indica available 0/1. Rechazar cualquier forma inesperada.
    const availability=day?.available;
    if (!(availability===0||availability===1||availability==='0'||availability==='1')) throw new Error('SMOOBU_RATES_INVALID');
    const minStay=day?.min_length_of_stay;
    const restriction = minStay == null ? false : Number(minStay) > 1;
    const bookings=await client.listReservations({from:addDays(fecha,-1),to:addDays(fecha,1),pageSize:100,includeCancelled:true},{maxPages:5});
    const related=bookings.map(classifyBooking).filter(c=> c.arrival<=fecha && c.departure>fecha && [habitacion,'CASA'].includes(c.unit));
    const activeReservations=related.filter(c=>[KINDS.RESERVATION,KINDS.MODIFICATION].includes(c.kind)).length;
    const activeBlocks=related.filter(c=>c.kind===KINDS.BLOCK&&c.blockedActive).length;
    const unclassified=related.filter(c=>[KINDS.OTHER_TYPE,KINDS.UNMAPPED,KINDS.INVALID].includes(c.kind)).length;
    const rateAvailable=Number(availability)===1;
    const canSell=rateAvailable && !restriction && activeReservations===0 && activeBlocks===0 && unclassified===0;
    results.push({
      fecha,habitacion,
      disponibleSmoobu:canSell,
      calendarioDisponible:rateAvailable,
      restriccionMinimoNoches:restriction,
      reservasActivas:activeReservations,
      bloqueosActivos:activeBlocks,
      registrosNoClasificados:unclassified,
      verificable:true,
    });
  }
  console.log('ATHERON_CHECK_RESULT='+JSON.stringify({
    ok:true,
    checkedUTC:new Date().toISOString(),
    fuente:'GET /api/rates y GET /api/reservations Smoobu HMAC',
    disponibilidadCondicionadaAConfirmacionAlReservar:true,
    writes:0, consultas:results,
  }));
} catch(e){ fail(['SMOOBU_RATES_INVALID','SOLICITUD_INVALIDA','HABITACION_NO_CONFIGURADA'].includes(e.message)?e.message:(e.code??'SMOOBU_API_NO_VERIFICABLE')); }
