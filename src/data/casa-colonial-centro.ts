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

   TAMPOCO ENTRAN LAS EXPRESIONES PROHIBIDAS (apartado 22)
   "Invertir ahora", "compra tu participacion", "reservar
   participacion", "asegurar inversion", "obten rentabilidad",
   "ganancia garantizada", "retorno asegurado", "recupera tu
   dinero", "comprar acciones", "separar cupo", "financiar ahora",
   "aportar dinero", "cupos limitados", "rentabilidad mensual" e
   "ingreso pasivo garantizado". Ni aqui ni en la maqueta. La
   pagina no pide dinero, no calcula retornos y no lleva pasarela
   de pago, checkout ni formulario de aportes.

   PENDIENTE JURIDICO — NO PUBLICAR TODAVIA
   La opcion o derecho preferente de compra a siete anos, el canon,
   la identidad de los propietarios, las condiciones contractuales
   privadas, el precio futuro de compra, la inversion realizada, los
   montos requeridos y los porcentajes de participacion NO estan en
   este archivo a proposito. No se anaden hasta recibir el texto
   aprobado por los abogados.

   PRIVACIDAD (apartado 34)
   Aqui no se escriben cedulas, firmas, poderes, contratos, nombres
   de propietarios, direccion exacta, matricula inmobiliaria, datos
   bancarios, presupuestos ni identificadores privados de Drive. El
   identificador de la carpeta de fotografias vive en el canal
   interno del proyecto, no en el repositorio: cualquier cosa que se
   escriba en este archivo termina en el HTML que se publica.
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

   Nunca, en ningun sitio, "bar" a secas. Tampoco el tipo
   "BarOrPub" de los datos estructurados.
   ------------------------------------------------------------ */
export const CUARTA_UNIDAD_COMERCIAL = 'Gastrobar';
export const CUARTA_UNIDAD_ADMINISTRATIVA = 'Restaurante gastrobar';

/* ------------------------------------------------------------
   WHATSAPP

   El numero NO se escribe aqui. Vive en public/assets/js/main.js,
   que es quien construye todos los enlaces del sitio, con el
   respaldo de src/data/ajustes.ts por si el guion no carga. Aqui
   solo van los mensajes que llegan ya escritos.
   ------------------------------------------------------------ */
export const MENSAJE_GENERAL =
  'Hola, Atheron. Conocí el proyecto Casa Colonial Centro y quisiera recibir más información.';

/* ------------------------------------------------------------
   ANALITICA

   El repositorio NO tiene ninguna plataforma de analitica
   instalada: ni Google Analytics, ni Tag Manager, ni Plausible, ni
   la de Vercel. Se comprobo antes de escribir esto.

   La instruccion pide usar el sistema existente y no instalar uno
   nuevo, asi que aqui NO se instala nada. Lo que se hace es dejar
   el evento declarado en el HTML, en el atributo data-evento de
   cada boton. El dia que se conecte una plataforma, un unico
   escucha delegado en main.js -uno, no doce- lee ese atributo y
   envia el evento. Ni se duplican escuchas ni hay que volver a
   tocar esta pagina.

   Los eventos NO llevan informacion personal: solo el nombre.
   ------------------------------------------------------------ */
export type Evento =
  | 'ccc_hero_conocer_click'
  | 'ccc_transformacion_click'
  | 'ccc_aliado_operador_click'
  | 'ccc_aliado_estrategico_click'
  | 'ccc_informacion_hotel_click'
  | 'ccc_proponer_alianza_click'
  | 'ccc_whatsapp_click'
  | 'ccc_bitacora_click'
  | 'ccc_unidad_hotel_click'
  | 'ccc_unidad_restaurante_click'
  | 'ccc_unidad_cafeteria_click'
  | 'ccc_unidad_gastrobar_click';

