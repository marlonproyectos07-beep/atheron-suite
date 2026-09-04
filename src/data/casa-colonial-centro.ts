/* ============================================================
   CASA COLONIAL CENTRO BY ATHERON — datos de la pagina de proyecto

   QUE ES ESTE ARCHIVO
   Todo el contenido de /proyectos/casa-colonial-centro vive aqui.
   La maqueta (src/pages/proyectos/casa-colonial-centro.astro) solo
   decide como se ve; que se dice se decide en este archivo.

   POR QUE ESTA SEPARADO
   La pagina se publica por partes: primero la estructura, despues
   el manifiesto fotografico, despues los textos que tienen que
   pasar por abogados. Si el contenido estuviera dentro de la
   maqueta, cada entrega obligaria a editar HTML. Asi cada entrega
   es rellenar campos de este archivo.

   REGLA DE ORO
   Aqui NO se inventa nada. Cada bloque lleva su estado:

     VERIFICADO  respaldado por Marlon, documentos o evidencia real.
     PENDIENTE   todavia requiere confirmacion o soporte.
     PROPUESTA   diseno, idea o representacion futura que aun no existe.

   Un texto que no ha llegado se queda como null y la pagina pinta
   un hueco marcado. No se rellena con texto de ejemplo.

   LO QUE NO PUEDE ENTRAR AQUI (instruccion maestra, apartado 8)
   Capacidad hotelera, numero de huespedes, tarifas, ocupacion,
   ventas, rentabilidad, retorno, utilidades, numero de mesas,
   aforos, servicios sin terminar, permisos no expedidos, fecha de
   apertura, distancias no medidas, condiciones de inversion y
   socios o aliados no formalizados.

   PENDIENTE JURIDICO — NO PUBLICAR TODAVIA
   La opcion o derecho preferente de compra a siete anos, el canon,
   la identidad de los propietarios, las condiciones contractuales
   privadas, el precio futuro de compra, la inversion realizada, los
   montos requeridos y los porcentajes de participacion NO estan en
   este archivo a proposito. No se anaden hasta recibir el texto
   aprobado por los abogados.
   ============================================================ */

/** Estado de cada dato que se publica. */
export type Estado = 'VERIFICADO' | 'PENDIENTE' | 'PROPUESTA';

/* ------------------------------------------------------------
   IDENTIDAD DEL PROYECTO
   ------------------------------------------------------------ */

export const NOMBRE = 'Casa Colonial Centro by Atheron';

/** Nombre corto, para titulos y textos donde el largo no cabe. */
export const NOMBRE_CORTO = 'Casa Colonial Centro';

export const RUTA = '/proyectos/casa-colonial-centro';

/* ------------------------------------------------------------
   INTERRUPTOR DE BORRADOR

   true  = la pagina es un borrador privado: banda de aviso arriba,
           notas internas visibles y noindex/nofollow.
   false = version publica.

   NO se cambia a false hasta que Marlon y ChatGPT lo aprueben por
   escrito. Cambiarlo tampoco basta por si solo: hay que anadir la
   ruta al sitemap (src/pages/sitemap.xml.ts) y decidir desde donde
   se enlaza. Se deja en un solo sitio para que ese repaso sea
   consciente y no un descuido.
   ------------------------------------------------------------ */
export const BORRADOR = true;

/* La ubicacion se comunica en general. La direccion exacta NO se
   publica todavia (instruccion maestra, apartado 13). */
export const UBICACION_PUBLICA = 'En el corazón de Zipaquirá';
export const LOCALIDAD = 'Zipaquirá';
export const DEPARTAMENTO = 'Cundinamarca';

/* ------------------------------------------------------------
   LA CUARTA UNIDAD: COMO SE LLAMA Y DONDE

   Comercialmente se presenta como "Gastrobar". En codigo, datos
   estructurados, comentarios administrativos, textos juridicos y
   cualquier cosa relacionada con permisos, el nombre es
   "Restaurante gastrobar".

   Nunca, en ningun sitio, "bar" a secas.
   ------------------------------------------------------------ */
export const CUARTA_UNIDAD_COMERCIAL = 'Gastrobar';
export const CUARTA_UNIDAD_ADMINISTRATIVA = 'Restaurante gastrobar';

