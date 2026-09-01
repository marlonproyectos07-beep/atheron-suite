/* ============================================================
   PRUEBAS DEL MINIMO PUBLICABLE

     npm run prueba

   Se ejecutan contra scripts/minimo-publicable.mjs, que es el mismo
   codigo que corre antes de cada publicacion. No hay copia ni
   simulacion: si estas pruebas pasan, el guardian se comporta asi de
   verdad.

   Que se demuestra aqui:
   - una casa completa valida se publica SIN fichas de habitaciones;
   - un hospedaje por habitaciones sigue necesitando lo de siempre;
   - una casa completa incompleta se sigue bloqueando, requisito a
     requisito;
   - las fichas reales del repositorio pasan por donde deben.

   Sin dependencias: node y ya. Meter un marco de pruebas para doce
   comprobaciones seria mas cosas que mantener que las que se prueban.
   ============================================================ */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { loQueFalta, modalidadDe, cifrasDe } from './minimo-publicable.mjs';

let hechas = 0;
const fallos = [];

function compara(nombre, real, esperado) {
  hechas++;
  const a = JSON.stringify(real);
  const b = JSON.stringify(esperado);
  if (a === b) return console.log(`  ok   ${nombre}`);
  fallos.push(nombre);
  console.log(`  FALLA ${nombre}\n         esperaba: ${b}\n         obtuvo:   ${a}`);
}

function falta(nombre, frontmatter, textoEsperado) {
  const pendientes = loQueFalta(frontmatter);
  hechas++;
  const encaja = textoEsperado
    ? pendientes.some((p) => p.includes(textoEsperado))
    : pendientes.length > 0;
  if (encaja) return console.log(`  ok   ${nombre}`);
  fallos.push(nombre);
  console.log(`  FALLA ${nombre}\n         no reclamo "${textoEsperado}"; reclamo: ${JSON.stringify(pendientes)}`);
}

/* ------------------------------------------------------------
   FICHAS DE PRUEBA
   ------------------------------------------------------------ */

/* Una casa que solo se alquila entera y esta completa. Fijate en que
   NO tiene ni una habitacion: ese es justo el caso que antes no se
   podia publicar. */
const CASA_COMPLETA_OK = `
nombre: Casa de Prueba
publicado: true
modalidad: casa-completa
insignia: '09'
descripcion: Casa de campo entera para grupos, con cocina, comedor, chimenea y zonas verdes alrededor.
zona: 'Vereda de Prueba, Cogua'
presentacion: Una casa entera para el grupo.
presentacionPendiente: false
fotoTarjeta: /assets/img/prueba/portada.webp
fotoPrincipal: /assets/img/prueba/portada.webp
heroFoto: true
galeria:
  - imagen: /assets/img/prueba/portada.webp
    alt: Portada
datos:
  - numero: '8'
    texto: Huespedes
    pendiente: false
  - numero: '2'
    texto: Habitaciones
    pendiente: false
  - numero: '2'
    texto: Camas
    pendiente: false
  - numero: '1'
    texto: Bano
    pendiente: false
caracteristicas:
  - texto: Cocina equipada
    pendiente: false
listadoSector: Cogua
precio: Consultar
precioPendiente: true
habitaciones: []
descripcionZona: En la vereda de prueba, en Cogua, Cundinamarca.
tituloContacto: Consulta disponibilidad y tarifa
antesDeReservar:
  titulo: Lo que conviene saber
  condiciones:
    - titulo: Mascotas, bajo consulta previa
      texto: No se aceptan automaticamente.
`;

/* El modelo de siempre: se vende por habitaciones. */
const POR_HABITACIONES_OK = `
nombre: Hotel de Prueba
publicado: true
insignia: '01'
descripcion: Hotel de prueba en Zipaquira con habitaciones para parejas y familias, a minutos del centro.
zona: 'Zipaquira, Cundinamarca'
presentacion: Un hotel de prueba.
presentacionPendiente: false
fotoTarjeta: /assets/img/prueba/portada.webp
listadoSector: Zipaquira
precio: $ 150.000
precioPendiente: false
habitaciones:
  - nombre: Habitacion 101
    descripcion: Habitacion con cama doble.
    pendiente: false
`;

const quitando = (base, linea, cambio = '') => base.replace(linea, cambio);

console.log('\nPRUEBAS DEL MINIMO PUBLICABLE\n');

console.log(' Casa completa');
compara('una casa completa valida se publica sin habitaciones', loQueFalta(CASA_COMPLETA_OK), []);
compara('la modalidad se lee del contenido', modalidadDe(CASA_COMPLETA_OK), 'casa-completa');
compara(
  'las cuatro cifras de la portada se leen bien',
  cifrasDe(CASA_COMPLETA_OK).map((c) => c.numero + ' ' + c.texto),
  ['8 Huespedes', '2 Habitaciones', '2 Camas', '1 Bano'],
);
compara(
  'sin tarifa fija pero con "Consultar" NO se bloquea',
  loQueFalta(CASA_COMPLETA_OK).filter((t) => t.includes('precio')),
  [],
);

