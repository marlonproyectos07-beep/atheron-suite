/* ARCHIVO GENERADO — no se edita a mano.
   Fuente: servidor/<nombre>.ts · Se regenera con: npm run api
   Lo comprueba: npm run prueba-vercel (falla si esto se queda viejo). */

// servidor/_almacen.ts
var SinAlmacen = class extends Error {
  codigo = "ALMACEN_NO_CONFIGURADO";
  constructor() {
    super(
      "Faltan KV_REST_API_URL y KV_REST_API_TOKEN. La API no guarda nada hasta que direcci\xF3n autorice y configure el almac\xE9n."
    );
  }
};
var RespuestaInvalida = class extends Error {
  codigo = "ALMACEN_RESPUESTA_INVALIDA";
};
var RETENCION_SEGUNDOS = 400 * 24 * 60 * 60;
var clave = (ns, id) => `ath:${ns}:${id}`;
var LUA_TIPOS = `
local tipoReg = redis.call('TYPE', KEYS[1])['ok']
if tipoReg ~= 'none' and tipoReg ~= 'string' then return -3 end
for i = 2, #KEYS do
  local tipoIdx = redis.call('TYPE', KEYS[i])['ok']
  if tipoIdx ~= 'none' and tipoIdx ~= 'set' then return -3 end
end`;
var LUA_CREA = `${LUA_TIPOS}
if redis.call('SET', KEYS[1], ARGV[1], 'NX', 'EX', ARGV[2]) == false then return 0 end
for i = 2, #KEYS do
  redis.call('SADD', KEYS[i], ARGV[3])
  redis.call('EXPIRE', KEYS[i], ARGV[2])
end
return 1`;
var LUA_CAMBIA = `${LUA_TIPOS}
local actual = redis.call('GET', KEYS[1])
if not actual then return -1 end
local ok, dato = pcall(cjson.decode, actual)
if not ok or type(dato) ~= 'table' or dato.version == nil then return -2 end
if tostring(dato.version) ~= ARGV[1] then return 0 end
redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3])
for i = 2, #KEYS do
  redis.call('SADD', KEYS[i], ARGV[4])
  redis.call('EXPIRE', KEYS[i], ARGV[3])
end
return 1`;
var LUA_CONTADOR = `
local tipo = redis.call('TYPE', KEYS[1])['ok']
if tipo ~= 'none' and tipo ~= 'string' then return -3 end
local n = redis.call('INCR', KEYS[1])
if n == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return n`;
var RedisHttp = class {
  url;
  token;
  constructor(url, token) {
    this.url = url;
    this.token = token;
  }
  /* ------------------------------------------------------------
       LA UNICA PUERTA AL ALMACEN
  
       Aqui se valida la respuesta con severidad, que es el cuarto
       hallazgo de la auditoria: antes, un 200 con el cuerpo vacio
       pasaba por escritura correcta. Ahora, si el cuerpo no es un
       objeto con la propiedad "result", es un error y se trata como
       tal. "No se sabe si se guardo" NUNCA puede contarse como
       "guardado".
       ------------------------------------------------------------ */
  async manda(...orden) {
    let respuesta;
    try {
      respuesta = await fetch(this.url, {
        method: "POST",
        headers: { authorization: `Bearer ${this.token}`, "content-type": "application/json" },
        body: JSON.stringify(orden.map(String))
      });
    } catch (error) {
      throw new RespuestaInvalida(`No se pudo hablar con el almac\xE9n: ${error.name}`);
    }
    if (!respuesta.ok) throw new RespuestaInvalida(`El almac\xE9n respondi\xF3 ${respuesta.status}.`);
    let cuerpo;
    try {
      cuerpo = await respuesta.json();
    } catch {
      throw new RespuestaInvalida("El almac\xE9n respondi\xF3 algo que no es JSON.");
    }
    if (!cuerpo || typeof cuerpo !== "object" || Array.isArray(cuerpo)) {
      throw new RespuestaInvalida("El almac\xE9n respondi\xF3 un cuerpo que no es un objeto.");
    }
    const objeto = cuerpo;
    if (typeof objeto.error === "string") {
      throw new RespuestaInvalida(`El almac\xE9n rechaz\xF3 la orden: ${objeto.error}`);
    }
    if (!Object.hasOwn(objeto, "result")) {
      throw new RespuestaInvalida("El almac\xE9n respondi\xF3 sin \xABresult\xBB: no consta que se guardara.");
    }
    return objeto.result;
  }
  /**
   * Un entero, y de los que este script puede devolver.
   *
   * Nada de Number(): la reauditoria comprobo que asi se colaban
   * true, ["1"] y "1" como exito. Number(true) es 1, Number(["1"])
   * es 1, y ese 1 significaba "escrito correctamente". Aqui el tipo
   * tiene que ser number, entero, y estar en la lista de codigos que
   * el script puede devolver; cualquier otra cosa es un almacen que
   * no se comporta, y eso no se convierte en una confirmacion
   * comercial.
   */
  async evalua(script, claves, argumentos, esperado) {
    const salida = await this.manda("EVAL", script, claves.length, ...claves, ...argumentos);
    if (typeof salida !== "number" || !Number.isInteger(salida)) {
      throw new RespuestaInvalida(
        `El almac\xE9n devolvi\xF3 ${describe(salida)} donde esperaba un c\xF3digo num\xE9rico.`
      );
    }
    if (!esperado(salida)) {
      throw new RespuestaInvalida(`El almac\xE9n devolvi\xF3 el c\xF3digo ${salida}, que este script no usa.`);
    }
    return salida;
  }
  async crea(ns, registro, indices = []) {
    const n = await this.evalua(
      LUA_CREA,
      [clave(ns, registro.id), ...indices.map((i) => clave("idx", i))],
      [JSON.stringify(registro), RETENCION_SEGUNDOS, registro.id],
      (n2) => n2 === 1 || n2 === 0 || n2 === -3
    );
    if (n === -3) {
      throw new RespuestaInvalida(
        `Los \xEDndices de ${ns}/${registro.id} tienen un tipo inesperado: no se escribi\xF3 nada.`
      );
    }
    return n === 1;
  }
  async lee(ns, id) {
    const crudo = await this.manda("GET", clave(ns, id));
    if (crudo === null || crudo === void 0) return null;
    if (typeof crudo !== "string") {
      throw new RespuestaInvalida(`El registro ${ns}/${id} vino como ${describe(crudo)}, no como texto.`);
    }
    return analiza(crudo, `${ns}/${id}`);
  }
  async cambia(ns, registro, indices = []) {
    const n = await this.evalua(
      LUA_CAMBIA,
      [clave(ns, registro.id), ...indices.map((i) => clave("idx", i))],
      [registro.version - 1, JSON.stringify(registro), RETENCION_SEGUNDOS, registro.id],
      (n2) => n2 <= 1 && n2 >= -3
    );
    if (n === 1) return "OK";
    if (n === 0) return "CONFLICTO";
    if (n === -1) return "NO_EXISTE";
    if (n === -2) return "ILEGIBLE";
    return "INCONSISTENTE";
  }
  async indice(nombre) {
    const salida = await this.manda("SMEMBERS", clave("idx", nombre));
    if (salida === null || salida === void 0) return [];
    if (!Array.isArray(salida)) {
      throw new RespuestaInvalida(`El \xEDndice ${nombre} vino como ${describe(salida)}, no como lista.`);
    }
    if (!salida.every((x) => typeof x === "string")) {
      throw new RespuestaInvalida(`El \xEDndice ${nombre} trae miembros que no son texto.`);
    }
    return salida;
  }
  async leeVarios(ns, ids) {
    if (!ids.length) return { encontrados: [], faltantes: [] };
    const salida = await this.manda("MGET", ...ids.map((id) => clave(ns, id)));
    if (!Array.isArray(salida) || salida.length !== ids.length) {
      throw new RespuestaInvalida("El almac\xE9n devolvi\xF3 menos registros de los pedidos.");
    }
    const encontrados = [];
    const faltantes = [];
    salida.forEach((crudo, i) => {
      if (typeof crudo === "string") encontrados.push(analiza(crudo, `${ns}/${ids[i]}`));
      else if (crudo === null || crudo === void 0) faltantes.push(ids[i]);
      else throw new RespuestaInvalida(`El registro ${ns}/${ids[i]} vino como ${describe(crudo)}.`);
    });
    return { encontrados, faltantes };
  }
  async contador(nombre, ventanaSegundos) {
    const n = await this.evalua(
      LUA_CONTADOR,
      [clave("lim", nombre)],
      [ventanaSegundos],
      /* Un conteo es 1 o mas; -3 es el tipo raro. Cero o negativos
         distintos serian un almacen que no se comporta. */
      (n2) => n2 >= 1 || n2 === -3
    );
    if (n === -3) throw new RespuestaInvalida("El contador de abuso tiene un tipo inesperado.");
    return n;
  }
  async cuenta(nombre) {
    const salida = await this.manda("GET", clave("lim", nombre));
    if (salida === null || salida === void 0) return 0;
    if (typeof salida === "number" && Number.isInteger(salida)) return salida;
    if (typeof salida === "string" && /^\d+$/.test(salida)) return Number(salida);
    throw new RespuestaInvalida(`El contador ${nombre} vino como ${describe(salida)}.`);
  }
  async escanea(ns, limite = 5e3) {
    const prefijo = `ath:${ns}:`;
    const ids = [];
    let cursor = "0";
    let vueltas = 0;
    do {
      const salida = await this.manda("SCAN", cursor, "MATCH", `${prefijo}*`, "COUNT", 500);
      if (!Array.isArray(salida) || salida.length !== 2) {
        throw new RespuestaInvalida(`SCAN devolvi\xF3 ${describe(salida)}.`);
      }
      const [siguiente, claves] = salida;
      if (typeof siguiente !== "string" || !Array.isArray(claves)) {
        throw new RespuestaInvalida("SCAN devolvi\xF3 un cursor o una lista con forma inesperada.");
      }
      for (const k of claves) {
        if (typeof k !== "string") throw new RespuestaInvalida("SCAN devolvi\xF3 una clave que no es texto.");
        ids.push(k.slice(prefijo.length));
      }
      cursor = siguiente;
      vueltas++;
      if (ids.length >= limite) return { ids: ids.slice(0, limite), truncado: true };
      if (vueltas > 1e3) return { ids, truncado: true };
    } while (cursor !== "0");
    return { ids, truncado: false };
  }
  async vida(ns, id) {
    return this.numero("TTL", clave(ns, id));
  }
  async vidaIndice(nombre) {
    return this.numero("TTL", clave("idx", nombre));
  }
  /** TTL y similares: numero entero, sin conversiones. */
  async numero(...orden) {
    const salida = await this.manda(...orden);
    if (typeof salida !== "number" || !Number.isInteger(salida)) {
      throw new RespuestaInvalida(`El almac\xE9n devolvi\xF3 ${describe(salida)} donde esperaba un entero.`);
    }
    return salida;
  }
};
function describe(valor) {
  if (valor === null) return "null";
  if (Array.isArray(valor)) return `una lista de ${valor.length}`;
  return `un valor de tipo ${typeof valor}`;
}
function analiza(crudo, donde) {
  let dato;
  try {
    dato = JSON.parse(crudo);
  } catch {
    throw new RespuestaInvalida(`El registro ${donde} est\xE1 guardado en un formato ilegible.`);
  }
  if (!dato || typeof dato !== "object" || typeof dato.version !== "number") {
    throw new RespuestaInvalida(`El registro ${donde} no tiene versi\xF3n: no se puede cambiar con seguridad.`);
  }
  return dato;
}
function almacen() {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw new SinAlmacen();
  return new RedisHttp(url, token);
}

