#!/usr/bin/env node
// Exporta el manifiesto como JSON (solo datos) para revisar el despliegue y para aplicarlo desde la consola de una copia.
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import * as m from '../src/sire-tra/manifest.mjs';

const fp = JSON.stringify({ F: m.FIELDS, S: m.SERVER_ACTIONS, V: m.VIEWS, W: m.WINDOW_ACTIONS, M: m.MENUS, A: m.AUTOMATIONS, C: m.ACLS, Y: m.SURVEY, Q: m.surveyQuestions() });
const out = { fingerprint: createHash('sha256').update(fp).digest('hex').slice(0, 16), NS: m.NS, MODELS: m.MODELS, FIELDS: m.FIELDS, ACLS: m.ACLS, SERVER_ACTIONS: m.SERVER_ACTIONS, AUTOMATIONS: m.AUTOMATIONS, MAX_COMPANIONS: m.MAX_COMPANIONS, SURVEY: m.SURVEY, QUESTIONS: m.surveyQuestions(), VIEWS: m.VIEWS, WINDOW_ACTIONS: m.WINDOW_ACTIONS, MENUS: m.MENUS, WRITABLE_MODELS: m.WRITABLE_MODELS, REQUIRED_MODELS: m.REQUIRED_MODELS };
const path = new URL('../dist/sire-tra-manifest.json', import.meta.url);
writeFileSync(path, JSON.stringify(out, null, 1));
console.log(JSON.stringify({ fingerprint: out.fingerprint }));
