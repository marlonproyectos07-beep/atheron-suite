/* ============================================================
   PRUEBAS ADVERSARIALES — una por cada hallazgo de la auditoria

     npm run prueba-adversarial

   Aqui no se comprueba que el camino feliz funcione: eso ya lo hacen
   las otras pruebas. Aqui se intenta romper el sistema por donde la
   auditoria independiente lo rompio, y cada comprobacion existe
   porque alguien consiguio hacer eso antes.

   SE ATACA POR HTTP, NO POR LA FUNCION

   Los endpoints se montan tal cual -los mismos archivos de /api- y
   se les hacen peticiones de verdad, con sus cabeceras y su cuerpo.
   Probar la funcion interna no demostraria nada sobre la frontera de
   confianza: el agujero estaba justo en la frontera.

   Y detras hay un Redis de verdad (scripts/lib/redis-local.mts), no
   una imitacion: si el compare-and-set no fuera atomico, estas
   pruebas lo verian.
   ============================================================ */

import http from 'node:http';
import { createHash } from 'node:crypto';
import { hayRedis, levanta } from './lib/redis-local.mts';

if (!hayRedis()) {
  console.log('\n  (omitida: no hay redis-server en esta máquina)\n');
  process.exit(0);
}

const local = await levanta(6397, 6396);
process.env.KV_REST_API_URL = local.url;
process.env.KV_REST_API_TOKEN = 'prueba';

/* Las credenciales se guardan hasheadas. Aqui se calcula el hash de
   una credencial de prueba, igual que haria quien la configure. */
const CREDENCIAL = 'credencial-de-prueba-larga-y-aleatoria-000';
const ADMIN = 'token-admin-de-prueba-largo-000';
process.env.ATHERON_OPERADOR_LA_TRIADA = createHash('sha256').update(CREDENCIAL).digest('hex');
process.env.ATHERON_TOKEN_ADMIN = createHash('sha256').update(ADMIN).digest('hex');

const { default: activarApi } = await import('../api/activar.ts');
const { default: transaccionApi } = await import('../api/transaccion.ts');
const { default: redimirApi } = await import('../api/redimir.ts');
const { default: seguimientoApi } = await import('../api/seguimiento.ts');
const { default: reporteApi } = await import('../api/reporte.ts');
const { default: operadorApi } = await import('../api/operador.ts');
const { almacen } = await import('../api/_almacen.ts');
const { generaCredito, gasta, reversa, vincula, estadoDe, cuadraCredito, asientaVencimiento } =
  await import('../src/data/credito-ledger.ts');
const { informeSemanal, semanaDe, conciliacionCuadra } = await import('../src/data/reporte-aliado.ts');
const { creaActivacion, esFuente } = await import('../src/data/transacciones-red.ts');
const { calculaEconomia, REGLA } = await import('../src/data/economia-red.ts');
const { entero, fechaIso, pesosEnteros, objetoPlano } = await import('../src/data/validacion.ts');
const deposito = almacen();

let hechas = 0;
const fallos: string[] = [];
const ok = (nombre: string, condicion: boolean, detalle = ''): void => {
  hechas++;
  if (condicion) {
    console.log(`  ok   ${nombre}`);
    return;
  }
  fallos.push(nombre);
  console.log(`  FALLA ${nombre}${detalle ? `\n         ${detalle}` : ''}`);
};

/* ------------------------------------------------------------
   LOS ENDPOINTS, SERVIDOS DE VERDAD
   ------------------------------------------------------------ */
type Handler = (p: unknown, c: unknown) => Promise<void>;

const RUTAS: Record<string, Handler> = {
  '/api/activar': activarApi as Handler,
  '/api/transaccion': transaccionApi as Handler,
  '/api/redimir': redimirApi as Handler,
  '/api/seguimiento': seguimientoApi as Handler,
  '/api/reporte': reporteApi as Handler,
  '/api/operador': operadorApi as Handler,
};

