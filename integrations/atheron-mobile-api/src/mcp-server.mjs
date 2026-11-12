import { createHash, timingSafeEqual } from 'node:crypto';
import {
  createMcpHandler,
  McpServer,
  OAuthError,
  OAuthErrorCode,
  requireBearerAuth,
} from '@modelcontextprotocol/server';
import * as z from 'zod/v4';

import { vistaPublica } from '../../smoobu-odoo-connector/src/mobile-readonly.mjs';
import { summarizeMobileNight } from '../../smoobu-odoo-connector/src/mobile-availability.mjs';
import { isIsoDate } from '../../smoobu-odoo-connector/src/window.mjs';
import { loadSmoobuConfig, loadOdooConfig } from '../../smoobu-odoo-connector/src/config.mjs';
import { SmoobuClient } from '../../smoobu-odoo-connector/src/smoobu-client.mjs';
import { OdooJson2Client } from '../../smoobu-odoo-connector/src/odoo-json2-client.mjs';
import { runDaily } from '../../smoobu-odoo-connector/src/daily-run.mjs';

const READ_SCOPE = 'atheron.read';
const MCP_KEY_HEADER = 'x-vercel-protection-bypass';
const DATA_ENV = [
  'SMOOBU_API_KEY',
  'SMOOBU_API_SECRET',
  'ODOO_API_KEY',
  'ODOO_BASE_URL',
  'ODOO_DATABASE',
];

function sha(value) {
  return createHash('sha256').update(value).digest();
}

function equalSecret(expected, received) {
  if (typeof expected !== 'string' || expected.length < 32 ||
      typeof received !== 'string' || received.length < 32) return false;
  return timingSafeEqual(sha(expected), sha(received));
}

function jsonError(status, code) {
  return new Response(JSON.stringify({ error: code }), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store, private',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'none'",
    },
  });
}

function configuredData(env) {
  return DATA_ENV.every((key) => typeof env[key] === 'string' && env[key].trim().length > 0);
}

function createLiveReaders(env) {
  let clients;
  const cache = new Map();
  const pending = new Map();

  function getClients() {
    if (!configuredData(env)) throw new Error('CONFIGURACION_PENDIENTE');
    if (!clients) {
      const smoobuConfig = loadSmoobuConfig(env);
      const odooConfig = loadOdooConfig(env);
      clients = {
        smoobu: new SmoobuClient({ ...smoobuConfig, pathPrefix: '/api' }),
        odoo: new OdooJson2Client(odooConfig),
        secrets: [smoobuConfig.apiKey, smoobuConfig.apiSecret, odooConfig.apiKey],
      };
    }
    return clients;
  }

  async function reportFor(key, reportEnv) {
    const cached = cache.get(key);
    if (cached && Date.now() - cached.at < 30_000) return cached.value;
    if (pending.has(key)) return pending.get(key);

    const p = (async () => {
      const c = getClients();
      const value = await runDaily({
        smoobu: c.smoobu,
        odoo: c.odoo,
        env: reportEnv,
        watchIds: [],
        secrets: c.secrets,
      });
      if (value?.exitCode === 0) cache.set(key, { at: Date.now(), value });
      return value;
    })().finally(() => pending.delete(key));

    pending.set(key, p);
    return p;
  }

  return {
    async getSummary() {
      const report = await reportFor('summary:2d', { RECONCILE_DAYS: '2' });
      const summary = vistaPublica(report);
      if (!summary) throw new Error('FUENTE_NO_VERIFICABLE');
      return summary;
    },
    async getOccupancy(date) {
      if (!isIsoDate(date)) throw new Error('FECHA_INVALIDA');
      const report = await reportFor(`night:${date}`, { RECONCILE_FROM: date, RECONCILE_TO: date });
      const occupancy = summarizeMobileNight(report?.report, date, report?.stdout?.at);
      if (!occupancy) throw new Error(report?.stdout?.failure?.code ?? 'FUENTE_NO_VERIFICABLE');
      return occupancy;
    },
  };
}

