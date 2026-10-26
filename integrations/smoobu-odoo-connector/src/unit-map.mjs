import { ConnectorError } from './errors.mjs';

/** Mapa de seis unidades (ATH-DEV-001). Carrera 19 queda excluida a proposito. */
export const UNITS = Object.freeze([
  { unit: '201', smoobuApartmentId: 3557506, odooRoleId: 29 },
  { unit: '202', smoobuApartmentId: 3557511, odooRoleId: 19 },
  { unit: '203', smoobuApartmentId: 3557516, odooRoleId: 30 },
  { unit: '301', smoobuApartmentId: 3557521, odooRoleId: 37 },
  { unit: '302', smoobuApartmentId: 3557526, odooRoleId: 18 },
  { unit: 'CASA', smoobuApartmentId: 3557501, odooRoleId: 69 },
].map(Object.freeze));

const bySmoobu = new Map(UNITS.map((u) => [u.smoobuApartmentId, u]));
const byRole = new Map(UNITS.map((u) => [u.odooRoleId, u]));

/** null = apartamento fuera del mapa (p. ej. Carrera 19): se ignora, nunca se adivina. */
export const unitForSmoobuApartment = (id) => bySmoobu.get(Number(id)) ?? null;
export const unitForOdooRole = (id) => byRole.get(Number(id)) ?? null;

export function requireUnit(smoobuApartmentId) {
  const u = unitForSmoobuApartment(smoobuApartmentId);
  if (!u) throw new ConnectorError('UNIT_NOT_MAPPED');
  return u;
}

/** Casa Completa bloquea las cinco fisicas y viceversa. */
export const PHYSICAL_UNITS = Object.freeze(UNITS.filter((u) => u.unit !== 'CASA').map((u) => u.unit));
export const conflictsWith = (unit) => (unit === 'CASA' ? PHYSICAL_UNITS : ['CASA']);
