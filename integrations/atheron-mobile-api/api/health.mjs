// Información de salud pública, sin cuentas, claves, datos de huéspedes ni saldos.
export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'GET') return res.status(405).json({ error: 'METODO_NO_PERMITIDO' });
  return res.status(200).json({
    servicio: 'ATHERON_MOBILE_READONLY',
    modo: 'SOLO_LECTURA',
    conexion: 'REQUIERE_CONSULTA_AUTORIZADA',
    escritura: false,
  });
}
