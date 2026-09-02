/* ============================================================
   OPTIMIZA UNA FOTO PARA EL SITIO

   Uso:
     npm run foto -- <archivo> <nombre-de-salida> [hospedaje]

   Ejemplo:
     npm run foto -- C:/fotos/DSC_0421.jpg sala la-magia-de-zipaquira

   Deja el resultado en:
     public/assets/img/hospedajes/la-magia-de-zipaquira-sala.jpg

   QUE HACE, Y POR QUE
   - Reduce la foto a 1600 px de ancho como maximo. Mas que eso no
     aporta nada en pantalla y multiplica el peso.
   - La convierte a JPEG de calidad 82, que es donde deja de notarse
     la diferencia a simple vista.
   - La deja por debajo del limite recomendado.

   ESTO NO FORMA PARTE DE LA PUBLICACION. Es una herramienta manual,
   asi que no puede romper el sitio. Si algun dia se automatiza la
   compresion al subir desde el panel, este script es el punto de
   partida.
   ============================================================ */

import sharp from 'sharp';
import { statSync, mkdirSync } from 'node:fs';
import { basename, join } from 'node:path';

const ANCHO_MAXIMO = 1600;
const CALIDAD = 82;
const CARPETA = 'public/assets/img/hospedajes';

const [entrada, nombre, hospedaje] = process.argv.slice(2);

if (!entrada || !nombre) {
  console.error('');
  console.error('Faltan datos. Uso:');
  console.error('  npm run foto -- <archivo> <nombre-de-salida> [hospedaje]');
  console.error('');
  console.error('Ejemplo:');
  console.error('  npm run foto -- C:/fotos/DSC_0421.jpg sala la-magia-de-zipaquira');
  console.error('');
  process.exit(1);
}

const kb = (ruta) => Math.round(statSync(ruta).size / 1024);

/* El nombre del archivo tambien comunica: describe que es la foto
   y a que hospedaje pertenece. "pasted-image-1787270231146.png" no
   le dice nada ni a Google ni a ti dentro de seis meses. */
const nombreFinal = [hospedaje, nombre].filter(Boolean).join('-') + '.jpg';
const destino = join(CARPETA, nombreFinal);

mkdirSync(CARPETA, { recursive: true });

const antes = kb(entrada);

const info = await sharp(entrada)
  .rotate() // respeta la orientacion de la camara
  .resize({ width: ANCHO_MAXIMO, withoutEnlargement: true })
  .jpeg({ quality: CALIDAD, mozjpeg: true })
  .toFile(destino);

const despues = kb(destino);

console.log('');
console.log(`  Origen:  ${basename(entrada)}  (${antes} KB)`);
console.log(`  Destino: ${destino}`);
console.log(`  Tamano:  ${info.width} x ${info.height} px  ·  ${despues} KB`);
console.log(`  Ahorro:  ${Math.round((1 - despues / antes) * 100)}%`);
console.log('');
console.log('  En el panel, pon esta direccion en el campo de foto:');
console.log(`    /assets/img/hospedajes/${nombreFinal}`);
console.log('');
