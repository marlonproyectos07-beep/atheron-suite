/* ============================================================
   PRUEBAS DE ATH-LOOP-002 — economia, transacciones y backend

     npm run prueba-loop002

   Se prueba lo que cuesta dinero si falla:

     1. La economia. El ejemplo del CEO -100.000 de consumo, 10.000
        de comision, 5.000 de credito, 5.000 de margen- entero, y
        ademas que credito + margen sea SIEMPRE la comision, con
        cifras feas y redondeos incomodos.

     2. La doble redencion. Es el fallo que se paga dos veces: una
        comision duplicada en la conciliacion y una discusion con el
        aliado. Se prueba secuencial y simultanea.

     3. La minimizacion de datos. Que el contacto del cliente no
        salga nunca en una respuesta de la API ni en la fila de
        conciliacion, aunque se haya guardado.

     4. El informe. Que la semana sea de lunes a domingo, que una
        transaccion cuente en la semana en que se redimio y que los
        totales cuadren con el consumo.

   El backend se prueba de verdad -con sus funciones, no con una
   imitacion-, contra un almacen en memoria que se inyecta a
   proposito. Sin servidor levantado y sin red.
   ============================================================ */

import { AlmacenMemoria } from '../servidor/_almacen.ts';
import { activar, consultar, redimir, cerrar, opinar, informe, vistaCliente } from '../servidor/_servicio.ts';
import { calculaEconomia, REGLA, VIGENCIA_CREDITO_DIAS, type ReglaEconomica } from '../src/data/economia-red.ts';
import {
  CABECERA_CONCILIACION,
  creaActivacion,
  filaConciliacion,
  normalizaContacto,
  redime,
  type Transaccion,
} from '../src/data/transacciones-red.ts';
import { informeSemanal, semanaDe, conciliacionCuadra } from '../src/data/reporte-aliado.ts';
import { leerCodigo } from '../src/data/codigos-referido.ts';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

let hechas = 0;
const fallos: string[] = [];

function ok(nombre: string, condicion: boolean, detalle = ''): void {
  hechas++;
  if (condicion) {
    console.log(`  ok   ${nombre}`);
    return;
  }
  fallos.push(nombre);
  console.log(`  FALLA ${nombre}${detalle ? `\n         ${detalle}` : ''}`);
}

const igual = (nombre: string, real: unknown, esperado: unknown): void =>
  ok(
    nombre,
    JSON.stringify(real) === JSON.stringify(esperado),
    `esperaba ${JSON.stringify(esperado)}, obtuvo ${JSON.stringify(real)}`,
  );

/* ============================================================
   1. LA ECONOMIA
   ============================================================ */
console.log('\n Economía de la red');

{
  const e = calculaEconomia(100000);
  igual('el ejemplo del CEO: 100.000 de consumo', e.consumo, 100000);
  igual('  comisión de La Triada a Atheron', e.comision, 10000);
  igual('  Crédito Atheron para el cliente', e.credito, 5000);
  igual('  margen bruto de Atheron', e.margen, 5000);
}

{
  ok('la comisión NO se le descuenta al cliente', calculaEconomia(100000).consumo === 100000);
  ok('el reparto confirmado por CEO es del 10%', REGLA.comisionPct === 10);
  ok('el reparto 5/5 sigue siendo hipótesis, no política', REGLA.estadoReparto !== 'CONFIRMADA POR CEO');
  ok('el originador no tiene porcentaje asignado', REGLA.originadorPct === null);
  ok('la comisión confirmada tiene evidencia escrita', REGLA.evidenciaComision.trim().length > 40);
}

{
  /* Cifras feas: lo que de verdad cobra un restaurante. Credito +
     margen tiene que dar la comision en todas, sin un peso suelto. */
  let descuadres = 0;
  for (let consumo = 1; consumo <= 400000; consumo += 997) {
    const e = calculaEconomia(consumo);
    if (e.credito + e.margen !== e.comision) descuadres++;
  }
  ok('crédito + margen = comisión, en 400 importes distintos', descuadres === 0, `${descuadres} descuadres`);
}

