/* ============================================================
   REGRESIONES DE LA PRUEBA LATERAL EN LA TRIADA (sept. 2026)

     npm run prueba-lateral

   Lo que cambio para la prueba con personal real, y lo que no puede
   romperse al cambiarlo:

     1. El valor se escribe como en una calculadora y se ve en pesos
        (100000 -> $ 100.000), pero al servidor llega el ENTERO.
     2. Personas sigue llegando y guardandose.
     3. La comision y el margen se siguen calculando y guardando,
        pero la pantalla del local ya no los pinta.
     4. El credito que ve el empleado es el de la regla CONGELADA de
        esa transaccion, no un 5% escrito en la pantalla.
     5. La doble redencion sigue protegida y los errores siguen
        diciendose claros.
     6. El evento interno de redencion lleva todo lo de conciliar.

   Si hay dist/ construido, se revisa ademas el HTML servido de las
   pantallas del cliente y del local.
   ============================================================ */

import { AlmacenMemoria } from '../servidor/_almacen.ts';
import { activar, redimir, eventoRedencion, consultar, type VistaCliente } from '../servidor/_servicio.ts';
import { estadoPublico } from '../servidor/estado.ts';
import { digitos, formatoCop, formateaMientrasEscribe, valorEntero } from '../src/data/importe.ts';
import type { Transaccion } from '../src/data/transacciones-red.ts';
import { codigoDeQr } from '../src/data/lector-qr.ts';
import { clasificaFallo, MENSAJE_CAMARA } from '../src/data/escaner.ts';
import { generarCodigo } from '../src/data/codigos-referido.ts';
import { existsSync, readFileSync } from 'node:fs';

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
  ok(nombre, Object.is(real, esperado), `esperado ${JSON.stringify(esperado)}, llegó ${JSON.stringify(real)}`);

/* ---------- 1. El importe ---------- */
console.log('\nImporte');
igual('100000 se ve $ 100.000', formateaMientrasEscribe('100000'), '$ 100.000');
igual('1000000 se ve $ 1.000.000', formateaMientrasEscribe('1000000'), '$ 1.000.000');
igual('lo ya formateado se relee al mismo entero', valorEntero('$ 100.000'), 100000);
igual('$ 1.000.000 es un millón, no uno', valorEntero('$ 1.000.000'), 1000000);
igual('seguir tecleando sobre lo formateado: "$ 100.0005" -> $ 1.000.005', formateaMientrasEscribe('$ 100.0005'), '$ 1.000.005');
igual('borrar un dígito: "$ 100.00" -> $ 10.000', formateaMientrasEscribe('$ 100.00'), '$ 10.000');
igual('vacío se queda vacío', formateaMientrasEscribe(''), '');
igual('sin dígitos no hay valor', valorEntero('$ '), undefined);
igual('una coma no crea decimales', valorEntero('100,5'), 1005);
igual('ceros a la izquierda fuera', digitos('000120000'), '120000');
igual('formatoCop sin decimales', formatoCop(5000), '$ 5.000');
ok('el entero nunca es fraccionario', Number.isInteger(valorEntero('$ 99.999')!));

igual('el placeholder no es un valor: campo vacío -> sin valor', valorEntero(''), undefined);
igual('120000 se ve $ 120.000', formateaMientrasEscribe('120000'), '$ 120.000');

/* ---------- Lector de QR ---------- */
console.log('\nLector de QR');
{
  const ORIGEN = 'https://atheron-suite-git-x.vercel.app';
  const OFICIAL = 'https://hotelesatheron.com';
  const cod = generarCodigo('la-triada');
  const lee = (t: string) => codigoDeQr(t, ORIGEN, OFICIAL, 'TRI', '/red/la-triada/validar');
  const bien = lee(`${ORIGEN}/red/la-triada/validar?c=${cod}`);
  ok('un QR de este sitio da el código', bien.ok && bien.codigo === cod, JSON.stringify(bien));
  const oficial = lee(`${OFICIAL}/red/la-triada/validar?c=${cod}`);
  ok('un QR del dominio oficial también', oficial.ok);
  ok('  y con www', lee(`https://www.hotelesatheron.com/red/la-triada/validar?c=${cod}`).ok);
  ok('el código suelto también', lee(cod).ok);
  const ajeno = lee(`https://evil.example.com/red/la-triada/validar?c=${cod}`);
  ok('un QR de otro origen se rechaza', !ajeno.ok && ajeno.motivo === 'OTRO_ORIGEN');
  ok('  diciendo que no es de Atheron', !ajeno.ok && ajeno.explicacion.includes('no es de Atheron'));
  const carta = lee('https://restaurante.example/menu.pdf');
  ok('la carta del restaurante no se busca', !carta.ok);
  const wifi = lee('WIFI:T:WPA;S:LaTriada;P:clave;;');
  ok('un QR de wifi no se busca', !wifi.ok);
  const roto = lee(`${ORIGEN}/red/la-triada/validar?c=ATH-TRI-AAAAA`);
  ok('un código con control malo se rechaza', !roto.ok && roto.motivo === 'INVALIDO');
  const otraRuta = lee(`${ORIGEN}/red/la-triada?c=${cod}`);
  ok('un QR de Atheron que no es de cliente se rechaza', !otraRuta.ok);
  ok('texto basura se rechaza', !lee('hola').ok);
  ok('vacío se rechaza', !lee('   ').ok);
}

