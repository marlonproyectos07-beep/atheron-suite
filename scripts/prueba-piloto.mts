/* ============================================================
   PRUEBAS DEL PILOTO ATHERON x LA TRIADA (ATH-PILOT-001)

     npm run prueba-piloto

   Se prueban las cuatro cosas que, si fallan, arruinan la prueba
   fisica del miercoles sin que nadie se entere hasta que sea tarde:

     1. El codigo. Que el caracter de control detecte DE VERDAD una
        letra mal copiada y dos caracteres cambiados de sitio. No se
        prueba con tres ejemplos: se prueban TODAS las sustituciones
        posibles en todas las posiciones, y todos los intercambios.

     2. La caducidad. Un codigo vale hasta el final del dia
        colombiano. La trampa esta en que Colombia es UTC-5: a las
        22:00 de Colombia en UTC ya es el dia siguiente, y una resta
        ingenua caduca el codigo cuatro horas antes de tiempo.

     3. El dinero. Redondeo al peso y total = consumo - descuento,
        nunca el porcentaje aplicado dos veces.

     4. La disciplina comercial. Que no haya ningun porcentaje
        escrito mientras la condicion no conste verificada, y que
        ninguna pagina publica enlace al piloto.

   Sin dependencias: node y ya, igual que las otras pruebas del
   repositorio.
   ============================================================ */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  ALFABETO,
  caracterControl,
  generarCodigo,
  leerCodigo,
} from '../src/data/codigos-referido.ts';
import {
  BENEFICIO,
  ENLAZADO_EN_FICHA,
  PILOTO,
  CABECERA_REGISTRO,
  calculaCuenta,
  caducaEl,
  diaColombiano,
  estaVigente,
  lineaRegistro,
  mensajeRedencion,
  pesos,
  puedePasarA,
  selloColombiano,
  type Movimiento,
} from '../src/data/piloto-la-triada.ts';

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
  ok(nombre, JSON.stringify(real) === JSON.stringify(esperado), `esperaba ${JSON.stringify(esperado)}, obtuvo ${JSON.stringify(real)}`);

/* ============================================================
   1. EL CODIGO
   ============================================================ */
console.log('\n El codigo de referido');

{
  const codigo = generarCodigo('la-triada');
  ok('generarCodigo da la forma ATH-TRI-XXXXX', /^ATH-TRI-[A-Z0-9]{5}$/.test(codigo), codigo);
  ok('y su propia lectura lo acepta', leerCodigo(codigo, 'TRI').valido, codigo);
  ok('un origen desconocido cae en GUI', /^ATH-GUI-/.test(generarCodigo('lo-que-sea')));
}

{
  /* Mil codigos seguidos: ni uno mal formado, ni uno que su propia
     lectura rechace. Es barato y cubre el sesgo del alfabeto. */
  let malos = 0;
  const vistos = new Set<string>();
  for (let i = 0; i < 1000; i++) {
    const c = generarCodigo('la-triada');
    if (!leerCodigo(c, 'TRI').valido) malos++;
    vistos.add(c);
  }
  ok('mil codigos seguidos, todos validos', malos === 0, `${malos} invalidos`);
  ok('y casi todos distintos (no hay unicidad garantizada, pero si dispersion)', vistos.size > 990, `${vistos.size} distintos de 1000`);
}

{
  ok('se admite en minusculas y sin guiones', leerCodigo('athtrik7m2q'.toLowerCase(), 'TRI').valido === leerCodigo('ATH-TRI-K7M2Q', 'TRI').valido);

  const base = generarCodigo('la-triada');
  const suelto = base.replace(/-/g, '').toLowerCase();
  const conEspacios = ` ${base.slice(0, 4)} ${base.slice(4)} `;
  igual('normaliza espacios y minusculas al mismo codigo', [leerCodigo(suelto, 'TRI').codigo, leerCodigo(conEspacios, 'TRI').codigo], [base, base]);
}

{
  igual('vacio se explica como vacio', leerCodigo('   ').motivo, 'vacio');
  igual('un texto cualquiera falla por formato', leerCodigo('hola').motivo, 'formato');
  igual('un codigo de otro aliado se rechaza', leerCodigo(generarCodigo('guia'), 'TRI').motivo, 'aliado');
  igual('una O -que no existe en el alfabeto- se senala como caracter', leerCodigo('ATH-TRI-OOOOO', 'TRI').motivo, 'caracter');
  ok('y todos los motivos traen explicacion', ['   ', 'hola', 'ATH-TRI-OOOOO'].every((t) => Boolean(leerCodigo(t, 'TRI').explicacion)));
}

