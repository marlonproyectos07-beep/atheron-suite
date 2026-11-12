import { createAtheronMcpService } from '../src/mcp-server.mjs';

const service = createAtheronMcpService();

function toWebRequest(req) {
  const host = req.headers?.host ?? process.env.VERCEL_URL ?? 'localhost';
  const forwarded = req.headers?.['x-forwarded-proto'];
  const protocol = Array.isArray(forwarded) ? forwarded[0] : (forwarded ?? 'https');
  const url = new URL(req.url ?? '/api/mcp', `${protocol}://${host}`);
  const headers = new Headers();

  for (const [name, value] of Object.entries(req.headers ?? {})) {
    if (Array.isArray(value)) {
      for (const item of value) headers.append(name, String(item));
    } else if (value !== undefined) {
      headers.set(name, String(value));
    }
  }

  let body;
  if (req.method !== 'GET' && req.method !== 'HEAD' && req.body !== undefined) {
    body = typeof req.body === 'string'
      ? req.body
      : Buffer.isBuffer(req.body)
        ? req.body.toString('utf8')
        : JSON.stringify(req.body);
  }

  return new Request(url, { method: req.method, headers, body });
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, private');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'none'");

  // This endpoint is intentionally preview-only. A future production rollout
  // requires a separate CEO authorization and security review.
  if (process.env.VERCEL_ENV !== 'preview') {
    return res.status(404).json({ error: 'NO_DISPONIBLE_EN_PRODUCCION' });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'METODO_NO_PERMITIDO' });

  try {
    const response = await service.fetch(toWebRequest(req));
    response.headers.forEach((value, name) => res.setHeader(name, value));
    const payload = await response.text();
    return res.status(response.status).send(payload);
  } catch {
    return res.status(503).json({ error: 'FUENTE_NO_VERIFICABLE' });
  }
}
