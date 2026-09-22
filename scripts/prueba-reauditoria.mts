/* ============================================================
   REGRESIONES DE LA SEGUNDA AUDITORIA — B1 a B7

     npm run prueba-reauditoria

   Cada bloque de aqui existe porque un auditor independiente rompio
   el sistema por ahi. No se prueba que el camino feliz funcione -de
   eso se encargan las otras suites-: se repite el ataque exacto.

   TODO CONTRA LO REAL

   Redis de verdad (scripts/lib/redis-local.mts), los endpoints de
   /api montados tal cual, y peticiones HTTP con sus cabeceras. Un
   hallazgo que se "corrige" y solo se comprueba contra una imitacion
   no esta comprobado.

   Y empieza por la prueba de oro: el recorrido completo, con las
   cifras del CEO, terminando en un informe que CUADRA. Si eso falla,
   lo demas da igual.
   ============================================================ */

import http from 'node:http';
import { createHash } from 'node:crypto';
import { hayRedis, levanta } from './lib/redis-local.mts';

if (!hayRedis()) {
  console.log('\n  (omitida: no hay redis-server en esta máquina)\n');
  process.exit(0);
}

const local = await levanta(6389, 6388);
process.env.KV_REST_API_URL = local.url;
process.env.KV_REST_API_TOKEN = 'prueba';

const CREDENCIAL = 'credencial-reauditoria-larga-y-aleatoria-1';
const ADMIN = 'token-admin-reauditoria-largo-1';
process.env.ATHERON_OPERADOR_LA_TRIADA = createHash('sha256').update(CREDENCIAL).digest('hex');
process.env.ATHERON_TOKEN_ADMIN = createHash('sha256').update(ADMIN).digest('hex');

const { default: activarApi } = await import('../api/activar.ts');
const { default: transaccionApi } = await import('../api/transaccion.ts');
const { default: redimirApi } = await import('../api/redimir.ts');
const { default: seguimientoApi } = await import('../api/seguimiento.ts');
const { default: reporteApi } = await import('../api/reporte.ts');
const { default: operadorApi } = await import('../api/operador.ts');
const { almacen, AlmacenMemoria } = await import('../api/_almacen.ts');
const { autoriza } = await import('../api/_autorizacion.ts');
const { activar, redimir } = await import('../api/_servicio.ts');
const { generaCredito, gasta, vincula, estadoDe, asientaVencimiento } = await import(
  '../src/data/credito-ledger.ts'
);
const { REGLA, VIGENCIA_CREDITO_DIAS } = await import('../src/data/economia-red.ts');
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
  const handler = RUTAS[new URL(peticion.url ?? '/', 'http://local').pathname];
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
await new Promise<void>((r) => servidor.listen(6387, r));
const BASE = 'http://127.0.0.1:6387';

let ipActual = '10.1.0.1';
const desdeIp = (ip: string): void => {
  ipActual = ip;
};

interface Llamada {
  estado: number;
  cuerpo: Record<string, unknown>;
  texto: string;
}

async function pide(
  ruta: string,
  opciones: { metodo?: string; cuerpo?: unknown; credencial?: string; cabeceraCruda?: string[] } = {},
): Promise<Llamada> {
  const cabeceras: [string, string][] = [
    ['content-type', 'application/json'],
    ['x-forwarded-for', ipActual],
  ];
  if (opciones.credencial) cabeceras.push(['authorization', `Bearer ${opciones.credencial}`]);
  for (const cruda of opciones.cabeceraCruda ?? []) cabeceras.push(['authorization', cruda]);

  const respuesta = await fetch(`${BASE}${ruta}`, {
    method: opciones.metodo ?? 'GET',
    headers: cabeceras,
    body: opciones.cuerpo !== undefined ? JSON.stringify(opciones.cuerpo) : undefined,
  });
  const texto = await respuesta.text();
  let cuerpo: Record<string, unknown> = {};
  try {
    cuerpo = JSON.parse(texto) as Record<string, unknown>;
  } catch {
    /* El texto crudo se comprueba aparte. */
  }
  return { estado: respuesta.status, cuerpo, texto };
}

