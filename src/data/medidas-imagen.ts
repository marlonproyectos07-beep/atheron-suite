/* ============================================================
   MEDIDAS REALES DE UNA IMAGEN, LEIDAS DEL PROPIO ARCHIVO

   PARA QUE SIRVE
   Un <img> sin width ni height no reserva sitio: el navegador pinta
   el texto, descarga la foto y entonces empuja todo hacia abajo.
   Eso es el CLS, y es lo que hace que alguien pulse un boton que se
   ha movido medio segundo antes.

   POR QUE NO SE ESCRIBEN A MANO EN CADA FICHA
   Son mas de cien fotos. Escribir dos numeros por foto en el panel
   es pedirle a una persona que copie doscientos datos que el archivo
   ya conoce, y basta con equivocarse en uno para deformar la imagen
   o reservar un hueco que no le corresponde. Aqui se leen del propio
   archivo al construir el sitio: si alguien sustituye una foto por
   otra de distinto tamano, las medidas se corrigen solas.

   POR QUE NO SE USA UNA LIBRERIA
   Solo hacen falta las medidas, que estan en los primeros bytes de
   la cabecera. Traer una dependencia para leer una cabecera seria
   anadir mantenimiento a cambio de nada.

   ESTO CORRE AL CONSTRUIR, NUNCA EN EL NAVEGADOR
   El sitio es estatico: cuando el visitante abre la pagina, el
   width y el height ya estan escritos en el HTML.
   ============================================================ */

import fs from 'node:fs';
import path from 'node:path';

export interface Medidas {
  ancho: number;
  alto: number;
}

/* Las imagenes del sitio viven en public/ y se sirven desde la raiz:
   "/assets/foo.webp" es "public/assets/foo.webp". */
const PUBLICO = path.resolve(process.cwd(), 'public');

/* Leer el mismo archivo veinte veces (la galeria, el visor, la
   tarjeta...) seria absurdo. Se lee una vez por construccion. */
const memoria = new Map<string, Medidas | null>();

function leeWebp(b: Buffer): Medidas | null {
  if (b.length < 30) return null;
  if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WEBP') return null;
  const formato = b.toString('ascii', 12, 16);
  /* WebP tiene tres variantes y cada una guarda las medidas en un
     sitio distinto. Las tres aparecen en este repositorio. */
  if (formato === 'VP8X') {
    return { ancho: (b.readUIntLE(24, 3) & 0xffffff) + 1, alto: (b.readUIntLE(27, 3) & 0xffffff) + 1 };
  }
  if (formato === 'VP8 ') {
    return { ancho: b.readUInt16LE(26) & 0x3fff, alto: b.readUInt16LE(28) & 0x3fff };
  }
  if (formato === 'VP8L') {
    const bits = b.readUInt32LE(21);
    return { ancho: (bits & 0x3fff) + 1, alto: ((bits >> 14) & 0x3fff) + 1 };
  }
  return null;
}

function leePng(b: Buffer): Medidas | null {
  if (b.length < 24 || b.readUInt32BE(0) !== 0x89504e47) return null;
  return { ancho: b.readUInt32BE(16), alto: b.readUInt32BE(20) };
}

function leeJpeg(b: Buffer): Medidas | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  /* Un JPEG es una sucesion de segmentos. Las medidas estan en el
     marcador de inicio de cuadro (SOF), que puede aparecer despues
     de la miniatura y de los datos de la camara, asi que hay que
     recorrer los segmentos hasta dar con el. */
  let i = 2;
  while (i < b.length - 9) {
    if (b[i] !== 0xff) { i++; continue; }
    const marca = b[i + 1];
    /* SOF0..SOF15, saltando DHT (c4), JPG (c8) y DAC (cc), que
       comparten rango pero no llevan medidas. */
    if (marca >= 0xc0 && marca <= 0xcf && marca !== 0xc4 && marca !== 0xc8 && marca !== 0xcc) {
      return { alto: b.readUInt16BE(i + 5), ancho: b.readUInt16BE(i + 7) };
    }
    if (marca === 0xd8 || marca === 0x01 || (marca >= 0xd0 && marca <= 0xd7)) { i += 2; continue; }
    const largo = b.readUInt16BE(i + 2);
    if (largo < 2) return null;
    i += 2 + largo;
  }
  return null;
}

/** Medidas reales de una imagen del sitio, o null si no se pueden leer. */
export function medidasDe(ruta?: string): Medidas | null {
  if (!ruta || !ruta.startsWith('/')) return null;
  if (memoria.has(ruta)) return memoria.get(ruta) ?? null;

  let medidas: Medidas | null = null;
  try {
    /* Solo se abre lo que este dentro de public/. Una ruta con ".."
       no puede acabar leyendo un archivo de fuera. */
    const archivo = path.resolve(PUBLICO, '.' + ruta);
    if (archivo.startsWith(PUBLICO + path.sep) && fs.existsSync(archivo)) {
      const b = fs.readFileSync(archivo);
      medidas = leeWebp(b) ?? leePng(b) ?? leeJpeg(b);
    }
  } catch {
    /* Una imagen ilegible no puede tumbar la construccion del sitio:
       se queda sin medidas y sale como salia antes. */
    medidas = null;
  }

  memoria.set(ruta, medidas);
  return medidas;
}
