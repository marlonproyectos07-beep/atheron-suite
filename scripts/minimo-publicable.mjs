/* ============================================================
   EL MINIMO PARA PUBLICAR UNA FICHA

   Vivia dentro de comprueba-contenido.mjs. Sale aqui para poder
   probarlo: las pruebas de scripts/prueba-minimo-publicable.mjs
   ejecutan ESTE mismo codigo, no una copia, asi que lo que se prueba
   es exactamente lo que corre antes de cada publicacion.

   DOS MODELOS DE VENTA, NO UNO

   El guardian daba por hecho que todo hospedaje se vende por
   habitaciones, y exigia "al menos una habitacion con datos reales".
   Eso vale para el Hotel Atheron Suite y para Casa Algarra, que
   ademas de la casa entera alquilan habitaciones sueltas. No vale
   para una casa que solo se alquila completa: Casa Neusa publica 8
   huespedes, 2 habitaciones, 2 camas y 1 bano, y no tiene -ni va a
   tener- una ficha comercial por habitacion. Con el guardian
   anterior, esa casa no se podia publicar nunca.

   La modalidad se declara en el contenido ("modalidad: casa-completa")
   y NO se deduce de que la ficha tenga o no habitaciones: deducirlo
   dejaria pasar como "casa completa" cualquier ficha a la que
   simplemente le falten las habitaciones, que es justo el descuido
   que este guardian existe para atrapar.

   Lo que se le pide a una casa completa no es menos, es otra cosa:
   en vez de la ficha de una habitacion y su precio, las cuatro
   cifras que definen la casa, la portada, la galeria, los servicios
   y las condiciones de reserva.
   ============================================================ */

