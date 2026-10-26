#!/usr/bin/env node
import { checkConnectivity } from '../src/connectivity.mjs';
const r = await checkConnectivity();
console.log(JSON.stringify(r, null, 2));
process.exit(r.every((x) => x.reachable) ? 0 : 3);
