import { getConferenceAreaMap, publicationMatchesConferenceSet, schoolAliases } from './data.js';
import { areaLabels, cleanName, countryFlag, escapeHtml, getConferenceLabel, scoreSuggestionMatch } from './shared.js';
import { splitComparisonQuery } from './comparison.js';

// The Search box's autocomplete: universities, professors, areas, and
// conferences, ranked by how well they match what has been typed.
//
// The list is scrollable, so groups keep enough rows to hold every plausible
// match — a surname like "Nguyen" has dozens — and each group says how many
// matches exist when it has to trim.
const GROUP_LIMITS = { schools: 12, professors: 25, areas: 8, conferences: 8 };

export function createSuggestionBox({ input, listbox, getContext, onSelect }) {
  let suggestions = [];
  let activeIndex = -1;
  let comparePrefix = '';

  const close = () => {
    suggestions = [];
    activeIndex = -1;
    listbox.hidden = true;
    listbox.innerHTML = '';
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  };

  const render = queryValue => {
    const { appData, confSet } = getContext();
    if (!appData) return close();
    // While typing "A vs B", complete the trailing side only.
    const { prefix, term } = splitComparisonQuery(queryValue);
    comparePrefix = prefix;
    const query = term.trim().toLowerCase();
    if (!query) return close();

    // Returns the trimmed rows plus how many matched in total.
    const rank = (items, limit) => {
      const matches = items
        .map(item => ({ item, score: scoreSuggestionMatch(`${item.label} ${item.searchTerms || ''}`, query) }))
        .filter(match => Number.isFinite(match.score))
        .sort((a, b) => a.score - b.score || a.item.label.localeCompare(b.item.label));
      return { items: matches.slice(0, limit).map(match => match.item), total: matches.length };
    };

    const aliasesBySchool = new Map();
    Object.entries(schoolAliases).forEach(([alias, school]) => {
      if (!aliasesBySchool.has(school)) aliasesBySchool.set(school, []);
      aliasesBySchool.get(school).push(alias);
    });

    const schools = rank(Object.values(appData.schools).map(school => ({
      kind: 'school',
      label: school.name,
      value: school.name,
      flag: countryFlag(school.country, school.countryName),
      detail: Number.isFinite(school.rank) ? `University · #${school.rank}` : 'University',
      searchTerms: (aliasesBySchool.get(school.name) || []).join(' '),
      target: { type: 'school', name: school.name }
    })), GROUP_LIMITS.schools);
    const professors = rank(Object.values(appData.professors).map(professor => ({
      kind: 'researcher',
      label: cleanName(professor.name),
      value: professor.name,
      detail: professor.affiliation || 'Professor',
      searchTerms: (professor.aliases || []).join(' '),
      target: { type: 'researcher', name: professor.name }
    })), GROUP_LIMITS.professors);
    const areas = rank(Object.entries(areaLabels).map(([key, label]) => ({
      kind: 'area', label, value: label, detail: 'Research area', searchTerms: key
    })), GROUP_LIMITS.areas);
    const conferences = rank(Object.keys(getConferenceAreaMap(confSet))
      .filter(key => publicationMatchesConferenceSet({ area: key }, confSet))
      .map(key => ({
        kind: 'conference', label: getConferenceLabel(key), value: key, detail: 'Conference'
      })), GROUP_LIMITS.conferences);

    // Only entities can be compared, so "A vs …" narrows the menu.
    const groups = (comparePrefix
      ? [['Universities', schools], ['Professors', professors]]
      : [
        ['Universities', schools],
        ['Professors', professors],
        ['Research areas', areas],
        ['Conferences', conferences]
      ]).filter(([, group]) => group.items.length);
    suggestions = groups.flatMap(([, group]) => group.items);
    activeIndex = -1;

    if (!suggestions.length) {
      listbox.innerHTML = '<div class="universal-suggestion-empty">No matching CSRankings result</div>';
    } else {
      let index = 0;
      listbox.innerHTML = groups.map(([label, group]) => `
        <div class="universal-suggestion-group">
          <span>${label}</span>
          ${group.total > group.items.length ? `<span class="universal-suggestion-count">${group.items.length} of ${group.total}</span>` : ''}
        </div>
        ${group.items.map(item => {
          const itemIndex = index++;
          return `<button type="button" id="universal-suggestion-${itemIndex}" class="universal-suggestion" role="option" data-index="${itemIndex}" aria-selected="false"><span>${item.flag || ''}${escapeHtml(item.label)}</span><small>${escapeHtml(item.detail)}</small></button>`;
        }).join('')}
      `).join('');
    }
    listbox.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  };

  const moveActive = delta => {
    if (!suggestions.length) return;
    activeIndex = (activeIndex + delta + suggestions.length) % suggestions.length;
    listbox.querySelectorAll('.universal-suggestion').forEach((element, index) => {
      const active = index === activeIndex;
      element.classList.toggle('active', active);
      element.setAttribute('aria-selected', String(active));
    });
    const activeElement = document.getElementById(`universal-suggestion-${activeIndex}`);
    if (activeElement) {
      input.setAttribute('aria-activedescendant', activeElement.id);
      activeElement.scrollIntoView({ block: 'nearest' });
    }
  };

  const choose = item => {
    if (!item) return;
    const prefix = comparePrefix;
    close();
    onSelect(item, prefix);
  };

  listbox.addEventListener('pointerdown', event => event.preventDefault());
  listbox.addEventListener('click', event => {
    const option = event.target.closest('.universal-suggestion');
    if (option) choose(suggestions[Number(option.dataset.index)]);
  });

  input.addEventListener('focus', () => render(input.value));
  input.addEventListener('blur', () => window.setTimeout(close, 120));
  input.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (listbox.hidden) render(input.value);
      moveActive(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveActive(-1);
    } else if (event.key === 'Enter' && activeIndex >= 0) {
      event.preventDefault();
      choose(suggestions[activeIndex]);
    } else if (event.key === 'Escape') {
      close();
    }
  });

  return { render, close };
}
