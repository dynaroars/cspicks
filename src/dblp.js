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

        const stats = {
            totalAdjusted: 0,
            areas: {}
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

            const pagesNode = pub.getElementsByTagName("pages")[0];
            if (!pagesNode) continue;

            const pagesStr = pagesNode.textContent;
            const rangeMatch = pagesStr.match(/(\d+)-(\d+)/);
            if (rangeMatch) {
                const start = parseInt(rangeMatch[1]);
                const end = parseInt(rangeMatch[2]);
                if ((end - start + 1) < 6) continue;
            } else {
                continue;
            }

            const authors = pub.getElementsByTagName("author");
            const authorCount = authors.length || 1;

            const adjusted = 1.0 / authorCount;
            const area = parentMap[confKey];

            stats.totalAdjusted += adjusted;
            stats.totalPapers = (stats.totalPapers || 0) + 1;

            if (!stats.areas[area]) {
                stats.areas[area] = { count: 0, adjusted: 0 };
            }
            stats.areas[area].count += 1;
            stats.areas[area].adjusted += adjusted;
        }

        return stats;

    } catch (err) {
        console.error("DBLP Fetch Error:", err);
        return null;
    }
}
