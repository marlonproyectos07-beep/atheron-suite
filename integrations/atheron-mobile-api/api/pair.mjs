// One-time owner pairing page. Vercel SSO protects this route on preview deployments.
export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");

  // Never expose the pairing key on production deployments.
  if (process.env.VERCEL_ENV !== 'preview') return res.status(404).json({ error: 'NO_DISPONIBLE' });
  if (req.method !== 'GET') return res.status(405).json({ error: 'METODO_NO_PERMITIDO' });

  const token = process.env.VERCEL_AUTOMATION_BYPASS_SECRET ?? process.env.ATHERON_MOBILE_MCP_TOKEN;
  if (typeof token !== 'string' || token.length < 32) {
    return res.status(503).json({ error: 'EMPAREJAMIENTO_NO_CONFIGURADO' });
  }

  // The Vercel SSO wall must be enabled for preview deployments. Do not add this
  // path to a custom domain or disable SSO protection for the project.
  return res.status(200).json({
    servicio: 'ATHERON_MOBILE_MCP',
    modo: 'SOLO_LECTURA',
    header: 'x-vercel-protection-bypass',
    token,
    advertencia: 'Clave privada. Guardarla en el gestor de contraseñas y no compartirla.',
  });
}
