import { Beds24Error } from './errors.mjs';

export const BEDS24_SCOPE_MATRIX = Object.freeze({
  getAvailability: 'beds24:availability:read',
  getReservation: 'beds24:reservation:read',
  getMapping: 'beds24:mapping:read',
  createReservation: 'beds24:reservation:create',
  updateReservation: 'beds24:reservation:update',
  cancelReservation: 'beds24:reservation:cancel',
  applyHold: 'beds24:hold:apply',
  releaseHold: 'beds24:hold:release',
});

export const BEDS24_SCOPES = Object.freeze(Object.values(BEDS24_SCOPE_MATRIX));

export function requireBeds24Scope(identity, operation) {
  const scope = BEDS24_SCOPE_MATRIX[operation];
  if (!scope || !identity?.scopes?.includes(scope)) throw new Beds24Error('BEDS24_SCOPE_DENIED');
  return scope;
}
