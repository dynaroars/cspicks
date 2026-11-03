/**
 * Browser-local application tracking for starred items (jobs, awards, fellowships): one status per item id,
 * kept next to the ★ favorites (localStorage, no account). Shown on starred cards, searchable with `progress:`,
 * and included in the Markdown export.
 */
import { parseKeywordQuery } from './search-keywords.js';
import type { KeywordSpec } from './search-keywords.js';

export const PROGRESS_LABELS = {
  preparing: 'Preparing',
  applied: 'Applied',
  interviewing: 'Interviewing',
  offer: 'Offer',
  declined: 'Declined / rejected'
} as const;

export type ProgressStatus = keyof typeof PROGRESS_LABELS;

export const PROGRESS_SEARCH_CHOICES = {
  any: 'Any status set',
  ...PROGRESS_LABELS,
  none: 'No status yet'
};

export const PROGRESS_KEYWORD_SPEC: KeywordSpec = {
  key: 'progress',
  aliases: ['applied', 'application'],
  example: 'progress: applied',
  description: 'Your own application status on starred items (kept in this browser): any, none, preparing, applied, interviewing, offer, or declined'
};

const isStatus = (value: unknown): value is ProgressStatus => typeof value === 'string' && value in PROGRESS_LABELS;

function storage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

export interface ProgressStore {
  get: (id: string) => ProgressStatus | undefined;
  /** An empty or unknown status clears the entry. Throws when storage is blocked. */
  set: (id: string, status: string) => void;
  all: () => Record<string, ProgressStatus>;
}

export function createProgressStore(storageKey: string): ProgressStore {
  function load(): Record<string, ProgressStatus> {
    try {
      const parsed: unknown = JSON.parse(storage()?.getItem(storageKey) ?? '{}');
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
      return Object.fromEntries(Object.entries(parsed).filter(([, value]) => isStatus(value))) as Record<string, ProgressStatus>;
    } catch {
      return {};
    }
  }
  return {
    get: id => load()[id],
    set: (id, status) => {
      const local = storage();
      if (!local) throw new Error('Browser storage is unavailable');
      const all = load();
      if (isStatus(status)) all[id] = status; else delete all[id];
      local.setItem(storageKey, JSON.stringify(all));
    },
    all: load
  };
}

/** `progress:` keyword: a status, `any` (some status set), or `none`. */
export function progressMatches(status: ProgressStatus | undefined, value: string) {
  if (value === 'any' || value === 'yes' || value === 'tracked') return Boolean(status);
  if (value === 'none' || value === 'no') return !status;
  if (value === 'rejected') return status === 'declined';
  if (value === 'interview') return status === 'interviewing';
  return status === value;
}

/** Filter a list of items by the `progress:` keyword in `query` using the given progress store. */
export function filterByProgress<T>(items: T[], query: string, specs: KeywordSpec[], getId: (item: T) => string, store: ProgressStore): T[] {
  const values = parseKeywordQuery(query, specs).filters.progress;
  return values?.length ? items.filter(item => values.some(value => progressMatches(store.get(getId(item)), value))) : items;
}

/** Delegated change listener for `[data-progress-id]` selects inside `container`. */
export function wireProgressPickers(container: HTMLElement, store: ProgressStore) {
  container.addEventListener('change', event => {
    const picker = event.target instanceof HTMLSelectElement && event.target.dataset.progressId ? event.target : null;
    if (!picker) return;
    try {
      store.set(picker.dataset.progressId!, picker.value);
      picker.closest('.opportunity-progress')?.classList.toggle('has-status', Boolean(picker.value));
    } catch {
      picker.title = 'Could not save: this browser is blocking site storage';
    }
  });
}