{
  const raro: ReglaEconomica = { ...REGLA, comisionPct: 7, creditoPct: 3.5, margenPct: 3.5 };
  const e = calculaEconomia(33333, raro);
  ok('con otro reparto, la suma sigue cuadrando', e.credito + e.margen === e.comision, JSON.stringify(e));
  ok('y el crédito nunca pasa de la comisión', e.credito <= e.comision);
}

{
  const rechaza = (n: number): boolean => {
    try {
      calculaEconomia(n);
      return false;
    } catch {
      return true;
    }
  };
  ok('un consumo negativo se rechaza', rechaza(-1));
  ok('un consumo que no es número se rechaza', rechaza(Number.NaN));
  igual('consumo cero da cero en todo', calculaEconomia(0), {
    consumo: 0,
    comision: 0,
    credito: 0,
    margen: 0,
    comisionPct: 10,
    creditoPct: 5,
    margenPct: 5,
    reglaVersion: REGLA.version,
  });
  ok('el crédito tiene vigencia declarada', VIGENCIA_CREDITO_DIAS > 0);
}

/* ============================================================
   2. LA TRANSACCION
   ============================================================ */
console.log('\n Transacciones y datos personales');

{
  const sinConsentir = creaActivacion({ codigo: 'ATH-TRI-K7M2Q', fuente: 'blog', personasPrevistas: 4 });
  igual('sin consentimiento no se guarda contacto', sinConsentir.consentimiento, { seguimiento: false });
  igual('la fuente se conserva', sinConsentir.fuente, 'blog');
  igual('las personas previstas se conservan', sinConsentir.personasPrevistas, 4);
  igual('el originador queda registrado', sinConsentir.originador, 'Josué');

  const marcadoPeroSinNumero = creaActivacion({
    codigo: 'ATH-TRI-K7M2Q',
    consentimiento: { seguimiento: true },
  });
  igual(
    'marcar la casilla sin dejar número no cuenta como consentimiento',
    marcadoPeroSinNumero.consentimiento,
    { seguimiento: false },
  );

  const conConsentimiento = creaActivacion({
    codigo: 'ATH-TRI-K7M2Q',
    consentimiento: { seguimiento: true, contacto: '318 898 3167' },
  });
  igual('con consentimiento y número, se guarda normalizado', conConsentimiento.consentimiento.contacto, '573188983167');
  ok('y queda la fecha del consentimiento', Boolean(conConsentimiento.consentimiento.sello));

  igual('una fuente desconocida cae en directo', creaActivacion({ codigo: 'x', fuente: 'pirata' as never }).fuente, 'directo');
  igual('un teléfono absurdo no se guarda', normalizaContacto('12'), undefined);
}

{
  const t = creaActivacion({
    codigo: 'ATH-TRI-K7M2Q',
    consentimiento: { seguimiento: true, contacto: '3188983167' },
  });
  const publica = vistaCliente(t);
  ok('la vista pública no lleva el contacto', !JSON.stringify(publica).includes('3188983167'), JSON.stringify(publica));
  /* Tampoco sale si dio consentimiento: al cliente no le aporta nada
     y al local no le incumbe. La lista blanca lo deja fuera. */
  ok('y tampoco dice si dejó consentimiento', !('seguimientoConsentido' in publica));

  const redimida = redime(t, 100000).transaccion!;
  const fila = filaConciliacion(redimida);
  ok('la fila de conciliación tampoco lleva el contacto', !fila.includes('3188983167'), fila);
  igual('y tiene tantas columnas como la cabecera', fila.split('|').length, CABECERA_CONCILIACION.split('|').length);
  ok('la fila lleva la comisión', fila.includes('|10000|'), fila);
}

