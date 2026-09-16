export function normaliseTags(tags) {
  if (!Array.isArray(tags) || tags.some(tag => typeof tag !== 'string')) {
    throw new Error("Input must be an array of strings.");
  }

  const normalized = [];
  const seen = new Set();

  for (const tag of tags) {
    const processedTag = tag
      .trim()
      .toLowerCase()
      .replace(/[\s_]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '');

    if (processedTag.length > 0 && !seen.has(processedTag)) {
      normalized.push(processedTag);
      seen.add(processedTag);
    }
  }

  return normalized;
}