const servidor = http.createServer(async (peticion, respuesta) => {
  const ruta = new URL(peticion.url ?? '/', 'http://local').pathname;
  const handler = RUTAS[ruta];
  if (!handler) {
    respuesta.writeHead(404).end('{}');
    return;
  }
  const trozos: Buffer[] = [];
  for await (const t of peticion) trozos.push(t as Buffer);

  await handler(
    {
      method: peticion.method,
      url: peticion.url,
      headers: peticion.headers,
      body: trozos.length ? Buffer.concat(trozos).toString('utf8') : undefined,
    },
    {
      status(codigo: number) {
        respuesta.statusCode = codigo;
        return this;
      },
      setHeader(nombre: string, valor: string) {
        respuesta.setHeader(nombre, valor);
      },
      json(cuerpo: unknown) {
        respuesta.end(JSON.stringify(cuerpo));
      },
    },
  );
});
await new Promise<void>((r) => servidor.listen(6395, r));
const BASE = 'http://127.0.0.1:6395';

interface Llamada {
  estado: number;
  cuerpo: Record<string, unknown>;
  texto: string;
}

/* Cada bloque de pruebas usa su propia IP simulada. Si todos
   compartieran una, el limite de abuso de un bloque haria rebotar al
   siguiente y las pruebas se estorbarian entre ellas: justo el tipo
   de prueba fragil que luego nadie sabe por que falla. */
let ipActual = '10.0.0.1';
const desdeIp = (ip: string): void => {
  ipActual = ip;
};

async function pide(
  ruta: string,
  opciones: { metodo?: string; cuerpo?: unknown; credencial?: string; crudo?: string } = {},
): Promise<Llamada> {
  const cabeceras: Record<string, string> = {
    'content-type': 'application/json',
    'x-forwarded-for': ipActual,
  };
  if (opciones.credencial) cabeceras.authorization = `Bearer ${opciones.credencial}`;
  const respuesta = await fetch(`${BASE}${ruta}`, {
    method: opciones.metodo ?? 'GET',
    headers: cabeceras,
    body: opciones.crudo ?? (opciones.cuerpo !== undefined ? JSON.stringify(opciones.cuerpo) : undefined),
  });
  const texto = await respuesta.text();
  let cuerpo: Record<string, unknown> = {};
  try {
    cuerpo = JSON.parse(texto) as Record<string, unknown>;
  } catch {
    /* Se deja vacio: el texto crudo se comprueba aparte. */
  }
  return { estado: respuesta.status, cuerpo, texto };
}

const nuevoCodigo = async (extra: Record<string, unknown> = {}): Promise<string> => {
  const r = await pide('/api/activar', { metodo: 'POST', cuerpo: extra });
  return (r.cuerpo.datos as { codigo: string }).codigo;
};

/* ============================================================
   C1 — AUTORIZACION: LA FRONTERA DE CONFIANZA
   ============================================================ */
console.log('\n C1 · Autorización del operador');
desdeIp('10.0.0.1');

{
  const codigo = await nuevoCodigo();

  const sinNada = await pide('/api/redimir', { metodo: 'POST', cuerpo: { codigo, consumo: 100000 } });
  ok('un cliente con el código NO puede declarar una venta', sinNada.estado === 401, `${sinNada.estado}`);

  const conBasura = await pide('/api/redimir', {
    metodo: 'POST',
    cuerpo: { codigo, consumo: 100000 },
    credencial: 'lo-que-sea',
  });
  ok('una credencial inventada tampoco', conBasura.estado === 401);

  /* El nucleo del hallazgo: el codigo del cliente NO es credencial. */
  const conSuPropioCodigo = await pide('/api/redimir', {
    metodo: 'POST',
    cuerpo: { codigo, consumo: 100000 },
    credencial: codigo,
  });
  ok('el código del cliente NO concede el papel de operador', conSuPropioCodigo.estado === 401);

  const cierreSinNada = await pide('/api/redimir', { metodo: 'POST', cuerpo: { codigo, cerrar: true } });
  ok('un cliente tampoco puede cerrar la visita de otro', cierreSinNada.estado === 401);

  /* Y despues de todos esos intentos, la transaccion sigue intacta. */
  const estado = await pide(`/api/transaccion?c=${codigo}`);
  ok('tras los intentos, la visita sigue ACTIVADO', (estado.cuerpo.datos as { estado: string }).estado === 'ACTIVADO');

  const conCredencial = await pide('/api/redimir', {
    metodo: 'POST',
    cuerpo: { codigo, consumo: 100000 },
    credencial: CREDENCIAL,
  });
  ok('con la credencial del local, sí', conCredencial.estado === 200 && conCredencial.cuerpo.ok === true);
  ok('  y la comisión es de 10.000', (conCredencial.cuerpo.datos as { comision: number }).comision === 10000);
}

