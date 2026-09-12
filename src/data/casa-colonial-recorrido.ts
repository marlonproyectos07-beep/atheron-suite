/* ============================================================
   CASA COLONIAL CENTRO — EL RECORRIDO

   Las 29 paradas del brochure, en el orden en que se camina la casa:
   se llega, se ve dónde está, se entra por la fachada, se cruza el
   parque, se recorre el corredor, se sube al piso 2, se ven las
   habitaciones y se termina en la terraza del gastrobar.

   POR QUÉ ESTE ARCHIVO EXISTE APARTE
   casa-colonial-centro.ts ya pasa de 1400 líneas. El recorrido son
   24 bloques nuevos con sus 59 imágenes, y meterlo allí haría el
   archivo inmanejable. Aquí vive el recorrido; allí siguen viviendo
   el catálogo de las 22 aprobadas, las unidades, las alianzas y el
   resto de la página.

   ============================================================
   LAS TRES REGLAS QUE NO SE TOCAN

   1. REAL Y VISIÓN SON ARCHIVOS SEPARADOS. Nunca un montaje
      "antes y después" en una sola imagen: se recorta al compartirlo
      y el aviso de conceptual se pierde por el camino.

   2. LOS RÓTULOS NO SE ESCRIBEN AQUÍ. Los pone ProyectoFoto a partir
      del campo "tipo" de cada imagen. REAL lleva "fotografía real";
      CONCEPTUAL lleva el sello encima, el rótulo debajo y el aviso de
      que el diseño puede cambiar. Escribirlos a mano en la maqueta es
      exactamente como se acaba enseñando un render sin advertir que
      lo es.

   3. NINGUNA CAPACIDAD SE INVENTA. La que no está aprobada por
      escrito, no se publica. Ver la nota de la 201 y la de la 205.

   ============================================================
   TEXTO INCRUSTADO EN LOS RENDERS

   Varios renders aprobados traen su propia cartelería dentro de la
   imagen: el número de habitación, la capacidad, iconos de servicios.
   Se generaron así durante el diseño y NO se recrean ni se retocan
   sin autorización.

   En la página mandan los títulos en HTML, que son los que lee un
   buscador y los que oye un lector de pantalla. El texto de dentro
   del render se queda donde está, pero no se repite fuera.
   ============================================================ */

import {
  ficha,
  type Estado,
  type FotoProyecto,
  fachadaActual,
  fachadaVision,
  entradaParqueActual,
  entradaParqueVision,
  corredorRecepcionActual,
  corredorRecepcionVision,
} from './casa-colonial-centro';

/* ------------------------------------------------------------
   UN BLOQUE DEL RECORRIDO

   "actuales" es una lista y no una sola foto porque varios espacios
   llegaron con más de una toma real: la 201 tiene tres, el baño
   modelo tres, la suite 207 cuatro. Enseñarlas todas es lo que hace
   creíble el render que va al lado.

   "vision" puede ser null. Dos bloques -el pasillo central y la
   habitación 206- llegaron con su render pero sin fotografía real del
   mismo encuadre; se publican con la visión sola y su nota, nunca
   emparejados con la foto de otro sitio.
   ------------------------------------------------------------ */
export interface BloqueRecorrido {
  /** Ancla de la sección. Ej: "hab-206". */
  id: string;
  /** Número de parada en el orden maestro, para trazarlo con Drive. */
  paso: number;
  ceja: string;
  titulo: string;
  /** Subtítulo corto, solo donde aporta. */
  subtitulo?: string;
  texto: string;
  /** Fotografías reales del estado de hoy. Puede estar vacía. */
  actuales: FotoProyecto[];
  /** Representación conceptual del mismo espacio. */
  vision: FotoProyecto | null;
  /** Aviso extra bajo el bloque, cuando hace falta explicar algo. */
  nota?: string;
  /** Datos de la unidad, si es una habitación. Nunca inventados. */
  ficha?: { etiqueta: string; valor: string }[];
  /* "apilado" saca el bloque de la comparativa 50/50 y pone la
     fotografía real arriba y el render debajo, cada uno a su ancho.

     Se usa cuando las proporciones de la pareja son tan distintas
     que enfrentarlas se ve desbalanceado pase lo que pase. Hoy solo
     la terraza: sus fotografías son 539 x 1200 -más del doble de
     altas que anchas- y el render es 4:3. Al lado quedaba una franja
     estrecha junto a una postal. Recortar la vertical para forzar
     4:3 está descartado: se comería la mitad de la toma. */
  disposicion?: 'comparativa' | 'apilado';
  /** false = no se pinta, aunque los archivos existan. */
  aprobada: boolean;
}