/* ------------------------------------------------------------
   FOTOGRAFIAS

   NINGUNA foto entra todavia. El material esta en la carpeta de
   Drive del proyecto (169 imagenes: 146 reales o de proceso y 23
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

/** A que unidad pertenece la imagen. */
export type UnidadFoto =
  | 'GENERAL'
  | 'HOTEL'
  | 'RESTAURANTE'
  | 'CAFETERIA'
  | 'RESTAURANTE_GASTROBAR';

export interface FotoProyecto {
  /** Identificador corto y estable. Ej: "patio-01". */
  id: string;
  tipo: TipoFoto;
  unidad: UnidadFoto;
  /** Que espacio se ve. Ej: "Patio central". */
  espacio: string;
  /** Planta o nivel, si consta. */
  planta?: string;
  /** Fecha de la toma, AAAA-MM-DD, si consta. */
  fecha?: string;
  /** Nombre del archivo tal y como venia del origen. Sirve para
      rastrear una foto hasta el manifiesto sin abrirla. */
  archivoOriginal?: string;
  /** Ruta dentro del sitio. Ej: /assets/img/proyectos/casa-colonial-centro/... */
  ruta: string;
  /** Que se ve, en una frase. Obligatorio: sin esto la foto no sirve. */
  alt: string;
  /** Pie de foto, si aporta algo que el alt no dice. */
  descripcion?: string;
  /** Autoria, si hay que darla. */
  credito?: string;
  orientacion?: 'vertical' | 'horizontal' | 'cuadrada';
  estado: Estado;
  /** false = NO se pinta, aunque el archivo exista. */
  aprobada: boolean;
  /** La destacada de su bloque. */
  destacada?: boolean;
  /* Orden dentro de su bloque, de menor a mayor. El 0 es la
     primera, y es la unica que se carga con prioridad: el resto
     va en carga diferida. */
  prioridad?: number;
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
    { texto: 'Conocer el proyecto', href: '#historia', evento: 'ccc_hero_conocer_click' as Evento },
    { texto: 'Ver la transformación', href: '#transformacion', evento: 'ccc_transformacion_click' as Evento },
    { texto: 'Quiero ser aliado estratégico', href: '#alianzas', evento: 'ccc_proponer_alianza_click' as Evento },
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

