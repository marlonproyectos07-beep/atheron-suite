/* ============================================================
   COMPROBACION DEL CONTENIDO ANTES DE PUBLICAR

   Se ejecuta sola antes de cada "npm run build" (ver la linea
   "prebuild" de package.json). Si encuentra un problema, detiene
   la publicacion con un mensaje claro.

   POR QUE EXISTE:
   en YAML, una almohadilla precedida de espacio empieza un
   comentario. Esto...

       zona: Cra. 9 #10-32, Zipaquira

   ...se lee como "Cra. 9". El resto desaparece SIN NINGUN AVISO:
   no falla el build, no sale un error, simplemente la direccion
   queda a medias en la pagina y en los datos que lee Google.

   Nos paso de verdad con la ficha de La Magia de Zipaquira, y
   solo se detecto comparando el texto publicado contra el sitio
   antiguo. Es exactamente el tipo de fallo que hay que convertir
   en un error ruidoso.

   La solucion al escribir es poner comillas:

       zona: "Cra. 9 #10-32, Zipaquira"

   El panel pone las comillas solo, asi que esto protege sobre
   todo de las ediciones hechas a mano en los archivos.
   ============================================================ */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const CARPETA = 'src/content';

/* Devuelve todos los .md de una carpeta y sus subcarpetas. */
function archivosMarkdown(dir) {
  let salida = [];
  for (const nombre of readdirSync(dir, { withFileTypes: true })) {
    const ruta = join(dir, nombre.name);
    if (nombre.isDirectory()) salida = salida.concat(archivosMarkdown(ruta));
    else if (nombre.name.endsWith('.md')) salida.push(ruta);
  }
  return salida;
}

const problemas = [];

for (const ruta of archivosMarkdown(CARPETA)) {
  const contenido = readFileSync(ruta, 'utf8');

  /* El frontmatter es lo que va entre las dos lineas de tres guiones. */
  const partes = contenido.split(/^---\s*$/m);
  if (partes.length < 3) continue;
  const frontmatter = partes[1];

  frontmatter.split('\n').forEach((linea, i) => {
    /* El corte por /^---$/ deja un salto de linea inicial, asi que
       el indice i ya va desfasado uno: la linea del archivo es i + 1. */
    const numero = i + 1;

    /* Una linea de comentario entera es legitima: empieza por #. */
    if (/^\s*#/.test(linea)) return;

    /* Buscamos un valor (tras ":" o tras "- ") que contenga " #"
       sin estar entre comillas. */
    const valor = linea.replace(/^\s*(?:-\s+)?(?:[a-zA-Z][\w]*\s*:\s*)?/, '');
    if (!valor) return;

    const entreComillas = /^["']/.test(valor.trim());
    if (entreComillas) return;

    if (/\s#/.test(valor)) {
      problemas.push({
        ruta,
        numero,
        linea: linea.trim(),
        cortado: valor.split(/\s#/)[0].trim(),
      });
    }
  });
}

if (problemas.length === 0) {
  console.log('Contenido comprobado: ningun texto se corta en una almohadilla.');
  process.exit(0);
}

console.error('');
console.error('PUBLICACION DETENIDA — hay texto que YAML va a cortar');
console.error('');
console.error('En YAML, una almohadilla precedida de espacio empieza un comentario.');
console.error('Estas lineas perderian todo lo que va despues de la almohadilla:');
console.error('');

for (const p of problemas) {
  console.error(`  ${p.ruta}:${p.numero}`);
  console.error(`    escrito:  ${p.linea}`);
  console.error(`    se leeria: "${p.cortado}"`);
  console.error('');
}

console.error('Solucion: pon el valor entre comillas.');
console.error('    zona: "Cra. 9 #10-32, Zipaquira"');
console.error('');
process.exit(1);
