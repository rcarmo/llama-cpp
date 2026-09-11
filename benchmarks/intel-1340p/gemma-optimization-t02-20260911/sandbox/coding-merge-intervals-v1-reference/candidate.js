export function mergeIntervals(intervals) {
  if (!Array.isArray(intervals)) throw new Error('intervals must be an array');
  const prepared = intervals.map((entry) => {
    if (!Array.isArray(entry) || entry.length !== 2 || !entry.every((value) => typeof value === 'number' && Number.isFinite(value))) {
      throw new Error('invalid interval');
    }
    const [left, right] = entry;
    return left <= right ? [left, right] : [right, left];
  });
  prepared.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged = [];
  for (const interval of prepared) {
    const last = merged[merged.length - 1];
    if (!last || interval[0] > last[1]) merged.push([...interval]);
    else if (interval[1] > last[1]) last[1] = interval[1];
  }
  return merged;
}