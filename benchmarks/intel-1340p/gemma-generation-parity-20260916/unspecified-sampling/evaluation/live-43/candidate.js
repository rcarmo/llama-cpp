export function normaliseTags(tags) {
  if (!Array.isArray(tags) || tags.some(tag => typeof tag !== 'string')) {
    throw new Error('tags must be an array of strings');
  }

  const processedTags = tags.map(tag => {
    return tag
      .trim()
      .toLowerCase()
      .replace(/[\s_]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }).filter(tag => tag.length > 0);

  return [...new Set(processedTags)];
}