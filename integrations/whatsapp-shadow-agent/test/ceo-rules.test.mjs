import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CEO_CORE, CEO_SUPPLEMENT } from '../cases/ceo-extra.mjs';
import { runCase } from './support.mjs';

for (const c of [...CEO_CORE, ...CEO_SUPPLEMENT]) {
  test(`${c.id} ${c.title}`, async () => {
    const r = await runCase(c);
    assert.deepEqual(r.fails, []);
  });
}
