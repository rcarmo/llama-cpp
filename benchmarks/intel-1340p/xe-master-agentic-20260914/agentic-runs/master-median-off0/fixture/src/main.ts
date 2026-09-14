export function median(xs: number[]): number | null {
  if (xs.length === 0) {
    return null;
  }

  // Check for NaN or Infinity in the input array
  for (const x of xs) {
    if (isNaN(x) || !isFinite(x)) {
      throw new RangeError('Input array must not contain NaN or Infinity');
    }
  }

  // Create a copy to avoid mutating the input array
  const sortedXs = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sortedXs.length / 2);

  if (sortedXs.length % 2 === 1) {
    // Odd length: return the middle element
    return sortedXs[mid];
  } else {
    // Even length: return the average of the two middle elements
    return (sortedXs[mid - 1] + sortedXs[mid]) / 2;
  }
}