{
  const buena = await pide('/api/operador', { credencial: CREDENCIAL });
  const mala = await pide('/api/operador', { credencial: `${CREDENCIAL}x` });
  ok('la comprobación de credencial acepta la buena', buena.estado === 200);
  ok('y rechaza una que solo se parece', mala.estado === 401);
}

{
  /* Sin variable configurada no se autoriza a nadie: nunca "abierto
     mientras tanto". */
  const guardada = process.env.ATHERON_OPERADOR_LA_TRIADA;
  delete process.env.ATHERON_OPERADOR_LA_TRIADA;
  const sinConfigurar = await pide('/api/operador', { credencial: CREDENCIAL });
  process.env.ATHERON_OPERADOR_LA_TRIADA = guardada;
  ok('sin credencial configurada en el servidor, no entra nadie', sinConfigurar.estado === 401);
}

/* ============================================================
   A4 — PRIVACIDAD: LISTA BLANCA
   ============================================================ */
console.log('\n A4 · Privacidad y lista blanca');
desdeIp('10.0.0.2');

{
  const codigo = await nuevoCodigo({
    consienteSeguimiento: true,
    contacto: '3188983167',
    personas: 4,
    fuente: 'blog',
  });
  await pide('/api/redimir', {
    metodo: 'POST',
    cuerpo: { codigo, consumo: 200000, nota: 'Mesa 7, nota interna del local' },
    credencial: CREDENCIAL,
  });
  await pide('/api/seguimiento', {
    metodo: 'POST',
    cuerpo: { codigo, satisfaccion: 2, comentario: 'Tardaron mucho en la cocina' },
  });

  const cliente = await pide(`/api/transaccion?c=${codigo}`);
  const operador = await pide(`/api/transaccion?c=${codigo}`, { credencial: CREDENCIAL });

  for (const [quien, r] of [
    ['cliente', cliente],
    ['operador', operador],
  ] as const) {
    ok(`la vista del ${quien} no lleva el teléfono`, !r.texto.includes('3188983167'), r.texto);
    ok(`la vista del ${quien} no lleva la nota interna`, !r.texto.includes('Mesa 7'), r.texto);
    ok(`la vista del ${quien} no lleva el comentario privado`, !r.texto.includes('Tardaron mucho'), r.texto);
    ok(`la vista del ${quien} no lleva el margen de Atheron`, !r.texto.includes('"margen"'), r.texto);
    ok(`la vista del ${quien} no lleva los eventos internos`, !r.texto.includes('"eventos"'), r.texto);
  }

  ok('el cliente no ve la comisión', !('comision' in (cliente.cuerpo.datos as object)));
  ok('el operador sí ve la comisión', 'comision' in (operador.cuerpo.datos as object));
  ok('el cliente no ve cuántas personas declaró el local', !('personas' in (cliente.cuerpo.datos as object)));
  ok('el cliente sí sabe que dejó consentimiento', (cliente.cuerpo.datos as { seguimientoConsentido: boolean }).seguimientoConsentido === true);

  /* Seguimiento vacio: no puede borrar lo anterior. */
  await pide('/api/seguimiento', { metodo: 'POST', cuerpo: { codigo } });
  const tras = await deposito.lee<{ seguimiento: { satisfaccion: number; comentario: string; incidencia: boolean } }>('tx', codigo);
  ok('una respuesta vacía no borra la satisfacción', tras!.seguimiento.satisfaccion === 2);
  ok('ni borra el comentario', tras!.seguimiento.comentario === 'Tardaron mucho en la cocina');

  await pide('/api/seguimiento', { metodo: 'POST', cuerpo: { codigo, incidencia: true } });
  await pide('/api/seguimiento', { metodo: 'POST', cuerpo: { codigo, incidencia: false } });
  const tras2 = await deposito.lee<{ seguimiento: { incidencia: boolean } }>('tx', codigo);
  ok('una incidencia declarada no se apaga desde fuera', tras2!.seguimiento.incidencia === true);
}

{
  /* El limite de abuso corta el bucle. seguimiento admite 10 por
     ventana: la undecima tiene que rebotar. Con su propia IP, para
     no gastarle el cupo a los demas bloques. */
  const codigo = await nuevoCodigo();
  desdeIp('10.0.0.3');
  let rebotes = 0;
  for (let i = 0; i < 14; i++) {
    const r = await pide('/api/seguimiento', { metodo: 'POST', cuerpo: { codigo, satisfaccion: 3 } });
    if (r.estado === 429) rebotes++;
  }
  ok('el límite de abuso corta un bucle de peticiones', rebotes > 0, `${rebotes} rebotes`);
  desdeIp('10.0.0.2');
}