/* ------------------------------------------------------------
   BLOG — PREPARADO, TODAVIA VACIO

   La bitacora del proyecto se publicara como articulos del blog
   agrupados por esta categoria. Aqui solo queda declarada para que
   la pagina y los futuros articulos usen la misma cadena y no se
   desincronicen.

   Cuando se escriba el primer articulo: se crea en src/pages/blog/
   como los que ya existen, y se anade su entrada al array
   "bitacora" de mas abajo. La seccion de la pagina lo listara sola.
   ------------------------------------------------------------ */
export const CATEGORIA_BLOG = 'casa-colonial-centro';

/* ------------------------------------------------------------
   WHATSAPP

   El numero NO se escribe aqui. Vive en public/assets/js/main.js,
   que es quien construye todos los enlaces del sitio, con el
   respaldo de src/data/ajustes.ts por si el guion no carga. Aqui
   solo van los mensajes que llegan ya escritos.
   ------------------------------------------------------------ */
export const MENSAJE_GENERAL =
  'Hola, quiero información sobre el proyecto Casa Colonial Centro by Atheron en Zipaquirá.';

/* ------------------------------------------------------------
   FOTOGRAFIAS

   NINGUNA foto entra todavia. El material esta en la carpeta de
   Drive "Fotos hotel" (169 imagenes: 146 reales o de proceso y 23
   representaciones conceptuales), y solo se integrara la seleccion
   que llegue en el manifiesto aprobado por Marlon y ChatGPT.

   Existe otra carpeta de nombre parecido que mezcla fotos de otras
   propiedades. Esa NO se usa.

   Hasta entonces, la pagina pinta huecos reservados. Prohibido:
   fotos de otras propiedades, la fachada, bancos de imagenes,
   imagenes externas, y usar una representacion conceptual para
   mostrar el estado actual.
   ------------------------------------------------------------ */

/** Que es la imagen. Decide como se rotula y donde puede salir. */
export type TipoFoto =
  /** Fotografia real del estado actual. */
  | 'REAL'
  /** Fotografia real del proceso de obra. */
  | 'OBRA'
  /** Imagen generada. Siempre rotulada, nunca como estado actual. */
  | 'CONCEPTUAL';

export interface FotoProyecto {
  /** Ruta dentro del sitio. Ej: /assets/img/proyectos/casa-colonial-centro/... */
  ruta: string;
  tipo: TipoFoto;
  /** Que espacio se ve. Ej: "Patio central". */
  espacio: string;
  /** Planta o nivel, si consta. */
  planta?: string;
  /** Fecha de la toma, AAAA-MM-DD, si consta. */
  fecha?: string;
  /** Que se ve, en una frase. Obligatorio: sin esto la foto no sirve. */
  alt: string;
  /** Pie de foto, si aporta algo que el alt no dice. */
  descripcion?: string;
  /** "alta" solo para la primera imagen visible. El resto, perezosa. */
  prioridad?: 'alta' | 'normal';
  orientacion?: 'vertical' | 'horizontal' | 'cuadrada';
  /** Autoria, si hay que darla. */
  credito?: string;
  /** false = no se pinta. La pagina solo muestra lo aprobado. */
  aprobada: boolean;
}

/** Cuantos huecos reservados se pintan mientras no haya manifiesto. */
export const HUECOS_GALERIA = 6;

/* Galeria de "La casa hoy". Solo fotografias REALES o de OBRA:
   una representacion conceptual aqui seria presentar un diseno como
   estado actual, que es justo lo que no se hace. */
export const galeriaEstadoActual: FotoProyecto[] = [];

/* ------------------------------------------------------------
   FECHAS

   Las fechas se guardan como "AAAA-MM-DD" y se muestran en texto.
   La conversion se hace partiendo la cadena a mano y NO con Date:
   new Date('2026-03-14') se interpreta en UTC, y al pintarla en un
   servidor con otra zona horaria sale el dia anterior. Es un fallo
   silencioso y muy dificil de ver en una revision.
   ------------------------------------------------------------ */
const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/** "2026-03-14" -> "14 de marzo de 2026". Si no encaja, la devuelve tal cual. */
export function fechaEnTexto(fecha?: string | null): string {
  const partes = (fecha ?? '').split('-');
  if (partes.length !== 3) return fecha ?? '';
  const mes = MESES[Number(partes[1]) - 1];
  return mes ? `${Number(partes[2])} de ${mes} de ${partes[0]}` : fecha ?? '';
}

/* ------------------------------------------------------------
   TEXTOS DE TRANSPARENCIA

   Se escriben una sola vez y se usan en todas las representaciones
   conceptuales del sitio. Si algun dia cambia la formula, cambia en
   un sitio y no en doce.
   ------------------------------------------------------------ */
