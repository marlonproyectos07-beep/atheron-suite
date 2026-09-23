/* GET /api/estado?c=ATH-TRI-XXXXX — el estado de UNA activacion,
   para la pantalla del cliente que espera con el QR abierto.

   POR QUE NO SE REUTILIZA /api/transaccion

   Sus datos serian los mismos -la vista del cliente-, pero su limite
   no: 60 consultas cada 10 minutos POR IP, compartidas con el
   operador. En La Triada el movil del cliente y el de la caja suelen
   estar en el MISMO wifi, es decir, detras de la misma IP. Un
   cliente consultando cada pocos segundos agotaria ese cupo y dejaria
   a la caja sin poder buscar codigos. Este endpoint tiene su propio
   cupo, contado por IP Y por codigo: una pantalla de cliente no le
   quita nada a otra ni a la caja.

   SOLO LECTURA, SOLO LO DEL CLIENTE, POR LISTA BLANCA

   Sale: codigo, estado, vigente, consumo, credito y la vigencia del
   credito en dias. No sale -ni puede salir, porque no se copia-:
   comision, margen, porcentajes, regla, fuente, personas, contacto,
   operador ni identificador del credito. No acepta credencial: esto
   no es una puerta al papel de operador. */
import { maneja, parametros, DEMASIADAS, type Peticion } from './_http.ts';
import { consultar, type VistaCliente } from './_servicio.ts';
import { almacen } from './_almacen.ts';
import { pasaLimite, quienLlama } from './_autorizacion.ts';
import { leerCodigo } from '../src/data/codigos-referido.ts';
import { PILOTO } from '../src/data/piloto-la-triada.ts';
import { EXPLICACION_RECHAZO } from '../src/data/transacciones-red.ts';
import { VIGENCIA_CREDITO_DIAS } from '../src/data/economia-red.ts';

export interface EstadoPublico {
  codigo: string;
  estado: VistaCliente['estado'];
  vigente: boolean;
  consumo?: number;
  credito?: number;
  vigenciaCreditoDias?: number;
}

export const estadoPublico = (v: VistaCliente): EstadoPublico => ({
  codigo: v.codigo,
  estado: v.estado,
  vigente: v.vigente,
  consumo: v.consumo,
  credito: v.credito,
  vigenciaCreditoDias: v.credito !== undefined && v.credito > 0 ? VIGENCIA_CREDITO_DIAS : undefined,
});

export default maneja('GET', async (peticion: Peticion) => {
  const deposito = almacen();
  const quien = quienLlama(peticion.headers);

  const lectura = leerCodigo(parametros(peticion).get('c') ?? '', PILOTO.codigoAliado);
  if (!lectura.valido) {
    return {
      estado: 400,
      cuerpo: { ok: false, motivo: 'CODIGO_INVALIDO', explicacion: lectura.explicacion ?? EXPLICACION_RECHAZO.CODIGO_INVALIDO },
    };
  }

  /* Dos cupos: uno por IP (corta a quien recorra codigos) y otro por
     IP y codigo (corta una pantalla desbocada sin tocar a las demas). */
  if (!(await pasaLimite(deposito, 'estado', quien))) return DEMASIADAS;
  if (!(await pasaLimite(deposito, 'estadoCodigo', `${quien}:${lectura.codigo}`))) return DEMASIADAS;

  const resultado = await consultar(lectura.codigo, deposito, { operador: false });
  if (!resultado.ok || !resultado.datos) {
    return { estado: 404, cuerpo: { ok: false, motivo: resultado.motivo, explicacion: resultado.explicacion } };
  }
  return { estado: 200, cuerpo: { ok: true, datos: estadoPublico(resultado.datos as VistaCliente) } };
});