{
  /* TODAS las sustituciones de un caracter, en las cinco posiciones
     del cuerpo, sobre varios codigos. Ninguna puede colarse. */
  let coladas = 0;
  let probadas = 0;
  for (let n = 0; n < 40; n++) {
    const codigo = generarCodigo('la-triada');
    const cuerpo = codigo.slice(8);
    for (let pos = 0; pos < cuerpo.length; pos++) {
      for (const c of ALFABETO) {
        if (c === cuerpo[pos]) continue;
        const roto = `ATH-TRI-${cuerpo.slice(0, pos)}${c}${cuerpo.slice(pos + 1)}`;
        probadas++;
        if (leerCodigo(roto, 'TRI').valido) coladas++;
      }
    }
  }
  ok(`ninguna sustitucion de un caracter se cuela (${probadas} probadas)`, coladas === 0, `${coladas} coladas`);
}

{
  /* Todos los intercambios de dos caracteres contiguos. */
  let coladas = 0;
  let probadas = 0;
  for (let n = 0; n < 200; n++) {
    const codigo = generarCodigo('la-triada');
    const cuerpo = codigo.slice(8);
    for (let i = 0; i < cuerpo.length - 1; i++) {
      if (cuerpo[i] === cuerpo[i + 1]) continue;
      const roto = `ATH-TRI-${cuerpo.slice(0, i)}${cuerpo[i + 1]}${cuerpo[i]}${cuerpo.slice(i + 2)}`;
      probadas++;
      if (leerCodigo(roto, 'TRI').valido) coladas++;
    }
  }
  ok(`ningun intercambio de contiguos se cuela (${probadas} probados)`, coladas === 0, `${coladas} colados`);
}

{
  /* El caracter de control depende del aliado: el mismo azar en otro
     aliado no puede dar por bueno el codigo. */
  const azar = 'K7M2';
  ok('el control cambia con el aliado', caracterControl('TRI', azar) !== caracterControl('GUI', azar));
}

/* ============================================================
   2. LA CADUCIDAD
   ============================================================ */
console.log('\n Vigencia, con Colombia en UTC-5');

{
  /* 23 de septiembre de 2026, 22:00 en Colombia = 24 a las 03:00 UTC.
     Si alguien trata el instante como UTC, cree que ya es dia 24. */
  const nocheColombiana = new Date('2026-09-24T03:00:00Z');
  igual('las 22:00 del 23 en Colombia siguen siendo dia 23', diaColombiano(nocheColombiana), '2026-09-23');

  const caduca = caducaEl(nocheColombiana);
  igual('y caducan a las 04:59:59.999 UTC del 24 (23:59:59 en Colombia)', caduca.toISOString(), '2026-09-24T04:59:59.999Z');

  ok('un minuto antes del corte, vigente', estaVigente(nocheColombiana, new Date('2026-09-24T04:58:00Z')));
  ok('en el ultimo milisegundo, vigente', estaVigente(nocheColombiana, new Date('2026-09-24T04:59:59.999Z')));
  ok('un milisegundo despues, caducado', !estaVigente(nocheColombiana, new Date('2026-09-24T05:00:00.000Z')));
}

{
  /* Activado a primera hora: no puede caducar el mismo dia por la tarde. */
  const manana = new Date('2026-09-23T13:00:00Z'); // 08:00 en Colombia
  ok('activado a las 08:00, sigue vigente a las 20:00 del mismo dia', estaVigente(manana, new Date('2026-09-24T01:00:00Z')));
  igual('el sello lleva el desfase escrito', selloColombiano(manana), '2026-09-23T08:00:00-05:00');
}

/* ============================================================
   3. EL DINERO
   ============================================================ */
console.log('\n Consumo, descuento y total');

{
  igual('120.000 al 10%', calculaCuenta(120000, 10), { consumo: 120000, porcentaje: 10, descuento: 12000, total: 108000 });
  igual('el descuento se redondea al peso', calculaCuenta(83333, 7.5), { consumo: 83333, porcentaje: 7.5, descuento: 6250, total: 77083 });
  igual('al 0% no se descuenta nada', calculaCuenta(45000, 0), { consumo: 45000, porcentaje: 0, descuento: 0, total: 45000 });
  igual('al 100% el total es cero', calculaCuenta(45000, 100), { consumo: 45000, porcentaje: 100, descuento: 45000, total: 0 });

  const c = calculaCuenta(97531, 13);
  ok('total = consumo - descuento, siempre', c.total === c.consumo - c.descuento);

  const rechaza = (consumo: number, pct: number): boolean => {
    try {
      calculaCuenta(consumo, pct);
      return false;
    } catch {
      return true;
    }
  };
  ok('un consumo negativo se rechaza', rechaza(-1, 10));
  ok('un porcentaje mayor de 100 se rechaza', rechaza(1000, 101));
  ok('un porcentaje que no es numero se rechaza', rechaza(1000, Number.NaN));

  igual('los pesos se escriben a la colombiana', [pesos(120000), pesos(1500), pesos(0)], ['$ 120.000', '$ 1.500', '$ 0']);
}

