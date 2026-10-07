#!/usr/bin/env node
/**
 * ATH-DISP-001 — genera el hash del PIN de un operador de recepción.
 *
 * Uso (en una terminal interactiva, sin argumentos):
 *   node scripts/reception-pin-hash.mjs
 *
 * - Pregunta el operador (marlon | angela | hermarit | otro).
 * - Pide el PIN dos veces con entrada oculta (sin eco, sin argumentos, sin historial).
 * - Imprime SOLO {"id","pinHash"}. El PIN no se imprime, no se guarda y no
 *   queda en logs ni en archivos. Guarda el hash en HOTEL_RECEPTION_OPERATORS
 *   (variable de entorno del servidor, nunca en el repositorio).
 */
import { createInterface } from 'node:readline/promises';
import { hashPin, isValidPinFormat, OPERATOR_IDS } from '../src/reception-auth.mjs';
import { readHiddenLine, NonInteractiveTerminalError, InputCancelledError } from '../src/reception-pin-input.mjs';

// Las preguntas van a stderr y el JSON resultado a stdout, para poder encadenarlo
// al almacén seguro (store-reception-operator.ps1). La entrada debe ser una terminal.
if (!process.stdin.isTTY) {
  console.error('Este script solo funciona en una terminal interactiva. No uses tuberías ni archivos para el PIN.');
  process.exit(1);
}

async function askOperator() {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    const answer = (await rl.question(`Operador (${OPERATOR_IDS.join(' | ')}): `)).trim().toLowerCase();
    return answer;
  } finally {
    rl.close();
  }
}

try {
  const operatorId = await askOperator();
  if (!OPERATOR_IDS.includes(operatorId)) {
    console.error('Operador inválido.');
    process.exit(1);
  }

  const first = await readHiddenLine({ output: process.stderr, prompt: 'PIN (6 a 8 dígitos, no se muestra): ' });
  const second = await readHiddenLine({ output: process.stderr, prompt: 'Repite el PIN: ' });
  if (first !== second) {
    console.error('Los PIN no coinciden. No se generó hash.');
    process.exit(1);
  }
  if (!isValidPinFormat(first)) {
    console.error('El PIN debe tener de 6 a 8 dígitos. No se generó hash.');
    process.exit(1);
  }

  const pinHash = await hashPin(first);
  // Borrado best-effort: las cadenas de JS son inmutables, así que no hay garantía total.
  console.error('Hash generado. El PIN no se guardó ni se muestra. Copia el JSON al almacén de secretos del servidor.');
  console.log(JSON.stringify({ id: operatorId, pinHash }));
} catch (error) {
  if (error instanceof NonInteractiveTerminalError) {
    console.error('Este script requiere una terminal interactiva.');
  } else if (error instanceof InputCancelledError) {
    console.error('Cancelado. No se generó hash.');
  } else {
    console.error('Error al generar el hash.');
  }
  process.exit(1);
}
