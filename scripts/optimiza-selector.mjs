/* ============================================================
   VARIANTES POR ANCHO DE LAS FOTOS DE FICHA

   Genera, antes de construir, las versiones AVIF y WebP que piden
   las fichas: las miniaturas del selector y los tamanos de la foto
   principal. No cambia el contenido de ninguna foto, solo el formato
   y el tamano que se sirve.

   QUE FOTOS: las saca del propio contenido, no de una lista escrita
   a mano. Antes eran cinco rutas fijas de Hotel Atheron Suite, y
   anadir otro hospedaje obligaba a editar este archivo. Ahora se
   recorren los .md de la coleccion:

     fotoPrincipal  -> 400, 600, 700 y 900 px  (portada y bloque doble)
     foto de cada habitacion -> 240, 360 y 480 px  (mini del selector)

   SOLO GENERA LO QUE FALTA. Las variantes del hero de Hotel Atheron
   Suite se hicieron a mano y estan versionadas: si esto las
   regenerara, cada build dejaria el repositorio sucio con bytes
   distintos y el mismo contenido.
   ============================================================ */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const CONTENIDO = 'src/content/hospedajes';
const PUBLICO = 'public';

/* Que anchos necesita cada tipo de foto. Si manana una plantilla pide
   otro tamano, se anade aqui y se genera solo. */
const ANCHOS_PRINCIPAL = [400, 600, 700, 900];
const ANCHOS_MINIATURA = [240, 360, 480];

/* ------------------------------------------------------------
   FOTOS DE TARJETA

   La foto de tarjeta es la que sale en la portada, en el catalogo y
   en la pagina de grupos. Hasta hoy era la unica de la ficha que NO
   se convertia, asi que se servia el original entero: el catalogo
   pesaba 721 KB, y la foto de tarjeta de Casa Algarra sola son 326
   KB para pintarse a menos de 400 px de ancho.

   Tres anchos y no cuatro: una tarjeta nunca se pinta a mas de unos
   380 px de ancho de CSS. El 700 cubre el caso de una pantalla de
   telefono con doble densidad; un 900 no lo elegiria nadie y solo
   ocuparia disco.
   ------------------------------------------------------------ */
const ANCHOS_TARJETA = [400, 600, 700];

/* ------------------------------------------------------------
   FOTOS QUE USA UNA MAQUETA, NO UNA FICHA

   Las de arriba se descubren solas leyendo los .md. Estas no: no
   pertenecen a ningun hospedaje, las escribe directamente una
   pagina, y por eso hay que nombrarlas.

   La de la portada pesaba 99 KB y se servia tal cual, sin AVIF ni
   WebP y sin reducir: era el archivo mas pesado de toda la portada,
   por delante de la propia imagen del hero. Con variantes baja a
   una fraccion sin que cambie nada de lo que se ve.

   Anadir una aqui es escribir su ruta. El resto -formatos, anchos,
   no regenerar lo que ya existe- ya funciona igual que para las
   fichas.
   ------------------------------------------------------------ */
const FOTOS_DE_MAQUETA = [
  /* Portada, seccion "Como nacio Atheron Suite". */
  '/assets/img/hospedajes/la-magia-de-zipaquira-301-camas.jpg',
  /* Hero de Casa Colonial Centro. Va a sangre y es la imagen que
     Lighthouse mide como LCP: servir los 1536 px de ancho a un
     telefono de 390 es mandar el triple de bytes de los que caben en
     la pantalla. Con las variantes, el movil baja la de 700 u 900. */
  '/assets/img/proyectos/casa-colonial-centro/casa-colonial-hero-vision-fachada.webp',
];

/* Rutas de foto dentro de un .md. No hace falta interpretar el YAML
   entero: basta con reconocer las dos claves que llevan imagen y
   quedarse con las que apuntan a nuestra carpeta de fotos. */
