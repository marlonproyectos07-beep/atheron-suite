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

import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { loQueFalta } from './minimo-publicable.mjs';
import { join } from 'node:path';

const CARPETA = 'src/content';

/* ------------------------------------------------------------
   LIMITES DE PESO DE LAS FOTOS

   Por que existen: en la primera prueba del panel se subio una
   captura de pantalla de 1,1 MB. Multiplicado por 5 fotos de
   galeria y 7 hospedajes, son 38 MB que el visitante descarga.
   En movil con datos, eso es abandono.

   AVISA por encima de 300 KB: sigue publicando, pero deja constancia.
   DETIENE por encima de 1 MB: a ese peso el dano es real, y es mejor
   un error claro ahora que un sitio lento del que nadie se entera.
   ------------------------------------------------------------ */
const AVISO_KB = 300;
const LIMITE_KB = 1024;

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
const fotosPesadas = [];
const fotosAvisadas = [];
const fotosQueFaltan = [];

for (const ruta of archivosMarkdown(CARPETA)) {
  const contenido = readFileSync(ruta, 'utf8');

  /* ----------------------------------------------------------
     FOTOS: que existan y que no pesen de mas
     Se buscan las direcciones que empiezan por /assets/img/,
     que es como las escribe el panel.
     ---------------------------------------------------------- */
  for (const [, direccion] of contenido.matchAll(/(\/assets\/img\/[^\s'"]+)/g)) {
    const enDisco = join('public', direccion);
    if (!existsSync(enDisco)) {
      fotosQueFaltan.push({ ruta, direccion });
      continue;
    }
    const kb = Math.round(statSync(enDisco).size / 1024);
    if (kb > LIMITE_KB) fotosPesadas.push({ ruta, direccion, kb });
    else if (kb > AVISO_KB) fotosAvisadas.push({ ruta, direccion, kb });
  }

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


/* ============================================================
   MINIMO PUBLICABLE DE UN HOSPEDAJE

   Que problema resuelve:
   la casilla "Publicado" del panel es la puerta de salida de una
   ficha. Al encenderla, esa ficha aparece en la portada, en el
   listado, en el sitemap y en Google.

   Sin esta comprobacion, se puede encender la casilla de una
   ficha que todavia dice "Hospedaje 02", "$ ---" y "N huespedes".
   El visitante ve una tarjeta vacia y se va; Google ve contenido
   delgado y lo castiga en TODO el dominio, no solo en esa pagina.

   Que hace:
   revisa cada ficha con "publicado: true" y comprueba que tenga
   lo minimo para defenderse sola delante de un cliente.

   ACTIVADO el 23 de agosto de 2026. La Magia de Zipaquira ya cumple
   los siete requisitos -llegaron el precio y los datos de la Suite
   301-, asi que el aviso salia vacio y esto paso de avisar a detener.
   Desde ahora, encender "publicado" en una ficha incompleta detiene la
   publicacion en vez de sacarla a medias a la calle.
   ============================================================ */
const MINIMO_BLOQUEA = true;

/* Los requisitos y sus ayudantes viven en scripts/minimo-publicable.mjs.
   Salieron de aqui para poder probarlos: las pruebas ejecutan ese mismo
   codigo, no una copia. Ahi tambien esta la razon por la que hay dos
   modelos de venta -por habitaciones y casa completa- y por que a la
   casa entera se le pide otra cosa, no menos. */

const fichasIncompletas = [];

for (const ruta of archivosMarkdown(join(CARPETA, 'hospedajes'))) {
  const partes = readFileSync(ruta, 'utf8').split(/^---\s*$/m);
  if (partes.length < 3) continue;
  const frontmatter = partes[1];

  const faltan = loQueFalta(frontmatter);
  if (faltan.length) fichasIncompletas.push({ ruta, faltan });
}

if (fichasIncompletas.length) {
  const cabecera = MINIMO_BLOQUEA
    ? 'PUBLICACION DETENIDA — ficha publicada sin el minimo'
    : 'AVISO  ficha publicada que aun no cumple el minimo publicable';
  const escribir = MINIMO_BLOQUEA ? console.error : console.warn;

  escribir('');
  escribir(cabecera);
  escribir('');
  for (const f of fichasIncompletas) {
    escribir(`  ${f.ruta}`);
    escribir(`    esta marcada como publicada, pero le falta:`);
    for (const q of f.faltan) escribir(`      - ${q}`);
    escribir('');
  }
  escribir('    Mientras falte algo de esto, la ficha se ve incompleta para un');
  escribir('    cliente. La alternativa es apagar "Publicado" hasta completarla:');
  escribir('    la ficha sigue editandose en el panel y desaparece de la portada,');
  escribir('    del listado, del sitemap y de Google.');
  escribir('');

  if (MINIMO_BLOQUEA) process.exit(1);
}
/* Los avisos no detienen nada: se dejan visibles y se sigue. */
for (const f of fotosAvisadas) {
  console.warn(
    `AVISO  ${f.direccion} pesa ${f.kb} KB (recomendado: menos de ${AVISO_KB} KB). ` +
    `Comprimela con:  npm run foto -- <archivo> <nombre> <hospedaje>`,
  );
}

if (fotosQueFaltan.length || fotosPesadas.length) {
  console.error('');
  console.error('PUBLICACION DETENIDA — problema con las fotos');
  console.error('');

  for (const f of fotosQueFaltan) {
    console.error(`  ${f.ruta}`);
    console.error(`    la foto ${f.direccion} no existe en el proyecto.`);
    console.error(`    Vuelve a subirla desde el panel.`);
    console.error('');
  }

  for (const f of fotosPesadas) {
    console.error(`  ${f.ruta}`);
    console.error(`    la foto ${f.direccion} pesa ${f.kb} KB.`);
    console.error(`    El maximo son ${LIMITE_KB} KB. Una foto asi hace lento el sitio`);
    console.error(`    en movil, que es donde entra la mayoria de tus clientes.`);
    console.error('');
    console.error(`    Comprimela sin perder calidad visible con:`);
    console.error(`      npm run foto -- <archivo original> <nombre> <hospedaje>`);
    console.error('');
  }

  process.exit(1);
}

if (problemas.length === 0) {
  const total = fotosAvisadas.length;
  console.log(
    `Contenido comprobado: ningun texto se corta en una almohadilla` +
    (total ? `, y ${total} foto(s) por encima del peso recomendado.` : `, y las fotos estan dentro de peso.`),
  );
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
