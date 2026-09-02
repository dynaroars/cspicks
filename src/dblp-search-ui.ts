import { searchAuthor, fetchAuthorStats } from './dblp.js';
import { areaLabels, escapeHtml, safeExternalUrl } from './shared.js';
import type { FilteredData } from './types.js';

export function createDblpAuthorSearch(getContext: () => { appData: FilteredData, startYear: number, endYear: number, confSet: string }) {
  let sequence = 0;

  return async function searchDblpAuthors(query: string) {
    const requestSequence = ++sequence;
    const container = document.getElementById('dblp-results');
    if (!container) return;
    if (query.length < 2) {
      container.innerHTML = '';
      return;
    }

    const { appData, startYear, endYear, confSet } = getContext();
    try {
      const searchResults = await searchAuthor(query);
      if (requestSequence !== sequence) return;
      const existingNames = new Set(Object.keys(appData.professors).map(name => name.toLowerCase()));
      const candidates = searchResults.filter(author => !existingNames.has(author.name.toLowerCase())).slice(0, 10);
      const checked = await Promise.all(candidates.map(async author => {
        try {
          const stats = await fetchAuthorStats(author.pid, startYear, endYear, confSet);
          return stats?.totalAdjusted > 0 ? { ...author, stats } : null;
        } catch {
          return null;
        }
      }));
      if (requestSequence !== sequence) return;

      const authors = checked.filter(Boolean).sort((a, b) => b.stats.totalAdjusted - a.stats.totalAdjusted);
      if (!authors.length) {
        container.innerHTML = '';
        return;
      }

      container.innerHTML = `
        <div class="section-header dblp-section-header"><h3>Other Authors (DBLP)</h3></div>
        <div class="compact-list dblp-compact-list">
          ${authors.map(author => {
            const areas = Object.entries(author.stats.areas).sort(([, a], [, b]) => b.adjusted - a.adjusted);
            const pid = String(author.pid).split('/').map(encodeURIComponent).join('/');
            const url = safeExternalUrl(`https://dblp.org/pid/${pid}.html`);
            return `<div class="card collapsed compact-card">
              <button type="button" class="card-header" data-action="toggle-card"><div class="dblp-card-heading"><h2>${escapeHtml(author.name)}</h2><span class="dblp-adjusted-count">${author.stats.totalAdjusted.toFixed(1)} Adjusted Count</span></div><span class="toggle-icon">▼</span></button>
              <div class="card-content"><div class="card-subtitle">DBLP Author</div><div class="card-stats"><strong>${author.stats.totalPapers}</strong> papers (<strong>${author.stats.totalAdjusted.toFixed(1)}</strong> adjusted)</div><div class="card-links"><a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="card-link">DBLP</a></div><div class="stats-list">${areas.map(([area, stats]) => `<div class="stat-item"><span class="stat-label">${escapeHtml(areaLabels[area] || area)}</span><span class="stat-count">${stats.count} (${stats.adjusted.toFixed(1)})</span></div>`).join('')}</div></div>
            </div>`;
          }).join('')}
        </div>`;
    } catch (error) {
      console.error('DBLP search failed', error);
      if (requestSequence === sequence) container.innerHTML = '';
    }
  };
}
