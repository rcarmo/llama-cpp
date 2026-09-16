export function normaliseTags(tags) {
  if (!Array.isArray(tags) || tags.some(tag => typeof tag !== 'string')) {
    throw new Error("Input must be an array of strings.");
  }

  const normalized = Array.from(new Set(
    tags
      .map(tag => tag.trim().toLowerCase())
      .map(tag => tag.replace(/[\s_]+/g, '-'))
      .map(tag => tag.replace(/-+/g, '-'))
      .map(tag => tag.replace(/^-|-$/g, ''))
      .filter(tag => tag.length > 0)
  ));

  const seen = new Set();
  const result = [];

  for (const tag of normalized) {
    if (!seen.has(tag)) {
      seen.add(tag);
      result.push(tag);
    }
  }

  return result;
}