const nuevoCodigo = async (extra: Record<string, unknown> = {}): Promise<string> => {
  const r = await pide('/api/activar', { metodo: 'POST', cuerpo: extra });
  return (r.cuerpo.datos as { codigo: string }).codigo;
};

const hoy = (): string => new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
const miembros = async (indice: string): Promise<string[]> =>
  ((await local.redis.manda(['SMEMBERS', `ath:idx:${indice}`])) as string[]) ?? [];

/* ============================================================
   PRUEBA DE ORO — el recorrido entero, con las cifras del CEO
   ============================================================ */
console.log('\n Prueba de oro: activar → redimir $100.000 → crédito $5.000 → informe');
desdeIp('10.1.0.1');

{
  const codigo = await nuevoCodigo({ fuente: 'ficha-la-triada', personas: 2 });

  const venta = await pide('/api/redimir', {
    metodo: 'POST',
    cuerpo: { codigo, consumo: 100000 },
    credencial: CREDENCIAL,
  });
  const datos = venta.cuerpo.datos as { consumo: number; comision: number };
  ok('el consumo se registra entero', datos.consumo === 100000, String(datos.consumo));
  ok('la comisión es 10.000', datos.comision === 10000, String(datos.comision));

  const tx = await deposito.lee<Record<string, never>>('tx', codigo);
  const economia = (tx as unknown as { economia: { credito: number; margen: number; consumo: number } }).economia;
  ok('el crédito del cliente es 5.000', economia.credito === 5000, String(economia.credito));
  ok('el margen de Atheron es 5.000', economia.margen === 5000, String(economia.margen));
  ok('el cliente paga 100.000: la comisión no es descuento', economia.consumo === 100000);

  const creditoId = (tx as unknown as { creditoId: string }).creditoId;
  const credito = await deposito.lee<{ valor: number; saldo: number }>('cr', creditoId);
  ok('el crédito existe en su libro, con su saldo', credito?.valor === 5000 && credito.saldo === 5000);

  const informe = await pide(`/api/reporte?fecha=${hoy()}`, { credencial: ADMIN });
  const inf = informe.cuerpo.datos as {
    cuadra: boolean;
    estado: string;
    consumoAtribuido: number;
    comision: number;
    creditoGenerado: number;
    margen: number;
    integridad: Record<string, string[]>;
    detalleConciliacion: string;
  };
  ok('el informe CUADRA', inf.cuadra === true, `${inf.estado}: ${inf.detalleConciliacion}`);
  ok('  estado explícito CUADRA', inf.estado === 'CUADRA', inf.estado);
  ok('  consumo atribuido 100.000', inf.consumoAtribuido === 100000, String(inf.consumoAtribuido));
  ok('  comisión 10.000', inf.comision === 10000);
  ok('  crédito generado 5.000', inf.creditoGenerado === 5000);
  ok('  margen 5.000', inf.margen === 5000);
  ok(
    '  sin nada que no se pueda demostrar',
    Object.values(inf.integridad).every((lista) => lista.length === 0),
    JSON.stringify(inf.integridad),
  );
}

/* ============================================================
   B1 — LOS INDICES NO SE MEZCLAN
   ============================================================ */
console.log('\n B1 · Índices de crédito y de transacción, separados');
desdeIp('10.1.0.2');

