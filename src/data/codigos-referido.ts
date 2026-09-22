/* ============================================================
   CODIGOS DE REFERIDO — ATH-<ALIADO>-<5 caracteres>

   DE DONDE VIENE

   El formato lo estreno la captacion de grupos
   (src/data/leads-grupo.ts) el 19 de septiembre de 2026, como
   semilla de atribucion: una referencia que viaja dentro del mensaje
   de WhatsApp y que luego se cruza a mano. Aquel codigo eran cinco
   caracteres al azar y nada mas.

   QUE CAMBIA AL USARLO EN EL PILOTO

   En el piloto Atheron x La Triada el codigo deja de ser una
   etiqueta y pasa a ser lo que alguien LEE EN VOZ ALTA o TECLEA en
   el restaurante. Eso trae un problema nuevo: una letra mal copiada
   produce otro codigo con la misma pinta, y nadie se entera. Por eso
   el quinto caracter ya no es azar: es un CARACTER DE CONTROL
   calculado sobre los otros cuatro.

   El formato no cambia -sigue siendo ATH-TRI-XXXXX-, asi que nada de
   lo que ya circula se rompe.

   QUE GARANTIZA EL CARACTER DE CONTROL, EXACTAMENTE

   El alfabeto tiene 31 caracteres, y 31 es primo. Con una suma
   ponderada modulo 31 eso basta para detectar:

     - cualquier caracter mal copiado (uno solo);
     - cualquier intercambio de dos caracteres contiguos.

   Son los dos errores que de verdad ocurren al dictar o teclear.

   QUE NO GARANTIZA, Y NO DEBE VENDERSE COMO TAL

   NO es autenticacion. El calculo es publico: quien lea este archivo
   puede fabricar un codigo que pase la comprobacion. Sirve para
   distinguir un codigo mal copiado de uno bien copiado, no para
   demostrar que Atheron lo emitio.

   NO es unicidad garantizada. Son cuatro caracteres al azar entre
   31^4 = 923.521 combinaciones, generados en el navegador con
   crypto.getRandomValues. Sin servidor no hay registro que compruebe
   que no se repite. Para un piloto de un dia con decenas de codigos
   la probabilidad de choque es despreciable, pero despreciable no es
   cero y no se dice que lo sea.

   La unicidad real llega con backend, y entonces este mismo formato
   pasa a ser un identificador de verdad sin cambiar lo que ya
   circula en los mensajes.
   ============================================================ */

/** Aliados con codigo propio. El resto usa el de por defecto. */
export const CODIGOS_ORIGEN: Record<string, string> = {
  'la-triada': 'TRI',
};

export const CODIGO_POR_DEFECTO = 'GUI';

/* Sin 0/O ni 1/I/L: se leen por telefono y se copian a mano.
   31 caracteres, y que sean 31 -primo- es lo que hace que el
   caracter de control detecte todos los intercambios. */
export const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

const MODULO = ALFABETO.length; // 31

/** Longitud de la parte al azar, sin contar el caracter de control. */
const AZAR = 4;

/** Semilla del aliado: "TRI" y "GUI" dan restos distintos. */
function semilla(aliado: string): number {
  let h = 7;
  for (const c of aliado) h = (h * 33 + c.charCodeAt(0)) % MODULO;
  return h;
}

/** El caracter de control de una cola de cuatro caracteres. */
export function caracterControl(aliado: string, cola: string): string {
  let suma = semilla(aliado);
  for (let i = 0; i < cola.length; i++) {
    const valor = ALFABETO.indexOf(cola[i]);
    if (valor < 0) throw new Error(`Caracter fuera del alfabeto: ${cola[i]}`);
    suma = (suma + (i + 2) * valor) % MODULO;
  }
  return ALFABETO[suma];
}

/** Cuatro caracteres al azar del alfabeto, del generador del sistema. */
function cola(): string {
  const n = new Uint32Array(AZAR);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(n);
  } else {
    for (let i = 0; i < AZAR; i++) n[i] = Math.floor(Math.random() * 4294967296);
  }
  /* El sesgo de "% 31" sobre 2^32 es de una parte en 138 millones:
     irrelevante aqui, y se anota para que no se descubra como
     hallazgo dentro de un ano. */
  return Array.from(n, (v) => ALFABETO[v % MODULO]).join('');
}

