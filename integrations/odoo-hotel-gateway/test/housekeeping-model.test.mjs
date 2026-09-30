import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ODOO_HOUSEKEEPING_STAGES,
  LOGICAL_HOUSEKEEPING_STAGES,
  UX_LABEL,
  onCheckout,
  startCleaning,
  finishCleaning,
  confirmReadyForGuest,
  reportIncident,
  resolveIncident,
  InvalidHousekeepingTransition,
  INCIDENT_CATEGORIES,
  computeHousekeepingPriority,
} from '../src/housekeeping-model.mjs';

test('ODOO_HOUSEKEEPING_STAGES son exactamente las 4 etapas reales confirmadas en Odoo (sin tocar)', () => {
  assert.deepEqual(ODOO_HOUSEKEEPING_STAGES, ['LISTA', 'POR_LIMPIAR', 'EN_LIMPIEZA', 'INCIDENCIA']);
});

test('LOGICAL_HOUSEKEEPING_STAGES son las 5 etapas del flujo aprobado por el CEO (Decision 1)', () => {
  assert.deepEqual(LOGICAL_HOUSEKEEPING_STAGES, ['POR_LIMPIAR', 'EN_LIMPIEZA', 'LISTA_PARA_REVISAR', 'LISTA', 'INCIDENCIA']);
});

test('UX_LABEL cubre las 5 etapas logicas, incluida LISTA_PARA_REVISAR', () => {
  assert.equal(Object.keys(UX_LABEL).length, 5);
  for (const stage of LOGICAL_HOUSEKEEPING_STAGES) assert.ok(UX_LABEL[stage]);
});

test('checkout -> aseo -> revision -> lista: ciclo feliz completo de 5 pasos', () => {
  let task = onCheckout('201');
  assert.equal(task.stage, 'POR_LIMPIAR');

  task = startCleaning(task);
  assert.equal(task.stage, 'EN_LIMPIEZA');

  task = finishCleaning(task);
  assert.equal(task.stage, 'LISTA_PARA_REVISAR');

  task = confirmReadyForGuest(task);
  assert.equal(task.stage, 'LISTA');
});

test('finishCleaning nunca salta directo a LISTA: siempre pasa por LISTA_PARA_REVISAR', () => {
  const task = startCleaning(onCheckout('201'));
  const afterFinish = finishCleaning(task);
  assert.equal(afterFinish.stage, 'LISTA_PARA_REVISAR');
  assert.notEqual(afterFinish.stage, 'LISTA');
});

test('confirmReadyForGuest exige pasar por LISTA_PARA_REVISAR primero (no se puede saltar desde EN_LIMPIEZA)', () => {
  const task = startCleaning(onCheckout('201')); // EN_LIMPIEZA
  assert.throws(() => confirmReadyForGuest(task), InvalidHousekeepingTransition);
});

test('transicion invalida se rechaza igual que Odoo real (mensaje claro, sin escribir nada)', () => {
  const task = onCheckout('201'); // POR_LIMPIAR
  assert.throws(() => finishCleaning(task), InvalidHousekeepingTransition);
  try {
    finishCleaning(task);
  } catch (e) {
    assert.match(e.message, /HOUSEKEEPING: transicion no permitida POR_LIMPIAR -> LISTA_PARA_REVISAR/);
  }
});

test('no se puede limpiar dos veces seguidas sin pasar por POR_LIMPIAR', () => {
  let task = onCheckout('201');
  task = startCleaning(task); // EN_LIMPIEZA
  task = finishCleaning(task); // LISTA_PARA_REVISAR
  task = confirmReadyForGuest(task); // LISTA
  assert.throws(() => startCleaning(task), InvalidHousekeepingTransition);
});

test('INCIDENCIA es alcanzable como rama lateral desde POR_LIMPIAR, EN_LIMPIEZA y LISTA_PARA_REVISAR', () => {
  const desdePorLimpiar = reportIncident(onCheckout('201'), 'OTRO');
  assert.equal(desdePorLimpiar.stage, 'INCIDENCIA');

  const desdeEnLimpieza = reportIncident(startCleaning(onCheckout('202')), 'OTRO');
  assert.equal(desdeEnLimpieza.stage, 'INCIDENCIA');

  const desdeListaParaRevisar = reportIncident(finishCleaning(startCleaning(onCheckout('203'))), 'OTRO');
  assert.equal(desdeListaParaRevisar.stage, 'INCIDENCIA');
});

