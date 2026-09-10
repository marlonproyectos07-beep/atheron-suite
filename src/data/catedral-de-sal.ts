/* ============================================================
   GUIA DE LA CATEDRAL DE SAL — datos y textos

   QUE ES ESTA GUIA, Y QUE NO ES

   Es una guia ORIGINAL de Atheron para quien se hospeda con
   nosotros: como planear la visita, que decisiones hay que tomar
   antes de llegar y como encaja con el resto del dia en Zipaquira.
   NO es una copia de la pagina de la Catedral, ni una reproduccion
   de sus textos. Lo que se toma de la fuente oficial son DATOS
   -horario, nombres de los pasaportes-, no su redaccion.

   LO QUE ATHERON NO PUEDE DECIR TODAVIA, Y AQUI NO SE DICE

   No vendemos boletas. No somos operador autorizado. No tenemos
   convenio ni comision. No hay descuento de Atheron en la Catedral.
   Mientras no exista un acuerdo firmado, cualquier frase que lo
   insinue es publicidad enganosa, y ademas nos deja sin margen para
   negociar ese acuerdo despues.

   Lo que si podemos ofrecer, y es real: ayudar a planear la visita
   de un grupo que se hospeda con nosotros, y coordinar horarios y
   traslados desde el alojamiento.

   POR QUE NO SE PUBLICAN PRECIOS

   Las tarifas de la Catedral cambian y no las fijamos nosotros. Una
   cifra desactualizada en nuestra pagina es una queja en la
   recepcion de la Catedral y un cliente que llega con la cuenta
   hecha de otra manera. Se enlaza la pagina oficial de tarifas y se
   dice que es ahi donde estan al dia.

   ============================================================
   VERIFICACION DE ESTA PAGINA
   ============================================================

   FUENTE: sitio oficial catedraldesal.gov.co
   CONSULTADO: 9 de septiembre de 2026

   VERIFICADO en la fuente oficial ese dia:
     - Abre todos los dias.
     - Horario de visita 9:00 a. m. a 4:40 p. m.
     - Existen tres pasaportes: Basic, Standard y Premium.
     - El Premium incluye Ruta del Minero y muro de escalar, y esta
       limitado a adultos.
     - Hay audioguia en varios idiomas.
     - Existe un canal oficial para compra de boleteria de grupos
       grandes, con telefono, correo y WhatsApp propios.

   VERIFICADO en contenido propio ya validado:
     - 1,4 km y 16 minutos a pie desde Hotel Atheron Suite. Sale de
       src/content/hospedajes/hotel-atheron-suite.md, no de una
       estimacion hecha aqui.

   NO VERIFICADO, y por eso NO se publica:
     - Precio de cada pasaporte.
     - Duracion exacta del recorrido.
     - Aforo, temporadas altas y dias de mayor afluencia.
     - Si hay tarifa diferencial para residentes o para grupos.
     - Accesibilidad para sillas de ruedas y coches de bebe.
     - Idiomas exactos de la audioguia.

   CUANDO REVISAR: antes de cualquier campaña pagada que apunte a
   esta pagina, y como minimo cada seis meses. Un horario viejo en
   una guia es un cliente que llega y se encuentra cerrado.
   ============================================================ */

/** Direccion oficial. Es la unica fuente que esta pagina cita. */
export const SITIO_OFICIAL = 'https://www.catedraldesal.gov.co/';
export const TARIFAS_OFICIALES = 'https://www.catedraldesal.gov.co/tarifas';

/** Fecha en que se comprobaron los datos de abajo contra la fuente. */
export const VERIFICADO_EL = '9 de septiembre de 2026';

/* ------------------------------------------------------------
   DATOS PRACTICOS

   Solo los que estan verificados. La lista es corta a proposito:
   preferimos tres datos ciertos a diez de los que la mitad haya
   que retirar en la primera revision.
   ------------------------------------------------------------ */
export const datosPracticos: { dato: string; valor: string }[] = [
  { dato: 'Días de apertura', valor: 'Todos los días' },
  { dato: 'Horario de visita', valor: '9:00 a. m. – 4:40 p. m.' },
  { dato: 'Desde Hotel Atheron Suite', valor: '1,4 km · 16 minutos a pie' },
];

