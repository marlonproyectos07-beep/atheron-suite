import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readHiddenLine, NonInteractiveTerminalError, InputCancelledError } from '../src/reception-pin-input.mjs';

function fakeTty() {
  const input = new EventEmitter();
  input.isTTY = true;
  input.raw = false;
  input.setRawMode = (on) => { input.raw = on; };
  input.setEncoding = () => {};
  input.resume = () => {};
  input.pause = () => {};
  const written = [];
  const output = { write: (s) => { written.push(String(s)); return true; } };
  return { input, output, written };
}

test('lee el valor sin eco y termina en Enter', async () => {
  const { input, output, written } = fakeTty();
  const pending = readHiddenLine({ input, output, prompt: 'PIN: ' });
  input.emit('data', '4');
  input.emit('data', '8');
  input.emit('data', '2\r');
  assert.equal(await pending, '482');
  assert.equal(input.raw, false, 'restaura el modo normal al terminar');
  const all = written.join('');
  assert.ok(all.startsWith('PIN: '));
  assert.ok(!/[0-9]/.test(all.replace('PIN: ', '')), 'no imprime ningún dígito del PIN');
});

test('retroceso borra el último carácter y no aparece en la salida', async () => {
  const { input, output, written } = fakeTty();
  const pending = readHiddenLine({ input, output });
  input.emit('data', '12\u007f34\r');
  assert.equal(await pending, '134');
  assert.ok(!/\d/.test(written.join('')));
});

test('Ctrl+C cancela sin devolver valor', async () => {
  const { input, output } = fakeTty();
  const pending = readHiddenLine({ input, output });
  input.emit('data', '12\u0003');
  await assert.rejects(pending, InputCancelledError);
  assert.equal(input.raw, false);
});

test('sin terminal interactiva se rechaza (no se acepta PIN por tubería o archivo)', async () => {
  const input = new EventEmitter();
  input.isTTY = false;
  await assert.rejects(readHiddenLine({ input, output: { write() {} } }), NonInteractiveTerminalError);
});

test('ignora caracteres de control que no son parte del PIN', async () => {
  const { input, output } = fakeTty();
  const pending = readHiddenLine({ input, output });
  input.emit('data', '\u001b9\u0007\r');
  assert.equal(await pending, '9');
});