/* ============================================================
   A5 — VALIDACION DE ENTRADAS
   ============================================================ */
console.log('\n A5 · Validación de entradas');
desdeIp('10.0.0.4');

{
  const codigo = await nuevoCodigo();
  const ataques: [string, unknown][] = [
    ['true', true],
    ['un array con el importe dentro', [100000]],
    ['una cadena con notación científica', '1e3'],
    ['un decimal', 0.1],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['un negativo', -1],
    ['cero', 0],
    ['un objeto', { valueOf: 1 }],
    ['null', null],
    ['una cadena vacía', ''],
    ['un importe absurdo', 99_000_000],
  ];

  let colados = 0;
  for (const [nombre, consumo] of ataques) {
    const r = await pide('/api/redimir', {
      metodo: 'POST',
      cuerpo: { codigo, consumo },
      credencial: CREDENCIAL,
    });
    if (r.estado === 200) {
      colados++;
      console.log(`         se coló: ${nombre}`);
    }
  }
  ok(`ninguno de los ${ataques.length} consumos inválidos se acepta`, colados === 0, `${colados} colados`);

  const sigue = await pide(`/api/transaccion?c=${codigo}`);
  ok('y la visita sigue sin redimir', (sigue.cuerpo.datos as { estado: string }).estado === 'ACTIVADO');

  for (const personas of [900, 'abc', 1.5, true, [3]]) {
    const r = await pide('/api/redimir', {
      metodo: 'POST',
      cuerpo: { codigo, consumo: 50000, personas },
      credencial: CREDENCIAL,
    });
    ok(`personas = ${JSON.stringify(personas)} se rechaza`, r.estado === 400, `${r.estado}`);
  }
}

{
  ok('entero() rechaza true', entero(true, 1, 10).fallo === 'TIPO');
  ok('entero() rechaza un array', entero([5], 1, 10).fallo === 'TIPO');
  ok('entero() rechaza 1.5 como NO_ENTERO', entero(1.5, 1, 10).fallo === 'NO_ENTERO');
  ok('entero() rechaza fuera de rango', entero(99, 1, 10).fallo === 'RANGO');
  ok('entero() acepta "7"', entero('7', 1, 10).valor === 7);
  ok('pesosEnteros() no acepta cero', pesosEnteros(0, 100).fallo !== undefined);

  ok('esFuente() no acepta "constructor"', !esFuente('constructor'));
  ok('esFuente() no acepta "__proto__"', !esFuente('__proto__'));
  ok('esFuente() no acepta "toString"', !esFuente('toString'));
  ok('esFuente() sí acepta "blog"', esFuente('blog'));
  ok('una fuente heredada acaba en «directo»', creaActivacion({ codigo: 'x', fuente: 'toString' }).fuente === 'directo');

  ok('fechaIso() rechaza el 31 de febrero', fechaIso('2026-02-31').fallo === 'RANGO');
  ok('fechaIso() rechaza un año imposible', fechaIso('1970-01-01').fallo === 'RANGO');
  ok('fechaIso() acepta una fecha real', fechaIso('2026-09-23').valor === '2026-09-23');

  ok('objetoPlano() descarta un array', Object.keys(objetoPlano([1, 2])).length === 0);
  ok('objetoPlano() quita __proto__', !Object.hasOwn(objetoPlano(JSON.parse('{"__proto__":{"x":1},"a":2}')), '__proto__'));
}

desdeIp('10.0.0.41');
{
  const malFormado = await pide('/api/redimir', {
    metodo: 'POST',
    crudo: '[1,2,3]',
    credencial: CREDENCIAL,
  });
  ok('un cuerpo que es un array se rechaza sin romper nada', malFormado.estado === 400, `${malFormado.estado}`);

  const roto = await pide('/api/redimir', { metodo: 'POST', crudo: '{esto no', credencial: CREDENCIAL });
  ok('un JSON roto tampoco rompe el servidor', roto.estado === 400);

  const fechaImposible = await pide('/api/reporte?fecha=2026-02-31', { credencial: ADMIN });
  ok('una fecha imposible en el informe no revienta', fechaImposible.estado === 200);
}

