/* ============================================================
   QR — generador propio, sin dependencias

   POR QUE ESTA AQUI Y NO ES UNA LIBRERIA

   El piloto necesita dos codigos QR: uno fijo, impreso, que lleva a
   la pagina de activacion, y otro que se dibuja EN EL MOVIL con el
   identificador ya generado, para que el aliado lo lea sin teclear.
   El segundo no se puede precalcular al construir: no existe hasta
   que el visitante pulsa "activar".

   Meter una dependencia nueva para eso tiene dos costes que este
   repositorio ya decidio no pagar en otros sitios: una dependencia
   mas que mantener y auditar, y un paquete que viaja al navegador.
   Esto son ~9 KB de codigo propio, se usa en las dos mitades
   -al construir y en el navegador- y no arrastra nada.

   QUE IMPLEMENTA, EXACTAMENTE

   QR Model 2, modo byte (UTF-8), nivel de correccion M (~15%),
   versiones 1 a 10. Eso cubre hasta 216 bytes, y la direccion mas
   larga del piloto son 67. Mas alla de la version 10 devuelve error
   en vez de dibujar algo que no se puede leer.

   Incluye lo que se olvida y hace que un QR no escanee: los patrones
   de alineacion, la informacion de formato con su BCH, la
   informacion de version (obligatoria desde la 7), las ocho mascaras
   con sus cuatro reglas de penalizacion, y el zigzag de colocacion
   saltando la columna 6.

   COMO SE COMPROBO

   scripts/prueba-qr.mjs compara la matriz de este modulo con la del
   paquete "qrcode" de npm -el de referencia- para varias cadenas y
   varias versiones. La comparacion es modulo a modulo: no se parece,
   es identica. El paquete se instala solo para esa comprobacion y
   NO entra en el repositorio.
   ============================================================ */

/* ------------------------------------------------------------
   TABLAS — solo nivel M, versiones 1 a 10

   [codewords de datos, codewords de correccion por bloque,
    bloques del grupo 1, bloques del grupo 2]

   El grupo 2, cuando existe, lleva un codeword de datos mas que el
   grupo 1. Es asi en el estandar y es el detalle que mas se falla.
   ------------------------------------------------------------ */
const BLOQUES_M: readonly [number, number, number, number][] = [
  [16, 10, 1, 0], // v1
  [28, 16, 1, 0], // v2
  [44, 26, 1, 0], // v3
  [64, 18, 2, 0], // v4
  [86, 24, 2, 0], // v5
  [108, 16, 4, 0], // v6
  [124, 18, 4, 0], // v7
  [154, 22, 2, 2], // v8
  [182, 22, 3, 2], // v9
  [216, 26, 4, 1], // v10
];

/** Centros de los patrones de alineacion por version. */
const ALINEACION: readonly number[][] = [
  [], // v1
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50],
];

/* ------------------------------------------------------------
   ARITMETICA DE GALOIS GF(256), polinomio 0x11D

   Es la que usa Reed-Solomon para calcular los codewords de
   correccion. Se construye una vez al cargar el modulo.
   ------------------------------------------------------------ */
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
}

const mul = (a: number, b: number): number => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

/** Polinomio generador de n codewords de correccion. */
function generador(n: number): number[] {
  let g = [1];
  for (let i = 0; i < n; i++) {
    const siguiente = new Array<number>(g.length + 1).fill(0);
    /* Multiplica por (x + alfa^i). El indice 0 es el coeficiente de
       mayor grado, y por eso g[0] vale siempre 1: la division de
       abajo cuenta con ese 1. */
    for (let j = 0; j < g.length; j++) {
      siguiente[j] ^= g[j];
      siguiente[j + 1] ^= mul(g[j], EXP[i]);
    }
    g = siguiente;
  }
  return g;
}

/** Los n codewords de correccion de un bloque de datos. */
function correccion(datos: number[], n: number): number[] {
  const g = generador(n);
  const resto = datos.concat(new Array<number>(n).fill(0));
  for (let i = 0; i < datos.length; i++) {
    const factor = resto[i];
    if (factor === 0) continue;
    for (let j = 0; j < g.length; j++) resto[i + j] ^= mul(g[j], factor);
  }
  return resto.slice(datos.length);
}

/* ------------------------------------------------------------
   BCH — informacion de formato y de version
   ------------------------------------------------------------ */