// src/data/validacion.ts
var AUSENTE = { fallo: "AUSENTE" };
function fechaIso(bruto) {
  if (bruto === void 0 || bruto === null || bruto === "") return AUSENTE;
  if (typeof bruto !== "string") return { fallo: "TIPO" };
  const crudo = bruto.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(crudo)) return { fallo: "TIPO" };
  const leida = { valor: crudo };
  const [a, m, d] = leida.valor.split("-").map(Number);
  const fecha = new Date(Date.UTC(a, m - 1, d));
  const existe = fecha.getUTCFullYear() === a && fecha.getUTCMonth() === m - 1 && fecha.getUTCDate() === d;
  if (!existe) return { fallo: "RANGO" };
  if (a < 2020 || a > 2100) return { fallo: "RANGO" };
  return { valor: leida.valor };
}

// src/data/codigos-referido.ts
var ALFABETO = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
var MODULO = ALFABETO.length;

// src/data/whatsapp.ts
var NUMERO = "573188983167";
var MENSAJE_DISPONIBILIDAD = "Hola, quiero consultar disponibilidad en Atheron Suite.\n\nFecha de llegada:\nFecha de salida:\nN\xFAmero de hu\xE9spedes:";
var MENSAJE_GRUPO = "Hola, quiero cotizar alojamiento para un grupo en Zipaquir\xE1.\n\nN\xFAmero de personas:\nFecha de llegada:\nFecha de salida:\nTipo de grupo/evento:";
var enlaceWhatsApp = (mensaje) => `https://wa.me/${NUMERO}?text=${encodeURIComponent(mensaje)}`;
var ENLACE_DISPONIBILIDAD = enlaceWhatsApp(MENSAJE_DISPONIBILIDAD);
var ENLACE_GRUPO = enlaceWhatsApp(MENSAJE_GRUPO);