/* ============================================================
   A1 y A2 — CONCURRENCIA Y CIERRE, POR HTTP
   ============================================================ */
console.log('\n A1/A2 · Concurrencia y cierre, por HTTP');
desdeIp('10.0.0.5');

{
  const codigo = await nuevoCodigo();
  const intentos = await Promise.all(
    Array.from({ length: 12 }, (_, i) =>
      pide('/api/redimir', {
        metodo: 'POST',
        cuerpo: { codigo, consumo: 100000 + i * 1000 },
        credencial: CREDENCIAL,
      }),
    ),
  );
  const registradas = intentos.filter((r) => r.estado === 200 && r.cuerpo.yaRedimida !== true);
  ok('12 confirmaciones simultáneas registran UNA sola venta', registradas.length === 1, `${registradas.length}`);
  ok('y ninguna devuelve error', intentos.every((r) => r.estado === 200));
}

desdeIp('10.0.0.51');
{
  let malas = 0;
  for (let i = 0; i < 12; i++) {
    const codigo = await nuevoCodigo();
    const [red, cier] = await Promise.all([
      pide('/api/redimir', { metodo: 'POST', cuerpo: { codigo, consumo: 80000 }, credencial: CREDENCIAL }),
      pide('/api/redimir', { metodo: 'POST', cuerpo: { codigo, cerrar: true }, credencial: CREDENCIAL }),
    ]);
    const final = await pide(`/api/transaccion?c=${codigo}`);
    const estado = (final.cuerpo.datos as { estado: string }).estado;
    const ventaRegistrada = red.estado === 200 && red.cuerpo.yaRedimida !== true;
    if (ventaRegistrada && estado !== 'REDIMIDO') malas++;
    if (!ventaRegistrada && cier.estado === 200 && estado !== 'NO_REDIMIDO') malas++;
  }
  ok('un cierre simultáneo nunca borra una venta confirmada (12 vueltas)', malas === 0, `${malas} casos`);
}

desdeIp('10.0.0.52');
{
  const codigo = await nuevoCodigo();
  await pide('/api/redimir', { metodo: 'POST', cuerpo: { codigo, cerrar: true }, credencial: CREDENCIAL });
  const despues = await pide('/api/redimir', {
    metodo: 'POST',
    cuerpo: { codigo, consumo: 90000 },
    credencial: CREDENCIAL,
  });
  ok('una visita cerrada ya no se puede redimir', despues.estado === 409 && despues.cuerpo.motivo === 'CERRADA');
}

/* ============================================================
   A3 — PERSISTENCIA: ESCRITURA PARCIAL
   ============================================================ */
console.log('\n A3 · Persistencia y reconciliación');
desdeIp('10.0.0.6');

{
  const codigo = await nuevoCodigo();
  await pide('/api/redimir', { metodo: 'POST', cuerpo: { codigo, consumo: 120000 }, credencial: CREDENCIAL });

  /* Se borra el registro dejando su id en el indice: la escritura
     parcial que reprodujo la auditoria. */
  await local.redis.manda(['DEL', `ath:tx:${codigo}`]);

  const hoy = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const informe = await pide(`/api/reporte?fecha=${hoy}`, { credencial: ADMIN });
  const datos = informe.cuerpo.datos as { faltantes: string[]; cuadra: boolean; avisos: string[] };
  ok('el informe detecta el registro que falta', datos.faltantes.includes(codigo), JSON.stringify(datos.faltantes));
  ok('y NO se declara cuadrado', datos.cuadra === false);
  ok('y lo dice con todas las letras', datos.avisos.some((a) => a.includes('incompleto')));
}

{
  /* Si el almacen contesta algo que no se puede tratar como exito,
     la API devuelve 503, no un 200 alegre. */
  local.averia(true);
  const r = await pide('/api/activar', { metodo: 'POST', cuerpo: {} });
  local.averia(false);
  ok('un almacén que contesta {} da 503, no un falso éxito', r.estado === 503, `${r.estado}`);
  ok('y el mensaje no cuenta de más', !r.texto.includes('Lua') && !r.texto.includes('EVAL'), r.texto);
}

/* ============================================================
   A6 — CREDITO ATHERON: EL LIBRO
   ============================================================ */
console.log('\n A6 · Crédito Atheron (libro mayor)');
desdeIp('10.0.0.7');