function bch(valor: number, generador: number, bits: number): number {
  let resto = valor << bits;
  const grado = 32 - Math.clz32(generador);
  while (32 - Math.clz32(resto) >= grado) {
    resto ^= generador << (32 - Math.clz32(resto) - grado);
  }
  return resto;
}

/** 15 bits de formato: nivel M (00) + mascara, con su BCH y su XOR. */
const infoFormato = (mascara: number): number =>
  (((0b00 << 3) | mascara) << 10 | bch((0b00 << 3) | mascara, 0x537, 10)) ^ 0x5412;

/** 18 bits de version. Solo desde la version 7. */
const infoVersion = (version: number): number => (version << 12) | bch(version, 0x1f25, 12);

/* ------------------------------------------------------------
   EL CODIGO
   ------------------------------------------------------------ */
export interface CodigoQr {
  /** Modulos por lado, sin contar el margen. */
  tamano: number;
  /** modulos[fila][columna]. true = negro. */
  modulos: boolean[][];
  version: number;
}

const bytesDe = (texto: string): number[] => Array.from(new TextEncoder().encode(texto));

/** La version mas pequena en la que cabe el texto. Error si no cabe. */
function versionPara(bytes: number): number {
  for (let v = 1; v <= 10; v++) {
    const cuenta = v < 10 ? 8 : 16;
    const capacidad = BLOQUES_M[v - 1][0] * 8 - 4 - cuenta;
    if (bytes * 8 <= capacidad) return v;
  }
  const maximo = Math.floor((BLOQUES_M[9][0] * 8 - 4 - 16) / 8);
  throw new Error(`El texto no cabe en un QR nivel M version 10 (${bytes} bytes; maximo ${maximo}).`);
}