{
  const t = creaActivacion({ codigo: 'ATH-TRI-K7M2Q' });
  const primera = redime(t, 100000);
  ok('la primera redención pasa', primera.ok);
  igual('la segunda se rechaza por ya redimida', redime(primera.transaccion!, 50000).motivo, 'YA_REDIMIDA');
  igual('un consumo de cero se rechaza', redime(t, 0).motivo, 'CONSUMO_INVALIDO');
  igual('un consumo absurdo se rechaza', redime(t, 99_000_000).motivo, 'CONSUMO_INVALIDO');
  igual('un número de personas imposible se rechaza', redime(t, 100000, { personas: 900 }).motivo, 'PERSONAS_INVALIDAS');
  ok('redimir no modifica la transacción original', t.estado === 'ACTIVADO');
}

/* ============================================================
   3. EL BACKEND
   ============================================================ */
console.log('\n Backend: unicidad, idempotencia y caducidad');

const almacen = new AlmacenMemoria();

{
  const r = await activar({ fuente: 'ficha-la-triada', personasPrevistas: 2 }, almacen);
  ok('activar devuelve una transacción', r.ok && Boolean(r.datos));
  const codigo = r.datos!.codigo;
  ok('con un código válido de La Triada', leerCodigo(codigo, 'TRI').valido, codigo);
  igual('en estado ACTIVADO', r.datos!.estado, 'ACTIVADO');

  const consulta = await consultar(codigo, almacen);
  ok('y se puede consultar', consulta.ok && consulta.datos?.codigo === codigo);
  ok('y consta vigente', consulta.datos?.vigente === true);

  igual('un código que no existe se dice claramente', (await consultar('ATH-TRI-K7M2Q', almacen)).motivo, 'NO_EXISTE');
}

{
  /* Doscientas activaciones: ni un codigo repetido. Esto es lo que
     el navegador no podia garantizar y el servidor si. */
  const codigos = new Set<string>();
  for (let i = 0; i < 200; i++) {
    const r = await activar({}, almacen);
    codigos.add(r.datos!.codigo);
  }
  igual('200 activaciones dan 200 códigos distintos', codigos.size, 200);
}

{
  const r = await activar({ fuente: 'hospedaje', personasPrevistas: 3 }, almacen);
  const codigo = r.datos!.codigo;

  const primera = await redimir({ codigo, consumo: 100000 }, almacen);
  ok('se redime', primera.ok);
  igual('  consumo', primera.datos!.consumo, 100000);
  igual('  comisión', primera.datos!.comision, 10000);
  /* Antes el credito no viajaba al operador. Para la prueba lateral
     (sept. 2026) direccion pidio lo contrario: el empleado le dice al
     cliente cuanto credito gano. Viaja el de la regla congelada. */
  igual('  el crédito del cliente sí sale hacia el operador (regla congelada)', primera.datos!.credito, 5000);
  /* El margen NO viaja al operador: es cuenta interna de Atheron.
     Que no este aqui es la lista blanca funcionando. */
  ok('  el margen no sale hacia el operador', !('margen' in primera.datos!));
  igual('  las personas previstas se heredan si no se corrigen', primera.datos!.personas, 3);

  const segunda = await redimir({ codigo, consumo: 900000 }, almacen);
  ok('la segunda vez NO cobra otra comisión', segunda.yaRedimida === true);
  igual('  y devuelve el mismo consumo de la primera', segunda.datos!.consumo, 100000);
  ok('  sin tratarlo como error', segunda.ok === true);

  /* Dos aparatos a la vez: el cerrojo deja pasar a uno. */
  const r2 = await activar({}, almacen);
  const [a, b] = await Promise.all([
    redimir({ codigo: r2.datos!.codigo, consumo: 50000 }, almacen),
    redimir({ codigo: r2.datos!.codigo, consumo: 70000 }, almacen),
  ]);
  const exitos = [a, b].filter((x) => x.ok && !x.yaRedimida).length;
  ok('dos confirmaciones simultáneas registran una sola', exitos === 1, `${exitos} registros`);
}

{
  const r = await activar({}, almacen);
  igual('cerrar sin consumo funciona', (await cerrar(r.datos!.codigo, almacen)).datos!.estado, 'NO_REDIMIDO');
  igual('y después ya no se puede redimir', (await redimir({ codigo: r.datos!.codigo, consumo: 1000 }, almacen)).motivo, 'CERRADA');
}