// src/data/piloto-la-triada.ts
var PILOTO = {
  /** El mismo identificador de la orden y del Issue #48. */
  id: "ATH-PILOT-001",
  aliado: "La Triada",
  slugAliado: "la-triada",
  /** Las tres letras que van dentro del codigo: ATH-TRI-XXXXX. */
  codigoAliado: "TRI",
  /** Dia de la prueba fisica del CEO. */
  fechaPrueba: "2026-09-23",
  rutas: {
    activar: "/piloto/la-triada",
    validar: "/piloto/la-triada/validar",
    registro: "/piloto/la-triada/registro"
  }
};
var ENLAZADO_EN_FICHA = false;
var BENEFICIO = {
  estado: "PENDIENTE DE VERIFICACI\xD3N CEO",
  porcentaje: null,
  descripcion: null,
  base: null,
  exclusiones: null,
  vigencia: null,
  evidencia: null
};
function comprueba() {
  const b = BENEFICIO;
  const verificado = b.estado === "VERIFICADO";
  if (!verificado) {
    const rellenos = [
      ["porcentaje", b.porcentaje],
      ["descripcion", b.descripcion],
      ["base", b.base],
      ["vigencia", b.vigencia]
    ].filter(([, v]) => v !== null && v !== void 0);
    if (rellenos.length) {
      throw new Error(
        `PILOTO ${PILOTO.id}: hay condicion comercial escrita (${rellenos.map(([k]) => k).join(", ")}) con estado "${b.estado}". Una condicion no verificada no se publica: o se verifica y se cambia el estado, o se deja en null.`
      );
    }
  }
  if (verificado) {
    const faltan = [
      ["porcentaje", b.porcentaje],
      ["descripcion", b.descripcion],
      ["base", b.base],
      ["exclusiones", b.exclusiones],
      ["vigencia", b.vigencia],
      ["evidencia", b.evidencia]
    ].filter(([, v]) => v === null || v === void 0);
    if (faltan.length) {
      throw new Error(
        `PILOTO ${PILOTO.id}: estado VERIFICADO sin ${faltan.map(([k]) => k).join(", ")}. Verificado significa que consta entero: porcentaje, base, exclusiones, vigencia y donde consta.`
      );
    }
    if (typeof b.porcentaje === "number" && (b.porcentaje <= 0 || b.porcentaje > 100)) {
      throw new Error(`PILOTO ${PILOTO.id}: porcentaje fuera de rango (${b.porcentaje}).`);
    }
  }
  if (ENLAZADO_EN_FICHA && !verificado) {
    throw new Error(
      `PILOTO ${PILOTO.id}: ENLAZADO_EN_FICHA esta en true con la condicion sin verificar. La ficha publica no enlaza un beneficio que no consta.`
    );
  }
}
comprueba();
var AVISO_CONDICION = BENEFICIO.estado === "VERIFICADO" ? null : "Condici\xF3n comercial: PENDIENTE DE VERIFICACI\xD3N CEO. Atheron no anuncia aqu\xED ning\xFAn porcentaje: el descuento que se aplique lo acuerda y lo teclea el local en el momento, y queda registrado tal cual.";
var DESFASE_COLOMBIA_MS = 5 * 60 * 60 * 1e3;
function diaColombiano(instante) {
  return new Date(instante.getTime() - DESFASE_COLOMBIA_MS).toISOString().slice(0, 10);
}

// src/data/economia-red.ts
var REGLA = {
  version: "2026-09-22.v1",
  comisionPct: 10,
  estadoComision: "CONFIRMADA POR CEO",
  evidenciaComision: "Decisi\xF3n del CEO comunicada en la orden ATH-LOOP-002 (22 de septiembre de 2026): La Triada reconoce a Atheron una comisi\xF3n del 10% sobre el consumo atribuido y validado.",
  creditoPct: 5,
  margenPct: 5,
  estadoReparto: "HIP\xD3TESIS \u2014 NO ES POL\xCDTICA",
  originadorPct: null,
  estadoOriginador: "PENDIENTE POL\xCDTICA CEO"
};
var REPARTO_CONFIRMADO = REGLA.estadoReparto === "CONFIRMADA POR CEO";
function comprueba2(r) {
  if (!r.version.trim()) throw new Error("ECONOMIA: la regla necesita versi\xF3n para poder auditarla.");
  const rango = (n) => Number.isFinite(n) && n >= 0 && n <= 100;
  if (!rango(r.comisionPct) || r.comisionPct === 0) {
    throw new Error(`ECONOMIA: comisionPct fuera de rango (${r.comisionPct}).`);
  }
  if (r.estadoComision === "CONFIRMADA POR CEO" && !r.evidenciaComision.trim()) {
    throw new Error("ECONOMIA: una comisi\xF3n confirmada sin evidencia escrita no se aplica.");
  }
  if (!rango(r.creditoPct) || !rango(r.margenPct)) {
    throw new Error("ECONOMIA: el reparto tiene porcentajes fuera de rango.");
  }
  const suma = Math.round((r.creditoPct + r.margenPct) * 100);
  if (suma !== Math.round(r.comisionPct * 100)) {
    throw new Error(
      `ECONOMIA: el reparto no cuadra. Cr\xE9dito ${r.creditoPct}% + margen ${r.margenPct}% = ${r.creditoPct + r.margenPct}%, y la comisi\xF3n es ${r.comisionPct}%. Cr\xE9dito y margen SON la comisi\xF3n repartida: no pueden sumar otra cosa.`
    );
  }
  if (r.originadorPct !== null && r.estadoOriginador !== "CONFIRMADA POR CEO") {
    throw new Error(
      `ECONOMIA: hay comisi\xF3n de originador escrita (${r.originadorPct}%) con estado "${r.estadoOriginador}". Modelar al originador no es pagarle.`
    );
  }
}
comprueba2(REGLA);
var VIGENCIA_CREDITO_DIAS = 90;
var COPY_CREDITO = {
  titulo: "Cr\xE9dito Atheron",
  queEs: `El ${REGLA.creditoPct}% de lo que consumas se te acredita como Cr\xE9dito Atheron.`,
  /* EN FUTURO, NO EN PRESENTE, Y SIN PROMETER AUTOMATISMO.
     La tercera auditoria senalo que estos dos textos se leian como
     una promesa: "se usa" y "vale" dan por hecho que el credito ya
     se puede gastar y que se aplicara solo. Hoy el credito se
     REGISTRA -existe, con su importe y su vencimiento- pero no hay
     mecanismo de vinculacion ni de aplicacion automatica, y decir lo
     contrario es prometer algo que no se puede cumplir. */
  donde: "Est\xE1 previsto para hospedajes Atheron y el resto de la red.",
  vigencia: `Se registra con ${VIGENCIA_CREDITO_DIAS} d\xEDas de vigencia desde tu visita.`,
  /* Mientras no exista una cuenta de cliente a la que atarlo, el
     credito se genera y queda esperando. Decirle "te lo aplicamos
     cuando reserves" seria prometer algo que hoy no se puede
     cumplir: no hay forma de saber que quien reserva es quien
     consumio. Ver src/data/credito-ledger.ts. */
  pendiente: "Queda registrado a nombre de este c\xF3digo. No se aplica solo: habr\xE1 que vincularlo.",
  comoReclamar: "Guarda tu c\xF3digo: es el que identifica tu cr\xE9dito.",
  /* Lo unico que se dice del estado del acuerdo, y solo dentro del
     piloto interno: es una prueba, y prometer permanencia seria
     exactamente lo que direccion pidio no hacer. */
  provisional: "Condiciones del piloto: pueden cambiar mientras dure la prueba."
};