/* ============================================================
   4. ESTADOS Y REGISTRO
   ============================================================ */
console.log('\n Estados y registro');

{
  ok('de activado se puede pasar a validado', puedePasarA('ACTIVADO', 'VALIDADO'));
  ok('de validado se puede pasar a redimido', puedePasarA('VALIDADO', 'REDIMIDO'));
  ok('de activado NO se salta a redimido', !puedePasarA('ACTIVADO', 'REDIMIDO'));
  ok('redimido es final', !puedePasarA('REDIMIDO', 'NO_REDIMIDO'));
  ok('no redimido es final', !puedePasarA('NO_REDIMIDO', 'REDIMIDO'));
}

{
  const movimiento: Movimiento = {
    piloto: PILOTO.id,
    codigo: 'ATH-TRI-K7M2Q',
    aliado: PILOTO.slugAliado,
    sello: '2026-09-23T13:40:05-05:00',
    estado: 'REDIMIDO',
    ...calculaCuenta(120000, 10),
    nota: 'Mesa 4 | con un salto\nde linea',
  };

  const linea = lineaRegistro(movimiento);
  igual('la linea tiene tantas columnas como la cabecera', linea.split('|').length, CABECERA_REGISTRO.split('|').length);
  ok('ni barras ni saltos de linea se cuelan desde la nota', linea.split('|').length === 10 && !linea.includes('\n'), linea);

  const sinCuenta = lineaRegistro({ ...movimiento, estado: 'NO_REDIMIDO', consumo: undefined, porcentaje: undefined, descuento: undefined, total: undefined, nota: '' });
  igual('sin consumo, esas columnas quedan vacias', sinCuenta, `${PILOTO.id}|ATH-TRI-K7M2Q|la-triada|2026-09-23T13:40:05-05:00|NO_REDIMIDO|||||`);

  const mensaje = mensajeRedencion(movimiento);
  ok('el mensaje lleva el codigo', mensaje.includes('ATH-TRI-K7M2Q'));
  ok('el mensaje lleva la cuenta en pesos', mensaje.includes('$ 120.000') && mensaje.includes('$ 108.000'));
  ok('y termina con la fila del registro, lista para copiar', mensaje.trim().endsWith(linea));
  ok('dice de quien es el porcentaje', mensaje.includes('el que aplicó el local'));
}

/* ============================================================
   5. DISCIPLINA COMERCIAL
   ============================================================ */
console.log('\n Lo que no se publica');

{
  const verificado = BENEFICIO.estado === 'VERIFICADO';
  ok(
    'sin verificar, no hay ningun porcentaje escrito',
    verificado || BENEFICIO.porcentaje === null,
    `estado "${BENEFICIO.estado}" con porcentaje ${BENEFICIO.porcentaje}`,
  );
  ok(
    'sin verificar, no hay descripcion ni vigencia publicables',
    verificado || (BENEFICIO.descripcion === null && BENEFICIO.vigencia === null),
  );
  ok('sin verificar, la ficha publica no enlaza el piloto', verificado || ENLAZADO_EN_FICHA === false);
  ok('verificado exige evidencia', !verificado || BENEFICIO.evidencia !== null);
}

{
  /* Ninguna pagina del sitio publico puede enlazar a /piloto: si
     alguien lo enlaza, el piloto deja de ser interno sin que nadie
     lo decida. Se busca en el codigo, no en la intencion. */
  const PERMITIDOS = [
    'src/pages/piloto',
    'src/data/piloto-la-triada.ts',
    'src/components/PilotoPie.astro',
  ];

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
      /['"`]\/piloto\//.test(readFileSync(ruta, 'utf8')),
  );
  igual('ninguna pagina publica enlaza a /piloto/', intrusos, []);
}

console.log('');
if (fallos.length) {
  console.error(`PRUEBAS FALLIDAS: ${fallos.length} de ${hechas}`);
  for (const f of fallos) console.error(`  - ${f}`);
  console.error('');
  process.exit(1);
}
console.log(`${hechas} pruebas, todas correctas.\n`);
