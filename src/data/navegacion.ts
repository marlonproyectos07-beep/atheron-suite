/* ============================================================
   NAVEGACION — todos los menus del sitio, en un solo archivo

   Antes: el menu estaba escrito a mano en 16 archivos HTML.
   Cambiar un enlace obligaba a editarlos los 16, y en la practica
   se descoordinaron: el listado de hospedajes mostraba 5 enlaces,
   el blog mostraba 3 y la ficha mostraba otros 4 distintos.

   Ahora: se cambia aqui y se actualiza en todo el sitio.

   Por que hay VARIOS menus y no uno solo:
   cada tipo de pagina necesita enlaces distintos. Una ficha de
   hospedaje ofrece "Habitaciones" y "Galeria", que en el blog no
   existen. Y las landings no llevan menu a proposito (ver abajo).
   ============================================================ */

import {
  ENLACE_DISPONIBILIDAD,
  ENLACE_GRUPO,
  enlaceWhatsApp,
  EVENTO_DISPONIBILIDAD,
  EVENTO_GRUPO,
  MENSAJE_DISPONIBILIDAD,
  MENSAJE_GRUPO,
} from './whatsapp';

export interface Enlace {
  texto: string;
  href: string;
}

export interface Cta {
  texto: string;
  href: string;
  /** Clase del boton. Por defecto boton--primario. */
  clase?: string;
  /** Si lleva mensaje, el boton abre WhatsApp con ese texto ya escrito. */
  whatsapp?: string;
  /** true = el enlace sale del sitio y se abre en otra pestana. */
  externo?: boolean;
  /** Nombre del evento para la analitica futura. Ver src/data/whatsapp.ts. */
  evento?: string;
  /** De donde sale el clic. Se completa en cada sitio donde se pinta. */
  origen?: string;
}

/* ------------------------------------------------------------
   LLAMADO A LA ACCION POR DEFECTO — ABRE WHATSAPP, EN UN CLIC

   Antes llevaba a /landing/hospedaje-en-zipaquira. Sobre el papel
   tenia sentido: es la pagina que mejor convierte. En el recorrido
   real que hizo direccion el 9 de septiembre de 2026 no lo tenia.

   El boton dice "Ver disponibilidad". Quien lo pulsa ya decidio
   preguntar; lo que necesita es el canal donde se responde, no otra
   pagina que se lo vuelva a proponer. Llevarlo a la landing le
   costaba dos o tres clics mas, y cada uno pierde gente.

   La landing NO desaparece: sigue publicada, sigue en el sitemap y
   sigue recibiendo el trafico de anuncios, que llega en otro estado
   de animo. Lo que sale del embudo de reserva es la obligacion de
   pasar por ella.

   El href ya viene resuelto desde src/data/whatsapp.ts, escrito en
   el HTML al construir. No depende de que main.js cargue.
   ------------------------------------------------------------ */
export const ctaDisponibilidad: Cta = {
  texto: 'Ver disponibilidad',
  href: ENLACE_DISPONIBILIDAD,
  clase: 'boton--whatsapp',
  whatsapp: MENSAJE_DISPONIBILIDAD,
  externo: true,
  evento: EVENTO_DISPONIBILIDAD,
};

/* ------------------------------------------------------------
   HOME — el menu completo. Mezcla paginas y secciones de la
   propia portada (las que empiezan por #).
   ------------------------------------------------------------ */
/* ------------------------------------------------------------
   "ZIPAQUIRA" YA NO ES UN ANCLA, ES LA GUIA

   Antes llevaba a "#zipaquira", una seccion corta de la portada con
   cuatro lineas sobre el municipio. Desde que existe /guia-zipaquira
   apunta ahi.

   POR QUE ASI Y NO ANADIENDO UN ENLACE MAS: el menu ya tiene siete
   entradas mas el boton. Anadir "Guia" haria ocho, apretaria el
   escritorio y duplicaria el concepto -"Zipaquira" y "Guia de
   Zipaquira" son lo mismo para quien lee-. Cambiar el destino de una
   entrada que ya existe deja el hub descubrible desde todo el sitio
   sin tocar el diseño ni el recuento.

   La seccion #zipaquira de la portada sigue donde estaba; lo que
   deja de ser es la unica puerta a ese tema.
   ------------------------------------------------------------ */
export const menuHome: Enlace[] = [
  { texto: 'Inicio', href: '/' },
  { texto: 'Hospedajes', href: '/hospedajes' },
  { texto: 'Zipaquirá', href: '/guia-zipaquira' },
  { texto: 'Experiencias', href: '#experiencias' },
  /* Apunta a la pagina exploratoria, no a la landing de campaña: desde
     el menu se llega curioseando, y hay que poder cambiar de idea. La
     landing sigue existiendo para el trafico de anuncios. */
  { texto: 'Grupos', href: '/grupos' },
  { texto: 'Blog', href: '/blog' },
  { texto: 'Contacto', href: '#contacto' },
];