export function generarQr(texto: string): CodigoQr {
  const datos = bytesDe(texto);
  const version = versionPara(datos.length);
  const [totalDatos, ecPorBloque, bloques1, bloques2] = BLOQUES_M[version - 1];

  /* --- Flujo de bits: modo byte, cuenta, datos, relleno --- */
  const bits: number[] = [];
  const empuja = (valor: number, ancho: number) => {
    for (let i = ancho - 1; i >= 0; i--) bits.push((valor >> i) & 1);
  };
  empuja(0b0100, 4);
  empuja(datos.length, version < 10 ? 8 : 16);
  for (const b of datos) empuja(b, 8);
  /* Terminador: hasta cuatro ceros, y ni uno mas de los que quepan. */
  for (let i = 0; i < 4 && bits.length < totalDatos * 8; i++) bits.push(0);
  while (bits.length % 8 !== 0) bits.push(0);

  const codewords: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j];
    codewords.push(byte);
  }
  const RELLENO = [0xec, 0x11];
  while (codewords.length < totalDatos) codewords.push(RELLENO[(codewords.length - bits.length / 8) % 2]);

  /* --- Bloques, correccion e intercalado --- */
  const totalBloques = bloques1 + bloques2;
  const porBloque1 = Math.floor(totalDatos / totalBloques);
  const grupos: number[][] = [];
  const correcciones: number[][] = [];
  let cursor = 0;
  for (let i = 0; i < totalBloques; i++) {
    const largo = i < bloques1 ? porBloque1 : porBloque1 + 1;
    const bloque = codewords.slice(cursor, cursor + largo);
    cursor += largo;
    grupos.push(bloque);
    correcciones.push(correccion(bloque, ecPorBloque));
  }

  const finales: number[] = [];
  const maxDatos = Math.max(...grupos.map((g) => g.length));
  for (let i = 0; i < maxDatos; i++) {
    for (const g of grupos) if (i < g.length) finales.push(g[i]);
  }
  for (let i = 0; i < ecPorBloque; i++) {
    for (const c of correcciones) finales.push(c[i]);
  }

  /* --- Matriz --- */
  const tamano = 17 + 4 * version;
  const modulos: boolean[][] = Array.from({ length: tamano }, () => new Array<boolean>(tamano).fill(false));
  const funcion: boolean[][] = Array.from({ length: tamano }, () => new Array<boolean>(tamano).fill(false));
  const pon = (f: number, c: number, negro: boolean) => {
    modulos[f][c] = negro;
    funcion[f][c] = true;
  };

  /* Buscadores y separadores. */
  for (const [f0, c0] of [
    [0, 0],
    [0, tamano - 7],
    [tamano - 7, 0],
  ]) {
    for (let f = -1; f <= 7; f++) {
      for (let c = -1; c <= 7; c++) {
        const ff = f0 + f;
        const cc = c0 + c;
        if (ff < 0 || cc < 0 || ff >= tamano || cc >= tamano) continue;
        const borde = f === 0 || f === 6 || c === 0 || c === 6;
        const centro = f >= 2 && f <= 4 && c >= 2 && c <= 4;
        const dentro = f >= 0 && f <= 6 && c >= 0 && c <= 6;
        pon(ff, cc, dentro && (borde || centro));
      }
    }
  }

  /* Temporizadores. */
  for (let i = 8; i < tamano - 8; i++) {
    pon(6, i, i % 2 === 0);
    pon(i, 6, i % 2 === 0);
  }

  /* Alineacion: todas las combinaciones de centros salvo las que
     pisan un buscador. */
  const centros = ALINEACION[version - 1];
  for (const f0 of centros) {
    for (const c0 of centros) {
      const pisaBuscador =
        (f0 === 6 && c0 === 6) ||
        (f0 === 6 && c0 === tamano - 7) ||
        (f0 === tamano - 7 && c0 === 6);
      if (pisaBuscador) continue;
      for (let f = -2; f <= 2; f++) {
        for (let c = -2; c <= 2; c++) {
          pon(f0 + f, c0 + c, Math.max(Math.abs(f), Math.abs(c)) !== 1);
        }
      }
    }
  }

  /* Modulo oscuro y reserva de la informacion de formato. */
  pon(tamano - 8, 8, true);
  for (let i = 0; i <= 8; i++) {
    if (i !== 6) {
      funcion[8][i] = true;
      funcion[i][8] = true;
    }
  }
  for (let i = 0; i < 8; i++) {
    funcion[8][tamano - 1 - i] = true;
    funcion[tamano - 1 - i][8] = true;
  }

  /* Informacion de version (desde la 7). */
  if (version >= 7) {
    const info = infoVersion(version);
    for (let i = 0; i < 18; i++) {
      const bit = ((info >> i) & 1) === 1;
      const f = Math.floor(i / 3);
      const c = tamano - 11 + (i % 3);
      pon(f, c, bit);
      pon(c, f, bit);
    }
  }

  /* --- Datos en zigzag, de derecha a izquierda, saltando la columna 6 --- */
  let indice = 0;
  let subiendo = true;
  for (let par = tamano - 1; par > 0; par -= 2) {
    if (par === 6) par = 5;
    for (let paso = 0; paso < tamano; paso++) {
      const f = subiendo ? tamano - 1 - paso : paso;
      for (const c of [par, par - 1]) {
        if (funcion[f][c]) continue;
        const bit = indice < finales.length * 8 ? (finales[indice >> 3] >> (7 - (indice & 7))) & 1 : 0;
        modulos[f][c] = bit === 1;
        indice++;
      }
    }
    subiendo = !subiendo;
  }

  /* --- Mascaras: se prueban las ocho y gana la menos penalizada --- */
  const condicion = (m: number, f: number, c: number): boolean => {
    switch (m) {
      case 0:
        return (f + c) % 2 === 0;
      case 1:
        return f % 2 === 0;
      case 2:
        return c % 3 === 0;
      case 3:
        return (f + c) % 3 === 0;
      case 4:
        return (Math.floor(f / 2) + Math.floor(c / 3)) % 2 === 0;
      case 5:
        return ((f * c) % 2) + ((f * c) % 3) === 0;
      case 6:
        return (((f * c) % 2) + ((f * c) % 3)) % 2 === 0;
      default:
        return (((f + c) % 2) + ((f * c) % 3)) % 2 === 0;
    }
  };

  let mejor: boolean[][] | null = null;
  let mejorPena = Infinity;
  for (let m = 0; m < 8; m++) {
    const prueba = modulos.map((fila) => fila.slice());
    for (let f = 0; f < tamano; f++) {
      for (let c = 0; c < tamano; c++) {
        if (!funcion[f][c] && condicion(m, f, c)) prueba[f][c] = !prueba[f][c];
      }
    }
    escribeFormato(prueba, tamano, m);
    const pena = penalizacion(prueba, tamano);
    if (pena < mejorPena) {
      mejorPena = pena;
      mejor = prueba;
    }
  }

  return { tamano, modulos: mejor!, version };
}