/* ------------------------------------------------------------
   CATÁLOGO DE LAS 59 IMÁGENES DE LA CURADURÍA FINAL

   El nombre del archivo conserva el número de la curaduría de Drive
   -06, 07, 17...- a propósito: así una imagen de la página se rastrea
   hasta su carpeta de origen sin abrir nada.

   Medidas: las reales verticales quedaron en 900x1200 y las
   horizontales en 1200x900; los renders cuadrados de habitación en
   1200x1097. Cada una declara su orientación, y de ahí sale la
   proporción del hueco que reserva la página. Por eso ninguna se
   recorta.
   ------------------------------------------------------------ */

const REAL = { tipo: 'REAL' as const, unidad: 'GENERAL' as const, estado: 'VERIFICADO' as Estado, aprobada: true };
const CONCEPTO = { tipo: 'CONCEPTUAL' as const, unidad: 'GENERAL' as const, estado: 'PROPUESTA' as Estado, aprobada: true };
const VERT = { orientacion: 'vertical' as const, ancho: 900, alto: 1200 };
const HORIZ = { orientacion: 'horizontal' as const, ancho: 1200, alto: 900 };
/* Los renders de habitación vienen casi cuadrados (1200x1097). No se
   fuerzan a 4:3: se declara su medida real y el hueco la respeta. */
const CUADRO = { orientacion: 'horizontal' as const, ancho: 1200, alto: 1097 };

const f = (archivo: string, base: object, forma: object, alt: string) =>
  ficha(`casa-colonial-${archivo}.webp`, { ...base, ...forma, alt } as never);

/* 06 — Recepción y escalera */
const recepcionReal = f('06-recepcion-escalera-real', REAL, VERT,
  'Zona de recepción de Casa Colonial Centro en su estado actual, junto a la escalera principal');
const recepcionVision = f('06-recepcion-escalera-vision', CONCEPTO, VERT,
  'Representación conceptual de la recepción integrada junto a la escalera principal');

/* 07 y 08 — Patio 1 / cafetería */
const patioAReal = f('07-patio1-cafeteria-a-real', REAL, VERT,
  'Patio 1 de Casa Colonial Centro en su estado actual, primera perspectiva');
const patioAVision = f('07-patio1-cafeteria-a-vision', CONCEPTO, VERT,
  'Representación conceptual del Patio 1 con la cafetería proyectada, primera perspectiva');
const patioBReal = f('08-patio1-cafeteria-b-real', REAL, HORIZ,
  'Patio 1 de Casa Colonial Centro en su estado actual, segunda perspectiva');
const patioBVision = f('08-patio1-cafeteria-b-vision', CONCEPTO, HORIZ,
  'Representación conceptual del Patio 1 y su conexión con el balcón del segundo piso');

/* 09 a 12 — ascenso, llegada, balcón y lobby */
const escaleraReal = f('09-escalera-piso2-real', REAL, VERT,
  'Escalera hacia el segundo piso de Casa Colonial Centro en su estado actual');
const escaleraVision = f('09-escalera-piso2-vision', CONCEPTO, VERT,
  'Representación conceptual de la escalera restaurada hacia el segundo piso');
const llegadaReal = f('10-llegada-piso2-real', REAL, VERT,
  'Espacio de llegada al segundo piso en su estado actual');
const llegadaVision = f('10-llegada-piso2-vision', CONCEPTO, VERT,
  'Representación conceptual del espacio de llegada al segundo piso');
const balconReal = f('11-balcon-lobby-real', REAL, HORIZ,
  'Balcón del segundo piso sobre el Patio 1, en su estado actual');
const balconVision = f('11-balcon-lobby-vision', CONCEPTO, HORIZ,
  'Representación conceptual del balcón del lobby con vista al Patio 1 y la cafetería');
const lobbyReal = f('12-lobby-piso2-real', REAL, HORIZ,
  'Lobby del segundo piso de Casa Colonial Centro en su estado actual');
const lobbyVision = f('12-lobby-piso2-vision', CONCEPTO, HORIZ,
  'Representación conceptual del lobby del segundo piso');