{
  const codigo = await nuevoCodigo();
  await pide('/api/redimir', { metodo: 'POST', cuerpo: { codigo, consumo: 200000 }, credencial: CREDENCIAL });

  const dia = hoy();
  const enTx = [...(await miembros(`tx:act:${dia}`)), ...(await miembros(`tx:red:${dia}`))];
  const enCr = await miembros(`cr:gen:${dia}`);

  ok('ningún crédito aparece en un índice de transacciones', !enTx.some((id) => id.startsWith('ATH-CR-')), enTx.join(','));
  ok('los créditos tienen su propio índice', enCr.length > 0 && enCr.every((id) => id.startsWith('ATH-CR-')), enCr.join(','));
  ok('y ninguna transacción se cuela en el de créditos', !enCr.some((id) => id.startsWith('ATH-TRI-')));

  const informe = await pide(`/api/reporte?fecha=${dia}`, { credencial: ADMIN });
  const inf = informe.cuerpo.datos as { cuadra: boolean; integridad: { contaminados: string[] } };
  ok('una venta normal NO sale incompleta por culpa del crédito', inf.cuadra === true);
  ok('y no hay contaminación que declarar', inf.integridad.contaminados.length === 0);
}

{
  /* Y si alguien contamina el indice a mano -datos viejos de antes
     de esta correccion-, el informe lo ve y NO liquida. */
  await local.redis.manda(['SADD', `ath:idx:tx:act:${hoy()}`, 'ATH-CR-CONTAMINA']);
  const informe = await pide(`/api/reporte?fecha=${hoy()}`, { credencial: ADMIN });
  const inf = informe.cuerpo.datos as { cuadra: boolean; estado: string; integridad: { contaminados: string[] } };
  ok('un crédito colado en el índice de tx se detecta', inf.integridad.contaminados.includes('ATH-CR-CONTAMINA'));
  ok('y el informe se declara INCOMPLETO', inf.cuadra === false && inf.estado === 'INCOMPLETO', inf.estado);
  await local.redis.manda(['SREM', `ath:idx:tx:act:${hoy()}`, 'ATH-CR-CONTAMINA']);
}

/* ============================================================
   B2 — EL SCRIPT LUA NO PUEDE DEJAR UNA ESCRITURA A MEDIAS
   ============================================================ */
console.log('\n B2 · Error de Lua con escritura parcial');
desdeIp('10.1.0.3');