test('una incidencia abierta nunca permite llegar a LISTA sin pasar de nuevo por aseo y revision (Regla v1)', () => {
  const withIncident = reportIncident(finishCleaning(startCleaning(onCheckout('201'))), 'DAÑO');
  assert.equal(withIncident.stage, 'INCIDENCIA');
  // Desde INCIDENCIA, LISTA_PARA_REVISAR y LISTA nunca son transiciones validas.
  assert.throws(() => confirmReadyForGuest(withIncident), InvalidHousekeepingTransition);
  assert.throws(() => finishCleaning(withIncident), InvalidHousekeepingTransition);
});

test('reportIncident exige categoria conocida', () => {
  const task = startCleaning(onCheckout('201'));
  assert.throws(() => reportIncident(task, 'CATEGORIA_INVENTADA'), /UNKNOWN_INCIDENT_CATEGORY/);
});

test('reportIncident nunca decide por su cuenta si bloquea la entrega: siempre decision_required (Regla v1)', () => {
  const task = startCleaning(onCheckout('201'));
  const withIncident = reportIncident(task, 'ELECTRICIDAD', { note: 'toma corriente danada' });
  assert.equal(withIncident.stage, 'INCIDENCIA');
  assert.equal(withIncident.incident.decision_required, true);
  assert.equal(withIncident.incident.resolved_by, null);
});

test('reportIncident no asume severidad por categoria: severity siempre null hasta que exista una regla futura', () => {
  for (const category of INCIDENT_CATEGORIES) {
    const withIncident = reportIncident(startCleaning(onCheckout('201')), category);
    assert.equal(withIncident.incident.severity, null);
  }
});

test('resolveIncident exige autorizacion humana explicita: falla cerrado sin authorizedBy', () => {
  const withIncident = reportIncident(startCleaning(onCheckout('201')), 'OTRO');
  assert.throws(
    () => resolveIncident(withIncident, 'POR_LIMPIAR'),
    /INCIDENT_RESOLUTION_REQUIRES_EXPLICIT_HUMAN_AUTHORIZATION/,
  );
});

test('resolveIncident solo aplica sobre una tarea que esta en INCIDENCIA', () => {
  const task = startCleaning(onCheckout('201')); // EN_LIMPIEZA, sin incidencia
  assert.throws(
    () => resolveIncident(task, 'POR_LIMPIAR', { authorizedBy: 'angela' }),
    /CANNOT_RESOLVE_INCIDENT_OUTSIDE_INCIDENCIA_STAGE/,
  );
});

test('resolveIncident con autorizacion explicita libera de vuelta al ciclo, nunca directo a LISTA', () => {
  const withIncident = reportIncident(startCleaning(onCheckout('201')), 'DAÑO', { note: 'grifo goteando' });
  const resolved = resolveIncident(withIncident, 'POR_LIMPIAR', { authorizedBy: 'marlon', resolutionNote: 'reparado' });
  assert.equal(resolved.stage, 'POR_LIMPIAR');
  assert.equal(resolved.incident.decision_required, false);
  assert.equal(resolved.incident.resolved_by, 'marlon');
  assert.equal(resolved.incident.resolution_note, 'reparado');
  // Sigue exigiendo el ciclo completo de nuevo: no hay atajo hacia LISTA.
  assert.throws(() => confirmReadyForGuest(resolved), InvalidHousekeepingTransition);
});

test('INCIDENT_CATEGORIES son exactamente las 6 pedidas por el CEO', () => {
  assert.deepEqual(INCIDENT_CATEGORIES, ['BAÑO', 'DUCHA', 'LENCERÍA', 'ELECTRICIDAD', 'DAÑO', 'OTRO']);
});

test('computeHousekeepingPriority: ALTA si llega hoy, MEDIA si llega mañana, NORMAL si no hay llegada', () => {
  const units = [
    { unit: '301', nextArrivalDate: null },
    { unit: '201', nextArrivalDate: '2026-10-01' },
    { unit: '202', nextArrivalDate: '2026-10-02' },
  ];
  const sorted = computeHousekeepingPriority(units, '2026-10-01');
  assert.deepEqual(sorted.map((u) => u.unit), ['201', '202', '301']);
  assert.deepEqual(sorted.map((u) => u.priority), ['ALTA', 'MEDIA', 'NORMAL']);
});

test('computeHousekeepingPriority nunca obliga a Angela a calcular nada: el orden ya viene resuelto', () => {
  const units = [
    { unit: 'A', nextArrivalDate: '2026-10-02' },
    { unit: 'B', nextArrivalDate: '2026-10-01' },
  ];
  const sorted = computeHousekeepingPriority(units, '2026-10-01');
  assert.equal(sorted[0].unit, 'B');
});