function success(data) {
  return {
    content: [{ type: 'text', text: JSON.stringify(data) }],
    structuredContent: data,
  };
}

function failure(code) {
  return { isError: true, content: [{ type: 'text', text: code }] };
}

function safeCode(error) {
  const code = error?.message;
  return ['CONFIGURACION_PENDIENTE', 'FUENTE_NO_VERIFICABLE', 'FECHA_INVALIDA'].includes(code)
    ? code
    : 'FUENTE_NO_VERIFICABLE';
}

/**
 * Create a stateless, read-only MCP endpoint.
 * The Vercel deployment-protection bypass header doubles as the per-user API key.
 * It is verified again by this resource server after Vercel's protection layer.
 */
export function createAtheronMcpService({
  env = process.env,
  getSummary,
  getOccupancy,
} = {}) {
  const expectedToken = env.VERCEL_AUTOMATION_BYPASS_SECRET ?? env.ATHERON_MOBILE_MCP_TOKEN;
  const liveReaders = createLiveReaders(env);
  const readSummary = getSummary ?? liveReaders.getSummary;
  const readOccupancy = getOccupancy ?? liveReaders.getOccupancy;

  const verifier = {
    async verifyAccessToken(token) {
      if (!equalSecret(expectedToken, token)) {
        throw new OAuthError(OAuthErrorCode.InvalidToken, 'Invalid Atheron read-only key');
      }
      return {
        token,
        clientId: 'atheron-mobile-owner',
        scopes: [READ_SCOPE],
        // The key is independently revocable in Vercel. This expiry satisfies the MCP
        // bearer-verifier contract; rotate the Vercel bypass key at least annually.
        expiresAt: Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60,
      };
    },
  };

  const gate = requireBearerAuth({ verifier, requiredScopes: [READ_SCOPE] });

  const mcpHandler = createMcpHandler(() => {
    const server = new McpServer({ name: 'atheron-mobile', version: '0.2.0' });

    server.registerTool(
      'get_atheron_status',
      {
        title: 'Consultar estado general de Atheron',
        description: 'Consulta el resumen anonimizado de conciliación Smoobu–Odoo. Solo lectura: devuelve conteos y alertas, nunca huéspedes, documentos, datos bancarios ni saldos.',
        inputSchema: z.object({}),
        annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
      },
      async () => {
        try {
          return success(await readSummary());
        } catch (error) {
          return failure(safeCode(error));
        }
      },
    );

    server.registerTool(
      'get_room_occupancy',
      {
        title: 'Consultar ocupación por fecha',
        description: 'Consulta el listado anonimizado de reservas activas para una fecha en las cinco habitaciones físicas. No certifica disponibilidad para vender: antes de ofrecer o reservar una habitación se debe consultar la disponibilidad oficial de Smoobu. Solo lectura, sin nombres ni valores.',
        inputSchema: z.object({
          date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Fecha local de Colombia en formato YYYY-MM-DD'),
        }),
        annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
      },
      async ({ date }) => {
        try {
          return success(await readOccupancy(date));
        } catch (error) {
          return failure(safeCode(error));
        }
      },
    );

    return server;
  }, { responseMode: 'json' });

  return {
    async fetch(request) {
      if (!expectedToken || expectedToken.length < 32) return jsonError(503, 'MCP_NO_CONFIGURADO');
      if (request.method !== 'POST') return jsonError(405, 'METODO_NO_PERMITIDO');

      const supplied = request.headers.get(MCP_KEY_HEADER);
      if (!supplied) return jsonError(401, 'NO_AUTORIZADO');

      // Vercel consumes this header first to bypass deployment protection. The MCP
      // resource server independently verifies the same secret as a read-only API key.
      const headers = new Headers(request.headers);
      headers.set('Authorization', `Bearer ${supplied}`);
      const rawBody = await request.clone().text();
      const authenticatedRequest = new Request(request.url, { method: request.method, headers, body: rawBody });
      const authInfo = await gate(authenticatedRequest);
      if (authInfo instanceof Response) return authInfo;

      return mcpHandler.fetch(authenticatedRequest, { authInfo });
    },
  };
}