{
  const codigo = await nuevoCodigo();
  const antes = await deposito.lee<{ estado: string; version: number }>('tx', codigo);

  /* El ataque exacto del auditor: dejar el indice de redenciones con
     el tipo equivocado. Antes, el script escribia el objeto y
     reventaba al llegar al SADD. */
  const manana = new Date(Date.now() + 24 * 60 * 60 * 1000 - 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
  /* Se guarda lo que habia en el indice para devolverlo despues: si
     la prueba lo destruyera, las ventas anteriores quedarian sin
     indice y el informe -con razon- dejaria de cuadrar. */
  const previos: Record<string, string[]> = {};
  for (const dia of [hoy(), manana]) {
    previos[dia] = await miembros(`tx:red:${dia}`);
    await local.redis.manda(['DEL', `ath:idx:tx:red:${dia}`]);
    await local.redis.manda(['SET', `ath:idx:tx:red:${dia}`, 'esto no es un conjunto']);
  }

  const intento = await pide('/api/redimir', {
    metodo: 'POST',
    cuerpo: { codigo, consumo: 150000 },
    credencial: CREDENCIAL,
  });
  ok('con un índice de tipo imposible, la redención NO se confirma', intento.estado !== 200, `${intento.estado}`);
  ok(
    '  y se dice que no se ha confirmado nada',
    intento.cuerpo.motivo === 'ALMACEN_INCIERTO' || intento.cuerpo.motivo === 'ERROR',
    String(intento.cuerpo.motivo),
  );

  const despues = await deposito.lee<{ estado: string; version: number }>('tx', codigo);
  ok('  NO se escribió nada: la transacción sigue igual', despues?.estado === antes?.estado && despues?.version === antes?.version, `${antes?.estado}/${antes?.version} → ${despues?.estado}/${despues?.version}`);
  ok('  y sigue sin economía', !('economia' in (despues as object)));

  for (const dia of [hoy(), manana]) {
    await local.redis.manda(['DEL', `ath:idx:tx:red:${dia}`]);
    if (previos[dia].length) await local.redis.manda(['SADD', `ath:idx:tx:red:${dia}`, ...previos[dia]]);
  }

  /* Reparado el indice, la misma peticion funciona: el sistema no se
     queda roto, solo se negaba a mentir. */
  const reintento = await pide('/api/redimir', {
    metodo: 'POST',
    cuerpo: { codigo, consumo: 150000 },
    credencial: CREDENCIAL,
  });
  ok('reparado el índice, la venta se registra sin perder nada', reintento.estado === 200);
}

/* ============================================================
   B3 — RESPUESTAS DEL ALMACEN QUE NO SON RESPUESTAS
   ============================================================ */
console.log('\n B3 · Respuestas malformadas de Redis');
desdeIp('10.1.0.4');

{
  const raras: [string, string][] = [
    ['{}', '{}'],
    ['true', 'true'],
    ['false', 'false'],
    ['[1]', '[1]'],
    ['"1"', '"1"'],
    ['null', 'null'],
    ['un objeto sin result', '{"otra":"cosa"}'],
    ['result true', '{"result":true}'],
    ['result [1]', '{"result":[1]}'],
    ['result "1"', '{"result":"1"}'],
    ['result objeto', '{"result":{"a":1}}'],
    ['result 99', '{"result":99}'],
  ];

  let colados = 0;
  for (const [nombre, cuerpoCrudo] of raras) {
    local.responde(cuerpoCrudo);
    const r = await pide('/api/activar', { metodo: 'POST', cuerpo: {} });
    local.responde(null);
    const aceptada = r.estado >= 200 && r.estado < 300;
    if (aceptada) {
      colados++;
      console.log(`         se coló: ${nombre}`);
    }
    ok(`«${nombre}» no cuenta como escritura correcta`, !aceptada, `${r.estado} ${r.texto.slice(0, 60)}`);
  }
  ok('ninguna respuesta rara se convierte en confirmación comercial', colados === 0);
}

/* ============================================================
   B4 — INTEGRIDAD EN LAS DOS DIRECCIONES
   ============================================================ */
console.log('\n B4 · Integridad y conciliación');
desdeIp('10.1.0.5');

const informeDeHoy = async (): Promise<{
  cuadra: boolean;
  estado: string;
  consumoAtribuido: number;
  integridad: Record<string, string[]>;
  detalleConciliacion: string;
}> => {
  const r = await pide(`/api/reporte?fecha=${hoy()}`, { credencial: ADMIN });
  return r.cuerpo.datos as never;
};

{
  /* Tres ventas de 100.000 cada una: 300.000 mas de lo que ya
     hubiera. Se mide el incremento, no el total: en el mismo dia hay
     ventas de los bloques anteriores. */
  const base = (await informeDeHoy()).consumoAtribuido;
  const codigos: string[] = [];
  for (let i = 0; i < 3; i++) {
    const c = await nuevoCodigo();
    await pide('/api/redimir', { metodo: 'POST', cuerpo: { codigo: c, consumo: 100000 }, credencial: CREDENCIAL });
    codigos.push(c);
  }

  /* EL ATAQUE: quitar la venta de sus indices, sin borrarla. El
     informe encontraria 200.000 y antes decia "cuadra". */
  const dia = hoy();
  await local.redis.manda(['SREM', `ath:idx:tx:act:${dia}`, codigos[0]]);
  await local.redis.manda(['SREM', `ath:idx:tx:red:${dia}`, codigos[0]]);

  const sinIndice = await informeDeHoy();
  ok('una venta sin índice NO pasa por cuadrada', sinIndice.cuadra === false, sinIndice.detalleConciliacion);
  ok('  y se dice cuánto falta por demostrar', sinIndice.estado === 'INCOMPLETO');

  /* Se devuelve a su sitio y vuelve a cuadrar. */
  await local.redis.manda(['SADD', `ath:idx:tx:act:${dia}`, codigos[0]]);
  await local.redis.manda(['SADD', `ath:idx:tx:red:${dia}`, codigos[0]]);
  const reparado = await informeDeHoy();
  ok(
    'reparado el índice, cuadra y las tres ventas suman 300.000',
    reparado.cuadra && reparado.consumoAtribuido - base === 300000,
    `${reparado.estado}: ${reparado.detalleConciliacion} · ${JSON.stringify(reparado.integridad)} · ${reparado.consumoAtribuido} - ${base}`,
  );

  /* Indice sin objeto. */
  await local.redis.manda(['DEL', `ath:tx:${codigos[1]}`]);
  const faltante = await informeDeHoy();
  ok('un índice que nombra algo que no está: INCOMPLETO', faltante.integridad.faltantes.includes(codigos[1]));
  ok('  y no cuadra', faltante.cuadra === false);

  /* Se limpia ese resto para las siguientes comprobaciones. */
  await local.redis.manda(['SREM', `ath:idx:tx:act:${dia}`, codigos[1]]);
  await local.redis.manda(['SREM', `ath:idx:tx:red:${dia}`, codigos[1]]);

  /* Ledger faltante. */
  const tx = await deposito.lee<{ creditoId: string }>('tx', codigos[2]);
  await local.redis.manda(['DEL', `ath:cr:${tx!.creditoId}`]);
  const sinLedger = await informeDeHoy();
  ok('un crédito referenciado que no existe se detecta', sinLedger.integridad.creditosFaltantes.includes(tx!.creditoId));
  ok('  y bloquea la liquidación', sinLedger.cuadra === false);

  /* TTL divergente. */
  await local.redis.manda(['DEL', `ath:tx:${codigos[2]}`]);
  await local.redis.manda(['SREM', `ath:idx:tx:act:${dia}`, codigos[2]]);
  await local.redis.manda(['SREM', `ath:idx:tx:red:${dia}`, codigos[2]]);
  await local.redis.manda(['EXPIRE', `ath:tx:${codigos[0]}`, '120']);
  const ttl = await informeDeHoy();
  ok('un registro que caduca mucho antes que su índice se detecta', ttl.integridad.ttlDivergente.includes(codigos[0]));
  ok('  y tampoco cuadra', ttl.cuadra === false);
}

{
  /* Semana vacia: ni cuadra ni no cuadra. Son cosas distintas. */
  const r = await pide('/api/reporte?fecha=2025-01-08', { credencial: ADMIN });
  const inf = r.cuerpo.datos as { cuadra: boolean; estado: string };
  ok('una semana sin datos se declara SIN_DATOS', inf.estado === 'SIN_DATOS', inf.estado);
  ok('  y no dice que cuadra', inf.cuadra === false);
}

/* ============================================================
   B5 — EL LIMITE DE CREDENCIALES CORTA ANTES DE COMPROBAR
   ============================================================ */
console.log('\n B5 · Límite de intentos de credencial');
desdeIp('10.1.0.6');

{
  /* Diez fallos. El once tiene que rebotar sin llegar a comprobar. */
  for (let i = 0; i < 10; i++) {
    await pide('/api/operador', { credencial: `mala-${i}` });
  }
  const once = await pide('/api/operador', { credencial: 'mala-11' });
  ok('el intento 11 se corta con 429', once.estado === 429, `${once.estado}`);

  /* Y la credencial BUENA tambien rebota: si no, el bloqueo no
     serviria de nada contra quien la acabe adivinando. */
  const buena = await pide('/api/operador', { credencial: CREDENCIAL });
  ok('con el cupo agotado, ni la credencial correcta entra', buena.estado === 429, `${buena.estado}`);

  /* El bloqueo vale para TODOS los endpoints protegidos. */
  const codigo = await (async () => {
    desdeIp('10.1.0.60');
    const c = await nuevoCodigo();
    desdeIp('10.1.0.6');
    return c;
  })();
  const redimir429 = await pide('/api/redimir', {
    metodo: 'POST',
    cuerpo: { codigo, consumo: 10000 },
    credencial: CREDENCIAL,
  });
  ok('  /redimir también', redimir429.estado === 429, `${redimir429.estado}`);
  const reporte429 = await pide(`/api/reporte?fecha=${hoy()}`, { credencial: ADMIN });
  ok('  /reporte también', reporte429.estado === 429, `${reporte429.estado}`);
  const transaccion429 = await pide(`/api/transaccion?c=${codigo}`, { credencial: CREDENCIAL });
  ok('  /transaccion también', transaccion429.estado === 429, `${transaccion429.estado}`);

  /* Sin credencial, /transaccion sigue sirviendo la vista del
     cliente: el bloqueo es de autenticacion, no de consulta. */
  const publica = await pide(`/api/transaccion?c=${codigo}`);
  ok('  pero la consulta pública del cliente sigue funcionando', publica.estado === 200);
}

{
  /* Una credencial equivocada en /transaccion ya no degrada en
     silencio a vista de cliente: responde 401 y cuenta el intento. */
  desdeIp('10.1.0.61');
  const codigo = await nuevoCodigo();
  const mala = await pide(`/api/transaccion?c=${codigo}`, { credencial: 'no-es-esta' });
  ok('una credencial equivocada en /transaccion da 401', mala.estado === 401, `${mala.estado}`);
}

{
  /* Cabeceras raras: 400, nunca 500. */
  desdeIp('10.1.0.62');
  const codigo = await nuevoCodigo();
  const dosVeces = await pide(`/api/transaccion?c=${codigo}`, { cabeceraCruda: ['Bearer uno', 'Bearer dos'] });
  ok('dos cabeceras de autorización dan 400', dosVeces.estado === 400, `${dosVeces.estado}`);
  const sinBearer = await pide(`/api/transaccion?c=${codigo}`, { cabeceraCruda: ['soy-un-token'] });
  ok('una credencial sin «Bearer» da 400', sinBearer.estado === 400, `${sinBearer.estado}`);
  ok('  y nunca un 500', dosVeces.estado !== 500 && sinBearer.estado !== 500);
}

{
  /* Contador roto: fail-closed en autenticacion. */
  const memoria = new AlmacenMemoria();
  memoria.contadorRoto = true;
  const veredicto = await autoriza(
    memoria,
    { authorization: `Bearer ${CREDENCIAL}` },
    'OPERADOR',
    'la-triada',
  );
  ok('si el contador no responde, NO se autentica a nadie', veredicto === 'ALMACEN', veredicto);

  /* Pero una venta ya confirmada no se toca por eso. */
  const sano = new AlmacenMemoria();
  const activada = await activar({}, sano);
  await redimir({ codigo: activada.datos!.codigo, consumo: 100000 }, sano);
  sano.contadorRoto = true;
  const guardada = await sano.lee<{ estado: string }>('tx', activada.datos!.codigo);
  ok('  y una venta ya registrada sigue registrada', guardada?.estado === 'REDIMIDO');
}

/* ============================================================
   B6 — VALIDACIONES SIN COERCION
   ============================================================ */
console.log('\n B6 · Validaciones');
desdeIp('10.1.0.7');

{
  const codigo = await nuevoCodigo();

  const cadena = await pide('/api/redimir', {
    metodo: 'POST',
    cuerpo: { codigo, consumo: '100000' },
    credencial: CREDENCIAL,
  });
  ok('el consumo "100000" (cadena) se RECHAZA', cadena.estado === 400, `${cadena.estado}`);

  for (const personas of ['3', 3.5, true, [3], '']) {
    const r = await pide('/api/redimir', {
      metodo: 'POST',
      cuerpo: { codigo, consumo: 50000, personas },
      credencial: CREDENCIAL,
    });
    ok(`personas = ${JSON.stringify(personas)} se rechaza`, r.estado === 400, `${r.estado}`);
  }

  const notaRara = await pide('/api/redimir', {
    metodo: 'POST',
    cuerpo: { codigo, consumo: 50000, nota: { texto: 'hola' } },
    credencial: CREDENCIAL,
  });
  ok('una nota que no es texto se rechaza', notaRara.estado === 400);

  const sigue = await pide(`/api/transaccion?c=${codigo}`);
  ok('tras todos esos intentos, la visita sigue ACTIVADO', (sigue.cuerpo.datos as { estado: string }).estado === 'ACTIVADO');
}

{
  /* En activar, un dato opcional invalido ya no se descarta en
     silencio: el cliente creia haberlo enviado. */
  const r = await pide('/api/activar', { metodo: 'POST', cuerpo: { personas: '4' } });
  ok('activar con personas = "4" da 400 en vez de ignorarlo', r.estado === 400, `${r.estado}`);
  const r2 = await pide('/api/activar', { metodo: 'POST', cuerpo: { contacto: 3188983167 } });
  ok('activar con un contacto que no es texto da 400', r2.estado === 400, `${r2.estado}`);
}

/* ============================================================
   B7 — CREDITO ATHERON
   ============================================================ */
console.log('\n B7 · Crédito: vencimiento, estados, idempotencia y regla');
desdeIp('10.1.0.8');

{
  /* A. El vencimiento sale de la REDENCION, no de cuando se repara
     el libro. Se borra el credito y se reintenta la redencion mas
     tarde: la fecha no puede moverse. */
  const codigo = await nuevoCodigo();
  await pide('/api/redimir', { metodo: 'POST', cuerpo: { codigo, consumo: 100000 }, credencial: CREDENCIAL });
  const tx = await deposito.lee<{ creditoId: string; redimidoEn: string }>('tx', codigo);
  const original = await deposito.lee<{ expiraEn: string }>('cr', tx!.creditoId);

  await local.redis.manda(['DEL', `ath:cr:${tx!.creditoId}`]);
  await new Promise((r) => setTimeout(r, 1100));
  await pide('/api/redimir', { metodo: 'POST', cuerpo: { codigo, consumo: 100000 }, credencial: CREDENCIAL });
  const reparado = await deposito.lee<{ expiraEn: string; generadoEn: string }>('cr', tx!.creditoId);

  ok('reparar el crédito tarde NO mueve su vencimiento', reparado?.expiraEn === original?.expiraEn, `${original?.expiraEn} → ${reparado?.expiraEn}`);
  ok('  porque se genera con el momento de la redención', reparado?.generadoEn === tx!.redimidoEn, `${reparado?.generadoEn} vs ${tx!.redimidoEn}`);

  const esperado = new Date(new Date(tx!.redimidoEn).getTime() + VIGENCIA_CREDITO_DIAS * 86400000);
  ok('  y dura exactamente la vigencia declarada', reparado!.expiraEn.slice(0, 10) === new Date(esperado.getTime() - 5 * 3600000).toISOString().slice(0, 10));
}

{
  /* B. VENCIDO no es USADO. */
  const base = generaCredito({
    valor: 5000,
    origen: { piloto: 'ATH-PILOT-001', aliado: 'la-triada', codigo: 'ATH-TRI-K7M2Q' },
    ambitos: ['HOSPEDAJE'],
    momentoComercial: new Date(),
  });
  const vinculado = vincula(base, 'cuenta:demo').credito!;
  const futuro = new Date(Date.now() + 200 * 86400000);

  const vencido = asientaVencimiento(vinculado, futuro).credito!;
  ok('un crédito vencido se lee como VENCIDO, no como usado', estadoDe(vencido, futuro) === 'VENCIDO', estadoDe(vencido, futuro));
  ok('  incluso mirándolo hoy: el asiento manda', estadoDe(vencido) === 'VENCIDO', estadoDe(vencido));

  const gastado = gasta(vinculado, 5000, 'reserva-real').credito!;
  ok('uno gastado entero se lee como AGOTADO', estadoDe(gastado) === 'AGOTADO', estadoDe(gastado));
  ok('  y su etiqueta no dice «vencido»', estadoDe(gastado) !== 'VENCIDO');
}

{
  /* D. SAME-ORDER dos veces: un solo gasto, aunque se relea la
     version nueva. Es el ataque exacto del auditor. */
  const base = generaCredito({
    valor: 5000,
    origen: { piloto: 'ATH-PILOT-001', aliado: 'la-triada', codigo: 'ATH-TRI-K7M2Q' },
    ambitos: ['HOSPEDAJE'],
    momentoComercial: new Date(),
  });
  const vinculado = vincula(base, 'cuenta:demo').credito!;

  const primero = gasta(vinculado, 2000, 'SAME-ORDER');
  ok('el primer gasto pasa', primero.ok && primero.credito!.saldo === 3000);

  /* Se relee la version nueva -como haria un reintento- y se vuelve
     a aplicar el MISMO pedido. */
  const segundo = gasta(primero.credito!, 2000, 'SAME-ORDER');
  ok('repetir SAME-ORDER no vuelve a gastar', segundo.ok === true && segundo.repetido === true);
  ok('  y el saldo sigue en 3.000', segundo.credito!.saldo === 3000, String(segundo.credito!.saldo));
  ok('  sin un segundo movimiento en el libro', segundo.credito!.movimientos.filter((m) => m.tipo === 'GASTO').length === 1);

  const otroPedido = gasta(primero.credito!, 1000, 'OTRA-ORDEN');
  ok('otro pedido distinto sí gasta', otroPedido.ok && otroPedido.credito!.saldo === 2000);
  ok('un gasto sin referencia se rechaza', gasta(vinculado, 100, '  ').fallo === 'REFERENCIA_AUSENTE');
}

{
  /* F. Credito cero no deja una referencia a un credito inexistente. */
  desdeIp('10.1.0.81');
  const codigo = await nuevoCodigo();
  await pide('/api/redimir', { metodo: 'POST', cuerpo: { codigo, consumo: 5 }, credencial: CREDENCIAL });
  const tx = await deposito.lee<{ economia: { credito: number }; creditoId?: string }>('tx', codigo);
  ok('un consumo mínimo genera crédito cero', tx!.economia.credito === 0);
  ok('  y NO deja referencia a un crédito que no existe', tx!.creditoId === undefined, String(tx!.creditoId));

  const informe = await pide(`/api/reporte?fecha=${hoy()}`, { credencial: ADMIN });
  const inf = informe.cuerpo.datos as { integridad: { creditosFaltantes: string[] } };
  ok('  y el informe no reclama ningún crédito perdido', inf.integridad.creditosFaltantes.length === 0);
}

{
  /* E. LA REGLA SE FIJA EN LA ACTIVACION.
     Se activa con 5/5, se cambia la configuracion a 6/4, y se
     redime: tiene que aplicarse la que vio el cliente. */
  desdeIp('10.1.0.82');
  const codigo = await nuevoCodigo();

  const guardados = { creditoPct: REGLA.creditoPct, margenPct: REGLA.margenPct, version: REGLA.version };
  REGLA.creditoPct = 6;
  REGLA.margenPct = 4;
  REGLA.version = '2026-12-01.v2';

  await pide('/api/redimir', { metodo: 'POST', cuerpo: { codigo, consumo: 100000 }, credencial: CREDENCIAL });

  REGLA.creditoPct = guardados.creditoPct;
  REGLA.margenPct = guardados.margenPct;
  REGLA.version = guardados.version;

  const tx = await deposito.lee<{ economia: { credito: number; margen: number; reglaVersion: string } }>('tx', codigo);
  ok('activado con 5/5 y redimido con la config en 6/4: manda el 5/5', tx!.economia.credito === 5000, String(tx!.economia.credito));
  ok('  el margen también', tx!.economia.margen === 5000, String(tx!.economia.margen));
  ok('  y queda escrito con qué versión se calculó', tx!.economia.reglaVersion === guardados.version, tx!.economia.reglaVersion);
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
console.log(`${hechas} regresiones de reauditoría, todas correctas.\n`);
