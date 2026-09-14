export function chunk(items, size) {
  if (!Array.isArray(items)) {
    throw new Error("items must be an array");
  }
  if (!Number.isInteger(size) || size <= 0) {
    throw new Error("size must be a positive integer");
  }

  if (items.length === 0) {
    return [];
  }

  const result = [];
  for (let i = 0; i < items.length; i += size) {
    const chunk = items.slice(i, i + size);
    result.push(chunk);
  }
  return result;
}