{
  const codigo = await nuevoCodigo();
  const redimida = await pide('/api/redimir', {
    metodo: 'POST',
    cuerpo: { codigo, consumo: 100000 },
    credencial: CREDENCIAL,
  });
  const creditoId = (redimida.cuerpo.datos as { creditoId?: string }).creditoId;
  ok('una venta emite un crédito de verdad', Boolean(creditoId));

  const credito = await deposito.lee<Record<string, unknown>>('cr', creditoId!);
  ok('  con su importe', credito!.valor === 5000);
  ok('  con su saldo', credito!.saldo === 5000);
  ok('  con su origen', (credito!.origen as { codigo: string }).codigo === codigo);
  ok('  con su vencimiento', typeof credito!.expiraEn === 'string');
  ok('  y sin titular inventado', credito!.titular === null);
  ok('  con su movimiento de generación', (credito!.movimientos as unknown[]).length === 1);

  const vista = (redimida.cuerpo.datos as { creditoVista?: unknown }).creditoVista;
  ok('el crédito no viaja entero en la respuesta', vista === undefined || !JSON.stringify(vista).includes('movimientos'));

  const consulta = await pide(`/api/transaccion?c=${codigo}`);
  const creditoVista = (consulta.cuerpo.datos as { creditoVista: { estado: string; etiqueta: string } }).creditoVista;
  ok('el cliente ve el estado real del crédito', creditoVista.estado === 'GENERADO', creditoVista.estado);
  ok('y la etiqueta dice que está pendiente de vinculación', creditoVista.etiqueta.includes('pendiente'));

  /* Reintentar no emite un segundo credito. */
  await pide('/api/redimir', { metodo: 'POST', cuerpo: { codigo, consumo: 100000 }, credencial: CREDENCIAL });
  const otra = await deposito.lee<Record<string, unknown>>('cr', creditoId!);
  ok('reintentar no duplica el crédito', (otra!.movimientos as unknown[]).length === 1);
}

{
  const base = generaCredito({
    valor: 5000,
    origen: { piloto: 'ATH-PILOT-001', aliado: 'la-triada', codigo: 'ATH-TRI-K7M2Q' },
    ambitos: ['HOSPEDAJE'],
  });

  ok('un crédito nace GENERADO, no disponible', estadoDe(base) === 'GENERADO');
  ok('y no se puede gastar sin titular', gasta(base, 1000, 'reserva').fallo === 'NO_GASTABLE');

  const vinculado = vincula(base, 'cuenta:demo').credito!;
  ok('vinculado pasa a DISPONIBLE', estadoDe(vinculado) === 'DISPONIBLE');

  const gastado = gasta(vinculado, 3000, 'reserva-1').credito!;
  ok('gastar deja saldo', gastado.saldo === 2000);
  ok('  y queda el movimiento', gastado.movimientos.at(-1)!.tipo === 'GASTO');
  ok('  y el estado es PARCIAL', estadoDe(gastado) === 'PARCIAL');
  ok('  y el libro cuadra', cuadraCredito(gastado));

  ok('no se puede gastar más que el saldo', gasta(gastado, 9000, 'x').fallo === 'SALDO_INSUFICIENTE');
  ok('ni un importe con decimales', gasta(gastado, 0.5, 'x').fallo === 'IMPORTE_INVALIDO');

  /* Doble gasto: la version sube, asi que el segundo intento contra
     la copia vieja no puede escribirse en el almacen. */
  const primero = gasta(vinculado, 5000, 'reserva-A').credito!;
  const segundo = gasta(vinculado, 5000, 'reserva-B').credito!;
  ok('dos gastos sobre la misma copia dan la misma versión', primero.version === segundo.version);
  await deposito.crea('cr', vinculado, []);
  const a = await deposito.cambia('cr', primero, []);
  const b = await deposito.cambia('cr', segundo, []);
  ok('y el almacén solo deja pasar uno: no hay doble gasto', a === 'OK' && b === 'CONFLICTO', `${a}/${b}`);

  const agotado = gasta(vinculado, 5000, 'todo').credito!;
  ok('gastarlo entero lo deja AGOTADO', estadoDe(agotado) === 'AGOTADO');

  ok('una reversión total funciona', reversa(vinculado, 'venta anulada').ok);
  ok('reversión de uno ya gastado a medias NO se decide en el código', reversa(gastado, 'x').fallo === 'REVERSION_PARCIAL_REQUIERE_POLITICA');

  const futuro = new Date(Date.now() + 200 * 24 * 60 * 60 * 1000);
  ok('pasada la vigencia, el estado es VENCIDO sin que nadie lo marque', estadoDe(vinculado, futuro) === 'VENCIDO');
  ok('y no se puede gastar', gasta(vinculado, 100, 'tarde', futuro).fallo === 'NO_GASTABLE');
  const vencido = asientaVencimiento(vinculado, futuro).credito!;
  ok('el vencimiento se puede asentar en el libro', vencido.movimientos.at(-1)!.tipo === 'VENCIMIENTO' && vencido.saldo === 0);
}