/** Un codigo nuevo para un origen ("la-triada", "guia"...). */
export function generarCodigo(origen: string): string {
  const aliado = CODIGOS_ORIGEN[origen] ?? CODIGO_POR_DEFECTO;
  const azar = cola();
  return `ATH-${aliado}-${azar}${caracterControl(aliado, azar)}`;
}

/* ------------------------------------------------------------
   LECTURA DE UN CODIGO TECLEADO

   Quien teclea en el restaurante esta de pie, con prisa y con el
   movil de otra persona delante. Se admiten minusculas, espacios y
   la falta de guiones. Lo que NO se hace es "arreglar" un caracter
   que no existe en el alfabeto: convertir una O en un 0 seria
   adivinar, y adivinar aqui es aceptar un codigo que nadie emitio.
   ------------------------------------------------------------ */

export type MotivoInvalido =
  | 'vacio'
  | 'formato'
  | 'aliado'
  | 'caracter'
  | 'control';

export interface Lectura {
  valido: boolean;
  /** El codigo en su forma normalizada, o lo que se pudo normalizar. */
  codigo: string;
  aliado?: string;
  motivo?: MotivoInvalido;
  /** Frase lista para mostrar. Nunca culpa a quien teclea. */
  explicacion?: string;
}

const EXPLICACION: Record<MotivoInvalido, string> = {
  vacio: 'Escribe el código que aparece en el móvil del huésped.',
  formato: 'Un código tiene esta forma: ATH-TRI-K7M2Q. Revisa que estén los ocho caracteres después de ATH.',
  aliado: 'Ese código no es de este aliado.',
  caracter: 'Hay un carácter que los códigos no usan. Nunca llevan O, I, L, 0 ni 1: mira si es una Q, una J, una S o un 5.',
  control: 'El código no cuadra. Casi siempre es una letra cambiada o dos caracteres al revés: vuelve a leerlo del móvil.',
};

/** Quita espacios, guiones y mayusculiza. No sustituye caracteres. */
export function normalizar(texto: string): string {
  return texto.trim().toUpperCase().replace(/[\s-]+/g, '');
}

/**
 * Lee un codigo tecleado y dice si cuadra.
 * @param aliadoEsperado si se pasa, exige ademas que sea de ese aliado.
 */
export function leerCodigo(texto: string, aliadoEsperado?: string): Lectura {
  const plano = normalizar(texto);
  if (!plano) return { valido: false, codigo: '', motivo: 'vacio', explicacion: EXPLICACION.vacio };

  const encaja = /^ATH([A-Z]{3})([A-Z0-9]{5})$/.exec(plano);
  if (!encaja) return { valido: false, codigo: plano, motivo: 'formato', explicacion: EXPLICACION.formato };

  const [, aliado, cuerpo] = encaja;
  const bonito = `ATH-${aliado}-${cuerpo}`;

  if (aliadoEsperado && aliado !== aliadoEsperado) {
    return { valido: false, codigo: bonito, aliado, motivo: 'aliado', explicacion: EXPLICACION.aliado };
  }

  const azar = cuerpo.slice(0, AZAR);
  const control = cuerpo[AZAR];
  for (const c of cuerpo) {
    if (!ALFABETO.includes(c)) {
      return { valido: false, codigo: bonito, aliado, motivo: 'caracter', explicacion: EXPLICACION.caracter };
    }
  }

  if (caracterControl(aliado, azar) !== control) {
    return { valido: false, codigo: bonito, aliado, motivo: 'control', explicacion: EXPLICACION.control };
  }

  return { valido: true, codigo: bonito, aliado };
}

/** Solo el formato bonito, para pintar lo que el visitante teclea. */
export const conGuiones = (plano: string): string =>
  /^ATH[A-Z0-9]{3,8}$/.test(plano)
    ? `ATH-${plano.slice(3, 6)}${plano.length > 6 ? `-${plano.slice(6)}` : ''}`
    : plano;
