#!/usr/bin/env node
import fs from 'node:fs';

import { decodeAffiliationHistory, encodeAffiliationHistory } from '../src/affiliation-history-format.js';

const historyUrl = new URL('../public/professor_history_openalex.json', import.meta.url);
const aliasesUrl = new URL('../public/school-aliases.json', import.meta.url);
const history = decodeAffiliationHistory(JSON.parse(fs.readFileSync(historyUrl, 'utf8')));
const aliases = JSON.parse(fs.readFileSync(aliasesUrl, 'utf8'));
const compact = encodeAffiliationHistory(history, aliases);

fs.writeFileSync(historyUrl, JSON.stringify(compact));
console.log(`Compacted ${Object.keys(compact.people).length} histories using ${compact.schools.length} institutions.`);