/* 13 y 14 — cuarto mochilero 208 */
const mochileroReal = f('13-mochilero-208-real', REAL, VERT,
  'Habitación 208 de Casa Colonial Centro en su estado actual, antes de la intervención');
const mochileroVision = f('13-mochilero-208-vision', CONCEPTO, VERT,
  'Representación conceptual de la habitación 208 como cuarto mochilero con seis camarotes');
const banoMochileroReal = f('14-bano-mochilero-real', REAL, VERT,
  'Baño de la habitación 208 en su estado actual');
const banoMochileroVision = f('14-bano-mochilero-vision', CONCEPTO, VERT,
  'Representación conceptual del baño del cuarto mochilero');

/* 15 y 16 — pasillos del piso 2 */
const pasilloCentralVision = f('15-pasillo-central-vision', CONCEPTO, VERT,
  'Representación conceptual del pasillo central del segundo piso');
const pasilloHabReal = f('16-pasillo-habitaciones-real', REAL, VERT,
  'Pasillo de acceso a las habitaciones en su estado actual');
const pasilloHabVision = f('16-pasillo-habitaciones-vision', CONCEPTO, VERT,
  'Representación conceptual del pasillo de acceso a las habitaciones');

/* 17 a 23 — habitaciones 201 a 206 y baño modelo */
const h201Real1 = f('17-habitacion-201-real-01', REAL, VERT, 'Habitación 201 en su estado actual, primera vista');
const h201Real2 = f('17-habitacion-201-real-02', REAL, VERT, 'Habitación 201 en su estado actual, segunda vista');
const h201Real3 = f('17-habitacion-201-real-03', REAL, VERT, 'Habitación 201 en su estado actual, tercera vista');
const h201Vision = f('17-habitacion-201-vision', CONCEPTO, CUADRO,
  'Representación conceptual de la habitación 201 con cama matrimonial, camarote, sofá cama y escritorio');

const h202Real = f('18-habitacion-202-real', REAL, VERT, 'Habitación 202 en su estado actual');
const h202Vision = f('18-habitacion-202-vision', CONCEPTO, VERT,
  'Representación conceptual de la habitación 202 con cama doble inferior y cama sencilla superior');

const h203Real = f('19-habitacion-203-real', REAL, VERT, 'Habitación 203 en su estado actual, con acceso al balcón');
const h203Vision = f('19-habitacion-203-vision', CONCEPTO, VERT,
  'Representación conceptual de la habitación 203 con balcón hacia el Parque Principal');

const banoReal1 = f('20-bano-modelo-real-01', REAL, VERT, 'Baño de habitación en su estado actual, primera vista');
const banoReal2 = f('20-bano-modelo-real-02', REAL, VERT, 'Baño de habitación en su estado actual, segunda vista');
const banoReal3 = f('20-bano-modelo-real-03', REAL, VERT, 'Baño de habitación en su estado actual, tercera vista');
const banoVision = f('20-bano-modelo-vision', CONCEPTO, VERT,
  'Representación conceptual del baño modelo: sanitario, lavamanos y ducha al fondo con división de vidrio');

const h204Real1 = f('21-habitacion-204-real-01', REAL, VERT, 'Habitación 204 en su estado actual, primera vista');
const h204Real2 = f('21-habitacion-204-real-02', REAL, VERT, 'Habitación 204 en su estado actual, segunda vista');
const h204Vision = f('21-habitacion-204-vision', CONCEPTO, CUADRO,
  'Representación conceptual de la habitación 204 con camarote doble y acceso al baño');

const h205Real = f('22-habitacion-205-real', REAL, VERT, 'Habitación 205 en su estado actual');
const h205Vision = f('22-habitacion-205-vision', CONCEPTO, CUADRO,
  'Representación conceptual de la habitación 205');

const h206Vision = f('23-habitacion-206-vision-final', CONCEPTO, CUADRO,
  'Representación conceptual final de la habitación 206: tres camarotes, pasillo central y balcón al fondo');

