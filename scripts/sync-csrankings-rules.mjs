import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { CSRANKINGS_RULES_URL, parseCsrankingsRules } from '../src/csrankings-rules.js';

const response = await fetch(CSRANKINGS_RULES_URL);
if (!response.ok) throw new Error(`CSRankings returned ${response.status}`);

const rules = parseCsrankingsRules(await response.text());
rules.sourceVersion = response.headers.get('etag') || response.headers.get('last-modified') || 'upstream-current';
rules.syncedAt = new Date().toISOString();
const target = fileURLToPath(new URL('../src/csrankings-rules.generated.js', import.meta.url));
const contents = `// Generated from upstream CSRankings. Do not edit manually.\nexport default ${JSON.stringify(rules, null, 2)};\n`;
await writeFile(target, contents);
console.log(`Updated ${target} from ${CSRANKINGS_RULES_URL}`);
