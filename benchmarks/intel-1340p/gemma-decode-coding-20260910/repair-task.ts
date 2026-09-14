/** SCRIPT_JDOC:
{"summary":"Smaller prespecified one-export interval repair to separate coding correctness from prior output truncation","kind":"read-only","weight":"lightweight","role":"module"}
*/
export const instruction=`Repair this TypeScript function. Return only the complete corrected module in one TypeScript code block. No prose, comments, helpers, examples or tests. Keep the implementation under 30 lines. The exact export name is mergeIntervals.
export function mergeIntervals(intervals: number[][]): number[][] {
 intervals.sort((a,b)=>a[0]-b[0]);
 const result: number[][]=[];
 for (const interval of intervals) {
  const last=result[result.length-1];
  if (last && interval[0]<last[1]) last[1]=interval[1];
  else result.push(interval);
 }
 return result;
}
Requirements: each interval must have exactly two finite numeric endpoints; reject invalid intervals with Error. Normalize reversed endpoints. Merge both overlapping and touching intervals. Return sorted intervals. Never mutate input or inner arrays, and do not alias them in the output. Empty input returns []. Retain isolated zero-length intervals. Fully implement only this one exported function.`;
export const tests=`import {test,expect} from 'bun:test';
import {mergeIntervals as merge} from './candidate';
test('empty and single reversed',()=>{expect(merge([])).toEqual([]);expect(merge([[5,1]])).toEqual([[1,5]])});
test('unsorted overlapping touching nested',()=>{expect(merge([[9,5],[3,1],[2,6],[11,12],[12,13]])).toEqual([[1,9],[11,13]]);expect(merge([[1,10],[2,3],[5,6]])).toEqual([[1,10]])});
test('preserve input and independent output',()=>{const x=[[4,1],[8,10]],copy=structuredClone(x);const y=merge(x);expect(x).toEqual(copy);y[0][0]=-100;expect(x).toEqual(copy)});
test('zero and duplicate intervals',()=>{expect(merge([[1,1],[3,3]])).toEqual([[1,1],[3,3]]);expect(merge([[1,4],[1,4],[2,2]])).toEqual([[1,4]])});
test('negative fractional endpoints',()=>expect(merge([[-3,-1],[-1,0.5],[3,4]])).toEqual([[-3,0.5],[3,4]]));
test('invalid lengths/nonfinite/non-numeric',()=>{for(const x of [[[1]],[[1,2,3]],[[NaN,2]],[[1,Infinity]],[[1,-Infinity]],[[0,1],[3]],[[\"1\",2]]])expect(()=>merge(x as number[][])).toThrow()});
`;
export const reference=`export function mergeIntervals(intervals:number[][]):number[][] {
 const a=intervals.map(x=>{if(x.length!==2||!x.every(Number.isFinite))throw Error('interval');return [Math.min(x[0],x[1]),Math.max(x[0],x[1])]}).sort((a,b)=>a[0]-b[0]);
 const out:number[][]=[];for(const x of a){const last=out[out.length-1];if(last&&x[0]<=last[1])last[1]=Math.max(last[1],x[1]);else out.push(x)}return out;
}`;
export {extractCode} from './task';