{
  /* Caducidad: se activa hoy y se intenta redimir pasado manana. */
  const r = await activar({}, almacen);
  const pasado = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
  igual('un código caducado se rechaza', (await redimir({ codigo: r.datos!.codigo, consumo: 50000 }, almacen, pasado)).motivo, 'CADUCADA');
}

{
  const r = await activar({}, almacen);
  igual('no se puede opinar de una visita que no consta', (await opinar({ codigo: r.datos!.codigo, satisfaccion: 5 }, almacen)).motivo, 'NO_EXISTE');

  await redimir({ codigo: r.datos!.codigo, consumo: 80000 }, almacen);
  const con = await opinar({ codigo: r.datos!.codigo, satisfaccion: 4, comentario: 'Muy bien', incidencia: false }, almacen);
  ok('después de redimir, sí', con.ok && con.datos!.tieneOpinion === true);

  /* Se comprueba contra el almacen, no contra la respuesta: la vista
     del cliente no devuelve el comentario a proposito. */
  const guardada = await almacen.lee<Transaccion>('tx', r.datos!.codigo);
  igual('  y queda guardada la nota', guardada!.seguimiento!.satisfaccion, 4);
  ok('  y el comentario no sale en la respuesta', !JSON.stringify(con.datos).includes('Muy bien'));

  await opinar({ codigo: r.datos!.codigo, satisfaccion: 9 }, almacen);
  const tras = await almacen.lee<Transaccion>('tx', r.datos!.codigo);
  igual('una satisfacción fuera de escala no pisa la anterior', tras!.seguimiento!.satisfaccion, 4);
  igual('  ni borra el comentario', tras!.seguimiento!.comentario, 'Muy bien');
}

/* ============================================================
   4. EL INFORME
   ============================================================ */
console.log('\n Informe semanal y conciliación');

{
  igual('el miércoles 23 cae en la semana del lunes 21', semanaDe('2026-09-23'), { lunes: '2026-09-21', domingo: '2026-09-27' });
  igual('el domingo 27 sigue en esa misma semana', semanaDe('2026-09-27').lunes, '2026-09-21');
  igual('el lunes 28 ya es la siguiente', semanaDe('2026-09-28').lunes, '2026-09-28');
}

{
  /* Un domingo que se activa y un lunes que se consume: la venta es
     de la semana del consumo, no la de la activacion. */
  const base = (codigo: string, activado: string, redimido: string, consumo: number): Transaccion => ({
    ...creaActivacion({ codigo, fuente: 'ficha-la-triada' }),
    activadoEn: activado,
    redimidoEn: redimido,
    estado: 'REDIMIDO',
    personas: 2,
    economia: calculaEconomia(consumo),
  });

  const transacciones: Transaccion[] = [
    base('ATH-TRI-AAAAA', '2026-09-20T20:00:00-05:00', '2026-09-21T13:00:00-05:00', 100000),
    base('ATH-TRI-BBBBB', '2026-09-23T12:00:00-05:00', '2026-09-23T14:00:00-05:00', 250000),
    { ...creaActivacion({ codigo: 'ATH-TRI-CCCCC', fuente: 'blog' }), activadoEn: '2026-09-22T10:00:00-05:00' },
  ];

  const inf = informeSemanal(transacciones, semanaDe('2026-09-23'));
  igual('cuenta las activaciones de la semana', inf.activaciones, 2);
  igual('cuenta las redenciones de la semana', inf.redenciones, 2);
  igual('la activación del domingo anterior no se cuenta como activación', inf.activaciones, 2);
  igual('pero su consumo del lunes sí entra', inf.consumoAtribuido, 350000);
  igual('comisión de la semana', inf.comision, 35000);
  igual('crédito generado', inf.creditoGenerado, 17500);
  igual('margen', inf.margen, 17500);
  /* Cohorte: de las DOS activaciones de la semana, una se redimió.
     Contar "redenciones de la semana / activaciones de la semana"
     daría 100% mezclando la activación del domingo anterior. */
  igual('conversión de la cohorte de la semana', inf.conversion, 50);
  igual('  y el numerador se ve', inf.cohorteRedimida, 1);
  igual('personas atendidas', inf.personasAtendidas, 4);
  ok('la fila de cabecera va primero', inf.filas[0] === CABECERA_CONCILIACION);
  /* Cabecera + las tres transacciones de la semana: activaciones,
     redenciones y cierres. Con solo las redenciones no se puede
     reconstruir la semana. */
  igual('las filas reconstruyen la semana entera', inf.filas.length, 4);
  ok('avisa de que el reparto es una hipótesis', inf.avisos.some((a) => a.includes('hipótesis')));
  ok('avisa de que el originador no se liquida', inf.avisos.some((a) => a.includes('originador')));

  const cuadre = conciliacionCuadra(inf);
  ok('la conciliación cuadra', cuadre.cuadra, cuadre.detalle);

  const roto = conciliacionCuadra({
    ...inf,
    porRegla: inf.porRegla.map((b) => ({ ...b, credito: 1 })),
  });
  ok('y detecta un descuadre si alguien toca una cifra', !roto.cuadra, roto.detalle);
}