// src/data/transacciones-red.ts
var ETIQUETA_FUENTE = {
  "ficha-la-triada": "Ficha de La Triada",
  "guia-restaurantes": "Gu\xEDa de restaurantes",
  blog: "Blog",
  hospedaje: "Hu\xE9sped de Atheron",
  "qr-local": "QR f\xEDsico en La Triada",
  directo: "Entrada directa"
};
var MAX_PERSONAS = 60;
var EXPLICACION_RECHAZO = {
  CODIGO_INVALIDO: "Ese c\xF3digo no est\xE1 bien copiado. Vuelve a leerlo del m\xF3vil.",
  NO_EXISTE: "Ese c\xF3digo no est\xE1 activado. Pide al cliente que lo active y vuelve a escanear.",
  YA_REDIMIDA: "Este c\xF3digo ya se us\xF3. Solo vale una vez.",
  CERRADA: "Este c\xF3digo se cerr\xF3 sin consumo.",
  CADUCADA: "Este c\xF3digo caduc\xF3: vale hasta el final del d\xEDa en que se activa.",
  CONSUMO_INVALIDO: "Escribe el valor de la cuenta en pesos enteros, sin puntos ni centavos.",
  PERSONAS_INVALIDAS: `El n\xFAmero de personas tiene que estar entre 1 y ${MAX_PERSONAS}.`,
  CONFLICTO: "Otro dispositivo estaba registrando esta misma cuenta. Vuelve a consultarla."
};
var CABECERA_CONCILIACION = "piloto|codigo|aliado|fuente|originador|activado|redimido|estado|personas|consumo_cop|comision_pct|comision_cop|credito_cop|margen_cop|regla|credito_id|satisfaccion|incidencia";
var limpio = (t) => t.replace(/[|\r\n]+/g, " ").trim();
function filaConciliacion(t) {
  const e = t.economia;
  return [
    t.piloto,
    t.codigo,
    t.aliado,
    t.fuente,
    limpio(t.originador ?? ""),
    t.activadoEn,
    t.redimidoEn ?? "",
    t.estado,
    t.personas ?? t.personasPrevistas ?? "",
    e?.consumo ?? "",
    e?.comisionPct ?? "",
    e?.comision ?? "",
    e?.credito ?? "",
    e?.margen ?? "",
    e?.reglaVersion ?? "",
    t.creditoId ?? "",
    t.seguimiento?.satisfaccion ?? "",
    t.seguimiento?.incidencia ? "SI" : ""
  ].join("|");
}

