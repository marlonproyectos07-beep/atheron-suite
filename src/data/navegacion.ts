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
}

/* ------------------------------------------------------------
   Llamado a la accion por defecto: lleva a la landing comercial,
   que es la pagina que mejor convierte.
   ------------------------------------------------------------ */
export const ctaDisponibilidad: Cta = {
  texto: 'Ver disponibilidad',
  href: '/landing/hospedaje-en-zipaquira',
};

/* ------------------------------------------------------------
   HOME — el menu completo. Mezcla paginas y secciones de la
   propia portada (las que empiezan por #).
   ------------------------------------------------------------ */
export const menuHome: Enlace[] = [
  { texto: 'Inicio', href: '/' },
  { texto: 'Hospedajes', href: '/hospedajes' },
  { texto: 'Zipaquira', href: '#zipaquira' },
  { texto: 'Experiencias', href: '#experiencias' },
  { texto: 'Grupos', href: '/landing/casas-para-grupos-en-zipaquira' },
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
  { texto: 'Zipaquira', href: '/#zipaquira' },
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
  { texto: 'Ubicacion', href: '#ubicacion' },
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
  { texto: 'Ubicacion', href: '#ubicacion' },
  { texto: 'Blog', href: '/blog' },
];

export const ctaConsultar: Cta = {
  texto: 'Consultar',
  href: '#contacto',
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
  href: '#cotizar',
  clase: 'boton--whatsapp',
  whatsapp: 'Hola, necesito alojamiento para un grupo en Zipaquira. Somos [numero] personas.',
};