export const ETIQUETA_CONCEPTUAL = 'Representación conceptual';
export const AVISO_CONCEPTUAL =
  'El diseño, mobiliario, distribución y acabados pueden cambiar durante el desarrollo del proyecto.';
export const AVISO_CONCEPTUAL_CORTO =
  'Representación conceptual — no corresponde al estado actual.';
export const ETIQUETA_GALERIA_REAL =
  'Fotografías reales del estado actual y del proceso de recuperación.';

/* ============================================================
   1. HERO
   ============================================================ */

export const hero = {
  ceja: 'PROYECTO EN DESARROLLO · ZIPAQUIRÁ',
  titulo: 'Una casa colonial vuelve a cobrar vida en el corazón de Zipaquirá',
  texto:
    'Atheron está restaurando una casa con historia para convertirla en un destino integrado de hospitalidad, gastronomía y experiencias: hotel, restaurante, cafetería y restaurante gastrobar bajo una sola visión.',
  botones: [
    { texto: 'Conocer el proyecto', href: '#historia' },
    { texto: 'Ver la transformación', href: '#transformacion' },
    { texto: 'Quiero ser aliado estratégico', href: '#alianzas' },
  ],
  /* La foto del hero sera una interior real con vista hacia la
     Catedral, y solo cuando venga elegida en el manifiesto. Mientras
     tanto, hueco reservado. La fachada no se usa. */
  foto: null as FotoProyecto | null,
  estado: 'VERIFICADO' as Estado,
};

/* ============================================================
   2. HISTORIA
   ============================================================ */

export const historia = {
  id: 'historia',
  ceja: 'NUESTRA HISTORIA',
  titulo:
    'No comenzamos construyendo desde cero. Comenzamos recuperando lo que otros habían olvidado.',
  /* Texto provisional entregado por direccion. Los pasajes sobre el
     acuerdo con los propietarios estan pendientes de revision
     juridica antes de la publicacion publica. */
  parrafos: [
    'Durante años, esta casa colonial permaneció deteriorada y sin aprovechar todo su potencial. Atheron vio algo diferente: una oportunidad para recuperar su arquitectura, devolverle vida y crear un lugar conectado con la historia, la gastronomía y el turismo de Zipaquirá.',
    'El proyecto nació con una visión de largo plazo. La casa fue tomada en arrendamiento mediante un acuerdo con sus propietarios que permite adelantar su recuperación, operarla y desarrollar progresivamente un modelo comercial sostenible.',
    'La meta no es solamente abrir otro hotel o restaurante. Queremos crear un destino que reúna alojamiento, gastronomía, tecnología y experiencias locales, y convertirlo en el primer modelo integral de Atheron que pueda documentarse y replicarse en otras ciudades.',
  ],
  destacado:
    'Recuperar una casa con historia para construir una nueva oportunidad para Zipaquirá.',
  estado: 'PENDIENTE' as Estado,
};

/* ============================================================
   3. LA CASA HOY
   ============================================================ */

export const estadoActual = {
  id: 'estado-actual',
  ceja: 'EL PUNTO DE PARTIDA',
  titulo: 'Una casa con historia, en proceso de volver a vivir',
  texto:
    'Cada espacio conserva señales de su historia y, al mismo tiempo, revela las posibilidades de una transformación cuidadosamente planeada.',
  estado: 'VERIFICADO' as Estado,
};

/* ============================================================
   4. TRANSFORMACION

   Cada bloque compara tres estados del mismo espacio:
   actual (foto real), conceptual (imagen rotulada) y resultado
   final, que todavia no existe y se anuncia como proximamente.

   Vacio a proposito: los espacios se cargan cuando llegue el
   manifiesto. Mientras tanto se pinta un bloque reservado que
   demuestra que el componente funciona.
   ============================================================ */

export interface BloqueTransformacion {
  /** Identificador corto, para los controles. Ej: "patio". */
  id: string;
  /** Nombre del espacio. */
  titulo: string;
  fotoActual: FotoProyecto | null;
  fotoConceptual: FotoProyecto | null;
  descripcionActual: string | null;
  descripcionPropuesta: string | null;
  /** En que va el espacio dentro del proyecto. */
  estadoProyecto: Estado;
  /** AAAA-MM-DD del ultimo cambio real de este bloque. */
  actualizado: string | null;
  /** false = no se pinta. */
  aprobado: boolean;
}