// src/data/reporte-aliado.ts
var INTEGRIDAD_LIMPIA = {
  faltantes: [],
  sinIndice: [],
  indicesDivergentes: [],
  contaminados: [],
  creditosFaltantes: [],
  creditosSinObjeto: [],
  creditosSinIndice: [],
  creditosContaminados: [],
  ttlDivergente: [],
  recuentoIncompleto: []
};
var aMediodia = (iso) => /* @__PURE__ */ new Date(`${iso}T12:00:00Z`);
var soloFecha = (sello) => sello.slice(0, 10);
function semanaDe(fecha) {
  const d = aMediodia(fecha);
  const dia = d.getUTCDay();
  const atras = dia === 0 ? 6 : dia - 1;
  const lunes = new Date(d);
  lunes.setUTCDate(d.getUTCDate() - atras);
  const domingo = new Date(lunes);
  domingo.setUTCDate(lunes.getUTCDate() + 6);
  return { lunes: lunes.toISOString().slice(0, 10), domingo: domingo.toISOString().slice(0, 10) };
}
var enSemana = (fecha, semana) => fecha >= semana.lunes && fecha <= semana.domingo;
function informeSemanal(transacciones, semana, integridad = INTEGRIDAD_LIMPIA) {
  const faltantes = integridad.faltantes;
  const activadas = transacciones.filter((t) => enSemana(soloFecha(t.activadoEn), semana));
  const redimidas = transacciones.filter(
    (t) => t.estado === "REDIMIDO" && t.redimidoEn && enSemana(soloFecha(t.redimidoEn), semana)
  );
  const cerradas = transacciones.filter(
    (t) => t.estado === "NO_REDIMIDO" && t.redimidoEn && enSemana(soloFecha(t.redimidoEn), semana)
  );
  const suma = (lista, f) => lista.reduce((n, t) => n + f(t), 0);
  const fuentes = /* @__PURE__ */ new Map();
  for (const t of activadas) {
    const f = fuentes.get(t.fuente) ?? { activaciones: 0, redenciones: 0 };
    f.activaciones++;
    fuentes.set(t.fuente, f);
  }
  for (const t of redimidas) {
    const f = fuentes.get(t.fuente) ?? { activaciones: 0, redenciones: 0 };
    f.redenciones++;
    fuentes.set(t.fuente, f);
  }
  const reglas = /* @__PURE__ */ new Map();
  for (const t of redimidas) {
    const e = t.economia;
    if (!e) continue;
    const bloque = reglas.get(e.reglaVersion) ?? {
      reglaVersion: e.reglaVersion,
      comisionPct: e.comisionPct,
      creditoPct: e.creditoPct,
      redenciones: 0,
      consumo: 0,
      comision: 0,
      credito: 0,
      margen: 0
    };
    bloque.redenciones++;
    bloque.consumo += e.consumo;
    bloque.comision += e.comision;
    bloque.credito += e.credito;
    bloque.margen += e.margen;
    reglas.set(e.reglaVersion, bloque);
  }
  const opiniones = transacciones.filter(
    (t) => t.seguimiento?.sello && enSemana(soloFecha(t.seguimiento.sello), semana)
  );
  const notas = opiniones.map((t) => t.seguimiento?.satisfaccion).filter((n) => typeof n === "number");
  const sinEconomia = redimidas.filter((t) => !t.economia).map((t) => t.codigo);
  const cohorteRedimida = activadas.filter((t) => t.estado === "REDIMIDO").length;
  const avisos = [];
  if (REGLA.estadoReparto !== "CONFIRMADA POR CEO") {
    avisos.push(
      `El reparto de la comisi\xF3n (${REGLA.creditoPct}% cr\xE9dito / ${REGLA.margenPct}% margen) es una hip\xF3tesis del piloto, no una pol\xEDtica aprobada. La comisi\xF3n total s\xED est\xE1 confirmada.`
    );
  }
  if (REGLA.originadorPct === null) {
    avisos.push("El originador comercial se registra, pero no se liquida: no hay pol\xEDtica aprobada.");
  }
  if (faltantes.length) {
    avisos.push(
      `${faltantes.length} registro(s) que el \xEDndice nombra no se pudieron leer. Este informe est\xE1 incompleto y NO sirve para liquidar hasta resolverlo.`
    );
  }
  if (sinEconomia.length) {
    avisos.push(`${sinEconomia.length} redenci\xF3n(es) sin consumo guardado: revisar antes de facturar.`);
  }
  if (integridad.sinIndice.length) {
    avisos.push(`${integridad.sinIndice.length} transacci\xF3n(es) que ning\xFAn \xEDndice nombra: el informe puede estar dej\xE1ndose ventas fuera.`);
  }
  if (integridad.creditosFaltantes.length) {
    avisos.push(`${integridad.creditosFaltantes.length} cr\xE9dito(s) referenciados por una venta que no existen en el libro.`);
  }
  if (integridad.creditosSinObjeto.length) {
    avisos.push(`${integridad.creditosSinObjeto.length} cr\xE9dito(s) que el \xEDndice nombra y no est\xE1n.`);
  }
  if (integridad.creditosSinIndice.length) {
    avisos.push(`${integridad.creditosSinIndice.length} cr\xE9dito(s) que existen y ning\xFAn \xEDndice nombra.`);
  }
  if (integridad.creditosContaminados.length) {
    avisos.push(`${integridad.creditosContaminados.length} id(s) que no son cr\xE9ditos dentro de un \xEDndice de cr\xE9ditos.`);
  }
  if (integridad.recuentoIncompleto.length) {
    avisos.push("No se pudo recorrer el almac\xE9n entero: este informe no puede declararse completo.");
  }
  if (integridad.contaminados.length) {
    avisos.push(`${integridad.contaminados.length} id(s) que no son transacciones dentro de un \xEDndice de transacciones.`);
  }
  if (integridad.indicesDivergentes.length) {
    avisos.push(`${integridad.indicesDivergentes.length} transacci\xF3n(es) en el \xEDndice de redenciones sin estar redimidas ni cerradas.`);
  }
  if (integridad.ttlDivergente.length) {
    avisos.push(`${integridad.ttlDivergente.length} registro(s) cuyo objeto y su \xEDndice caducan en momentos distintos.`);
  }
  if (reglas.size > 1) {
    avisos.push("En esta semana se aplic\xF3 m\xE1s de una regla econ\xF3mica. Cada bloque se liquida con la suya.");
  }
  return {
    semana,
    activaciones: activadas.length,
    personasPrevistas: suma(activadas, (t) => t.personasPrevistas ?? 0),
    redenciones: redimidas.length,
    cerradasSinConsumo: cerradas.length,
    conversion: activadas.length ? Math.round(cohorteRedimida / activadas.length * 1e3) / 10 : 0,
    cohorteRedimida,
    personasAtendidas: suma(redimidas, (t) => t.personas ?? 0),
    consumoAtribuido: suma(redimidas, (t) => t.economia?.consumo ?? 0),
    comision: suma(redimidas, (t) => t.economia?.comision ?? 0),
    creditoGenerado: suma(redimidas, (t) => t.economia?.credito ?? 0),
    margen: suma(redimidas, (t) => t.economia?.margen ?? 0),
    porFuente: [...fuentes.entries()].map(([fuente, n]) => ({ fuente, etiqueta: ETIQUETA_FUENTE[fuente], ...n })).sort((a, b) => b.activaciones - a.activaciones || a.fuente.localeCompare(b.fuente)),
    porRegla: [...reglas.values()].sort((a, b) => a.reglaVersion.localeCompare(b.reglaVersion)),
    satisfaccionMedia: notas.length ? Math.round(notas.reduce((a, b) => a + b, 0) / notas.length * 10) / 10 : null,
    incidencias: opiniones.filter((t) => t.seguimiento?.incidencia).length,
    integridad,
    faltantes,
    sinEconomia,
    /* TODOS los movimientos de la semana, no solo los que facturan:
       con activaciones y cierres dentro, la semana se puede
       reconstruir entera desde estas filas. */
    filas: [
      CABECERA_CONCILIACION,
      ...[...activadas, ...redimidas, ...cerradas].filter((t, i, lista) => lista.findIndex((o) => o.codigo === t.codigo) === i).sort((a, b) => a.activadoEn.localeCompare(b.activadoEn)).map(filaConciliacion)
    ],
    avisos
  };
}
function conciliacionCuadra(informe2) {
  const i = informe2.integridad;
  const problemas = [
    /* El alcance va primero: si no se pudo mirar entero, lo demas no
       demuestra nada, por mucho que salga vacio. */
    ["motivo(s) por los que el recuento no est\xE1 completo", i.recuentoIncompleto],
    ["registro(s) que el \xEDndice nombra y no se pueden leer", i.faltantes],
    ["transacci\xF3n(es) que ning\xFAn \xEDndice nombra", i.sinIndice],
    ["id(s) ajenos dentro de un \xEDndice de transacciones", i.contaminados],
    ["transacci\xF3n(es) con \xEDndice y estado contradictorios", i.indicesDivergentes],
    ["cr\xE9dito(s) referenciados por una venta que no existen", i.creditosFaltantes],
    ["cr\xE9dito(s) que el \xEDndice nombra y no est\xE1n", i.creditosSinObjeto],
    ["cr\xE9dito(s) que existen y ning\xFAn \xEDndice nombra", i.creditosSinIndice],
    ["id(s) ajenos dentro de un \xEDndice de cr\xE9ditos", i.creditosContaminados],
    ["registro(s) con retenci\xF3n divergente de su \xEDndice", i.ttlDivergente],
    ["redenci\xF3n(es) sin consumo guardado", informe2.sinEconomia]
  ];
  for (const [que, lista] of problemas) {
    if (lista.length) {
      return {
        cuadra: false,
        estado: "INCOMPLETO",
        detalle: `${lista.length} ${que}. No se puede liquidar hasta resolverlo.`
      };
    }
  }
  if (!informe2.redenciones) {
    return {
      cuadra: false,
      estado: "SIN_DATOS",
      detalle: informe2.activaciones ? `${informe2.activaciones} activaci\xF3n(es) y ninguna redenci\xF3n en la semana.` : "No hay ninguna transacci\xF3n en esta semana."
    };
  }
  for (const bloque of informe2.porRegla) {
    if (bloque.credito + bloque.margen !== bloque.comision) {
      return {
        cuadra: false,
        estado: "NO_CUADRA",
        detalle: `Regla ${bloque.reglaVersion}: cr\xE9dito (${bloque.credito}) + margen (${bloque.margen}) no suman la comisi\xF3n (${bloque.comision}).`
      };
    }
    const esperada = Math.round(bloque.consumo * bloque.comisionPct / 100);
    if (Math.abs(esperada - bloque.comision) > Math.max(1, bloque.redenciones)) {
      return {
        cuadra: false,
        estado: "NO_CUADRA",
        detalle: `Regla ${bloque.reglaVersion}: la comisi\xF3n suma ${bloque.comision} y sobre el consumo dar\xEDa ${esperada}.`
      };
    }
  }
  const total = informe2.porRegla.reduce((n, b) => n + b.comision, 0);
  if (total !== informe2.comision) {
    return {
      cuadra: false,
      estado: "NO_CUADRA",
      detalle: `Los bloques por regla suman ${total} y el total dice ${informe2.comision}.`
    };
  }
  return {
    cuadra: true,
    estado: "CUADRA",
    detalle: informe2.porRegla.length === 1 ? `Los totales cuadran con el consumo atribuido (regla ${informe2.porRegla[0].reglaVersion}).` : "Los totales cuadran en cada bloque de regla."
  };
}