   Configuracion central de las unidades. Cualquier sitio del sitio
   que hable de ellas -la seccion, el modelo interno, los datos
   estructurados del dia que abran- lee de aqui.
   ============================================================ */

export interface Unidad {
  id: 'hotel' | 'restaurante' | 'cafeteria' | 'restaurante-gastrobar';
  /** Como se llama de cara al publico. */
  titulo: string;
  /** Como se llama en documentos, permisos y datos estructurados.
      Coincide con el titulo salvo en el gastrobar. */
  nombreAdministrativo: string;
  estado: Estado;
  texto: string;
  /* Recurso visual. No es una foto ni un icono descargado: es la
     inicial de la unidad dibujada con CSS. Asi no entra ninguna
     imagen sin aprobar, no se anade ninguna peticion y nadie puede
     confundirlo con una fotografia del sitio. */
  icono: string;
  /** Texto del boton que abre el detalle. */
  ctaTexto: string;
  /** Mensaje con el que se abriria WhatsApp desde esta unidad. */
  mensaje: string;
  evento: Evento;
  /** A donde llevara cuando tenga pagina propia. null = todavia no
      existe, y por eso NO se pinta ningun enlace: un enlace roto es
      peor que la ausencia de enlace. */
  enlaceFuturo: string | null;
  /** false = la unidad no se muestra en la pagina. */
  visible: boolean;
  /** AAAA-MM-DD del ultimo cambio real de esta ficha. */
  actualizado: string | null;
  /** Detalle ampliado. null = todavia no hay texto aprobado. */
  detalle: string | null;
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
      estado: 'PROPUESTA',
      texto:
        'Un hospedaje conectado con la historia, la arquitectura y el centro turístico de Zipaquirá.',
      icono: 'H',
      ctaTexto: 'Conocer la visión del hotel',
      mensaje:
        'Hola, Atheron. Conocí el proyecto Casa Colonial Centro y quisiera conocer la visión del componente hotelero.',
      evento: 'ccc_unidad_hotel_click',
      enlaceFuturo: null,
      visible: true,
      actualizado: null,
      /* Sin ficha comercial hotelera todavia: no hay capacidad,
         habitaciones ni tarifas confirmadas, y no se inventan. */
      detalle: null,
    },
    {
      id: 'restaurante',
      titulo: 'Restaurante',
      nombreAdministrativo: 'Restaurante',
      estado: 'PROPUESTA',
      texto:
        'Una propuesta gastronómica para huéspedes, visitantes y comunidad local.',
      icono: 'R',
      ctaTexto: 'Explorar la oportunidad gastronómica',
      mensaje:
        'Hola, Atheron. Conocí el proyecto Casa Colonial Centro y quisiera conversar sobre la propuesta del restaurante.',
      evento: 'ccc_unidad_restaurante_click',
      enlaceFuturo: null,
      visible: true,
      actualizado: null,
      detalle: null,
    },
    {
      id: 'cafeteria',
      titulo: 'Cafetería',
      nombreAdministrativo: 'Cafetería',
      estado: 'PROPUESTA',
      texto:
        'Un espacio de encuentro durante el día, conectado con el movimiento cultural y turístico del centro.',
      icono: 'C',
      ctaTexto: 'Conocer el concepto',
      mensaje:
        'Hola, Atheron. Conocí el proyecto Casa Colonial Centro y quisiera conocer el concepto de la cafetería.',
      evento: 'ccc_unidad_cafeteria_click',
      enlaceFuturo: null,
      visible: true,
      actualizado: null,
      detalle: null,
    },
    {
      id: 'restaurante-gastrobar',
      /* Visible al publico: "Gastrobar". */
      titulo: CUARTA_UNIDAD_COMERCIAL,
      /* Administrativo, juridico y de permisos: "Restaurante gastrobar". */
      nombreAdministrativo: CUARTA_UNIDAD_ADMINISTRATIVA,
      estado: 'PROPUESTA',
      texto:
        'Una experiencia gastronómica y nocturna pensada para compartir bebidas, alimentos y encuentros en un ambiente colonial renovado.',
      icono: 'G',
      ctaTexto: 'Conocer la visión',
      mensaje:
        'Hola, Atheron. Conocí el proyecto Casa Colonial Centro y quisiera conocer la visión del restaurante gastrobar.',
      evento: 'ccc_unidad_gastrobar_click',
      enlaceFuturo: null,
      visible: true,
      actualizado: null,
      detalle: null,
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

   Tres puertas de entrada, ninguna de ellas financiera. La tercera
   habla del componente hotelero y por eso lleva el aviso
   informativo pegado: no es captacion de inversion, no pide
   monto disponible, patrimonio, ingresos, datos bancarios, numero
   de identificacion, compromiso economico ni reserva de
   participacion, y no recibe pagos ni transferencias.
   ============================================================ */

export interface Alianza {
  id: string;
  titulo: string;
  descripcion: string;
  ctaTexto: string;
  /** Mensaje con el que se abre WhatsApp. */
  mensaje: string;
  evento: Evento;
  estado: Estado;
  /** true = ademas del texto, lleva el aviso informativo al lado. */
  llevaAviso?: boolean;
}

export const alianzas = {
  id: 'alianzas',
  ceja: 'CONSTRUYAMOS JUNTOS',
  titulo: 'Estamos buscando aliados que compartan la visión',
  texto:
    'Casa Colonial Centro está siendo estructurada para integrar experiencia, conocimiento, operación y tecnología. Buscamos conversar con personas y organizaciones capaces de aportar valor real al proyecto.',
  estado: 'VERIFICADO' as Estado,
  lista: [
    {
      id: 'operador',
      titulo: 'Aliado operador',
      descripcion:
        'Para empresas o emprendedores con experiencia interesados en operar el restaurante, la cafetería o el restaurante gastrobar.',
      ctaTexto: 'Quiero operar una unidad',
      mensaje:
        'Hola, Atheron. Conocí el proyecto Casa Colonial Centro y quisiera conversar sobre la posibilidad de operar una de sus unidades gastronómicas.',
      evento: 'ccc_aliado_operador_click',
      estado: 'VERIFICADO',
    },
    {
      id: 'estrategico',
      titulo: 'Aliado estratégico o técnico',
      descripcion:
        'Para proveedores y especialistas en arquitectura, restauración, obra, mobiliario, dotación, tecnología, turismo o experiencias.',
      ctaTexto: 'Quiero aportar al proyecto',
      mensaje:
        'Hola, Atheron. Conocí Casa Colonial Centro y quisiera presentar una propuesta como aliado, proveedor o colaborador del proyecto.',
      evento: 'ccc_aliado_estrategico_click',
      estado: 'VERIFICADO',
    },
    {
      id: 'componente-hotelero',
      titulo: 'Componente hotelero',
      descripcion:
        'Para personas interesadas en conocer el desarrollo del componente de hospedaje cuando su documentación jurídica y financiera esté aprobada.',
      ctaTexto: 'Solicitar información preliminar',
      mensaje:
        'Hola, Atheron. Conocí el proyecto Casa Colonial Centro y quisiera recibir información preliminar sobre el componente hotelero cuando esté disponible.',
      evento: 'ccc_informacion_hotel_click',
      estado: 'VERIFICADO',
      llevaAviso: true,
    },
  ] as Alianza[],
};

/* ============================================================
   8. BITACORA

   Se alimentara de los articulos del blog agrupados por la
   categoria de mas abajo. Vacia hasta que se escriba el primero:
   la seccion lo dice y no pinta tarjetas de ejemplo, ni fechas, ni
   autores, ni avances que no han ocurrido.
   ============================================================ */

/* La categoria que agrupara los articulos del proyecto. Declarada
   aqui para que la pagina y los futuros articulos usen la misma
   cadena y no se desincronicen. */
export const CATEGORIA_BLOG = 'casa-colonial-centro';

export interface EntradaBitacora {
  titulo: string;
  /** AAAA-MM-DD */
  fecha: string;
  resumen: string;
  /** Ruta del articulo en el blog. */
  href: string;
}

/* ------------------------------------------------------------
   ARTICULOS PREVISTOS

   La lista de direcciones que tendra la bitacora cuando se
   escriban. NO se publican todavia y NO se enlazan: ninguna de
   estas paginas existe, y enlazar a una direccion que devuelve un
   404 es peor que no enlazar nada.

   Estan aqui para que el dia que se escriba un articulo baste con
   crearlo en src/pages/blog/ con la misma direccion y anadir su
   entrada al array "entradas". El listado sale solo.
   ------------------------------------------------------------ */
export const ARTICULOS_PREVISTOS = [
  '/blog/como-encontramos-casa-colonial-centro',
  '/blog/por-que-decidimos-restaurarla',
  '/blog/la-vista-hacia-la-catedral',
  '/blog/primer-levantamiento-de-los-espacios',
  '/blog/lo-que-queremos-conservar',
  '/blog/vision-del-hotel-casa-colonial',
  '/blog/vision-gastronomica-casa-colonial',
  '/blog/avances-remodelacion-casa-colonial',
  '/blog/aliados-casa-colonial-centro',
];

export const bitacora = {
  id: 'bitacora',
  ceja: 'BITÁCORA DE TRANSFORMACIÓN',
  titulo: 'Sigue la evolución de Casa Colonial Centro',
  texto:
    'El proyecto será documentado paso a paso para mostrar sus avances, aprendizajes y decisiones con transparencia.',
  /* Lo que se ve mientras no haya ni un articulo publicado. */
  textoVacio: 'Próximamente compartiremos los primeros avances de esta transformación.',
  ctaTexto: 'Seguir la transformación',
  evento: 'ccc_bitacora_click' as Evento,
  entradas: [] as EntradaBitacora[],
  estado: 'PENDIENTE' as Estado,
};

/* ============================================================
   9. AVISO INFORMATIVO OBLIGATORIO

   Texto exacto, entregado por direccion. No se resume, no se
   reescribe y no se abrevia.

   Va en el HTML inicial, sin interaccion, con contraste suficiente
   y con letra de tamano normal: ni en el pie, ni en un globo de
   ayuda, ni dentro de una ventana, ni como casilla de aceptacion.

   Aparece dos veces a proposito: junto a la tarjeta del componente
   hotelero -que es el unico bloque que alguien podria confundir con
   una captacion- y antes del cierre de la pagina.
   ============================================================ */

export const AVISO_INFORMATIVO =
  'Esta página tiene carácter exclusivamente informativo y presenta un proyecto actualmente en desarrollo. No constituye una oferta pública o privada de inversión, una promesa de rentabilidad ni una solicitud de recursos. Cualquier eventual vinculación estará sujeta a validación jurídica, financiera, operativa y contractual.';

export const aviso = {
  id: 'aviso',
  titulo: 'Aviso informativo',
  texto: AVISO_INFORMATIVO,
  estado: 'VERIFICADO' as Estado,
};

/* ============================================================
   10. CIERRE
   ============================================================ */

export const cierre = {
  id: 'contacto',
  titulo: 'La próxima historia de esta casa apenas está comenzando',
  texto:
    'Estamos construyendo este proyecto paso a paso, con información real, visión de largo plazo y aliados que compartan el propósito de recuperar espacios con valor para Zipaquirá.',
  botones: [
    {
      texto: 'Seguir la transformación',
      href: '#bitacora',
      evento: 'ccc_bitacora_click' as Evento,
      whatsapp: null as string | null,
    },
    {
      texto: 'Proponer una alianza',
      href: '#alianzas',
      evento: 'ccc_proponer_alianza_click' as Evento,
      whatsapp: null as string | null,
    },
    {
      texto: 'Hablar con Atheron',
      /* href de respaldo; main.js lo reescribe a wa.me con el
         mensaje. Igual que en el resto del sitio. */
      href: null as string | null,
      evento: 'ccc_whatsapp_click' as Evento,
      whatsapp: MENSAJE_GENERAL,
    },
  ],
  estado: 'VERIFICADO' as Estado,
};

/* ============================================================
   SEO — SOLO PARA EL BORRADOR

   Titulo y descripcion exactos, entregados por direccion.

   La canonica NO se escribe aqui: la construye Base.astro a partir
   de la ruta y del dominio de astro.config.mjs. Escribir el dominio
   a mano es justo lo que ese diseno evita.

   Open Graph: esta pagina NO manda imagen. Las unicas candidatas
   serian la fachada (prohibida), una conceptual (no puede ir sin
   rotulo, y una vista previa no admite rotulos) o una foto de otra
   propiedad (prohibida). El logo institucional tampoco: no dice
   nada de este proyecto y las redes lo recortan. Sin imagen, la
   vista previa sale como enlace de texto, que en una pagina que
   nadie debe compartir todavia es exactamente lo que se quiere.
   Queda pendiente de sustitucion cuando llegue la fotografia
   interior real aprobada.
   ============================================================ */

export const seo = {
  titulo: 'Casa Colonial Centro | Proyecto Atheron en Zipaquirá',
  descripcion:
    'Conoce la recuperación de Casa Colonial Centro, un proyecto de Atheron que integrará hotel, restaurante, cafetería y restaurante gastrobar en el corazón de Zipaquirá.',
  /* Ruta de la futura foto de Open Graph. null mientras no exista
     una fotografia interior real aprobada. */
  imagen: null as string | null,
  imagenAlt: null as string | null,
};