/* ============================================================
   A7 — INFORME: HISTORIA, VACIOS Y REGLAS
   ============================================================ */
console.log('\n A7 · Informe y conciliación');

{
  const vacio = informeSemanal([], semanaDe('2026-09-23'));
  const cuadre = conciliacionCuadra(vacio);
  ok('una semana vacía NO se declara cuadrada', cuadre.cuadra === false);
  ok('  y se distingue como SIN_DATOS', cuadre.estado === 'SIN_DATOS', cuadre.estado);

  const incompleto = informeSemanal([], semanaDe('2026-09-23'), ['ATH-TRI-AAAAA']);
  ok('con registros que faltan, el estado es INCOMPLETO', conciliacionCuadra(incompleto).estado === 'INCOMPLETO');
}

{
  /* Dos reglas economicas distintas en la misma semana. El informe
     tiene que liquidar cada una con la suya, no recalcular con la de
     hoy: esa era la trampa. */
  const reglaVieja = { ...REGLA, version: '2026-01-01.v0', comisionPct: 8, creditoPct: 4, margenPct: 4 };
  const fila = (codigo: string, consumo: number, regla: typeof REGLA) => ({
    ...creaActivacion({ codigo, fuente: 'blog' }),
    activadoEn: '2026-09-22T12:00:00-05:00',
    redimidoEn: '2026-09-23T14:00:00-05:00',
    estado: 'REDIMIDO' as const,
    economia: calculaEconomia(consumo, regla),
  });

  const inf = informeSemanal(
    [fila('ATH-TRI-AAAAA', 100000, REGLA), fila('ATH-TRI-BBBBB', 100000, reglaVieja)],
    semanaDe('2026-09-23'),
  );
  ok('el informe separa las dos reglas', inf.porRegla.length === 2, JSON.stringify(inf.porRegla.map((b) => b.reglaVersion)));
  ok('  la nueva cobra 10.000', inf.porRegla.find((b) => b.reglaVersion === REGLA.version)!.comision === 10000);
  ok('  la vieja cobra 8.000', inf.porRegla.find((b) => b.reglaVersion === '2026-01-01.v0')!.comision === 8000);
  ok('  y el total es la suma, no el 10% de todo', inf.comision === 18000, String(inf.comision));
  ok('  la conciliación cuadra igualmente', conciliacionCuadra(inf).cuadra);
  ok('  y avisa de que hubo más de una regla', inf.avisos.some((a) => a.includes('más de una regla')));

  const filas = inf.filas.join('\n');
  ok('la fila de conciliación lleva la versión de la regla', filas.includes('2026-01-01.v0'));
}

{
  /* Cierres: antes desaparecian del informe. */
  const cerrada = {
    ...creaActivacion({ codigo: 'ATH-TRI-CCCCC', fuente: 'blog' }),
    activadoEn: '2026-09-23T12:00:00-05:00',
    redimidoEn: '2026-09-23T13:00:00-05:00',
    estado: 'NO_REDIMIDO' as const,
  };
  const inf = informeSemanal([cerrada], semanaDe('2026-09-23'));
  ok('los cierres sin consumo se cuentan', inf.cerradasSinConsumo === 1);
  ok('y no inflan la conversión', inf.conversion === 0);
}

/* ------------------------------------------------------------ */
console.log('');
servidor.close();
local.cierra();

if (fallos.length) {
  console.error(`PRUEBAS FALLIDAS: ${fallos.length} de ${hechas}`);
  for (const f of fallos) console.error(`  - ${f}`);
  console.error('');
  process.exit(1);
}
console.log(`${hechas} pruebas adversariales, todas correctas.\n`);