console.log('\n Hospedaje por habitaciones (no se toco nada)');
compara('un hospedaje por habitaciones valido se publica', loQueFalta(POR_HABITACIONES_OK), []);
falta(
  'sin habitaciones con datos reales, se sigue bloqueando',
  quitando(POR_HABITACIONES_OK, '    pendiente: false', '    pendiente: true'),
  'al menos una habitacion',
);
falta(
  'con el precio pendiente, se sigue bloqueando',
  quitando(POR_HABITACIONES_OK, 'precioPendiente: false', 'precioPendiente: true'),
  'precio real',
);
falta(
  'un "Consultar" NO le vale a un hospedaje por habitaciones',
  quitando(POR_HABITACIONES_OK, 'precio: $ 150.000\nprecioPendiente: false', 'precio: Consultar\nprecioPendiente: true'),
  'precio real',
);

console.log('\n Casa completa incompleta: se bloquea igual');
falta('sin portada fotografica', quitando(CASA_COMPLETA_OK, 'heroFoto: true', 'heroFoto: false'), 'portada fotografica');
falta('sin foto principal', quitando(CASA_COMPLETA_OK, 'fotoPrincipal: /assets/img/prueba/portada.webp', "fotoPrincipal: ''"), 'portada fotografica');
falta('sin ninguna foto en la galeria', quitando(CASA_COMPLETA_OK, '  - imagen: /assets/img/prueba/portada.webp\n    alt: Portada'), 'galeria');
falta('sin la capacidad en la portada', quitando(CASA_COMPLETA_OK, "  - numero: '8'\n    texto: Huespedes\n    pendiente: false\n"), 'capacidad total');
falta('sin el numero de camas', quitando(CASA_COMPLETA_OK, "  - numero: '2'\n    texto: Camas\n    pendiente: false\n"), 'camas');
falta('sin el numero de banos', quitando(CASA_COMPLETA_OK, "  - numero: '1'\n    texto: Bano\n    pendiente: false\n"), 'banos');
falta('con un "N" de plantilla en vez de la capacidad', quitando(CASA_COMPLETA_OK, "  - numero: '8'", "  - numero: 'N'"), 'capacidad total');
falta('sin descripcion de la zona', quitando(CASA_COMPLETA_OK, 'descripcionZona: En la vereda de prueba, en Cogua, Cundinamarca.', "descripcionZona: ''"), 'ubicacion publica');
falta('sin servicios listados', quitando(CASA_COMPLETA_OK, '  - texto: Cocina equipada\n    pendiente: false\n'), 'servicios');
falta('sin condiciones de reserva', quitando(CASA_COMPLETA_OK, '    - titulo: Mascotas, bajo consulta previa\n      texto: No se aceptan automaticamente.\n'), 'condiciones de reserva');
falta('sin llamada a consultar en contacto', quitando(CASA_COMPLETA_OK, 'tituloContacto: Consulta disponibilidad y tarifa', "tituloContacto: ''"), 'apartado de contacto');
falta('con el precio en hueco ("$ ---") y sin consultar', quitando(CASA_COMPLETA_OK, 'precio: Consultar', 'precio: $ ---'), 'precio real');
falta('con nombre de plantilla', quitando(CASA_COMPLETA_OK, 'nombre: Casa de Prueba', 'nombre: Hospedaje 09'), 'nombre real');

console.log('\n Borradores');
compara(
  'una ficha en borrador no se revisa, aunque este a medias',
  loQueFalta(quitando(CASA_COMPLETA_OK, 'publicado: true', 'publicado: false').replace('heroFoto: true', 'heroFoto: false')),
  [],
);
compara(
  'sin declarar modalidad, se sigue tratando como por habitaciones',
  modalidadDe(POR_HABITACIONES_OK),
  'habitaciones',
);
falta(
  'una casa entera SIN declarar la modalidad sigue pidiendo habitaciones',
  quitando(CASA_COMPLETA_OK, 'modalidad: casa-completa', ''),
  'al menos una habitacion',
);

console.log('\n Fichas reales del repositorio');
const CARPETA = 'src/content/hospedajes';
for (const archivo of readdirSync(CARPETA).filter((n) => n.endsWith('.md')).sort()) {
  const partes = readFileSync(join(CARPETA, archivo), 'utf8').split(/^---\s*$/m);
  const fm = partes[1] ?? '';
  compara(`${archivo} (${modalidadDe(fm)})`, loQueFalta(fm), []);
}

console.log('');
if (fallos.length) {
  console.error(`PRUEBAS FALLIDAS: ${fallos.length} de ${hechas}`);
  for (const f of fallos) console.error(`  - ${f}`);
  console.error('');
  process.exit(1);
}
console.log(`${hechas} pruebas, todas correctas.\n`);