/* ---------- Fallos de camara ---------- */
console.log('\nCámara');
igual('permiso rechazado -> PERMISO', clasificaFallo({ name: 'NotAllowedError' }), 'PERMISO');
igual('sin cámara -> SIN_CAMARA', clasificaFallo({ name: 'NotFoundError' }), 'SIN_CAMARA');
igual('sin trasera -> SIN_CAMARA', clasificaFallo({ name: 'OverconstrainedError' }), 'SIN_CAMARA');
igual('ocupada -> EN_USO', clasificaFallo({ name: 'NotReadableError' }), 'EN_USO');
igual('otra cosa -> ERROR', clasificaFallo(new Error('x')), 'ERROR');
ok('todos los mensajes ofrecen el código manual', Object.values(MENSAJE_CAMARA).every((m) => /manualmente/.test(m)));

/* ---------- 2-4. Backend: enteros, personas, comision interna, credito congelado ---------- */
console.log('\nBackend');
{
  const almacen = new AlmacenMemoria();
  const a = await activar({}, almacen);
  const codigo = a.datos!.codigo;

  const r = await redimir({ codigo, consumo: valorEntero('$ 100.000')!, personas: 5 }, almacen);
  ok('se redime', r.ok);
  igual('  el backend recibió el entero 100000', r.datos!.consumo, 100000);
  igual('  personas = 5', r.datos!.personas, 5);
  igual('  crédito del cliente $ 5.000 (regla vigente 10/5/5)', r.datos!.credito, 5000);
  ok('  el margen no sale hacia el operador', !('margen' in r.datos!));

  const guardada = await almacen.lee<Transaccion>('tx', codigo);
  igual('  la comisión se sigue guardando', guardada?.economia?.comision, 10000);
  igual('  el margen se sigue guardando', guardada?.economia?.margen, 5000);
  igual('  el crédito se sigue guardando', guardada?.economia?.credito, 5000);
  igual('  personas guardadas', guardada?.personas, 5);
  ok('  el crédito del ledger tiene id', typeof guardada?.creditoId === 'string');

  const ev = eventoRedencion(guardada!, true);
  igual('  evento: aliado', ev.aliado, 'la-triada');
  igual('  evento: venta', ev.consumo, 100000);
  igual('  evento: comisión', ev.comision, 10000);
  igual('  evento: crédito', ev.credito, 5000);
  igual('  evento: margen', ev.margen, 5000);
  igual('  evento: personas', ev.personas, 5);
  igual('  evento: id de transacción', ev.codigo, codigo);
  igual('  evento: id de crédito', ev.creditoId, guardada!.creditoId);
  ok('  evento: fecha/hora ISO', typeof ev.redimidoEn === 'string' && !Number.isNaN(Date.parse(String(ev.redimidoEn))));

  const segunda = await redimir({ codigo, consumo: 900000, personas: 2 }, almacen);
  ok('la doble redención sigue protegida', segunda.ok && segunda.yaRedimida === true);
  igual('  y devuelve el consumo de la primera', segunda.datos!.consumo, 100000);
  igual('  y el crédito de la primera', segunda.datos!.credito, 5000);
}

{
  /* La regla congelada manda. Se simula una activacion hecha con
     otro reparto (10 = 7 + 3): el empleado tiene que ver 7.000, no
     el 5% de la configuracion de hoy. */
  const almacen = new AlmacenMemoria();
  const a = await activar({}, almacen);
  const codigo = a.datos!.codigo;
  const tx = (await almacen.lee<Transaccion>('tx', codigo))!;
  const cambiada = { ...tx, regla: { version: 'prueba-7-3', comisionPct: 10, creditoPct: 7, margenPct: 3 }, version: tx.version + 1 };
  igual('se congela otra regla en la activación', await almacen.cambia('tx', cambiada), 'OK');
  const r = await redimir({ codigo, consumo: 100000 }, almacen);
  igual('el crédito sale de la regla congelada: $ 7.000', r.datos!.credito, 7000);
  const g = await almacen.lee<Transaccion>('tx', codigo);
  igual('  y el margen interno es 3.000', g?.economia?.margen, 3000);
}

