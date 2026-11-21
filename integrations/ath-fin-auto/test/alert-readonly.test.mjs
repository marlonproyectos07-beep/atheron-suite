import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyBankEmail, classifyBankBatch } from '../src/alert-readonly.mjs';

const at = '2026-11-21T17:36:50Z';
const email = (messageId, body) => ({ messageId, body, receivedAt: at });

test('transferencia empresarial solo queda pendiente: no confirma ni contabiliza', () => {
  const result = classifyBankEmail(email('mock-1',
    '¡Listo! Bancolombia: Transferiste $125.000 desde tu cuenta *0136 a la cuenta *4321 el 21/11/2026 a las 12:36.'));
  assert.equal(result.type, 'TRANSFERENCIA_SALIENTE');
  assert.equal(result.direction, 'SALIDA');
  assert.equal(result.amountCop, 125000);
  assert.equal(result.ownAccountLast4, '0136');
  assert.equal(result.accountClass, 'CANDIDATA_ATHERON');
  assert.equal(result.status, 'PENDIENTE_CONFIRMACION_BANCARIA');
  assert.equal(result.paymentConfirmed, false);
  assert.equal(result.accountingApproved, false);
  assert.equal(result.writesToOdoo, 0);
  assert.equal(JSON.stringify(result).includes('4321'), false);
});

test('abono QR en cuenta empresarial es entrada, nunca pago confirmado', () => {
  const r = classifyBankEmail(email('mock-2',
    'Bancolombia: Recibiste $90.000 por QR de Persona de Prueba en tu cuenta *0136 el 21/11/2026.'));
  assert.equal(r.type, 'RECAUDO_QR');
  assert.equal(r.direction, 'ENTRADA');
  assert.equal(r.amountCop, 90000);
  assert.equal(r.paymentConfirmed, false);
  assert.equal(JSON.stringify(r).includes('Persona de Prueba'), false);
});

test('retiro sin cuenta identificable queda bloqueado', () => {
  const r = classifyBankEmail(email('mock-3',
    'Bancolombia: Retiraste $60.000 en nuestro corresponsal de Zipaquirá a las 10:38.'));
  assert.equal(r.type, 'RETIRO_EFECTIVO');
  assert.equal(r.accountClass, 'CUENTA_NO_IDENTIFICADA');
  assert.equal(r.status, 'BLOQUEADO_CUENTA_DESCONOCIDA');
});

test('un pago a cuenta AHORROS no identifica una cuenta bancaria empresarial', () => {
  const r = classifyBankEmail(email('mock-4',
    'Bancolombia: Recibiste un pago por $340.000 de Empresa Ejemplo a tu cuenta AHORROS.'));
  assert.equal(r.type, 'PAGO_RECIBIDO');
  assert.equal(r.direction, 'ENTRADA');
  assert.equal(r.ownAccountLast4, null);
  assert.equal(r.status, 'BLOQUEADO_CUENTA_DESCONOCIDA');
});

test('alerta de autenticación no se convierte en movimiento', () => {
  const r = classifyBankEmail(email('mock-5',
    'Por tu seguridad. Bancolombia: Te identificaste con tu clave principal en nuestra Sucursal Telefónica.'));
  assert.equal(r.type, 'AVISO_SEGURIDAD');
  assert.equal(r.amountCop, null);
  assert.equal(r.status, 'IGNORAR_NO_FINANCIERO');
});

test('una cuenta distinta no se atribuye a Atheron', () => {
  const r = classifyBankEmail(email('mock-6',
    'Bancolombia: Transferiste $17.000 desde tu cuenta *9866 a una cuenta de prueba.'));
  assert.equal(r.accountClass, 'OTRA_CUENTA_REQUIERE_TITULARIDAD');
  assert.equal(r.status, 'BLOQUEADO_TITULARIDAD');
});

test('no tomar datos del pie de marketing ni links', () => {
  const r = classifyBankEmail(email('mock-7',
    'Bancolombia: Te identificaste con tu clave. ¿No fuiste tú? ' +
      '[DESCUBRIR](https://ejemplo.com/?token=irrelevante) Retiraste $2.000.000'));
  assert.equal(r.type, 'AVISO_SEGURIDAD');
  assert.equal(r.amountCop, null);
  assert.equal(JSON.stringify(r).includes('irrelevante'), false);
});

test('cuerpo sin cabecera bancaria no se contabiliza ni se clasifica como operación', () => {
  const r = classifyBankEmail(email('mock-8',
    'Su transferencia por $12.000 fue realizada exitosamente.'));
  assert.equal(r.type, 'NO_ES_ALERTA_BANCARIA_IDENTIFICABLE');
  assert.equal(r.status, 'IGNORAR_O_REVISAR_MANUAL');
});

test('misma alerta duplicada se deduplica por mensaje Gmail, no por importe', () => {
  const e = email('mock-9','Bancolombia: Transferiste $50.000 desde tu cuenta *0136.');
  const out = classifyBankBatch([e,e,{...e,messageId:'mock-10'}]);
  assert.equal(out.totalMessages,3);
  assert.equal(out.uniqueEmails,2);
  assert.equal(out.sameMessageDuplicates,1);
  assert.equal(out.possibleCollisions,1);
  assert.equal(out.records.length,2);
  assert.equal(out.writesToOdoo,0);
});

test('sin ID fuente se detiene antes de procesar', () => {
  assert.throws(() => classifyBankEmail({body:'Bancolombia: Recibiste $5.000'}),/GMAIL_MESSAGE_ID_REQUIRED/);
});

test('la fecha del correo no es la fecha bancaria verificada', () => {
  const r = classifyBankEmail(email('mock-11',
    'Bancolombia: Recibiste $123.456,78 por QR en tu cuenta *0136.'));
  assert.equal(r.emailReceivedDateBogota,'2026-11-21');
  assert.equal(r.bankEventDateVerified,false);
  assert.equal(r.amountCop,123456.78);
});

test('la salida no contiene remitente, cuerpo, nombre ni saldo', () => {
  const r = classifyBankEmail({...email('mock-12',
    'Bancolombia: Transferiste $87.000 desde tu cuenta *0136 a otra cuenta.'), from:'nombre-personal@example.com'});
  const s = JSON.stringify(r);
  assert.equal(s.includes('example.com'),false);
  assert.equal(s.includes('Transferiste'),false);
  assert.equal(s.includes('balance'),false);
});