{
  const inf = await informe('2026-09-23', almacen);
  ok('el informe del backend responde', inf.ok);
  ok('y trae su comprobación de conciliación', typeof inf.datos!.cuadra === 'boolean');
  ok('y no declara cuadrada una semana sin redenciones', inf.datos!.redenciones > 0 || !inf.datos!.cuadra);
  ok('ninguna fila del informe lleva un teléfono', !inf.datos!.filas.join('\n').match(/\b57\d{10}\b/));
}

/* ============================================================
   5. SIGUE SIN SER PUBLICO
   ============================================================ */
console.log('\n Lo que no se publica');

{
  /* Igual que el piloto tecnico: ninguna pagina del sitio publico
     puede enlazar /red/la-triada. Que sea interno no puede depender
     de que nadie se despiste un martes. */
  const PERMITIDOS = ['src/pages/red', 'src/data/api-red.ts', 'src/components/RedPie.astro'];
  const archivos: string[] = [];
  const recorre = (dir: string): void => {
    for (const nombre of readdirSync(dir)) {
      const ruta = join(dir, nombre);
      if (statSync(ruta).isDirectory()) recorre(ruta);
      else if (/\.(astro|ts|mjs|md)$/.test(nombre)) archivos.push(ruta);
    }
  };
  recorre('src');

  const intrusos = archivos.filter(
    (ruta) =>
      !PERMITIDOS.some((p) => ruta.replace(/\\/g, '/').startsWith(p)) &&
      /['"`]\/red\/la-triada/.test(readFileSync(ruta, 'utf8')),
  );
  igual('ninguna página pública enlaza a /red/la-triada', intrusos, []);

  const sitemap = readFileSync('src/pages/sitemap.xml.ts', 'utf8');
  ok('el sitemap no menciona el piloto', !sitemap.includes('/red/') && !sitemap.includes('/piloto/'));
}

/* ============================================================
   CLASIFICACION DE FALLOS — LO QUE VE EL CLIENTE CUANDO ALGO FALLA

   En la prueba fisica, la funcion de Vercel devolvio un 500 con una
   pagina de error HTML, y el cliente leyo que "el registro central
   todavia no esta configurado". Era falso: Redis ya estaba puesto.
   El mensaje mandaba a arreglar lo que no estaba roto.

   Aqui se comprueban las cuatro clases contra el clasificador de
   verdad. Lo unico que se sustituye es el transporte -fetch-, que
   es la parte que no se puede provocar de otra manera; la decision,
   que es lo que fallaba, es la real.
   ============================================================ */
console.log('\n Cuando algo falla, se acusa al sitio correcto');
{
  const { activar: pideActivar, MENSAJE_FALLO, SIN_ALMACEN_CONFIGURADO } = await import('../src/data/api-red.ts');
  const originalFetch = globalThis.fetch;

  const con = async (
    responder: () => Response | Promise<Response> | never,
  ): Promise<{ clase?: string; explicacion?: string; ok: boolean; motivo?: string }> => {
    globalThis.fetch = (async () => responder()) as typeof fetch;
    try {
      return await pideActivar({});
    } finally {
      globalThis.fetch = originalFetch;
    }
  };

  const json = (estado: number, cuerpo: unknown): Response =>
    new Response(JSON.stringify(cuerpo), { status: estado, headers: { 'content-type': 'application/json' } });
  const html = (estado: number): Response =>
    new Response('<!doctype html><title>500</title>', { status: estado, headers: { 'content-type': 'text/html' } });

  /* 1. El movil no llego a salir. */
  {
    const r = await con(() => {
      throw new TypeError('Failed to fetch');
    });
    igual('sin red, el fallo es de RED', r.clase, 'RED');
    ok('  y se le dice que revise la conexión', r.explicacion === MENSAJE_FALLO.RED, r.explicacion);
  }

  /* 2. EL FALLO DE LA PRUEBA FISICA, exactamente. */
  {
    const r = await con(() => html(500));
    igual('un 500 con HTML es fallo de SERVIDOR', r.clase, 'SERVIDOR');
    ok(
      '  y NO se le dice que falte configurar el almacén',
      !(r.explicacion ?? '').includes('no está configurado'),
      r.explicacion,
    );
    ok('  el mensaje no lleva jerga técnica', !/500|módulo|module|deploy|bundle/i.test(r.explicacion ?? ''), r.explicacion);
  }

  /* 3. La funcion ni existe en este despliegue. */
  {
    const r = await con(() => html(404));
    igual('un 404 es fallo de API, no de almacén', r.clase, 'API');
    ok('  con mensaje de "vuelve a intentarlo"', r.explicacion === MENSAJE_FALLO.API, r.explicacion);
  }

  /* 4. El almacen de verdad no esta configurado: aqui SI se dice. */
  {
    const r = await con(() => json(503, { ok: false, motivo: 'ALMACEN_NO_CONFIGURADO' }));
    igual('el almacén sin configurar se clasifica como ALMACEN', r.clase, 'ALMACEN');
    ok('  y ese sí lleva la explicación completa', r.explicacion === SIN_ALMACEN_CONFIGURADO, r.explicacion);
  }

  /* 5. El almacen existe y contesto mal: se reintenta, no se
        manda a configurar nada. */
  {
    const r = await con(() => json(503, { ok: false, motivo: 'ALMACEN_INCIERTO' }));
    igual('un almacén que contesta mal también es ALMACEN', r.clase, 'ALMACEN');
    ok(
      '  pero NO dice que falte configurarlo: eso ya está hecho',
      r.explicacion === MENSAJE_FALLO.ALMACEN,
      r.explicacion,
    );
  }

  /* 6. Un problema del dato conserva lo que dijo el servidor. */
  {
    const r = await con(() => json(400, { ok: false, motivo: 'PERSONAS_INVALIDAS', explicacion: 'Dime cuántos sois.' }));
    ok('un 400 con explicación propia la conserva', r.explicacion === 'Dime cuántos sois.', r.explicacion);
    ok('  y no se marca como fallo de servidor', r.clase === undefined, String(r.clase));
  }

  /* 7. Y un 429 sin texto no acusa a nadie. */
  {
    const r = await con(() => json(429, { ok: false, motivo: 'DEMASIADAS_PETICIONES' }));
    igual('un rechazo sin texto se clasifica como DATOS', r.clase, 'DATOS');
  }

  /* 8. Lo que va bien, pasa intacto. */
  {
    const r = await con(() => json(201, { ok: true, datos: { codigo: 'ATH-TRI-K7M2Q' } }));
    ok('una respuesta correcta pasa sin tocarse', r.ok === true && r.clase === undefined);
  }
}

console.log('');
if (fallos.length) {
  console.error(`PRUEBAS FALLIDAS: ${fallos.length} de ${hechas}`);
  for (const f of fallos) console.error(`  - ${f}`);
  console.error('');
  process.exit(1);
}
console.log(`${hechas} pruebas, todas correctas.\n`);
