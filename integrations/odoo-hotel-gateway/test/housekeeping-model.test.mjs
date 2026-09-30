import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ODOO_HOUSEKEEPING_STAGES,
  UX_LABEL,
  onCheckout,
  startCleaning,
  finishCleaning,
  reportIncident,
  InvalidHousekeepingTransition,
  INCIDENT_CATEGORIES,
  computeHousekeepingPriority,
} from '../src/housekeeping-model.mjs';

test('ODOO_HOUSEKEEPING_STAGES son exactamente las 4 etapas reales confirmadas en Odoo', () => {
  assert.deepEqual(ODOO_HOUSEKEEPING_STAGES, ['LISTA', 'POR_LIMPIAR', 'EN_LIMPIEZA', 'INCIDENCIA']);
});

test('UX_LABEL cubre las 4 etapas reales, sin inventar una 5ta', () => {
  assert.equal(Object.keys(UX_LABEL).length, 4);
  for (const stage of ODOO_HOUSEKEEPING_STAGES) assert.ok(UX_LABEL[stage]);
});

test('checkout -> aseo -> lista: ciclo feliz completo', () => {
  let task = onCheckout('201');
  assert.equal(task.stage, 'POR_LIMPIAR');

  task = startCleaning(task);
  assert.equal(task.stage, 'EN_LIMPIEZA');

  task = finishCleaning(task);
  assert.equal(task.stage, 'LISTA');
});

test('transicion invalida se rechaza igual que Odoo real (mensaje claro, sin escribir nada)', () => {
  const task = onCheckout('201'); // POR_LIMPIAR
  assert.throws(() => finishCleaning(task), InvalidHousekeepingTransition);
  try {
    finishCleaning(task);
  } catch (e) {
    assert.match(e.message, /HOUSEKEEPING: transicion no permitida POR_LIMPIAR -> LISTA/);
  }
});

test('no se puede limpiar dos veces seguidas sin pasar por POR_LIMPIAR', () => {
  let task = onCheckout('201');
  task = startCleaning(task); // EN_LIMPIEZA
  task = finishCleaning(task); // LISTA
  assert.throws(() => startCleaning(task), InvalidHousekeepingTransition);
});

test('reportIncident exige categoria conocida', () => {
  const task = startCleaning(onCheckout('201'));
  assert.throws(() => reportIncident(task, 'CATEGORIA_INVENTADA'), /UNKNOWN_INCIDENT_CATEGORY/);
});

test('reportIncident nunca decide por su cuenta si bloquea la entrega', () => {
  const task = startCleaning(onCheckout('201'));
  const withIncident = reportIncident(task, 'ELECTRICIDAD', { note: 'toma corriente danada' });
  assert.equal(withIncident.stage, 'INCIDENCIA');
  assert.equal(withIncident.incident.blocks_delivery, null);
  assert.equal(withIncident.incident.decision_required, 'CEO_DEBE_DEFINIR_SI_ESTA_CATEGORIA_BLOQUEA_ENTREGA');
});

test('reportIncident respeta blocksDelivery si el llamador ya lo decidio explicitamente', () => {
  const task = startCleaning(onCheckout('201'));
  const withIncident = reportIncident(task, 'DAÑO', { blocksDelivery: true });
  assert.equal(withIncident.incident.blocks_delivery, true);
  assert.equal(withIncident.incident.decision_required, null);
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