// servidor/_servicio.ts
var TX = "tx";
var CR = "cr";
var idxActivacion = (dia) => `tx:act:${dia}`;
var idxRedencion = (dia) => `tx:red:${dia}`;
var idxCredito = (dia) => `cr:gen:${dia}`;
var ES_TRANSACCION = /^ATH-[A-Z]{3}-[A-Z0-9]{5}$/;
var ES_CREDITO = /^ATH-CR-[A-Z0-9]{8}$/;
var TOLERANCIA_TTL_SEGUNDOS = 24 * 60 * 60;
var TOPE_COMPROBACION = 500;
async function informe(fecha, deposito = almacen()) {
  const semana = semanaDe(fecha);
  const dias = [];
  const desde = /* @__PURE__ */ new Date(`${semana.lunes}T12:00:00Z`);
  for (let i = 0; i < 7; i++) {
    const d = new Date(desde);
    d.setUTCDate(desde.getUTCDate() + i);
    dias.push(d.toISOString().slice(0, 10));
  }
  const [listasAct, listasRed, listasCr] = await Promise.all([
    Promise.all(dias.map((d) => deposito.indice(idxActivacion(d)))),
    Promise.all(dias.map((d) => deposito.indice(idxRedencion(d)))),
    Promise.all(dias.map((d) => deposito.indice(idxCredito(d))))
  ]);
  const enActivacion = new Set(listasAct.flat());
  const enRedencion = new Set(listasRed.flat());
  const todos = [.../* @__PURE__ */ new Set([...enActivacion, ...enRedencion])];
  const contaminados = todos.filter((id) => !ES_TRANSACCION.test(id));
  const ids = todos.filter((id) => ES_TRANSACCION.test(id));
  const { encontrados, faltantes } = await deposito.leeVarios(TX, ids);
  const escaneo = await deposito.escanea(TX);
  const conocidas = new Set(ids);
  const huerfanasTodas = escaneo.ids.filter((id) => !conocidas.has(id));
  const huerfanas = huerfanasTodas.slice(0, TOPE_COMPROBACION);
  const { encontrados: sueltas } = huerfanas.length ? await deposito.leeVarios(TX, huerfanas) : { encontrados: [] };
  const recuentoIncompleto = [];
  if (escaneo.truncado) {
    recuentoIncompleto.push("El almac\xE9n tiene m\xE1s transacciones de las que se pudieron recorrer.");
  }
  if (huerfanasTodas.length > TOPE_COMPROBACION) {
    recuentoIncompleto.push(
      `Se encontraron ${huerfanasTodas.length} transacciones fuera de \xEDndice y solo se comprobaron ${TOPE_COMPROBACION}.`
    );
  }
  const sinIndice = [];
  for (const t of sueltas) {
    const dActivacion = t.activadoEn.slice(0, 10);
    const dCierre = t.redimidoEn?.slice(0, 10);
    if (dias.includes(dActivacion) || dCierre && dias.includes(dCierre)) sinIndice.push(t.codigo);
  }
  const indicesDivergentes = [];
  const creditosFaltantes = [];
  const ttlDivergente = [];
  for (const t of encontrados) {
    const diaActivacion = t.activadoEn.slice(0, 10);
    if (dias.includes(diaActivacion) && !enActivacion.has(t.codigo)) sinIndice.push(t.codigo);
    if (t.redimidoEn) {
      const diaCierre = t.redimidoEn.slice(0, 10);
      if (dias.includes(diaCierre) && !enRedencion.has(t.codigo)) sinIndice.push(t.codigo);
    }
    if (enRedencion.has(t.codigo) && t.estado !== "REDIMIDO" && t.estado !== "NO_REDIMIDO") {
      indicesDivergentes.push(t.codigo);
    }
    if (t.creditoId && !await deposito.lee(CR, t.creditoId)) creditosFaltantes.push(t.creditoId);
    try {
      const vidaTx = await deposito.vida(TX, t.codigo);
      const vidaAct = await deposito.vidaIndice(idxActivacion(diaActivacion));
      if (vidaTx >= 0 && vidaAct >= 0 && Math.abs(vidaTx - vidaAct) > TOLERANCIA_TTL_SEGUNDOS) {
        ttlDivergente.push(t.codigo);
      }
      if (t.redimidoEn) {
        const vidaRed = await deposito.vidaIndice(idxRedencion(t.redimidoEn.slice(0, 10)));
        if (vidaTx >= 0 && vidaRed >= 0 && Math.abs(vidaTx - vidaRed) > TOLERANCIA_TTL_SEGUNDOS) {
          ttlDivergente.push(t.codigo);
        }
      }
    } catch (error) {
      registra("comprobar la retenci\xF3n", error);
      ttlDivergente.push(t.codigo);
    }
  }
  const enCredito = new Set(listasCr.flat());
  const creditosContaminados = [...enCredito].filter((id) => !ES_CREDITO.test(id));
  const idsCredito = [...enCredito].filter((id) => ES_CREDITO.test(id));
  const { encontrados: creditos, faltantes: creditosSinObjeto } = await deposito.leeVarios(
    CR,
    idsCredito
  );
  const escaneoCr = await deposito.escanea(CR);
  const creditosConocidos = new Set(idsCredito);
  const sueltosTodos = escaneoCr.ids.filter((id) => !creditosConocidos.has(id));
  const sospechosos = sueltosTodos.slice(0, TOPE_COMPROBACION);
  const { encontrados: creditosSueltos } = sospechosos.length ? await deposito.leeVarios(CR, sospechosos) : { encontrados: [] };
  if (escaneoCr.truncado) {
    recuentoIncompleto.push("El almac\xE9n tiene m\xE1s cr\xE9ditos de los que se pudieron recorrer.");
  }
  if (sueltosTodos.length > TOPE_COMPROBACION) {
    recuentoIncompleto.push(
      `Se encontraron ${sueltosTodos.length} cr\xE9ditos fuera de \xEDndice y solo se comprobaron ${TOPE_COMPROBACION}.`
    );
  }
  const creditosSinIndice = [];
  for (const c of creditosSueltos) {
    if (typeof c.generadoEn === "string" && dias.includes(c.generadoEn.slice(0, 10))) {
      creditosSinIndice.push(c.id);
    }
  }
  for (const c of creditos) {
    const diaGeneracion = typeof c.generadoEn === "string" ? c.generadoEn.slice(0, 10) : "";
    try {
      const vidaCr = await deposito.vida(CR, c.id);
      const vidaIdx = diaGeneracion ? await deposito.vidaIndice(idxCredito(diaGeneracion)) : -2;
      if (vidaCr >= 0 && vidaIdx >= 0 && Math.abs(vidaCr - vidaIdx) > TOLERANCIA_TTL_SEGUNDOS) {
        ttlDivergente.push(c.id);
      }
    } catch (error) {
      registra("comprobar la retenci\xF3n del cr\xE9dito", error);
      ttlDivergente.push(c.id);
    }
  }
  const integridad = {
    faltantes,
    sinIndice: [...new Set(sinIndice)],
    indicesDivergentes,
    contaminados,
    creditosFaltantes: [...new Set(creditosFaltantes)],
    creditosSinObjeto,
    creditosSinIndice: [...new Set(creditosSinIndice)],
    creditosContaminados,
    ttlDivergente: [...new Set(ttlDivergente)],
    recuentoIncompleto
  };
  const resultado = informeSemanal([...encontrados, ...sueltas.filter((t) => sinIndice.includes(t.codigo))], semana, integridad);
  const conciliacion = conciliacionCuadra(resultado);
  return {
    ok: true,
    datos: {
      ...resultado,
      cuadra: conciliacion.cuadra,
      estado: conciliacion.estado,
      detalleConciliacion: conciliacion.detalle
    }
  };
}
var hoyColombiano = () => diaColombiano(/* @__PURE__ */ new Date());
function registra(donde, error) {
  const tipo = error instanceof Error ? error.name : typeof error;
  const codigo = error?.codigo;
  console.error(`[atheron/api] fallo al ${donde}: ${tipo}${codigo ? ` (${codigo})` : ""}`);
}