/** Los 15 bits de formato, en sus dos copias. */
function escribeFormato(m: boolean[][], tamano: number, mascara: number): void {
  const info = infoFormato(mascara);
  for (let i = 0; i < 15; i++) {
    const bit = ((info >> i) & 1) === 1;
    /* Copia 1: columna 8 hacia abajo y fila 8 hacia la izquierda,
       rodeando el buscador superior izquierdo. */
    if (i < 6) m[i][8] = bit;
    else if (i === 6) m[7][8] = bit;
    else if (i === 7) m[8][8] = bit;
    else if (i === 8) m[8][7] = bit;
    else m[8][14 - i] = bit;
    /* Copia 2: fila 8 por la derecha y columna 8 por abajo. */
    if (i < 8) m[8][tamano - 1 - i] = bit;
    else m[tamano - 15 + i][8] = bit;
  }
  m[tamano - 8][8] = true;
}

/** Las cuatro reglas de penalizacion del estandar. */
function penalizacion(m: boolean[][], tamano: number): number {
  let total = 0;

  /* 1: cinco o mas modulos seguidos del mismo color. */
  for (let i = 0; i < tamano; i++) {
    for (const fila of [true, false]) {
      let color = fila ? m[i][0] : m[0][i];
      let seguidos = 1;
      for (let j = 1; j < tamano; j++) {
        const actual = fila ? m[i][j] : m[j][i];
        if (actual === color) seguidos++;
        else {
          if (seguidos >= 5) total += seguidos - 2;
          color = actual;
          seguidos = 1;
        }
      }
      if (seguidos >= 5) total += seguidos - 2;
    }
  }

  /* 2: bloques de 2x2 del mismo color. */
  for (let f = 0; f < tamano - 1; f++) {
    for (let c = 0; c < tamano - 1; c++) {
      const v = m[f][c];
      if (v === m[f][c + 1] && v === m[f + 1][c] && v === m[f + 1][c + 1]) total += 3;
    }
  }

  /* 3: el patron 1:1:3:1:1 con cuatro claros a un lado. */
  const PATRON = [true, false, true, true, true, false, true];
  const cuatro = [false, false, false, false];
  const coincide = (lista: boolean[], desde: number, patron: boolean[]) =>
    patron.every((p, i) => lista[desde + i] === p);
  for (let i = 0; i < tamano; i++) {
    const filaLista = m[i];
    const colLista = m.map((fila) => fila[i]);
    for (const lista of [filaLista, colLista]) {
      for (let j = 0; j + 7 <= tamano; j++) {
        if (!coincide(lista, j, PATRON)) continue;
        const antes = j >= 4 && coincide(lista, j - 4, cuatro);
        const despues = j + 11 <= tamano && coincide(lista, j + 7, cuatro);
        if (antes || despues) total += 40;
      }
    }
  }

  /* 4: desequilibrio entre claros y oscuros. */
  let oscuros = 0;
  for (const fila of m) for (const v of fila) if (v) oscuros++;
  const porcentaje = (oscuros * 100) / (tamano * tamano);
  total += Math.floor(Math.abs(porcentaje - 50) / 5) * 10;

  return total;
}

/* ------------------------------------------------------------
   SALIDA EN SVG

   Un solo <path>: pesa una fraccion de lo que pesan N rectangulos y
   no obliga al navegador a crear miles de nodos. El margen de cuatro
   modulos es obligatorio: sin el, muchos lectores no encuentran el
   codigo.
   ------------------------------------------------------------ */
export function qrSvg(texto: string, alt: string, margen = 4): string {
  const { tamano, modulos } = generarQr(texto);
  const lado = tamano + margen * 2;
  let d = '';
  for (let f = 0; f < tamano; f++) {
    for (let c = 0; c < tamano; c++) {
      if (modulos[f][c]) d += `M${c + margen} ${f + margen}h1v1h-1z`;
    }
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${lado} ${lado}" role="img" ` +
    `aria-label="${alt.replace(/[<>&"]/g, '')}" shape-rendering="crispEdges">` +
    `<rect width="${lado}" height="${lado}" fill="#ffffff"/>` +
    `<path d="${d}" fill="#000000"/>` +
    `</svg>`
  );
}
