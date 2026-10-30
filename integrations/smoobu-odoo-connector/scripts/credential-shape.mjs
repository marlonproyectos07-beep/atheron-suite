#!/usr/bin/env node
// ATH-DEV-022: metadatos de forma de las credenciales Smoobu configuradas. NO llama a Smoobu ni a nadie.
// Nunca imprime valores, prefijos ni sufijos: solo longitud, clases de caracteres y banderas de higiene.
import { credentialHygiene } from '../src/config.mjs';

const shape = (v) => (typeof v !== 'string' || v === '' ? { present: false } : {
  present: true, length: v.length, trimmedLength: v.trim().length,
  classes: { upper: /[A-Z]/.test(v), lower: /[a-z]/.test(v), digit: /\d/.test(v), symbol: /[^A-Za-z0-9]/.test(v) },
  looksHex: /^[0-9a-fA-F]+$/.test(v.trim()), looksBase64: /^[A-Za-z0-9+/_-]+=*$/.test(v.trim()),
});
const k = process.env.SMOOBU_API_KEY; const s = process.env.SMOOBU_API_SECRET;
const out = { network: 'ninguna', key: shape(k), secret: shape(s), hygiene: credentialHygiene(process.env), baseUrlVariableSet: Boolean(process.env.SMOOBU_BASE_URL), pairVerifiable: 'NO_VERIFICABLE_SIN_SOLICITUD_AL_SERVIDOR' };
console.log(JSON.stringify(out));