export const transformacion = {
  id: 'transformacion',
  ceja: 'LA VISIÓN',
  titulo: 'Del estado actual a una nueva experiencia',
  texto:
    'No queremos borrar la historia de la casa. Queremos recuperar su esencia y prepararla para recibir nuevas experiencias.',
  bloques: [] as BloqueTransformacion[],
  estado: 'PROPUESTA' as Estado,
};

/* ============================================================
   5. CUATRO EXPERIENCIAS
   ============================================================ */

export interface Unidad {
  id: string;
  /** Como se llama de cara al publico. */
  titulo: string;
  /** Como se llama en documentos, permisos y datos estructurados.
      Coincide con el titulo salvo en el gastrobar. */
  nombreAdministrativo: string;
  texto: string;
  /** Texto del boton que abre el detalle. */
  ctaTexto: string;
  /** Detalle ampliado. null = todavia no hay texto aprobado. */
  detalle: string | null;
  estado: Estado;
}

export const unidades = {
  id: 'unidades',
  ceja: 'UN DESTINO INTEGRADO',
  titulo: 'Cuatro experiencias conectadas por una sola visión',
  intro:
    'Casa Colonial Centro se proyecta como un lugar donde hospedarse, encontrarse, compartir y descubrir Zipaquirá desde su centro histórico.',
  estado: 'PROPUESTA' as Estado,
  lista: [
    {
      id: 'hotel',
      titulo: 'Hotel',
      nombreAdministrativo: 'Hotel',
      texto:
        'Un hospedaje conectado con la historia, la arquitectura y el centro turístico de Zipaquirá.',
      ctaTexto: 'Conocer la visión del hotel',
      /* Sin ficha comercial hotelera todavia: no hay capacidad,
         habitaciones ni tarifas confirmadas, y no se inventan. */
      detalle: null,
      estado: 'PROPUESTA',
    },
    {
      id: 'restaurante',
      titulo: 'Restaurante',
      nombreAdministrativo: 'Restaurante',
      texto:
        'Una propuesta gastronómica para huéspedes, visitantes y comunidad local.',
      ctaTexto: 'Explorar la oportunidad gastronómica',
      detalle: null,
      estado: 'PROPUESTA',
    },
    {
      id: 'cafeteria',
      titulo: 'Cafetería',
      nombreAdministrativo: 'Cafetería',
      texto:
        'Un espacio de encuentro durante el día, conectado con el movimiento cultural y turístico del centro.',
      ctaTexto: 'Conocer el concepto',
      detalle: null,
      estado: 'PROPUESTA',
    },
    {
      id: 'gastrobar',
      /* Visible al publico: "Gastrobar". */
      titulo: CUARTA_UNIDAD_COMERCIAL,
      /* Administrativo, juridico y de permisos: "Restaurante gastrobar". */
      nombreAdministrativo: CUARTA_UNIDAD_ADMINISTRATIVA,
      texto:
        'Una experiencia gastronómica y nocturna pensada para compartir bebidas, alimentos y encuentros en un ambiente colonial renovado.',
      ctaTexto: 'Conocer la visión',
      detalle: null,
      estado: 'PROPUESTA',
    },
  ] as Unidad[],
};

/* ============================================================
   6. MODELO ATHERON
   ============================================================ */

export const modelo = {
  id: 'modelo-atheron',
  ceja: 'EL MODELO',
  titulo: 'Una experiencia para el público. Cuatro unidades independientes por dentro.',
  parrafos: [
    'Ante el público, Casa Colonial Centro será una sola experiencia. Internamente, cada unidad contará con operación, contratos, responsables, ingresos, gastos y resultados independientes.',
    'Atheron será el integrador de la marca, la tecnología, la experiencia del cliente, el sistema comercial y la visión general del proyecto.',
  ],
  /* Lo que se muestra del modelo. Sin cifras ni porcentajes, y sin
     dar por seleccionados operadores o inversionistas. */
  publico: ['Una marca', 'Una experiencia'],
  interno: [
    'Cuatro unidades',
    'Cuatro centros de costos',
    'Responsabilidades independientes',
    'Administración integrada',
  ],
  estado: 'VERIFICADO' as Estado,
};

/* ============================================================
   7. ALIANZAS

   Los textos de las tres tarjetas llegaron cortados en la
   instruccion maestra. Se dejan en null: la pagina marca el hueco
   en vez de rellenarlo con un texto que nadie ha aprobado.
   ============================================================ */

export interface Alianza {
  id: string;
  titulo: string;
  descripcion: string | null;
  ctaTexto: string;
  /** Mensaje con el que se abre WhatsApp. */
  mensaje: string;
  estado: Estado;
}

