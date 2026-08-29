import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

/* Miniaturas del selector comercial de Hotel Atheron Suite.
   Se generan durante prebuild desde los JPG ya aprobados: no cambia
   el contenido de ninguna foto, solo el formato y el tamaño servido. */
const carpeta = 'public/assets/img/hospedajes';
const archivos = [
  'hotel-atheron-suite-201-vista-general.jpg',
  'hotel-atheron-suite-202-vista-general.jpg',
  'hotel-atheron-suite-203-cama.jpg',
  'la-magia-de-zipaquira-301-camas.jpg',
  'hotel-atheron-suite-302-habitacion.jpg',
];
const anchos = [240, 360, 480];

for (const nombre of archivos) {
  const entrada = path.join(carpeta, nombre);
  try {
    await fs.access(entrada);
  } catch {
    throw new Error(`No existe la foto del selector: ${entrada}`);
  }

  const base = entrada.replace(/\.jpg$/i, '');
  for (const ancho of anchos) {
    const avif = `${base}-${ancho}.avif`;
    const webp = `${base}-${ancho}.webp`;

    await sharp(entrada)
      .resize({ width: ancho, withoutEnlargement: true })
      .avif({ quality: 62, effort: 4 })
      .toFile(avif);

    await sharp(entrada)
      .resize({ width: ancho, withoutEnlargement: true })
      .webp({ quality: 74, effort: 4 })
      .toFile(webp);
  }
}

console.log(`Selector optimizado: ${archivos.length} fotos × ${anchos.length} tamaños × AVIF/WebP.`);
