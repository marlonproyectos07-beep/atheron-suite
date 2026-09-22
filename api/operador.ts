/* GET /api/operador — ¿esta credencial sirve para este aliado?

   Existe para que la pantalla del local pueda decir "esa credencial
   no es" en el momento de teclearla, en vez de dejar que el operador
   descubra el problema cuando ya tiene al cliente delante con la
   cuenta pedida.

   No devuelve nada mas que si vale o no. Y suma al contador de
   intentos fallidos igual que redimir: si no, seria justo la puerta
   comoda para adivinar la credencial. */
import { maneja, DEMASIADAS, type Peticion } from './_http.ts';
import { almacen } from './_almacen.ts';
import { credencialDe, esOperador, pasaLimite, quienLlama } from './_autorizacion.ts';
import { PILOTO } from '../src/data/piloto-la-triada.ts';

export default maneja('GET', async (peticion: Peticion) => {
  const deposito = almacen();
  const quien = quienLlama(peticion.headers);
  if (!(await pasaLimite(deposito, 'credencial', quien))) return DEMASIADAS;

  const operador = esOperador(credencialDe(peticion.headers), PILOTO.slugAliado);
  return {
    estado: operador ? 200 : 401,
    cuerpo: operador
      ? { ok: true, operador: true }
      : {
          ok: false,
          operador: false,
          motivo: 'NO_AUTORIZADO',
          explicacion: 'Esa credencial no es la de este local.',
        },
  };
});