/* Lee un campo de primer nivel del frontmatter. */
export function valorDe(frontmatter, campo) {
  const encontrado = frontmatter.match(new RegExp('^' + campo + ':\\s*(.*)$', 'm'));
  if (!encontrado) return '';
  return encontrado[1].trim().replace(/^['"]|['"]$/g, '');
}

/* Lee un bloque entero (una lista) hasta el siguiente campo de primer nivel. */
export function bloqueDe(frontmatter, campo) {
  const lineas = frontmatter.split('\n');
  const inicio = lineas.findIndex((l) => l.startsWith(campo + ':'));
  if (inicio === -1) return '';
  const resto = lineas.slice(inicio + 1);
  const fin = resto.findIndex((l) => /^[a-zA-Z]/.test(l));
  return (fin === -1 ? resto : resto.slice(0, fin)).join('\n');
}

export const vacio = (v) => !v || v === "''" || v === '""';

const limpia = (v) => v.trim().replace(/^['"]|['"]$/g, '');

/* Las cifras de la portada, tal y como las lee el visitante.

   Se leen de "datos" en vez de pedir cuatro campos nuevos a proposito:
   asi el guardian comprueba lo que de verdad se ve en la pagina. Si
   alguien borra una cifra de la portada, el guardian se entera; con
   campos paralelos, la ficha seguiria "cumpliendo" mientras la
   portada se queda coja. */
export function cifrasDe(frontmatter) {
  const cifras = [];
  let numero = null;
  for (const linea of bloqueDe(frontmatter, 'datos').split('\n')) {
    const n = linea.match(/^\s*-\s*numero:\s*(.*)$/);
    if (n) {
      numero = limpia(n[1]);
      continue;
    }
    const t = linea.match(/^\s*texto:\s*(.*)$/);
    if (t && numero !== null) {
      cifras.push({ numero, texto: limpia(t[1]) });
      numero = null;
    }
  }
  return cifras;
}

/* Una cifra existe si esta, si su texto la nombra y si el numero es
   un numero de verdad mayor que cero. Un "N" de plantilla no cuenta. */
function tieneCifra(frontmatter, patron) {
  const c = cifrasDe(frontmatter).find((x) => patron.test(x.texto));
  if (!c) return false;
  const n = Number(String(c.numero).replace(',', '.'));
  return Number.isFinite(n) && n > 0;
}

/* El precio deja de ser un numero pendiente y pasa a ser una llamada
   a consultar. No es lo mismo que dejarlo vacio: "$ ---" en la tarjeta
   es un hueco, y "Consultar" es una instruccion. */
function esCtaDeConsulta(frontmatter) {
  const precio = valorDe(frontmatter, 'precio');
  return !vacio(precio) && !/-{2,}/.test(precio) && /consult/i.test(precio);
}

function tienePrecioReal(frontmatter) {
  return (
    valorDe(frontmatter, 'precioPendiente') !== 'true' &&
    !/-{2,}/.test(valorDe(frontmatter, 'precio'))
  );
}

/* ------------------------------------------------------------
   LO QUE SE LE PIDE A CUALQUIER FICHA
   ------------------------------------------------------------ */
const COMUNES = [
  {
    texto: 'nombre real (no "Hospedaje 02")',
    cumple: (f) => {
      const v = valorDe(f, 'nombre');
      return !vacio(v) && !/^Hospedaje\s+\d+$/i.test(v);
    },
  },
  {
    texto: 'foto de tarjeta (la que se ve en portada y listado)',
    cumple: (f) => !vacio(valorDe(f, 'fotoTarjeta')),
  },
  {
    texto: 'presentacion escrita (no el texto de ejemplo)',
    cumple: (f) => valorDe(f, 'presentacionPendiente') !== 'true',
  },
  {
    texto: 'sector real en el listado (no "Barrio / sector")',
    cumple: (f) => {
      const v = valorDe(f, 'listadoSector');
      return !vacio(v) && !/barrio\s*\/\s*sector/i.test(v);
    },
  },
  {
    texto: 'descripcion para buscadores de al menos 80 caracteres',
    cumple: (f) => valorDe(f, 'descripcion').length >= 80,
  },
];

/* ------------------------------------------------------------
   HOSPEDAJE QUE SE VENDE POR HABITACIONES
   Exactamente lo de siempre. Aqui no se ha relajado nada.
   ------------------------------------------------------------ */
const POR_HABITACIONES = [
  {
    texto: 'precio real (hoy "$ ---" o marcado como pendiente)',
    cumple: tienePrecioReal,
  },
  {
    texto: 'al menos una habitacion con datos reales',
    cumple: (f) => /pendiente:\s*false/.test(bloqueDe(f, 'habitaciones')),
  },
];

/* ------------------------------------------------------------
   CASA QUE SE ALQUILA ENTERA
   ------------------------------------------------------------ */
const CASA_COMPLETA = [
  {
    texto: 'capacidad total en las cifras de la portada (huespedes)',
    cumple: (f) => tieneCifra(f, /huesped/i),
  },
  {
    texto: 'numero de habitaciones en las cifras de la portada',
    cumple: (f) => tieneCifra(f, /habitacion/i),
  },
  {
    texto: 'numero de camas en las cifras de la portada',
    cumple: (f) => tieneCifra(f, /cama/i),
  },
  {
    texto: 'numero de banos en las cifras de la portada',
    cumple: (f) => tieneCifra(f, /ban[oy]/i),
  },
  {
    texto: 'portada fotografica (heroFoto activo y foto principal cargada)',
    cumple: (f) =>
      valorDe(f, 'heroFoto') === 'true' && !vacio(valorDe(f, 'fotoPrincipal')),
  },
  {
    texto: 'al menos una fotografia en la galeria',
    cumple: (f) => /^\s*-?\s*imagen:\s*\S/m.test(bloqueDe(f, 'galeria')),
  },
  {
    texto: 'ubicacion publica (zona y descripcion de la zona)',
    cumple: (f) =>
      !vacio(valorDe(f, 'zona')) && !vacio(valorDe(f, 'descripcionZona')),
  },
  {
    /* Sin tarifa fija cerrada, lo que no puede faltar es la llamada a
       consultarla. Lo que se bloquea es el hueco, no la ausencia de
       precio. */
    texto: 'precio real, o el aviso de consultar tarifa en su lugar',
    cumple: (f) => tienePrecioReal(f) || esCtaDeConsulta(f),
  },
  {
    texto: 'titulo del apartado de contacto (la llamada a consultar)',
    cumple: (f) => !vacio(valorDe(f, 'tituloContacto')),
  },
  {
    texto: 'servicios listados (caracteristicas de la casa)',
    cumple: (f) => /^\s*-\s*texto:\s*\S/m.test(bloqueDe(f, 'caracteristicas')),
  },
  {
    texto: 'condiciones de reserva (bloque "antesDeReservar")',
    cumple: (f) => /^\s*-\s*titulo:\s*\S/m.test(bloqueDe(f, 'antesDeReservar')),
  },
];

/** La modalidad declarada en el contenido. Por defecto, la de siempre. */
export function modalidadDe(frontmatter) {
  const v = valorDe(frontmatter, 'modalidad');
  return v === 'casa-completa' ? 'casa-completa' : 'habitaciones';
}

/**
 * Que le falta a una ficha para poder publicarse.
 * Devuelve una lista de textos; vacia = esta lista.
 * Una ficha que no esta publicada no se revisa: se puede dejar a
 * medias todo el tiempo que haga falta mientras siga en borrador.
 */
export function loQueFalta(frontmatter) {
  if (valorDe(frontmatter, 'publicado') !== 'true') return [];
  const propios =
    modalidadDe(frontmatter) === 'casa-completa' ? CASA_COMPLETA : POR_HABITACIONES;
  return [...COMUNES, ...propios].filter((r) => !r.cumple(frontmatter)).map((r) => r.texto);
}
