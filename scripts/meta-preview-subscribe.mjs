const branch = process.env.VERCEL_GIT_COMMIT_REF ?? '';
const env = process.env.VERCEL_ENV ?? '';
const targetBranch = 'feature/ath-odoo-hotel-016-whatsapp-natural-media';
const callbackUrl = 'https://atheron-suite-git-feature-ath-odoo-hotel-b07d8f-marlon-atheron.vercel.app/api/hotel/webhook';
const appId = '1606991587743431';

if (env !== 'preview' || branch !== targetBranch) {
  console.log('[meta-preview-subscribe] skipped outside HOTEL-016 Preview');
  process.exit(0);
}

const appSecret = process.env.META_APP_SECRET;
const verifyToken = process.env.META_VERIFY_TOKEN;
if (!appSecret || !verifyToken) {
  console.error('[meta-preview-subscribe] missing META_APP_SECRET or META_VERIFY_TOKEN');
  process.exit(1);
}

const body = new URLSearchParams({
  object: 'whatsapp_business_account',
  callback_url: callbackUrl,
  fields: 'messages',
  verify_token: verifyToken,
  access_token: `${appId}|${appSecret}`,
});

const response = await fetch(`https://graph.facebook.com/${appId}/subscriptions`, {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body,
});

const text = await response.text();
if (!response.ok) {
  console.error('[meta-preview-subscribe] Meta subscription update failed', response.status, text.slice(0, 500));
  process.exit(1);
}
console.log('[meta-preview-subscribe] Meta callback updated for HOTEL-016 Preview');
