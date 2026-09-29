import { startServerFromEnv } from './src/bootstrap.mjs';

const { port, dryRun } = startServerFromEnv();
// eslint-disable-next-line no-console
console.log(`[hotel-gateway] listening on :${port} (DRY_RUN=${dryRun})`);
