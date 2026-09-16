export function normaliseTags(tags) {
    if (!Array.isArray(tags) || tags.some(tag => typeof tag !== 'string')) {
        throw new Error("Input must be an array of strings.");
    }

    const processedTags = tags.map(tag => {
        return tag
            .trim()
            .toLowerCase()
            .replace(/[\s_]+/g, '-') // Replace runs of spaces or underscores with '-'
            .replace(/-+/g, '-')   // Collapse repeated '-'
            .replace(/^-|-$/g, ''); // Remove leading and trailing '-'
    }).filter(tag => tag.length > 0);

    const seen = new Set();
    const uniqueTags = [];
    for (const tag of processedTags) {
        if (!seen.has(tag)) {
            seen.add(tag);
            uniqueTags.push(tag);
        }
    }

    return uniqueTags;
}