/* 24 — suite presidencial 207 */
const h207Real1 = f('24-habitacion-207-real-01', REAL, VERT, 'Habitación 207 en su estado actual, primera vista');
const h207Real2 = f('24-habitacion-207-real-02', REAL, VERT, 'Habitación 207 en su estado actual, segunda vista');
const h207Real3 = f('24-habitacion-207-real-03', REAL, HORIZ, 'Habitación 207 en su estado actual, tercera vista');
const h207Real4 = f('24-habitacion-207-real-04', REAL, HORIZ, 'Habitación 207 en su estado actual, cuarta vista');
const h207Vision = f('24-habitacion-207-suite-presidencial-vision', CONCEPTO, CUADRO,
  'Representación conceptual de la habitación 207 como suite presidencial');

/* 25 y 26 — restaurante */
const restAReal = f('25-restaurante-ala-a-real', REAL, VERT, 'Ala A del restaurante en su estado actual');
const restAVision = f('25-restaurante-ala-a-vision', CONCEPTO, { orientacion: 'horizontal' as const, ancho: 1200, alto: 800 },
  'Representación conceptual del ala A del restaurante, con mesas al frente y cocina abierta al fondo');
const restBReal = f('26-restaurante-ala-b-real', REAL, VERT, 'Ala B del restaurante en su estado actual');
const restBVision = f('26-restaurante-ala-b-vision', CONCEPTO, { orientacion: 'horizontal' as const, ancho: 1200, alto: 800 },
  'Representación conceptual del ala B del restaurante, con dos arcos y el salón principal');

/* 27 a 29 — gastrobar */
const gastroIntReal1 = f('27-gastrobar-interior-real-01', REAL, VERT, 'Interior del gastrobar en su estado actual, primera vista');
const gastroIntReal2 = f('27-gastrobar-interior-real-02', REAL, VERT, 'Interior del gastrobar en su estado actual, segunda vista');
const gastroIntVision = f('27-gastrobar-interior-vision', CONCEPTO, { orientacion: 'horizontal' as const, ancho: 1200, alto: 800 },
  'Representación conceptual del interior del gastrobar');
const gastroExtReal1 = f('28-gastrobar-exterior-real-01', REAL, HORIZ, 'Exterior del gastrobar en su estado actual, primera vista');
const gastroExtReal2 = f('28-gastrobar-exterior-real-02', REAL, HORIZ, 'Exterior del gastrobar en su estado actual, segunda vista');
const gastroExtReal3 = f('28-gastrobar-exterior-real-03', REAL, HORIZ, 'Exterior del gastrobar en su estado actual, tercera vista');
const gastroExtVision = f('28-gastrobar-exterior-vision', CONCEPTO, { orientacion: 'horizontal' as const, ancho: 1200, alto: 800 },
  'Representación conceptual del exterior del gastrobar');
/* ============================================================
   LAS DOS DE LA TERRAZA LLEVAN BARRAS NEGRAS INCRUSTADAS

   Los archivos son 539 x 1200, pero 121 px de arriba y 121 de abajo
   son barra negra: vienen de un fotograma de video vertical. Medido
   fila a fila sobre el propio archivo.

   La fotografia de verdad es 539 x 958, proporcion 0,563 en vez de
   0,449. Esa diferencia era la que hacia imposible cuadrar el bloque:
   no era una foto extremadamente alta, era una foto normal con
   relleno negro.

   NO se recorta el archivo -es un asset aprobado y no se toca-. Se
   declaran aqui las medidas UTILES, que es para lo que existen estos
   dos campos: Foto.astro dice que se pasan a mano "cuando la imagen
   se recorta y las del archivo no sirven". Con 539 x 958 el hueco
   toma la proporcion del contenido y object-fit: cover se come
   exactamente las barras. Ni un pixel de fotografia se pierde.

   Si algun dia se recortan los archivos de origen, estas dos lineas
   vuelven a 1200 y todo sigue igual.
   ============================================================ */
const terrazaReal1 = f('29-gastrobar-terraza-real-01', REAL, { orientacion: 'vertical' as const, ancho: 539, alto: 958 },
  'Terraza del gastrobar en su estado actual, primera vista');
const terrazaReal2 = f('29-gastrobar-terraza-real-02', REAL, { orientacion: 'vertical' as const, ancho: 539, alto: 958 },
  'Terraza del gastrobar en su estado actual, segunda vista');
const terrazaVision = f('29-gastrobar-terraza-vision-aprobada', CONCEPTO, HORIZ,
  'Representación conceptual aprobada de la terraza del gastrobar');

/* ============================================================
   EL RECORRIDO

   Los pasos 01 y 02 -hero y ubicación- no están aquí: son secciones
   propias de la maqueta, no comparativas.
   ============================================================ */
