import { parentMap, nextTier } from './data.js';
import { getCsrankingsRules, syncCsrankingsRules } from './csrankings-rules.js';

export function normalizeDblpVenue(venue, metadata = {}) {
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

export function hasEligiblePageRange(pages, dblpVenue, booktitle = '') {
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

export async function searchAuthor(name) {
    try {
        const authorUrl = `https://dblp.org/search/author/api?q=${encodeURIComponent(name)}&format=json&h=60`;
        const authorRes = await fetch(authorUrl);
        if (!authorRes.ok) throw new Error(`DBLP returned ${authorRes.status}`);
        const authorData = await authorRes.json();
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

export async function fetchAuthorStats(pid, startYear = 2015, endYear = new Date().getFullYear()) {
    const url = `https://dblp.org/pid/${pid}.xml`;

    try {
        await syncCsrankingsRules();
        const res = await fetch(url);
        if (!res.ok) throw new Error(`DBLP returned ${res.status}`);

        const text = await res.text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(text, "text/xml");

        // Extract author aliases from the <person> element
        const aliases = [];
        const personNode = xmlDoc.getElementsByTagName("person")[0];
        if (personNode) {
            const authorNodes = personNode.getElementsByTagName("author");
            for (let i = 0; i < authorNodes.length; i++) {
                aliases.push(authorNodes[i].textContent);
            }
        }

        const stats = {
            totalAdjusted: 0,
            totalPapers: 0,
            totalDblpPublications: 0,
            areas: {},
            papers: [],
            aliases: aliases
        };

        const records = xmlDoc.getElementsByTagName("r");

        for (let i = 0; i < records.length; i++) {
            const record = records[i];
            const pub = record.firstElementChild;
            if (!pub) continue;

            const yearNode = pub.getElementsByTagName("year")[0];
            if (!yearNode) continue;
            const year = parseInt(yearNode.textContent);

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

            if (!confKey || !parentMap[confKey]) continue;
            if (nextTier[confKey]) continue;

            const pagesNode = pub.getElementsByTagName("pages")[0];
            if (!hasEligiblePageRange(pagesNode?.textContent, dblpVenue, booktitleNode?.textContent)) continue;

            const authors = pub.getElementsByTagName("author");
            const authorCount = authors.length || 1;

            const adjusted = 1.0 / authorCount;
            const area = parentMap[confKey];

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
                authors: authorCount,
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
