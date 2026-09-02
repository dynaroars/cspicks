

export function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function percent(part: number, total: number) {
  return total > 0 ? (part / total) * 100 : 0;
}

export function hasProfileValue(value: unknown) {
  const normalized = String(value || '').trim().toLowerCase();
  return Boolean(normalized) && normalized !== 'noscholarpage' && normalized !== 'nohomepage';
}

export function sumBy<T>(items: T[], value: (item: T) => number) {
  return items.reduce((total, item) => total + value(item), 0);
}

export function topEntry(counts: Record<string, number>) {
  return Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0] || null;
}

export function cosineSimilarity(first: Record<string, number>, second: Record<string, number>) {
  const keys = new Set([...Object.keys(first), ...Object.keys(second)]);
  let dot = 0;
  let firstLength = 0;
  let secondLength = 0;
  keys.forEach(key => {
    const a = first[key] || 0;
    const b = second[key] || 0;
    dot += a * b;
    firstLength += a * a;
    secondLength += b * b;
  });
  return firstLength && secondLength ? dot / Math.sqrt(firstLength * secondLength) : 0;
}
