import { createServer } from 'node:http';
import { httpStatusForCode } from './errors.mjs';

const ROUTES = Object.freeze({
  '/hotel/availability': 'availability',
  '/hotel/quote': 'quote',
  '/hotel/hold': 'hold',
  '/hotel/status': 'status',
});

const MAX_BODY_BYTES = 64 * 1024;

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('PAYLOAD_TOO_LARGE'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (chunks.length === 0) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new Error('INVALID_JSON'));
      }
    });
    req.on('error', reject);
  });
}

function parseCredentials(req) {
  const agentId = req.headers['x-agent-id'];
  const authHeader = req.headers['authorization'] ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(authHeader);
  const rawKey = match ? match[1] : undefined;
  return { agentId, rawKey };
}

function send(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

/**
 * Crea el servidor HTTP del gateway HOTEL-007. No abre puertos por si solo:
 * quien lo importe decide cuando llamar a `.listen()` (ver README para
 * DRY_RUN y variables de entorno).
 */
export function createHotelGatewayServer({ gateway, readinessCheck = () => true }) {
  return createServer(async (req, res) => {
    try {
      if (req.method === 'GET' && req.url === '/health') {
        send(res, 200, { status: 'ok' });
        return;
      }

      if (req.method === 'GET' && req.url === '/ready') {
        const ready = Boolean(await readinessCheck());
        send(res, ready ? 200 : 503, { ready });
        return;
      }

      const operation = req.method === 'POST' ? ROUTES[req.url] : undefined;
      if (!operation) {
        send(res, httpStatusForCode('UNKNOWN_OP'), {
          ok: false,
          correlation_id: null,
          error: { code: 'UNKNOWN_OP', message: `No such endpoint: ${req.method} ${req.url}` },
        });
        return;
      }

      const { agentId, rawKey } = parseCredentials(req);
      let body;
      try {
        body = await readJsonBody(req);
      } catch {
        send(res, 400, {
          ok: false,
          correlation_id: null,
          error: { code: 'INVALID_REQUEST', message: 'Malformed JSON body' },
        });
        return;
      }

      const { envelope, code } = await gateway.handle({ operation, agentId, rawKey, body });
      const status = envelope.ok ? 200 : httpStatusForCode(code);
      send(res, status, envelope);
    } catch {
      // Fail closed: nunca se expone stack trace ni detalle interno.
      send(res, 500, {
        ok: false,
        correlation_id: null,
        error: { code: 'INTERNAL_ERROR', message: 'Unexpected gateway error' },
      });
    }
  });
}
