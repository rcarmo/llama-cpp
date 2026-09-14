export function normaliseTags(tags) {
  if (!Array.isArray(tags) || tags.some(tag => typeof tag !== 'string')) {
    throw new Error('Input must be an array of strings.');
  }

  const result = [];
  const seen = new Set();

  for (const tag of tags) {
    // 1. Trim, lowercase
    let normalized = tag.trim().toLowerCase();

    // 2. Replace runs of spaces or underscores with '-'
    normalized = normalized.replace(/[\s_]+/g, '-');

    // 3. Collapse repeated '-'
    normalized = normalized.replace(/-+/g, '-');

    // 4. Remove leading and trailing '-'
    normalized = normalized.replace(/^-|-$/g, '');

    // 5. Drop empty results
    if (normalized.length === 0) {
      continue;
    }

    // 6. Deduplicate while preserving first occurrence order
    if (!seen.has(normalized)) {
      result.push(normalized);
      seen.add(normalized);
    }
  }

  return result;
}