export const recorrido: BloqueRecorrido[] = [
  {
    id: 'fachada', paso: 3,
    ceja: 'FACHADA PRINCIPAL',
    titulo: 'El mismo lugar. Una nueva visión.',
    texto: 'La propuesta conserva la identidad arquitectónica de la casa y plantea una renovación orientada a hospitalidad, gastronomía y experiencias.',
    actuales: [fachadaActual], vision: fachadaVision, aprobada: true,
  },
  {
    id: 'acceso-parque', paso: 4,
    ceja: 'ACCESO PRINCIPAL',
    titulo: 'Del parque al corazón de la casa',
    texto: 'El acceso principal conduce desde el Parque Principal hacia la recepción y el Patio 1, proyectado como un espacio de bienvenida y encuentro, integrado con la cafetería.',
    actuales: [entradaParqueActual], vision: entradaParqueVision, aprobada: true,
  },
  {
    id: 'corredor-recepcion', paso: 5,
    ceja: 'CORREDOR INTERIOR',
    titulo: 'Un recorrido que conecta la experiencia',
    texto: 'El corredor interior articula la llegada, la recepción y los espacios sociales, conservando el carácter de la casa dentro de la propuesta de transformación.',
    actuales: [corredorRecepcionActual], vision: corredorRecepcionVision, aprobada: true,
  },
  {
    id: 'recepcion', paso: 6,
    ceja: 'RECEPCIÓN',
    titulo: 'Recepción y acceso al hotel',
    texto: 'La recepción conecta el acceso principal, el Patio 1 y el ascenso hacia el área de hospedaje.',
    actuales: [recepcionReal], vision: recepcionVision, aprobada: true,
  },
  {
    id: 'patio-1-a', paso: 7,
    ceja: 'PATIO 1 · CAFETERÍA',
    titulo: 'El corazón social de la casa',
    texto: 'Un espacio de encuentro para huéspedes y visitantes, integrado al corazón social de la casa.',
    actuales: [patioAReal], vision: patioAVision, aprobada: true,
  },
  {
    id: 'patio-1-b', paso: 8,
    ceja: 'PATIO 1 · SEGUNDA PERSPECTIVA',
    titulo: 'El mismo patio, otra perspectiva',
    texto: 'La segunda vista muestra la conexión entre el Patio 1, la cafetería y el balcón del segundo piso, proyectado como una extensión del ambiente social.',
    actuales: [patioBReal], vision: patioBVision, aprobada: true,
  },
  {
    id: 'escalera-piso-2', paso: 9,
    ceja: 'ESCALERA HACIA EL PISO 2',
    titulo: 'Ascenso al piso 2',
    texto: 'La escalera restaurada conecta el nivel social con el segundo piso, marcando la transición hacia la experiencia de hospedaje.',
    actuales: [escaleraReal], vision: escaleraVision, aprobada: true,
  },
  {
    id: 'llegada-piso-2', paso: 10,
    ceja: 'LLEGADA AL PISO 2',
    titulo: 'Aquí comienza el hospedaje',
    texto: 'Al finalizar la escalera, el huésped encuentra un espacio de llegada que conecta lobby, circulación y acceso a las habitaciones.',
    actuales: [llegadaReal], vision: llegadaVision, aprobada: true,
  },
  {
    id: 'balcon-lobby', paso: 11,
    ceja: 'BALCÓN DEL LOBBY',
    titulo: 'Una mirada hacia el corazón de la casa',
    texto: 'Desde el segundo piso, el huésped mantiene conexión visual con el Patio 1 y la cafetería, integrando las áreas sociales con la experiencia hotelera.',
    actuales: [balconReal], vision: balconVision, aprobada: true,
  },
  {
    id: 'lobby-piso-2', paso: 12,
    ceja: 'LOBBY PISO 2',
    titulo: 'Lobby piso 2',
    texto: 'Un punto de encuentro entre la tranquilidad del hotel y la vida del patio.',
    actuales: [lobbyReal], vision: lobbyVision, aprobada: true,
  },
  {
    id: 'hab-208', paso: 13,
    ceja: '208 · CUARTO MOCHILERO',
    titulo: 'Una prueba piloto para el viajero mochilero',
    texto: 'La primera unidad de Atheron pensada para el segmento mochilero. Se presenta como propuesta piloto: todavía no está en operación.',
    actuales: [mochileroReal], vision: mochileroVision,
    ficha: [
      { etiqueta: 'Capacidad', valor: '12 huéspedes' },
      { etiqueta: 'Configuración', valor: '6 camarotes' },
    ],
    aprobada: true,
  },
  {
    id: 'bano-208', paso: 14,
    ceja: 'BAÑO DEL CUARTO MOCHILERO',
    titulo: 'El baño de la unidad piloto',
    texto: 'El baño propio del cuarto mochilero, propuesto con el mismo lenguaje de acabados del resto de la casa.',
    actuales: [banoMochileroReal], vision: banoMochileroVision, aprobada: true,
  },
  {
    id: 'pasillo-central', paso: 15,
    ceja: 'PASILLO CENTRAL',
    titulo: 'Pasillo central',
    texto: 'El corredor conecta el lobby con las habitaciones y funciona como área común de transición, con visuales hacia el Parque Principal.',
    actuales: [], vision: pasilloCentralVision,
    nota: 'Representación conceptual del espacio proyectado. Todavía no hay fotografía del estado actual con este mismo encuadre.',
    aprobada: true,
  },
  {
    id: 'pasillo-habitaciones', paso: 16,
    ceja: 'ACCESO A LAS HABITACIONES',
    titulo: 'El recorrido hacia las habitaciones',
    texto: 'Un corredor cálido y ordenado conduce hacia las unidades de hospedaje, manteniendo la identidad colonial contemporánea del proyecto.',
    actuales: [pasilloHabReal], vision: pasilloHabVision, aprobada: true,
  },
  {
    id: 'hab-201', paso: 17,
    ceja: 'HABITACIÓN 201',
    titulo: 'La unidad amplia',
    texto: 'Pensada para familias y grupos. La propuesta se dibujó a partir de tres fotografías del estado actual del espacio.',
    actuales: [h201Real1, h201Real2, h201Real3], vision: h201Vision,
    /* Dirección NO ha validado la capacidad de esta unidad. Se publica
       la distribución, que sí está aprobada, y ninguna cifra. */
    ficha: [
      { etiqueta: 'Distribución', valor: 'Cama matrimonial, camarote, sofá cama y escritorio' },
    ],
    aprobada: true,
  },
  {
    id: 'hab-202', paso: 18,
    ceja: 'HABITACIÓN 202',
    titulo: 'Habitación compartida',
    texto: 'Un camarote especial con cama doble abajo y sencilla arriba, para tres huéspedes.',
    actuales: [h202Real], vision: h202Vision,
    ficha: [
      { etiqueta: 'Capacidad', valor: '3 huéspedes' },
      { etiqueta: 'Camas', valor: 'Doble inferior y sencilla superior' },
    ],
    aprobada: true,
  },
  {
    id: 'hab-203', paso: 19,
    ceja: 'HABITACIÓN 203',
    titulo: 'Con balcón al Parque Principal',
    texto: 'La misma configuración de la 202, con un diferencial: el balcón y la vista hacia el Parque Principal.',
    actuales: [h203Real], vision: h203Vision,
    ficha: [
      { etiqueta: 'Capacidad', valor: '3 huéspedes' },
      { etiqueta: 'Camas', valor: 'Doble inferior y sencilla superior' },
      { etiqueta: 'Diferencial', valor: 'Balcón hacia el Parque Principal' },
    ],
    aprobada: true,
  },
  {
    id: 'bano-modelo', paso: 20,
    ceja: 'BAÑO MODELO',
    titulo: 'Baño modelo · visión conceptual',
    texto: 'El concepto de acabados y ambiente para los baños de las habitaciones 201 a 208. La referencia física es sanitario, lavamanos y ducha al fondo con división de vidrio.',
    actuales: [banoReal1, banoReal2, banoReal3], vision: banoVision,
    nota: 'Referencia de diseño, no obra terminada ni plano arquitectónico exacto.',
    aprobada: true,
  },
  {
    id: 'hab-204', paso: 21,
    ceja: 'HABITACIÓN 204',
    titulo: 'Camarote doble para cuatro',
    texto: 'Un camarote con cama doble abajo y cama doble arriba. El acceso al baño queda a la vista.',
    actuales: [h204Real1, h204Real2], vision: h204Vision,
    ficha: [
      { etiqueta: 'Capacidad', valor: '4 huéspedes' },
      { etiqueta: 'Camas', valor: 'Doble inferior y doble superior' },
    ],
    aprobada: true,
  },
  {
    /* ============================================================
       HABITACIÓN 205 — RETENIDA A PROPÓSITO, NO OLVIDADA

       La orden del 12/09/2026 dice: 3 huéspedes, misma tipología que
       la 202 (doble inferior + sencilla superior).

       El render aprobado -22-habitacion-205-vision- lleva impreso
       dentro de la imagen: "Camarote doble 1.00 m x 2,00 m
       (4 personas)". Y lo que se ve es el mismo camarote doble de
       la 204, no la tipología de la 202.

       No se puede publicar un bloque cuyo texto diga 3 mientras la
       imagen dice 4. Tampoco se retoca el render: está prohibido. Y
       la cifra no se inventa en ninguna de las dos direcciones.

       Se queda en false hasta que dirección diga cuál de las dos es
       la buena. Si son 4, el texto de abajo ya está escrito; si son
       3, hace falta un render nuevo.
       ============================================================ */
    id: 'hab-205', paso: 22,
    ceja: 'HABITACIÓN 205',
    titulo: 'Habitación 205',
    texto: 'Pendiente de resolver la capacidad antes de publicarse.',
    actuales: [h205Real], vision: h205Vision,
    aprobada: false,
  },
  {
    id: 'hab-206', paso: 23,
    ceja: 'HABITACIÓN 206',
    titulo: 'Habitación múltiple con balcón',
    texto: 'Tres camarotes, pasillo central libre y balcón al fondo. El acceso al baño queda a mano derecha, nada más entrar.',
    actuales: [], vision: h206Vision,
    ficha: [
      { etiqueta: 'Capacidad', valor: '6 a 8 huéspedes' },
      { etiqueta: 'Configuración', valor: '3 camarotes dobles' },
    ],
    /* El render lleva impresos dentro de la imagen cuatro iconos:
       6-8 huespedes, Wi-Fi, aire acondicionado y bano privado. La
       capacidad y los camarotes SI estan aprobados y por eso salen
       arriba en HTML. Wi-Fi, aire acondicionado y bano privado NO
       constan aprobados por escrito, asi que no se repiten fuera de
       la imagen y la nota avisa de que no son servicios confirmados. */
    nota: 'Representación conceptual del espacio proyectado. Todavía no hay fotografía del estado actual con este mismo encuadre. Los rótulos e iconos que aparecen dentro de la imagen forman parte de la propuesta de diseño y no constituyen servicios confirmados.',
    aprobada: true,
  },
  {
    id: 'hab-207', paso: 24,
    ceja: '207 · SUITE PRESIDENCIAL',
    titulo: 'La unidad insignia del proyecto',
    subtitulo: 'La unidad insignia del proyecto.',
    texto: 'La habitación de mayor jerarquía de la casa, documentada hoy en cuatro vistas del estado actual.',
    /* LA 02 VA PRIMERA, Y NO ES UN CAPRICHO DE ORDEN

       Direccion pidio el 12/09/2026 que no se viera la base de cama
       negra que aparece en primer plano de la 01. La 02 es la misma
       habitacion desde un encuadre equivalente -vertical, mismo piso
       de madera, la puerta de tablero- y ahi la base NO esta en
       primer plano: solo se intuye al fondo, en la habitacion
       siguiente, a traves del vano.

       Asi que se cambia la fotografia, no se retoca ninguna: es una
       real aprobada que ya estaba en la curaduria. Las otras tres
       siguen declaradas y en el repositorio, sin renderizar. */
    actuales: [h207Real2, h207Real1, h207Real3, h207Real4], vision: h207Vision,
    /* ============================================================
       EL RENDER DE LA 207 PUBLICA MAS DE LO QUE NADIE APROBO

       No es un render: es una lamina compuesta -un panel grande y
       tres paneles pequenos- con una barra de servicios impresa
       dentro. Dice, literalmente:

         Capacidad 8-10 huespedes
         Cama principal King Size
         2 camarotes (4 plazas)
         2 sofa cama (4 plazas)
         Bano privado · Wi-Fi · Aire acondicionado · Smart TV

       mas el texto "La Habitacion 207 es la suite mas completa del
       proyecto".

       La orden del 12/09/2026 dice para esta unidad, textualmente:
       "No inventar capacidad. No inventar metros cuadrados". Aqui NO
       se publica ninguna cifra en HTML -este bloque no lleva ficha a
       proposito-, pero la imagen las lleva dentro y no se retoca.

       La nota es lo unico que se puede hacer sin tocar el asset ni
       inventar nada. Si direccion no valida esos servicios, hace
       falta un render sin la barra.
       ============================================================ */
    nota: 'Representación conceptual. Los rótulos, la capacidad y los iconos de servicios que aparecen dentro de la imagen forman parte de la propuesta de diseño y no constituyen características ni servicios confirmados del proyecto.',
    aprobada: true,
  },
  {
    id: 'restaurante-a', paso: 25,
    ceja: 'RESTAURANTE · ALA A',
    titulo: 'Mesas al frente, cocina abierta al fondo',
    texto: 'La primera ala del restaurante, con la cocina a la vista como parte de la experiencia.',
    actuales: [restAReal], vision: restAVision, aprobada: true,
  },
  {
    id: 'restaurante-b', paso: 26,
    ceja: 'RESTAURANTE · ALA B',
    titulo: 'Dos arcos y el salón principal',
    texto: 'La segunda ala, con mayor número de mesas y los dos arcos que ordenan el salón.',
    actuales: [restBReal], vision: restBVision, aprobada: true,
  },
  {
    id: 'gastrobar-interior', paso: 27,
    ceja: 'GASTROBAR · INTERIOR',
    titulo: 'El gastrobar por dentro',
    texto: 'El ambiente interior del gastrobar, propuesto como cierre nocturno del recorrido gastronómico.',
    actuales: [gastroIntReal1, gastroIntReal2], vision: gastroIntVision, aprobada: true,
  },
  {
    id: 'gastrobar-exterior', paso: 28,
    ceja: 'GASTROBAR · EXTERIOR',
    titulo: 'El gastrobar por fuera',
    texto: 'La fachada del gastrobar y su relación con la calle, documentada en tres vistas del estado actual.',
    actuales: [gastroExtReal1, gastroExtReal2, gastroExtReal3], vision: gastroExtVision, aprobada: true,
  },
  {
    id: 'gastrobar-terraza', paso: 29,
    ceja: 'GASTROBAR · TERRAZA',
    titulo: 'La terraza, y el final del recorrido',
    texto: 'La terraza cierra el recorrido: el punto más alto de la casa, mirando al centro histórico.',
    actuales: [terrazaReal1, terrazaReal2], vision: terrazaVision,
    disposicion: 'apilado', aprobada: true,
  },
];

