import { createBeds24Mapping } from '../../src/beds24/mapper.mjs';

const PHYSICAL = ['201', '202', '203', '301', '302'];

export function syntheticMapping() {
  return createBeds24Mapping([
    ...PHYSICAL.map((number) => ({
      canonicalUnitId: `AHS-${number}`,
      kind: 'physical',
      odooUnitId: `TEST-ODOO-UNIT-${number}`,
      odooResourceId: `TEST-ODOO-RESOURCE-${number}`,
      beds24AccountId: 'TEST-BEDS24-ACCOUNT',
      beds24PropertyId: 'TEST-BEDS24-PROPERTY',
      beds24RoomId: `TEST-BEDS24-ROOM-${number}`,
      bookingPropertyId: null,
      bookingRoomId: null,
      airbnbListingId: null,
    })),
    {
      canonicalUnitId: 'AHS-CASA',
      kind: 'virtual',
      odooUnitId: 'TEST-ODOO-UNIT-CASA',
      odooResourceId: null,
      beds24AccountId: 'TEST-BEDS24-ACCOUNT',
      beds24PropertyId: 'TEST-BEDS24-PROPERTY-CASA',
      beds24RoomId: 'TEST-BEDS24-ROOM-CASA',
      bookingPropertyId: null,
      bookingRoomId: null,
      airbnbListingId: null,
    },
  ]);
}

export function syntheticEvent(number = '201', overrides = {}) {
  return {
    type: 'reservation.created',
    bookingId: `TEST-BEDS24-BOOKING-${number}`,
    accountId: 'TEST-BEDS24-ACCOUNT',
    propertyId: number === 'CASA' ? 'TEST-BEDS24-PROPERTY-CASA' : 'TEST-BEDS24-PROPERTY',
    roomId: `TEST-BEDS24-ROOM-${number}`,
    checkIn: '2026-11-12',
    checkOut: '2026-11-14',
    revision: 1,
    ...overrides,
  };
}

export function syntheticTransport(handler = async () => ({ status: 200, data: {} })) {
  return { synthetic: true, request: handler };
}
