import { mkdir, writeFile } from 'node:fs/promises';

const branch = process.env.VERCEL_GIT_COMMIT_REF ?? '';
const env = process.env.VERCEL_ENV ?? '';
const targetBranch = 'feature/ath-odoo-hotel-016-whatsapp-natural-media';
const callbackUrl = 'https://atheron-suite-git-feature-ath-odoo-hotel-b07d8f-marlon-atheron.vercel.app/api/hotel/webhook';
const appId = '1606991587743431'; // Atheron Hotels Pilot TEST app
const statusPath = new URL('../public/meta-preview-sync-status.json', import.meta.url);

async function saveStatus(status) {
  await mkdir(new URL('../public/', import.meta.url), { recursive: true });
  await writeFile(statusPath, JSON.stringify({ ...status, at: new Date().toISOString() }, null, 2) + '\n');
}

if (env !== 'preview' || branch !== targetBranch) {
  await saveStatus({ attempted: false, reason: 'outside_hotel_016_preview' });
  console.log('[meta-preview-subscribe] skipped outside HOTEL-016 Preview');
  process.exit(0);
}

const appSecret = process.env.META_APP_SECRET;
const verifyToken = process.env.META_VERIFY_TOKEN;
if (!appSecret || !verifyToken) {
  await saveStatus({ attempted: false, success: false, reason: 'missing_meta_config' });
  console.error('[meta-preview-subscribe] missing META_APP_SECRET or META_VERIFY_TOKEN');
  process.exit(0);
}

try {
  // Obtain a real app access token server-to-server. Never log or persist it.
  const tokenUrl = new URL('https://graph.facebook.com/oauth/access_token');
  tokenUrl.searchParams.set('client_id', appId);
  tokenUrl.searchParams.set('client_secret', appSecret);
  tokenUrl.searchParams.set('grant_type', 'client_credentials');

  const tokenResponse = await fetch(tokenUrl);
  const tokenRaw = await tokenResponse.text();
  let appAccessToken = null;
  try {
    const parsed = JSON.parse(tokenRaw);
    appAccessToken = parsed?.access_token ?? null;
  } catch {
    appAccessToken = tokenRaw.startsWith('access_token=') ? new URLSearchParams(tokenRaw).get('access_token') : null;
  }

  if (!tokenResponse.ok || !appAccessToken) {
    let detail = 'APP_TOKEN_REQUEST_FAILED';
    try {
      const parsed = JSON.parse(tokenRaw);
      detail = JSON.stringify({
        error: parsed?.error ? {
          message: parsed.error.message ?? null,
          type: parsed.error.type ?? null,
          code: parsed.error.code ?? null,
          error_subcode: parsed.error.error_subcode ?? null,
        } : null,
      });
    } catch {}
    await saveStatus({
      attempted: true,
      success: false,
      stage: 'app_access_token',
      http_status: tokenResponse.status,
      meta_result: detail,
      target: 'HOTEL-016-preview',
    });
    console.error('[meta-preview-subscribe] app access token request failed');
    process.exit(0);
  }

  const body = new URLSearchParams({
    object: 'whatsapp_business_account',
    callback_url: callbackUrl,
    fields: 'messages',
    verify_token: verifyToken,
    access_token: appAccessToken,
  });

  const response = await fetch(`https://graph.facebook.com/${appId}/subscriptions`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });

  const raw = await response.text();
  let detail = raw.slice(0, 800);
  try {
    const parsed = JSON.parse(raw);
    detail = JSON.stringify({
      success: parsed?.success ?? null,
      error: parsed?.error ? {
        message: parsed.error.message ?? null,
        type: parsed.error.type ?? null,
        code: parsed.error.code ?? null,
        error_subcode: parsed.error.error_subcode ?? null,
      } : null,
    });
  } catch {}

  await saveStatus({
    attempted: true,
    success: response.ok,
    stage: 'subscription_update',
    http_status: response.status,
    meta_result: detail,
    target: 'HOTEL-016-preview',
  });

  if (!response.ok) {
    console.error('[meta-preview-subscribe] Meta subscription update failed', response.status);
  } else {
    console.log('[meta-preview-subscribe] Meta callback updated for HOTEL-016 Preview');
  }
} catch (error) {
  await saveStatus({
    attempted: true,
    success: false,
    reason: 'network_or_runtime_error',
    error: String(error?.message ?? error).slice(0, 500),
    target: 'HOTEL-016-preview',
  });
  console.error('[meta-preview-subscribe] request failed');
}