{
  const almacen = new AlmacenMemoria();
  const a = await activar({}, almacen);
  const r = await redimir({ codigo: a.datos!.codigo, consumo: 0 }, almacen);
  ok('un consumo de cero se rechaza con motivo', !r.ok && r.motivo === 'CONSUMO_INVALIDO');
  ok('  y con una explicación legible', typeof r.explicacion === 'string' && r.explicacion.length > 10);
  const n = await redimir({ codigo: 'ATH-TRI-ZZZZZ', consumo: 1000 }, almacen);
  ok('un código que no existe se dice', !n.ok && n.motivo === 'NO_EXISTE');
}

/* ---------- Estado publico para la pantalla del cliente ---------- */
console.log('\nEstado público');
{
  const almacen = new AlmacenMemoria();
  const a = await activar({ fuente: 'hospedaje', personasPrevistas: 2, contacto: '3001234567', consienteSeguimiento: true }, almacen);
  const codigo = a.datos!.codigo;
  const antes = estadoPublico((await consultar(codigo, almacen)).datos as VistaCliente);
  igual('antes de consumir: ACTIVADO', antes.estado, 'ACTIVADO');
  ok('  sin consumo ni crédito', antes.consumo === undefined && antes.credito === undefined && antes.vigenciaCreditoDias === undefined);
  await redimir({ codigo, consumo: 100000, personas: 3 }, almacen);
  const despues = estadoPublico((await consultar(codigo, almacen)).datos as VistaCliente);
  igual('después: REDIMIDO', despues.estado, 'REDIMIDO');
  igual('  consumo 100000', despues.consumo, 100000);
  igual('  crédito 5000', despues.credito, 5000);
  igual('  vigencia 90 días', despues.vigenciaCreditoDias, 90);
  igual('  solo campos públicos', Object.keys(despues).sort().join(','), 'codigo,consumo,credito,estado,vigenciaCreditoDias,vigente');
  ok('  sin comisión, margen, personas, fuente ni contacto', !/comision|margen|personas|fuente|contacto|3001234567/.test(JSON.stringify(despues)));
  const tx = await almacen.lee<Transaccion>('tx', codigo);
  igual('  y consultar no crea otra transacción ni cambia la redimida', tx?.economia?.consumo, 100000);
}

/* ---------- 3. Lo que la pantalla NO dice ---------- */
console.log('\nPantallas');
const PROHIBIDO = /comisi[oó]n|margen|reparto|hip[oó]tesis|conciliaci[oó]n|c[oó]mo funciona por dentro|piloto interno|ATH-LOOP/i;
function textoVisible(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<head[\s\S]*?<\/head>/i, ' ')
    .replace(/<[^>]+>/g, ' ');
}
for (const pagina of ['red/la-triada/validar', 'red/la-triada', 'red/la-triada/seguimiento']) {
  const ruta = `dist/${pagina}/index.html`;
  const alternativa = `dist/${pagina}.html`;
  const archivo = existsSync(ruta) ? ruta : existsSync(alternativa) ? alternativa : '';
  if (!archivo) {
    console.log(`  (sin dist/ para ${pagina}: se omite)`);
    continue;
  }
  const visible = textoVisible(readFileSync(archivo, 'utf8'));
  const hallado = visible.match(PROHIBIDO);
  ok(`/${pagina} no enseña comisión, margen, reparto ni textos internos`, !hallado, hallado?.[0]);
}
{
  const archivo = ['dist/red/la-triada/validar/index.html', 'dist/red/la-triada/validar.html'].find((a) => existsSync(a)) ?? '';
  if (archivo) {
    const html = readFileSync(archivo, 'utf8');
    ok('la pantalla del local tiene "Escanear siguiente cliente"', html.includes('Escanear siguiente cliente'));
    ok('el QR es la acción principal', html.includes('Escanear QR del cliente'));
    ok('el código manual queda como alternativa', html.includes('Ingresar código manualmente'));
    ok('el campo del valor no trae value', !/name="consumo"[^>]*value=/.test(html));
    ok('y su ejemplo es placeholder', /name="consumo"[^>]*placeholder="Ej: \$ 100\.000"/.test(html) || /placeholder="Ej: \$ 100\.000"[^>]*name="consumo"/.test(html));
    ok('y "Crédito Atheron generado"', html.includes('Crédito Atheron generado'));
    ok('y el campo de personas', /name="personas"/.test(html));
  }
}

console.log('');
if (fallos.length) {
  console.error(`PRUEBAS FALLIDAS: ${fallos.length} de ${hechas}`);
  for (const f of fallos) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`${hechas} pruebas, todas correctas.\n`);
