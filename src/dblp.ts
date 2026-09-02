import { getConferenceAreaMap, parentMap, publicationMatchesConferenceSet } from './data.js';
import { readCached, writeCached } from './dblp-cache.js';
import { getCsrankingsRules, syncCsrankingsRules } from './csrankings-rules.js';
import type { AreaStats } from './types.js';

export interface DblpAuthorResult { name: string, pid: string, url: string }
export interface DblpCoauthorRecord { name: string, years: Record<string, number> }
export interface DblpAuthorStats {
    totalAdjusted: number;
    totalPapers: number;
    totalDblpPublications: number;
    areas: Record<string, AreaStats>;
    papers: Array<{ title: string | null, venue: string, year: number, adjusted: number, area: string }>;
    aliases: string[];
}

export function parseDblpProfileUrl(value: unknown) {
    try {
        const url = new URL(String(value ?? '').trim());
        const hostname = url.hostname.toLowerCase();
        const isDblpHost = hostname === 'dblp.org' || hostname === 'www.dblp.org' || hostname === 'dblp.uni-trier.de';
        if (!isDblpHost) return null;

        const match = url.pathname.match(/^\/pid\/(.+?)(?:\.(?:html|xml))?\/?$/i);
        if (!match) return null;

        const pid = match[1]
            .split('/')
            .map(segment => decodeURIComponent(segment))
            .join('/');
        if (!/^[A-Za-z0-9][A-Za-z0-9._=-]*(?:\/[A-Za-z0-9][A-Za-z0-9._=-]*)+$/.test(pid)) return null;

        return { pid, url: `https://dblp.org/pid/${pid}.html` };
    } catch {
        return null;
    }
}

export function normalizeDblpVenue(venue: string, metadata: { number?: unknown, booktitle?: unknown, year?: unknown, volume?: unknown } = {}) {
    const rules = getCsrankingsRules();
    const number = String(metadata.number || '').trim().toLowerCase();
    const booktitle = String(metadata.booktitle || '').trim();
    const year = Number(metadata.year);
    const volume = Number(metadata.volume);

    if (venue === 'pacmse') {
        if (number === 'fse') return 'fse';
        if (number === 'issta') return 'issta';
        return null;
    }
    if (venue === 'pacmpl') {
        return ['popl', 'pldi', 'oopsla', 'icfp'].includes(number) ? number : null;
    }
    if (venue === 'pacmmod') {
        if (year === 2023) return 'sigmod';
        return Number(number) === 2 ? 'pods' : 'sigmod';
    }
    if (venue === 'sigsoft') {
        return /^(?:SIGSOFT FSE|ESEC\/SIGSOFT FSE)$/i.test(booktitle) ? 'fse' : null;
    }
    if (venue === 'kbse') {
        return /^ASE(?: \(\d+\))?$/i.test(booktitle) ? 'ase' : null;
    }
    if (venue === 'tog') {
        const issue = rules.issues.tog[year];
        if (!issue || volume !== issue[0]) return null;
        if (Number(number) === issue[1]) return 'siggraph';
        if (Number(number) === issue[2]) return 'siggraph-asia';
        return null;
    }
    if (venue === 'cgf') {
        const issue = rules.issues.cgf[year];
        return issue && volume === issue[0] && Number(number) === issue[1] ? 'eurographics' : null;
    }
    if (venue === 'tvcg') {
        const issue = rules.issues.tvcg[year];
        if (!issue || volume !== issue[0]) return null;
        if (Number(number) === issue[1]) return 'vis';
        if (issue[2] !== null && Number(number) === issue[2]) return 'vr';
        return null;
    }
    if (venue === 'bioinformatics') {
        const issue = rules.issues.ismb[year];
        return issue && volume === issue[0] && String(metadata.number) === issue[1] ? 'ismb' : null;
    }
    return rules.venueAliases[venue] || venue;
}

export function hasEligiblePageRange(pages: string | null | undefined, dblpVenue: string, booktitle = '') {
    const isNeuripsKey = dblpVenue === 'nips' || dblpVenue === 'neurips';
    if (isNeuripsKey && !/^(?:nips|neurips)$/i.test(booktitle.trim())) return false;
    if (!pages) return isNeuripsKey;

    const normalizedPages = pages.replace(/(\d+):/g, '');
    const rangeMatch = normalizedPages.match(/(?:i)?(\d+)-(?:i)?(\d+)/i);
    if (rangeMatch) {
        return Number(rangeMatch[2]) - Number(rangeMatch[1]) + 1 >= 6;
    }

    return ['siggraph', 'siggraph-asia', 'pacmmod', 'pacmpl', 'sigsoft', 'kbse', 'pacmse']
        .includes(dblpVenue);
}

