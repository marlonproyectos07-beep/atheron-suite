/* ============================================================
   CREDENCIAL DE OPERADOR DE UN ALIADO

   Genera la credencial que teclea el local y el hash que se guarda
   en el entorno. Los dos se imprimen aqui y NO salen de esta
   pantalla: no se escriben en ningun archivo, no se mandan a ningun
   sitio y no entran en el repositorio.

   ============================================================
   POR QUE EL ENTORNO GUARDA UN HASH Y NO LA CREDENCIAL
   ============================================================

   Porque quien pueda leer las variables del proyecto -un panel, un
   volcado de configuracion, una captura en una reunion- no puede
   quedarse con algo que sirva para cobrar. Con el hash no se puede
   iniciar sesion: solo se puede comprobar una credencial que alguien
   ya haya tecleado.

   Ver servidor/_autorizacion.ts: la comparacion es en 32 bytes con
   timingSafeEqual, asi que la longitud de la credencial tampoco se
   deduce del tiempo que tarda en fallar.

   ============================================================
   POR QUE LA GENERA LA MAQUINA Y NO UNA PERSONA
   ============================================================

   Una credencial elegida a mano acaba siendo el nombre del
   restaurante y el ano. Esta sale de crypto.randomInt, que no tiene
   sesgo, sobre un alfabeto sin caracteres que se confundan al
   dictarla por telefono: sin I, L, O, U, ni 0 ni 1.

   Tampoco se teclea en la linea de ordenes: lo que se escribe ahi
   queda en el historial del shell, y un historial es un archivo.
   ============================================================ */
import { createHash, randomInt } from 'node:crypto';

/* Sin I, L, O, U -se confunden con 1 y 0- y sin 0 ni 1. El mismo
   alfabeto que usan los codigos de cliente, por las mismas razones. */
const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const LARGO = 12;

/** La credencial en claro. Se dicta o se teclea; no se guarda. */
export function generaCredencial(largo = LARGO) {
  let salida = '';
  for (let i = 0; i < largo; i++) salida += ALFABETO[randomInt(0, ALFABETO.length)];
  return salida;
}

/** Lo que va en la variable de entorno: SHA-256 en hexadecimal. */
export const hashDe = (credencial) => createHash('sha256').update(credencial, 'utf8').digest('hex');

/** El nombre de la variable, calculado igual que en el servidor. */
export const variableDe = (aliado) =>
  `ATHERON_OPERADOR_${aliado.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}`;

/* ------------------------------------------------------------ */
if (process.argv[1] && process.argv[1].endsWith('credencial-operador.mjs')) {
  const aliado = process.argv[2] ?? 'la-triada';
  const credencial = generaCredencial();

  console.log('');
  console.log('  CREDENCIAL DEL LOCAL  (se teclea en la pantalla de validar)');
  console.log('');
  console.log(`      ${credencial}`);
  console.log('');
  console.log('  VARIABLE DE ENTORNO  (se pega en Vercel, entorno Preview)');
  console.log('');
  console.log(`      Nombre:  ${variableDe(aliado)}`);
  console.log(`      Valor:   ${hashDe(credencial)}`);
  console.log('');
  console.log('  Ninguno de los dos se ha guardado en ningun archivo.');
  console.log('  La credencial no se puede recuperar: si se pierde, se genera otra.');
  console.log('  Cierra esta ventana cuando termines.');
  console.log('');
}