/* ------------------------------------------------------------
   LOS TRES PASAPORTES

   Los nombres son los oficiales. Lo que se describe de cada uno
   esta escrito por nosotros y se queda en lo que la fuente permite
   afirmar sin margen de duda; el detalle completo y las tarifas
   estan en su pagina, que se enlaza.

   Ninguno lleva precio. Ver el encabezado de este archivo.
   ------------------------------------------------------------ */
export interface Pasaporte {
  nombre: string;
  resumen: string;
  incluye: string[];
  /** Restriccion oficial, si la tiene. */
  nota?: string;
}

export const pasaportes: Pasaporte[] = [
  {
    nombre: 'Basic',
    resumen: 'El recorrido de la Catedral, que es a lo que va la mayoría de visitantes.',
    incluye: [
      'Entrada a la Catedral de Sal y sus naves',
      'Audioguía',
      'Museo Arqueológico y sendero ecológico',
      'Proyecciones y experiencias audiovisuales del recorrido',
    ],
  },
  {
    nombre: 'Standard',
    resumen: 'Todo lo del Basic y, además, salir a ver la ciudad.',
    incluye: [
      'Todo lo incluido en Basic',
      'City tour por Zipaquirá',
      'Museo adicional del complejo',
    ],
  },
  {
    nombre: 'Premium',
    resumen: 'La opción para quien quiere entrar en la parte minera, no solo mirarla.',
    incluye: [
      'Todo lo incluido en Standard',
      'Ruta del Minero',
      'Muro de escalar',
    ],
    nota: 'Solo para adultos, según las condiciones oficiales.',
  },
];

/* ------------------------------------------------------------
   RECOMENDACIONES

   Esto SI es contenido propio: es lo que sabemos por recibir a
   quienes vuelven de la visita. Ninguna afirma un dato que no
   podamos sostener.
   ------------------------------------------------------------ */
export const recomendaciones: { titulo: string; texto: string }[] = [
  {
    titulo: 'Ve temprano',
    texto:
      'Las primeras horas son las más tranquilas. Entrando cerca de la apertura se recorre con calma y todavía queda el resto del día para el centro histórico.',
  },
  {
    titulo: 'Decide el pasaporte antes de llegar',
    texto:
      'La diferencia entre los tres no es el recorrido de la Catedral, que va en todos: es lo que se añade alrededor. Mirarlo con calma la noche anterior evita decidir en la fila.',
  },
  {
    titulo: 'Abrígate: se baja de temperatura',
    texto:
      'El recorrido es subterráneo y Zipaquirá ya es fría de por sí. Una chaqueta ligera sobra menos de lo que parece.',
  },
  {
    titulo: 'Calzado cómodo',
    texto:
      'Es un recorrido a pie, con rampas y desniveles. No hace falta equipo de montaña, pero tampoco es el día de estrenar zapatos.',
  },
  {
    titulo: 'Cuenta con media jornada',
    texto:
      'Entre el trayecto, la entrada y el recorrido, la visita ocupa buena parte de la mañana o de la tarde. Encaja bien con una noche de estancia, no con una escapada de paso.',
  },
];

/* ------------------------------------------------------------
   GRUPOS

   Aqui es donde hay que tener mas cuidado. La Catedral TIENE un
   canal propio para boleteria de grupos grandes, y es el que hay
   que usar: nosotros no vendemos, no reservamos y no cobramos por
   ello. Lo que hacemos es lo de la lista, que es real y es lo que
   nos piden los grupos que se hospedan aqui.
   ------------------------------------------------------------ */
export const loQueHacemosPorUnGrupo: string[] = [
  'Alojamos al grupo completo, repartido entre nuestros hospedajes si hace falta.',
  'Ayudamos a cuadrar el horario de la visita con el check-in, el check-out y las comidas.',
  'Contamos cómo se llega desde cada alojamiento y cuánto se tarda.',
  'Guardamos el equipaje sin costo en la oficina si el grupo llega antes o sale después.',
];

/** Lo que NO hacemos. Se publica en la pagina, no solo aqui. */
export const loQueNoHacemos =
  'No vendemos boletas de la Catedral de Sal ni somos operador autorizado. La compra se hace por los canales oficiales de la Catedral, y para grupos grandes tienen su propio canal de boletería.';