export async function searchAuthor(name: string): Promise<DblpAuthorResult[]> {
    try {
        const authorUrl = `https://dblp.org/search/author/api?q=${encodeURIComponent(name)}&format=json&h=60`;
        const authorRes = await fetch(authorUrl);
        if (!authorRes.ok) throw new Error(`DBLP returned ${authorRes.status}`);
        const authorData = await authorRes.json() as { result: { hits: { hit?: Array<{ info: { author: string, url: string } }> } } };
        const authorHits = authorData.result.hits.hit;

        if (!authorHits) return [];

        return authorHits.map(h => ({
            name: h.info.author,
            pid: h.info.url.split('/pid/')[1],
            url: h.info.url
        }));
    } catch (err) {
        console.error("DBLP Search Error:", err);
        return [];
    }
}

const coauthorCache = new Map<string, Promise<DblpCoauthorRecord[]>>();
const COAUTHOR_RETRY_AFTER_MS = 60_000;

// DBLP rate-limits bursts (a 429 arrives without CORS headers, so the browser
// reports it as a CORS failure). Requests are therefore serialized with a gap,
// and transient failures are retried instead of being cached as "no results".
const DBLP_REQUEST_GAP_MS = 1200;
let dblpQueue: Promise<void> = Promise.resolve();

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

function parseDblpXml(text: string) {
    const xml = new DOMParser().parseFromString(text, 'text/xml');
    if (xml.getElementsByTagName('parsererror').length > 0 || !xml.documentElement) {
        throw new Error('DBLP returned malformed XML');
    }
    return xml;
}

function queueDblpRequest<T>(task: () => Promise<T>): Promise<T> {
    const result = dblpQueue.then(task);
    dblpQueue = result.then(() => undefined, () => undefined).then(() => sleep(DBLP_REQUEST_GAP_MS));
    return result;
}

async function fetchDblp(url: string, attempts = 3): Promise<Response> {
    for (let attempt = 1; ; attempt++) {
        try {
            const response = await queueDblpRequest(() => fetch(url));
            if (response.status === 429) throw new Error('DBLP rate limit');
            if (!response.ok) throw new Error(`DBLP returned ${response.status}`);
            return response;
        } catch (error) {
            if (attempt >= attempts) throw error;
            await sleep(1500 * attempt);
        }
    }
}

/**
 * Every coauthor on an author's DBLP profile, with the years they appear.
 * DBLP is the only source that names coauthors — CSRankings publishes
 * per-author totals only — so these names are DBLP's and need not appear in the
 * CSRankings roster. Resolution requires an exact name match to avoid
 * attributing another researcher's collaborators; anything less returns nothing.
 *
 * Cached by author rather than by query window, in memory and in IndexedDB. One
 * profile answers every window, so changing the year filter no longer costs two
 * more rate-limited requests, and a returning reader pays nothing at all.
 */
async function fetchCoauthorRecords(name: string): Promise<DblpCoauthorRecord[]> {
    if (coauthorCache.has(name)) return coauthorCache.get(name);

    const request = (async () => {
        const stored = await readCached<DblpCoauthorRecord[]>(name);
        if (stored) return stored;

        const search = await fetchDblp(`https://dblp.org/search/author/api?q=${encodeURIComponent(name)}&format=json&h=60`);
        const searchData = await search.json() as { result?: { hits?: { hit?: Array<{ info?: { author?: string, url: string } }> } } };
        const hits = searchData.result?.hits?.hit || [];
        const target = hits.find(hit => hit.info?.author?.toLowerCase() === name.toLowerCase());
        if (!target) return [];

        const pid = target.info.url.split('/pid/')[1];
        const profile = await fetchDblp(`https://dblp.org/pid/${pid}.xml`);
        const xml = parseDblpXml(await profile.text());
        if (!xml.getElementsByTagName('dblpperson').length) {
            throw new Error('DBLP returned an unexpected profile document');
        }

        // The <person> block lists the author's own name variants.
        const self = new Set([name.toLowerCase()]);
        const person = xml.getElementsByTagName('person')[0];
        if (person) {
            Array.from(person.getElementsByTagName('author'))
                .forEach(node => self.add((node.textContent || '').trim().toLowerCase()));
        }

        const records = new Map<string, DblpCoauthorRecord>();
        Array.from(xml.getElementsByTagName('r')).forEach(record => {
            const publication = record.firstElementChild;
            if (!publication) return;
            const year = Number(publication.getElementsByTagName('year')[0]?.textContent);
            if (!Number.isFinite(year)) return;

            new Set(Array.from(publication.getElementsByTagName('author'))
                .map(node => (node.textContent || '').trim())
                .filter(author => author && !self.has(author.toLowerCase()))
            ).forEach(author => {
                let entry = records.get(author);
                if (!entry) records.set(author, entry = { name: author, years: {} });
                entry.years[year] = (entry.years[year] || 0) + 1;
            });
        });

        // Plain objects so the value survives IndexedDB's structured clone.
        const result = [...records.values()];
        await writeCached(name, result);
        return result;
    })().catch(error => {
        // Let a later visit try again rather than remembering the outage.
        console.error('DBLP coauthor lookup failed:', error);
        setTimeout(() => coauthorCache.delete(name), COAUTHOR_RETRY_AFTER_MS);
        return [];
    });

    coauthorCache.set(name, request);
    return request;
}