// servidor/_http.ts
var parametros = (peticion) => new URL(peticion.url ?? "/", "http://local").searchParams;
function maneja(metodo, accion) {
  return async (peticion, contestacion) => {
    contestacion.setHeader("cache-control", "no-store");
    contestacion.setHeader("content-type", "application/json; charset=utf-8");
    if (peticion.method !== metodo) {
      contestacion.setHeader("allow", metodo);
      contestacion.status(405).json({ ok: false, motivo: "METODO_NO_PERMITIDO" });
      return;
    }
    try {
      const { estado = 200, cuerpo: salida } = await accion(peticion);
      contestacion.status(estado).json(salida);
    } catch (error) {
      if (error instanceof SinAlmacen) {
        contestacion.status(503).json({ ok: false, motivo: error.codigo, explicacion: error.message });
        return;
      }
      if (error instanceof RespuestaInvalida) {
        registra("hablar con el almac\xE9n", error);
        contestacion.status(503).json({ ok: false, motivo: "ALMACEN_INCIERTO" });
        return;
      }
      registra("atender la petici\xF3n", error);
      contestacion.status(500).json({ ok: false, motivo: "ERROR" });
    }
  };
}
var DEMASIADAS = {
  estado: 429,
  cuerpo: {
    ok: false,
    motivo: "DEMASIADAS_PETICIONES",
    explicacion: "Demasiadas peticiones seguidas. Espera un momento y vuelve a intentarlo."
  }
};

