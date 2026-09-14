export function wrongExport(tags) {
  if (!Array.isArray(tags)) throw new Error('tags must be an array');
  const out = [];
  const seen = new Set();
  for (const tag of tags) {
    if (typeof tag !== 'string') throw new Error('tag must be a string');
    const value = tag
      .trim()
      .toLowerCase()
      .replace(/[\s_]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '');
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}