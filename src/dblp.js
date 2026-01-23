import { parentMap, nextTier } from './data.js';

export async function searchAuthor(name) {
    const url = `https://dblp.org/search/publ/api?q=${encodeURIComponent(name)}&format=json`;
    try {
        const res = await fetch(url);
        const data = await res.json();
        const hits = data.result.hits.hit;

        if (!hits) return [];

        const authorUrl = `https://dblp.org/search/author/api?q=${encodeURIComponent(name)}&format=json&h=60`;
        const authorRes = await fetch(authorUrl);
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

            const key = pub.getAttribute("key");
            if (!key) continue;

            const keyParts = key.split('/');
            if (keyParts.length < 2) continue;

            const confKey = keyParts[1];

            if (!parentMap[confKey]) continue;
            if (nextTier[confKey]) continue;

            // handling for article numbers (e.g., "146:1-146:12")
            const pagesNode = pub.getElementsByTagName("pages")[0];
            if (pagesNode) {
                let pagesStr = pagesNode.textContent;

                // If format is ArticleNo:PageStart-ArticleNo:PageEnd, strip ArticleNo
                // Example: 19:1-19:9 -> 1-9
                if (pagesStr.includes(':')) {
                    pagesStr = pagesStr.replace(/(\d+):/g, '');
                }

                const rangeMatch = pagesStr.match(/(\d+)-(\d+)/);
                if (rangeMatch) {
                    const start = parseInt(rangeMatch[1]);
                    const end = parseInt(rangeMatch[2]);
                    if ((end - start + 1) < 6) continue;
                } else {
                    // Fallback: If it was one of our special article venues and we couldn't find a range,
                    // we accept it (matches previous behavior for "Article 66")
                    const isArticleVenue = confKey === 'siggraph' || confKey === 'siggraph-asia' ||
                        confKey === 'pacmmod' || confKey === 'pacmpl' ||
                        confKey === 'sigsoft' || confKey === 'kbse' || confKey === 'pacmse';

                    if (!isArticleVenue) continue;
                }
            } else {
                continue;
            }

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