function rutasDeFicha(texto) {
  const principal = [];
  const miniaturas = [];
  const tarjetas = [];
  /* Las fichas llegan con saltos de linea de Windows cuando se
     trabaja en Windows. Sin quitar el "\r", el "$" de la expresion
     no encuentra el final de linea y este archivo concluia que la
     ficha no tenia ninguna foto. Mismo fallo que el del guardian de
     publicacion, y por el mismo motivo. */
  for (const linea of texto.replace(/\r\n?/g, '\n').split('\n')) {
    const m = linea.match(/^(\s*)(fotoPrincipal|fotoTarjeta|foto):\s*(\/assets\/img\/[^\s'"]+)\s*$/);
    if (!m) continue;
    const [, sangria, clave, ruta] = m;
    if (clave === 'fotoPrincipal') principal.push(ruta);
    else if (clave === 'fotoTarjeta') tarjetas.push(ruta);
    /* "foto:" sangrada vive dentro de una habitacion; sin sangrar no
       existe hoy, pero si apareciera seria otra foto de ficha. */
    else if (sangria.length > 0) miniaturas.push(ruta);
  }
  return { principal, miniaturas, tarjetas };
}

async function existe(ruta) {
  try {
    await fs.access(ruta);
    return true;
  } catch {
    return false;
  }
}

async function genera(rutaPublica, anchos) {
  const entrada = path.join(PUBLICO, rutaPublica);
  if (!(await existe(entrada))) {
    throw new Error(`Una ficha apunta a una foto que no existe: ${entrada}`);
  }
  const base = entrada.replace(/\.(jpe?g|png|webp)$/i, '');
  let hechas = 0;

  for (const ancho of anchos) {
    const avif = `${base}-${ancho}.avif`;
    const webp = `${base}-${ancho}.webp`;

    if (!(await existe(avif))) {
      await sharp(entrada).resize({ width: ancho, withoutEnlargement: true })
        .avif({ quality: 62, effort: 4 }).toFile(avif);
      hechas++;
    }
    if (!(await existe(webp))) {
      await sharp(entrada).resize({ width: ancho, withoutEnlargement: true })
        .webp({ quality: 74, effort: 4 }).toFile(webp);
      hechas++;
    }
  }
  return hechas;
}

const fichas = (await fs.readdir(CONTENIDO)).filter((f) => f.endsWith('.md'));
let generadas = 0;
let fotos = 0;

for (const nombre of fichas) {
  const texto = await fs.readFile(path.join(CONTENIDO, nombre), 'utf8');
  const { principal, miniaturas, tarjetas } = rutasDeFicha(texto);

  for (const ruta of principal) {
    generadas += await genera(ruta, ANCHOS_PRINCIPAL);
    fotos++;
  }
  /* Una foto de tarjeta puede ser la misma que la principal -es el
     caso de Hotel Atheron Suite-. No pasa nada: genera() no rehace
     lo que ya existe. */
  for (const ruta of tarjetas) {
    generadas += await genera(ruta, ANCHOS_TARJETA);
    fotos++;
  }
  for (const ruta of miniaturas) {
    generadas += await genera(ruta, ANCHOS_MINIATURA);
    fotos++;
  }
}

/* Las de las maquetas, que no salen de ningun .md. */
/* Las fotos de maqueta llevan sus propios anchos. Los de ficha -400,
   600, 700 y 900- se pensaron para fotos que ocupan media pantalla;
   una imagen a sangre necesita el ancho entero del movil por su
   densidad de pixeles, y el salto de 700 a 900 deja al telefono
   bajando bastante mas de lo que cabe: con 412 px de ancho y densidad
   1,75 pide 721, y al no haber nada entre medias se lleva la de 900.
   Con 800 en la lista baja la que le corresponde. */
const ANCHOS_MAQUETA = [400, 600, 800, 1100];

for (const ruta of FOTOS_DE_MAQUETA) {
  generadas += await genera(ruta, ANCHOS_MAQUETA);
  fotos++;
}

console.log(
  generadas === 0
    ? `Variantes al dia: ${fotos} fotos revisadas, ninguna que generar.`
    : `Variantes generadas: ${generadas} archivos nuevos, de ${fotos} fotos.`
);