/* Solo se pinta lo aprobado. Si una pareja se retira, desaparece el
   bloque entero y no queda medio bloque enseñando un "hoy" suelto. */
export const recorridoVisible = recorrido.filter((b) => b.aprobada);

/* ============================================================
   CIERRE — LAS FORMAS DE CREAR EXPERIENCIAS

   Siete frentes del proyecto. NO llevan cifras, ni tarifas, ni
   rentabilidad, ni fechas de apertura: son lo que la casa puede
   albergar, no una oferta.
   ============================================================ */
export const cierreRecorrido = {
  id: 'formas-de-experiencia',
  ceja: 'UN PROYECTO',
  titulo: 'Un proyecto. Múltiples formas de crear experiencias.',
  texto:
    'Casa Colonial Centro reúne bajo un mismo techo lo que hoy está repartido por la ciudad: dónde dormir, dónde comer, dónde quedarse conversando.',
  tarjetas: [
    { titulo: 'Hospedaje', texto: 'Habitaciones privadas y compartidas en el segundo piso.' },
    { titulo: 'Cafetería', texto: 'El Patio 1 como punto de encuentro de huéspedes y visitantes.' },
    { titulo: 'Restaurante', texto: 'Dos alas, con cocina abierta y salón principal.' },
    { titulo: 'Gastrobar', texto: 'Interior, exterior y terraza para el cierre de la noche.' },
    { titulo: 'Eventos', texto: 'Espacios que pueden reservarse para encuentros y celebraciones.' },
    { titulo: 'Grupos', texto: 'Unidades múltiples pensadas para viajes de varias personas.' },
    { titulo: 'Experiencias', texto: 'La casa como base para recorrer el centro histórico de Zipaquirá.' },
  ],
  estado: 'PROPUESTA' as Estado,
};