export const alianzas = {
  id: 'alianzas',
  ceja: 'CONSTRUYAMOS JUNTOS',
  titulo: 'Estamos buscando aliados que compartan la visión',
  texto:
    'Casa Colonial Centro está siendo estructurada para integrar experiencia, conocimiento, operación y tecnología. Buscamos conversar con personas y organizaciones capaces de aportar valor real al proyecto.',
  estado: 'PENDIENTE' as Estado,
  lista: [
    {
      id: 'operador',
      titulo: 'Aliado operador',
      descripcion: null,
      ctaTexto: 'Conversar como aliado operador',
      mensaje:
        'Hola, me interesa el proyecto Casa Colonial Centro by Atheron. Quiero conversar como aliado operador.',
      estado: 'PENDIENTE',
    },
    {
      id: 'tecnico',
      titulo: 'Aliado técnico',
      descripcion: null,
      ctaTexto: 'Conversar como aliado técnico',
      mensaje:
        'Hola, me interesa el proyecto Casa Colonial Centro by Atheron. Quiero conversar como aliado técnico.',
      estado: 'PENDIENTE',
    },
    {
      id: 'estrategico',
      titulo: 'Aliado estratégico',
      descripcion: null,
      ctaTexto: 'Conversar como aliado estratégico',
      mensaje:
        'Hola, me interesa el proyecto Casa Colonial Centro by Atheron. Quiero conversar como aliado estratégico.',
      estado: 'PENDIENTE',
    },
  ] as Alianza[],
};

/* ============================================================
   8. BITACORA

   Se alimentara de los articulos del blog marcados con la
   categoria CATEGORIA_BLOG. Vacia hasta que se escriba el primero:
   la seccion lo dice y no pinta tarjetas de ejemplo.
   ============================================================ */

export interface EntradaBitacora {
  titulo: string;
  /** AAAA-MM-DD */
  fecha: string;
  resumen: string;
  /** Ruta del articulo en el blog. */
  href: string;
}

export const bitacora = {
  id: 'bitacora',
  /* Titulo tomado de la propia estructura pedida. La ceja y el
     texto de entrada todavia no han llegado. */
  ceja: null as string | null,
  titulo: 'Bitácora del proyecto',
  texto: null as string | null,
  entradas: [] as EntradaBitacora[],
  estado: 'PENDIENTE' as Estado,
};

/* ============================================================
   9. AVISO INFORMATIVO

   Redactado unicamente con hechos declarados en la instruccion
   maestra. Queda en PENDIENTE porque la redaccion final tiene que
   revisarse antes de cualquier publicacion publica.
   ============================================================ */

export const aviso = {
  id: 'aviso',
  titulo: 'Aviso informativo',
  puntos: [
    'Esta página es informativa sobre un proyecto en desarrollo y no constituye una oferta de inversión.',
    'El inmueble se encuentra en restauración y remodelación. Las unidades descritas son unidades proyectadas y todavía no están en operación.',
    'Las representaciones conceptuales no corresponden al estado actual del inmueble. El diseño, mobiliario, distribución y acabados pueden cambiar durante el desarrollo del proyecto.',
    'Está pendiente el concepto del Ministerio de Cultura o autoridad competente. No se afirma que el proyecto cuente ya con todos los permisos.',
    'No se publican capacidades, tarifas, aforos, fechas de apertura ni condiciones económicas mientras no estén confirmadas.',
  ],
  estado: 'PENDIENTE' as Estado,
};

/* ============================================================
   10. CIERRE

   Usa el bloque de WhatsApp que ya existe en el sitio, con sus
   textos por defecto, y solo cambia el mensaje.
   ============================================================ */

export const cierre = {
  id: 'contacto',
  mensaje: MENSAJE_GENERAL,
  estado: 'VERIFICADO' as Estado,
};

/* ============================================================
   SEO — SOLO PARA EL BORRADOR

   La pagina sale con noindex, nofollow, fuera del sitemap y sin
   enlace desde ninguna parte del sitio. Estos textos existen para
   que la pestana y las vistas previas internas digan algo util, no
   para posicionar.
   ============================================================ */

export const seo = {
  titulo: 'Casa Colonial Centro by Atheron | Proyecto en desarrollo',
  descripcion:
    'Borrador privado del proyecto Casa Colonial Centro by Atheron en Zipaquirá: recuperación de una casa colonial para integrar hotel, restaurante, cafetería y restaurante gastrobar.',
};