// servidor/_autorizacion.ts
import { createHash, timingSafeEqual } from "node:crypto";
var variableDe = (aliado) => `ATHERON_OPERADOR_${aliado.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`;
var sha256 = (texto2) => createHash("sha256").update(texto2, "utf8").digest();
function coincide(recibido, esperadoHex) {
  let esperado;
  try {
    esperado = Buffer.from(esperadoHex.trim(), "hex");
  } catch {
    return false;
  }
  if (esperado.length !== 32) return false;
  return timingSafeEqual(sha256(recibido), esperado);
}
function credencialDe(cabeceras) {
  const bruta = cabeceras.authorization ?? cabeceras.Authorization;
  if (Array.isArray(bruta)) return bruta.length === 1 ? analizaCabecera(bruta[0]) : { tipo: "MALFORMADA" };
  if (bruta === void 0 || bruta === null) return { tipo: "AUSENTE" };
  if (typeof bruta !== "string") return { tipo: "MALFORMADA" };
  return analizaCabecera(bruta);
}
function analizaCabecera(bruta) {
  const texto2 = bruta.trim();
  if (!texto2) return { tipo: "AUSENTE" };
  const encaja = /^Bearer\s+(\S+)$/i.exec(texto2);
  if (!encaja) return { tipo: "MALFORMADA" };
  return { tipo: "PRESENTE", valor: encaja[1] };
}
function esOperador(credencial, aliado) {
  if (!credencial) return false;
  const esperado = process.env[variableDe(aliado)];
  if (!esperado) return false;
  return coincide(credencial, esperado);
}
function esAdmin(credencial) {
  if (!credencial) return false;
  const esperado = process.env.ATHERON_TOKEN_ADMIN;
  if (!esperado) return false;
  return coincide(credencial, esperado);
}
function quienLlama(cabeceras) {
  const bruta = cabeceras["x-forwarded-for"] ?? cabeceras["x-real-ip"];
  const texto2 = Array.isArray(bruta) ? bruta[0] : bruta ?? "";
  const primera = texto2.split(",")[0]?.trim() || "desconocida";
  return createHash("sha256").update(primera).digest("hex").slice(0, 16);
}
var LIMITES = {
  activar: { max: 20, ventana: 600 },
  transaccion: { max: 60, ventana: 600 },
  redimir: { max: 60, ventana: 600 },
  seguimiento: { max: 10, ventana: 600 },
  reporte: { max: 30, ventana: 600 },
  /* Intentos de credencial equivocada. Mucho mas corto: es lo que
     usa quien prueba a adivinarla. */
  credencial: { max: 10, ventana: 900 }
};
var cubeta = (endpoint, quien, ahora) => {
  const limite = LIMITES[endpoint];
  return `${endpoint}:${quien}:${Math.floor(ahora.getTime() / (limite.ventana * 1e3))}`;
};
async function pasaLimite(deposito, endpoint, quien, ahora = /* @__PURE__ */ new Date()) {
  const limite = LIMITES[endpoint];
  if (!limite) return true;
  try {
    const n = await deposito.contador(cubeta(endpoint, quien, ahora), limite.ventana);
    return n <= limite.max;
  } catch {
    return true;
  }
}
async function autoriza(deposito, cabeceras, papel, aliado, ahora = /* @__PURE__ */ new Date()) {
  const cabecera = credencialDe(cabeceras);
  if (cabecera.tipo === "AUSENTE") return "AUSENTE";
  if (cabecera.tipo === "MALFORMADA") return "MALFORMADA";
  const quien = quienLlama(cabeceras);
  const clave2 = cubeta("credencial", quien, ahora);
  const limite = LIMITES.credencial;
  let fallos;
  try {
    fallos = await deposito.cuenta(clave2);
  } catch {
    return "ALMACEN";
  }
  if (fallos >= limite.max) return "BLOQUEADO";
  const vale = papel === "ADMIN" ? esAdmin(cabecera.valor) : esOperador(cabecera.valor, aliado);
  if (vale) return "OK";
  try {
    await deposito.contador(clave2, limite.ventana);
  } catch {
    return "ALMACEN";
  }
  return "INVALIDA";
}
var RESPUESTA_AUTORIZACION = {
  AUSENTE: {
    estado: 401,
    cuerpo: {
      ok: false,
      motivo: "NO_AUTORIZADO",
      explicacion: "Esta pantalla es del personal del local. Hace falta su credencial."
    }
  },
  MALFORMADA: {
    estado: 400,
    cuerpo: {
      ok: false,
      motivo: "CABECERA_INVALIDA",
      explicacion: "La credencial se manda como \xABAuthorization: Bearer <credencial>\xBB, una sola vez."
    }
  },
  INVALIDA: {
    estado: 401,
    cuerpo: { ok: false, motivo: "NO_AUTORIZADO", explicacion: "Esa credencial no es la de este local." }
  },
  BLOQUEADO: {
    estado: 429,
    cuerpo: {
      ok: false,
      motivo: "DEMASIADAS_PETICIONES",
      explicacion: "Demasiados intentos fallidos. Espera un rato antes de volver a intentarlo."
    }
  },
  ALMACEN: {
    estado: 503,
    cuerpo: { ok: false, motivo: "ALMACEN_INCIERTO" }
  }
};

// servidor/reporte.ts
var reporte_default = maneja("GET", async (peticion) => {
  const deposito = almacen();
  const quien = quienLlama(peticion.headers);
  if (!await pasaLimite(deposito, "reporte", quien)) return DEMASIADAS;
  const veredicto = await autoriza(deposito, peticion.headers, "ADMIN", "");
  if (veredicto !== "OK") return RESPUESTA_AUTORIZACION[veredicto];
  const pedida = parametros(peticion).get("fecha");
  if (pedida === null) return { cuerpo: await informe(hoyColombiano(), deposito) };
  const fecha = fechaIso(pedida);
  if (fecha.valor === void 0) {
    return {
      estado: 400,
      cuerpo: {
        ok: false,
        motivo: "FECHA_INVALIDA",
        explicacion: "La fecha se escribe AAAA-MM-DD y tiene que existir en el calendario."
      }
    };
  }
  return { cuerpo: await informe(fecha.valor, deposito) };
});
export {
  reporte_default as default
};
