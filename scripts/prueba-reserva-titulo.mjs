// Comprueba que el titulo del hero de cada ficha reserva en movil las lineas que ocupara con Fraunces.
// Causa: ORDEN ATH-WEB-SEO-123 (el titulo pasaba de 1 a 2 lineas al llegar la fuente y movia .hero__datos).
import fs from 'node:fs';

let ok = 0, fallos = 0;
const prueba = (nombre, cond) => { if (cond) { ok++; console.log('  ok  ', nombre); } else { fallos++; console.log('  FALLA', nombre); } };

function tramos(pagina) {
  const html = fs.readFileSync(`dist/hospedajes/${pagina}.html`, 'utf8');
  return [...html.matchAll(/@media \(min-width:(\d+)px\) and \(max-width:(\d+)px\)\{\.hero__titulo\{min-height:([\d.]+)em\}\}/g)]
    .map((m) => ({ min: +m[1], max: +m[2], em: +m[3] }));
}
const em = (t, ancho) => t.find((x) => ancho >= x.min && ancho <= x.max)?.em ?? 0;

// Colonial Confort: dos lineas de 320 a 418 px (375 y 390 incluidos), una sola desde 419 px.
const col = tramos('hotel-colonial-confort');
prueba('Colonial: 2 lineas a 320 px', em(col, 320) === 2.3);
prueba('Colonial: 2 lineas a 375 px', em(col, 375) === 2.3);
prueba('Colonial: 2 lineas a 390 px', em(col, 390) === 2.3);
prueba('Colonial: sin reserva a 430 px (cabe en una linea)', em(col, 430) === 0);

// Titulos cortos: nunca reservan nada.
for (const p of ['casa-algarra', 'casa-neusa']) prueba(`${p}: sin reserva (cabe siempre en una linea)`, tramos(p).length === 0);

// Titulo muy largo: tres lineas en la pantalla mas estrecha.
prueba('Algarra duplex: 3 lineas a 320 px', em(tramos('algarra-duplex'), 320) === 3.45);

// Toda ficha publicada lleva exactamente un h1 con la clase del hero.
for (const f of fs.readdirSync('dist/hospedajes').filter((x) => x.endsWith('.html') && x !== 'index.html')) {
  const html = fs.readFileSync(`dist/hospedajes/${f}`, 'utf8');
  prueba(`${f}: un h1.hero__titulo`, (html.match(/<h1 class="hero__titulo"/g) || []).length === 1);
}

console.log(`\n${ok}/${ok + fallos} pruebas correctas`);
process.exit(fallos ? 1 : 0);
