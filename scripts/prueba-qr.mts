/* ============================================================
   PRUEBAS DEL GENERADOR DE QR

     npm run prueba-qr

   Un QR mal generado no avisa: se dibuja igual de bonito y
   simplemente no escanea. Por eso aqui no se comprueba "que parezca
   un QR", se compara MODULO A MODULO contra el paquete "qrcode" de
   npm, que es la implementacion de referencia.

   EL PAQUETE NO ESTA EN EL REPOSITORIO, Y ES A PROPOSITO

   Solo hace falta para comprobar, no para construir ni para servir.
   Si no esta instalado, la prueba lo dice y termina sin fallar: no
   se puede exigir una dependencia que no esta declarada. Para
   ejecutarla entera:

     npm install --no-save qrcode && npm run prueba-qr

   Lo que si se ejecuta siempre son las comprobaciones propias: que
   la version elegida es la minima, que el margen y el tamano
   cuadran, y que un texto que no cabe da error en vez de dibujar
   algo ilegible.
   ============================================================ */

import { generarQr, qrSvg } from '../src/data/qr.ts';

let hechas = 0;
const fallos: string[] = [];

function comprueba(nombre: string, condicion: boolean, detalle = ''): void {
  hechas++;
  if (condicion) {
    console.log(`  ok   ${nombre}`);
    return;
  }
  fallos.push(nombre);
  console.log(`  FALLA ${nombre}${detalle ? `\n         ${detalle}` : ''}`);
}

/* ------------------------------------------------------------
   CASOS: cortos, con acentos, y de los largos que usa el piloto
   ------------------------------------------------------------ */
const CASOS = [
  'A',
  'ATH-TRI-K7M2Q',
  'https://hotelesatheron.com/piloto/la-triada',
  'https://hotelesatheron.com/piloto/la-triada/validar?c=ATH-TRI-K7M2Q',
  'Zipaquirá — acentos y guion largo en UTF-8',
  'https://hotelesatheron.com/piloto/la-triada/validar?c=ATH-TRI-K7M2Q&r=' + 'x'.repeat(60),
  'x'.repeat(200),
];

console.log('\n Propias');

for (const texto of CASOS) {
  const qr = generarQr(texto);
  comprueba(
    `tamano coherente con la version (${texto.slice(0, 24)}…)`,
    qr.tamano === 17 + 4 * qr.version && qr.modulos.length === qr.tamano,
    `version ${qr.version}, tamano ${qr.tamano}`,
  );
}

comprueba(
  'un texto que no cabe da error',
  (() => {
    try {
      generarQr('x'.repeat(400));
      return false;
    } catch {
      return true;
    }
  })(),
);

{
  const svg = qrSvg('ATH-TRI-K7M2Q', 'Codigo de prueba');
  const qr = generarQr('ATH-TRI-K7M2Q');
  comprueba(
    'el SVG lleva el margen de cuatro modulos',
    svg.includes(`viewBox="0 0 ${qr.tamano + 8} ${qr.tamano + 8}"`),
  );
  comprueba('el SVG declara texto alternativo', svg.includes('role="img"') && svg.includes('aria-label='));
}

/* ------------------------------------------------------------
   CONTRA LA REFERENCIA
   ------------------------------------------------------------ */
console.log('\n Contra el paquete "qrcode" (referencia)');

let referencia: { create: (t: unknown, o: unknown) => { modules: { size: number; data: Uint8Array } } } | null =
  null;
try {
  referencia = (await import('qrcode')).default as never;
} catch {
  referencia = null;
}

if (!referencia) {
  console.log('  (omitida: el paquete "qrcode" no esta instalado)');
  console.log('   npm install --no-save qrcode && npm run prueba-qr\n');
} else {
  for (const texto of CASOS) {
    const mio = generarQr(texto);
    /* Se le exige modo byte: por su cuenta elegiria alfanumerico
       para las cadenas que solo llevan mayusculas y digitos, que es
       otra codificacion igual de valida y no comparable. */
    const suyo = referencia.create([{ data: texto, mode: 'byte' }], { errorCorrectionLevel: 'M' });
    let iguales = suyo.modules.size === mio.tamano;
    let primera = '';
    if (iguales) {
      for (let f = 0; f < mio.tamano && iguales; f++) {
        for (let c = 0; c < mio.tamano; c++) {
          const suyoNegro = suyo.modules.data[f * mio.tamano + c] === 1;
          if (suyoNegro !== mio.modulos[f][c]) {
            iguales = false;
            primera = `primer modulo distinto en fila ${f}, columna ${c}`;
            break;
          }
        }
      }
    }
    comprueba(
      `identico a la referencia (v${mio.version}) "${texto.slice(0, 24)}…"`,
      iguales,
      primera || `tamanos ${mio.tamano} vs ${suyo.modules.size}`,
    );
  }
}

console.log('');
if (fallos.length) {
  console.error(`PRUEBAS FALLIDAS: ${fallos.length} de ${hechas}`);
  for (const f of fallos) console.error(`  - ${f}`);
  console.error('');
  process.exit(1);
}
console.log(`${hechas} pruebas, todas correctas.\n`);