/** Top coauthors within a year window, derived from cached per-year counts. */
export function topCoauthorsInWindow(records: DblpCoauthorRecord[], { startYear, endYear, limit = 3 }: { startYear?: number, endYear?: number, limit?: number } = {}) {
    const inWindow = (year: number) => (!Number.isFinite(startYear) || year >= startYear!)
        && (!Number.isFinite(endYear) || year <= endYear!);

    return (records || [])
        .map(record => ({
            name: record.name,
            papers: Object.entries(record.years || {})
                .reduce((sum, [year, count]) => sum + (inWindow(Number(year)) ? count : 0), 0)
        }))
        .filter(record => record.papers > 0)
        .sort((a, b) => b.papers - a.papers || a.name.localeCompare(b.name))
        .slice(0, limit);
}

/** Most frequent coauthors in a year window, for the researcher summary. */
export async function fetchFrequentCoauthors(name: string, options: { startYear?: number, endYear?: number, limit?: number } = {}) {
    return topCoauthorsInWindow(await fetchCoauthorRecords(name), options);
}

export async function fetchAuthorStats(pid: string, startYear = 2015, endYear = new Date().getFullYear(), confSet = 'all-union'): Promise<DblpAuthorStats | null> {
    const url = `https://dblp.org/pid/${pid}.xml`;

    try {
        await syncCsrankingsRules();
        const res = await fetch(url);
        if (!res.ok) throw new Error(`DBLP returned ${res.status}`);

        const text = await res.text();
        const xmlDoc = parseDblpXml(text);
        if (!xmlDoc.getElementsByTagName('dblpperson').length) {
            throw new Error('DBLP returned an unexpected profile document');
        }

        // Extract author aliases from the <person> element
        const aliases: string[] = [];
        const personNode = xmlDoc.getElementsByTagName("person")[0];
        if (personNode) {
            const authorNodes = personNode.getElementsByTagName("author");
            for (let i = 0; i < authorNodes.length; i++) {
                if (authorNodes[i].textContent) aliases.push(authorNodes[i].textContent!);
            }
        }

        const stats: DblpAuthorStats = {
            totalAdjusted: 0,
            totalPapers: 0,
            totalDblpPublications: 0,
            areas: {},
            papers: [],
            aliases: aliases
        };
        const conferenceAreaMap = getConferenceAreaMap(confSet);

        const records = xmlDoc.getElementsByTagName("r");

        for (let i = 0; i < records.length; i++) {
            const record = records[i];
            const pub = record.firstElementChild;
            if (!pub) continue;

            const yearNode = pub.getElementsByTagName("year")[0];
            if (!yearNode) continue;
            const year = parseInt(yearNode.textContent || '');

            if (isNaN(year) || year < startYear || year > endYear) continue;

            stats.totalDblpPublications += 1;

            const key = pub.getAttribute("key");
            if (!key) continue;

            const keyParts = key.split('/');
            if (keyParts.length < 2) continue;

            const dblpVenue = keyParts[1];
            const booktitleNode = pub.getElementsByTagName("booktitle")[0];
            const numberNode = pub.getElementsByTagName("number")[0];
            const volumeNode = pub.getElementsByTagName("volume")[0];
            const confKey = normalizeDblpVenue(dblpVenue, {
                booktitle: booktitleNode?.textContent,
                number: numberNode?.textContent,
                volume: volumeNode?.textContent,
                year
            });

            if (!confKey || !conferenceAreaMap[confKey]) continue;
            if (!publicationMatchesConferenceSet({ area: confKey }, confSet)) continue;

            const pagesNode = pub.getElementsByTagName("pages")[0];
            if (!hasEligiblePageRange(pagesNode?.textContent, dblpVenue, booktitleNode?.textContent)) continue;

            const authors = pub.getElementsByTagName("author");
            const authorCount = authors.length || 1;

            const adjusted = 1.0 / authorCount;
            const area = conferenceAreaMap[confKey] || parentMap[confKey];

            const titleNode = pub.getElementsByTagName("title")[0];
            const title = titleNode ? titleNode.textContent : "Untitled";

            stats.totalAdjusted += adjusted;
            stats.totalPapers += 1;

            if (!stats.areas[area]) {
                stats.areas[area] = { count: 0, adjusted: 0 };
            }
            stats.areas[area].count += 1;
            stats.areas[area].adjusted += adjusted;

            stats.papers.push({
                title: title,
                venue: confKey.toUpperCase(),
                year: year,
                adjusted: adjusted,
                area: area
            });
        }

        stats.papers.sort((a, b) => b.year - a.year);
        return stats;

    } catch (err) {
        console.error("DBLP Fetch Error:", err);
        return null;
    }
}
