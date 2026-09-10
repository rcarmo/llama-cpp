export function median(values: number[]): number {
 if (values.length === 0) {
  throw new Error("Input array cannot be empty");
 }
 const sorted = [...values].sort((a,b)=>a-b);
 const mid = Math.floor(sorted.length / 2);
 if (sorted.length % 2 === 1) {
  return sorted[mid];
 } else {
  return (sorted[mid - 1] + sorted[mid]) / 2;
 }
}
