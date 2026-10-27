#!/usr/bin/env node
// ATH-DEV-025: SIN RED. Solo imprime MATCH / NO MATCH y el nombre de la variable con formato correcto.
import { checkCredentialSwap, renderCredentialSwap } from '../src/credential-swap.mjs';
console.log(renderCredentialSwap(checkCredentialSwap(process.env)));
