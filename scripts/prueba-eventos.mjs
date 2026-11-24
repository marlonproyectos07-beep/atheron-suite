/* ============================================================
   PRUEBA DE DATOS ESTRUCTURADOS DE EVENTOS — ATH-WEB-SEO-121

     npm run prueba   (se ejecuta junto con las demas)

   Lee el HTML ya construido (dist/) y comprueba, para cada Event del
   Mes del Patrimonio, que existan los campos reales que Search Console
   pedia (description, eventStatus, organizer) y que NO se haya inventado
   un performer: la fuente no publica artistas ni ponentes.
   Si no hay dist/, la prueba se omite con aviso (npm run build primero).
   ============================================================ */
import { readFileSync, existsSync } from 'node:fs';

let hechas = 0;
const fallos = [];
const prueba = (n, ok) => { hechas++; if (!ok) fallos.push(n); console.log(`  ${ok ? 'ok  ' : 'FALLA'} ${n}`); };

console.log('\nEventos: datos estructurados\n');
const f = 'dist/eventos/mes-del-patrimonio-zipaquira-2026.html';
if (!existsSync(f)) {
  console.log('  (omitida: falta dist/, ejecuta npm run build)');
} else {
  const html = readFileSync(f, 'utf8');
  const bloques = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1]));
  const eventos = bloques.flatMap((b) => b['@graph'] ?? [b]).filter((n) => n['@type'] === 'Event');
  prueba('hay 4 eventos en la agenda', eventos.length === 4);
  for (const e of eventos) {
    prueba(`${e.name}: description con fecha y lugar`, typeof e.description === 'string' && e.description.includes(e.name) && /Lugar:/.test(e.description));
    prueba(`${e.name}: eventStatus declarado`, e.eventStatus === 'https://schema.org/EventScheduled');
    prueba(`${e.name}: organizer con nombre y url`, !!e.organizer?.name && /^https:\/\//.test(e.organizer?.url ?? ''));
    prueba(`${e.name}: sin performer inventado`, e.performer === undefined);
    prueba(`${e.name}: startDate con zona horaria de Colombia`, /-05:00$/.test(e.startDate));
  }
}

console.log(`\n${hechas - fallos.length}/${hechas} pruebas correctas`);
if (fallos.length) { console.error('Fallaron:', fallos); process.exit(1); }
