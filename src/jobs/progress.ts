/**
 * Browser-local application tracking for starred postings: one status per job id, kept next to the ★ favorites
 * (localStorage, no account). Shown on starred cards, searchable with `progress:`, and included in the Markdown export.
 */
export const PROGRESS_LABELS = {
  preparing: 'Preparing',
  applied: 'Applied',
  interviewing: 'Interviewing',
  offer: 'Offer',
  declined: 'Declined / rejected'
} as const;

export type ProgressStatus = keyof typeof PROGRESS_LABELS;

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
