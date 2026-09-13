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
   FOTOS QUE USA UNA MAQUETA, NO UNA FICHA

   Las de arriba se descubren solas leyendo los .md. Estas no: no
   pertenecen a ningun hospedaje, las escribe directamente una
   pagina, y por eso hay que nombrarlas.
   ------------------------------------------------------------ */
const FOTOS_DE_MAQUETA = [
  /* Hero de Casa Colonial Centro. Va a sangre y es la imagen que
     Lighthouse mide como LCP: servir los 1536 px de ancho a un
     telefono de 390 es mandar el triple de bytes de los que caben en
     la pantalla. Con las variantes, el movil baja la de 600 u 800. */
  '/assets/img/proyectos/casa-colonial-centro/casa-colonial-hero-vision-fachada.webp',
];

/* Rutas de foto dentro de un .md. No hace falta interpretar el YAML
   entero: basta con reconocer las dos claves que llevan imagen y
   quedarse con las que apuntan a nuestra carpeta de fotos. */
function rutasDeFicha(texto) {
  const principal = [];
  const miniaturas = [];
  for (const linea of texto.split('\n')) {
    const m = linea.match(/^(\s*)(fotoPrincipal|foto):\s*(\/assets\/img\/[^\s'"]+)\s*$/);
    if (!m) continue;
    const [, sangria, clave, ruta] = m;
    if (clave === 'fotoPrincipal') principal.push(ruta);
    /* "foto:" sangrada vive dentro de una habitacion; sin sangrar no
       existe hoy, pero si apareciera seria otra foto de ficha. */
    else if (sangria.length > 0) miniaturas.push(ruta);
  }
  return { principal, miniaturas };
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
  const { principal, miniaturas } = rutasDeFicha(texto);

  for (const ruta of principal) {
    generadas += await genera(ruta, ANCHOS_PRINCIPAL);
    fotos++;
  }
  for (const ruta of miniaturas) {
    generadas += await genera(ruta, ANCHOS_MINIATURA);
    fotos++;
  }
}

/* Las de las maquetas, que no salen de ningun .md. Llevan sus propios
   anchos: una imagen a sangre necesita el ancho entero del movil por
   su densidad de pixeles. */
const ANCHOS_MAQUETA = [400, 600, 800, 1100];

for (const ruta of FOTOS_DE_MAQUETA) {
  generadas += await genera(ruta, ANCHOS_MAQUETA);
  fotos++;
}

/* ------------------------------------------------------------
   RECORRIDO DE CASA COLONIAL

   Las imagenes del recorrido se guardan a 900 o 1200 px de ancho,
   que es lo que necesita un escritorio. Un telefono las pinta a unos
   360, asi que sin variantes se le mandaban tres veces los pixeles
   que caben en su pantalla.

   400 cubre el movil normal, 700 el movil de densidad alta y el
   escritorio. El archivo entero se queda de respaldo del <img>.
   ------------------------------------------------------------ */
const CARPETA_RECORRIDO = 'assets/img/proyectos/casa-colonial-centro';
const ANCHOS_RECORRIDO = [400, 700];

const directorioRecorrido = path.join(PUBLICO, CARPETA_RECORRIDO);
let nombresRecorrido = [];
try {
  nombresRecorrido = await fs.readdir(directorioRecorrido);
} catch {
  /* La carpeta solo existe si el proyecto tiene imagenes. Sin ella no
     hay nada que generar y el build sigue igual. */
}

for (const nombre of nombresRecorrido) {
  /* Solo los originales: los derivados ya llevan el sufijo del ancho
     y regenerarlos seria morderse la cola. */
  if (!nombre.endsWith('.webp')) continue;
  if (/-\d{3,4}\.webp$/.test(nombre)) continue;
  generadas += await genera(`/${CARPETA_RECORRIDO}/${nombre}`, ANCHOS_RECORRIDO);
  fotos++;
}

console.log(
  generadas === 0
    ? `Variantes al dia: ${fotos} fotos revisadas, ninguna que generar.`
    : `Variantes generadas: ${generadas} archivos nuevos, de ${fotos} fotos.`
);
