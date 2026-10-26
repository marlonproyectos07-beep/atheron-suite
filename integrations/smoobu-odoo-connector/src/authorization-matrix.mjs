/**
 * Matriz de autorizaciones (ATH-DEV-017): para cada operacion futura sobre Odoo de produccion, que se sabe, que
 * lo impide y si existe una version suficientemente segura. Los veredictos se CALCULAN a partir de hechos, para
 * que un cambio de hecho (p. ej. neutralizar el cron 147) cambie la conclusion en las pruebas.
 */
export const FACTS = Object.freeze({
  cron147CanBeDisabledSelectively: false, // regenera TODOS los .ics cada 5 min; apagarlo corta la salida a OTAs/NOBEDS (prohibido)
  icalFeedIncludesPublishedDirectSlots: true,
  rules167169FireOnPublished: true,
  draftSlotFiresMirrorsOrIcal: false, // dominio exige state=published (167/169) y el feed solo incluye published
  bookingEngineIgnoresState: true,
  nativeReleaseIsDeleteOnly: true,
  deleteCascadesSharedMirrors: true, // automatizacion 168
  smoobuApiEnabled: false,
  stagingAvailable: false,
  keyLeaksInPublicIcalWhenInName: true,
  guestPlaceholderVerified: false, // se actualiza tras leer res.partner 7 y sus usos
});

export const OPERATIONS = Object.freeze([
  { id: 'P0', op: 'Crear UN turno BORRADOR de 301, una noche PASADA y libre', writes: ['planning.slot x1'] },
  { id: 'P1', op: 'Crear UN turno PUBLICADO de 301 en una noche futura o pasada', writes: ['planning.slot x1', 'espejo de Casa (regla 169)'] },
  { id: 'P2', op: 'Crear un turno publicado de Casa Completa', writes: ['planning.slot x1', 'hasta 5 espejos (regla 167)'] },
  { id: 'P3', op: 'Turno de cobertura de Casa (x_bloqueo_ref)', writes: ['planning.slot x1'] },
  { id: 'P4', op: 'Modificar fechas de un turno existente', writes: ['planning.slot'] },
  { id: 'P5', op: 'Liberar con state=draft o x_checkin_state=cancelled', writes: ['planning.slot'] },
  { id: 'P6', op: 'Borrar un turno propio', writes: ['planning.slot', 'espejos por regla 168'] },
  { id: 'P7', op: 'Escribir x_nobeds_id desde el conector', writes: ['planning.slot'] },
  { id: 'P8', op: 'Escribir en Smoobu (confirmar reserva)', writes: ['Smoobu'] },
]);

export function evaluateOperation(id, facts = FACTS) {
  const f = facts;
  const v = (verdict, reasons, conditions = []) => ({ id, verdict, reasons, conditions });
  switch (id) {
    case 'P0': {
      const reasons = []; const conditions = ['noche pasada, libre en las seis unidades y sin cierre del recurso', 'autorizacion expresa de Marlon', 'borrado de limpieza autorizado y manual (caso por caso)', 'verificacion posterior por lectura'];
      if (f.draftSlotFiresMirrorsOrIcal) return v('NO_SEGURO', ['un borrador dispararia espejos o iCal']);
      reasons.push('un borrador no cumple el dominio de 167/169 ni entra en el iCal: sin espejo, sin publicacion a OTAs, sin eco');
      reasons.push('solo corre 12 (sin efecto con horas correctas) y 22 (recalculo interno; fecha pasada)');
      if (!f.guestPlaceholderVerified) reasons.push('la clave en name no sale al iCal porque el borrador no entra en el feed');
      return v('AUTORIZABLE_CON_APROBACION_EXPRESA', reasons, conditions);
    }
    case 'P1': case 'P2':
      if (f.icalFeedIncludesPublishedDirectSlots && f.rules167169FireOnPublished && !f.cron147CanBeDisabledSelectively)
        return v('PILOTO_PRODUCTIVO_NO_SEGURO', ['crea espejos por 167/169 y entra en el .ics en <= 5 min (cron 147)', 'cron 147 no puede neutralizarse selectivamente sin cortar la salida a OTAs/NOBEDS (prohibido apagarlo)', 'no se puede descartar el eco con Smoobu', 'sin staging no hay prueba previa'], ['staging aislado o neutralizacion selectiva del feed']);
      return v('REQUIERE_PRUEBA_EN_STAGING', ['depende de la neutralizacion y de la prueba']);
    case 'P3': return v('BLOQUEADA', ['sale en el iCal de Casa; requiere staging y pruebas de efectos laterales'], ['staging']);
    case 'P4': return v('BLOQUEADA', ['167/169 no actualizan el espejo existente: hueco de bloqueo en Casa']);
    case 'P5': return v(f.bookingEngineIgnoresState ? 'INEFICAZ_Y_BLOQUEADA' : 'REQUIERE_PRUEBA', ['el Booking Engine ignora state y x_checkin_state: no libera disponibilidad']);
    case 'P6': return v('SOLO_MANUAL_NUNCA_AUTOMATICA', ['unica via nativa de liberar', f.deleteCascadesSharedMirrors ? 'la regla 168 borra los espejos del turno, tambien si cubren a otra habitacion' : ''].filter(Boolean), ['revision manual de espejos compartidos', 'autorizacion expresa']);
    case 'P7': return v('PROHIBIDA', ['activaria 164 (borra el turno), 170 (crea ventas y contactos) y 171']);
    case 'P8': return v(f.smoobuApiEnabled ? 'REQUIERE_DISENO' : 'BLOQUEADA', ['la API de Smoobu responde 401']);
    default: throw new Error('UNKNOWN_OPERATION');
  }
}
export const evaluateAll = (facts = FACTS) => OPERATIONS.map((o) => ({ ...o, ...evaluateOperation(o.id, facts) }));