/* En celular hay sitio para un texto mas largo y explicito. */
export const menuHomeMovil: Enlace[] = menuHome.map((enlace) =>
  enlace.texto === 'Grupos' ? { ...enlace, texto: 'Grupos y empresas' } : enlace,
);

/* ------------------------------------------------------------
   HOSPEDAJES — listado. Los enlaces a secciones de la portada
   llevan "/" delante porque estamos fuera de ella.
   ------------------------------------------------------------ */
export const menuHospedajes: Enlace[] = [
  { texto: 'Inicio', href: '/' },
  { texto: 'Hospedajes', href: '/hospedajes' },
  { texto: 'Grupos', href: '/grupos' },
  /* Mismo cambio que en el menu de la portada: el ancla pasa a ser
     la guia del destino. Ver el comentario de menuHome. */
  { texto: 'Zipaquirá', href: '/guia-zipaquira' },
  { texto: 'Blog', href: '/blog' },
  { texto: 'Contacto', href: '/#contacto' },
];

/* ------------------------------------------------------------
   BLOG — menu corto a proposito: en un articulo, el visitante
   viene a leer. Cuantas menos salidas, mejor.
   ------------------------------------------------------------ */
export const menuBlog: Enlace[] = [
  { texto: 'Inicio', href: '/' },
  { texto: 'Hospedajes', href: '/hospedajes' },
  { texto: 'Blog', href: '/blog' },
];

/* ------------------------------------------------------------
   FICHA DE HOSPEDAJE — el menu navega dentro de la propia ficha.
   En celular se anaden Habitaciones y Galeria, que en el menu de
   escritorio no caben.
   ------------------------------------------------------------ */
export const menuFicha: Enlace[] = [
  { texto: 'Inicio', href: '/' },
  { texto: 'Hospedajes', href: '/hospedajes' },
  { texto: 'Ubicación', href: '#ubicacion' },
  { texto: 'Blog', href: '/blog' },
];

/* Los enlaces a secciones (los que empiezan por #) se filtran en la
   ficha: solo se muestran los que esa ficha pinta de verdad. Un menu
   que lleva a un ancla que no existe deja al visitante donde estaba,
   sin decirle por que. */
export const menuFichaMovil: Enlace[] = [
  { texto: 'Inicio', href: '/' },
  { texto: 'Hospedajes', href: '/hospedajes' },
  { texto: 'Tarifas', href: '#tarifas' },
  { texto: 'La casa', href: '#espacios' },
  { texto: 'Habitaciones', href: '#habitaciones' },
  { texto: 'Galeria', href: '#galeria' },
  { texto: 'Opiniones', href: '#opiniones' },
  { texto: 'Ubicación', href: '#ubicacion' },
  { texto: 'Preguntas', href: '#faq' },
  { texto: 'Blog', href: '/blog' },
];

/* ------------------------------------------------------------
   BOTON DE LA CABECERA DE UNA FICHA

   Es una funcion y no una constante porque el mensaje nombra la
   propiedad: quien escribe desde la ficha de Casa Neusa no deberia
   tener que explicar cual le gusto.

   Antes era un ancla a "#contacto" y solo main.js la convertia en
   WhatsApp al cargar. Ahora el destino viene resuelto en el HTML.
   ------------------------------------------------------------ */
export const ctaConsultarDe = (propiedad: string, localidad: string): Cta => {
  const mensaje =
    `Hola, quiero consultar disponibilidad de ${propiedad}, en ${localidad}.\n\n` +
    'Fecha de llegada:\nFecha de salida:\nNúmero de huéspedes:';
  return {
    texto: 'Consultar',
    href: enlaceWhatsApp(mensaje),
    clase: 'boton--whatsapp',
    whatsapp: mensaje,
    externo: true,
    evento: EVENTO_DISPONIBILIDAD,
    origen: 'ficha_cabecera',
  };
};

/* ------------------------------------------------------------
   LANDINGS — NO llevan menu, y es intencionado.

   Una landing tiene un solo objetivo: que el visitante escriba.
   Cada enlace del menu es una puerta de salida que le permite
   distraerse antes de convertir. Por eso su cabecera solo tiene
   el logo y UN boton. Si alguna vez alguien "arregla" esto
   anadiendo el menu, la landing convertira menos.
   ------------------------------------------------------------ */
export const ctaLandingHospedaje: Cta = {
  texto: 'Consultar disponibilidad',
  href: '#consultar',
};

export const ctaLandingGrupos: Cta = {
  texto: 'Cotizar grupo',
  href: ENLACE_GRUPO,
  clase: 'boton--whatsapp',
  whatsapp: MENSAJE_GRUPO,
  externo: true,
  evento: EVENTO_GRUPO,
};

/* El de la pagina de grupos. Mismo canal, mismo mensaje, y el texto
   nombra lo que hace: cotizar, no "consultar". */
export const ctaCotizarGrupo: Cta = {
  texto: 'Cotizar mi grupo',
  href: ENLACE_GRUPO,
  clase: 'boton--whatsapp',
  whatsapp: MENSAJE_GRUPO,
  externo: true,
  evento: EVENTO_GRUPO,
};
