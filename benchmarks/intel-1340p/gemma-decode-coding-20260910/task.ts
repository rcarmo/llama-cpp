/** SCRIPT_JDOC:
{"summary":"Prespecified long-context TypeScript interval task and independent test fixture","kind":"read-only","weight":"lightweight","role":"module"}
*/
export const instruction = `Write a TypeScript module implementing the following API. Return only one TypeScript code block, with no explanation and no tests.
export function mergeIntervals(intervals: number[][]): number[][]
export function totalLength(intervals: number[][]): number
export function containsPoint(intervals: number[][], point: number): boolean
Each interval is exactly two finite numbers. Validate all intervals and throw Error for any other length or any nonfinite endpoint. Reverse endpoints when necessary. Return sorted merged intervals; overlapping or touching intervals merge. Never mutate input arrays or inner arrays. Empty input returns an empty array. Zero-length intervals are retained by mergeIntervals.
For totalLength, return the summed lengths of merged intervals, counting overlap only once.
For containsPoint, validate intervals as above and also require a finite point; throw Error otherwise. Use half-open intervals [start,end): the start is included, the end excluded. Zero-length intervals contain no point. Return a boolean. Use no imports or external dependencies. Keep the code clear and fully implement all three exports.`;
export const tests = `import {test,expect} from 'bun:test';
import {mergeIntervals as merge,totalLength,containsPoint as contains} from './candidate';
test('empty',()=>{expect(merge([])).toEqual([]);expect(totalLength([])).toBe(0);expect(contains([],1)).toBe(false)});
test('reversed unsorted overlapping touching',()=>{expect(merge([[9,5],[3,1],[2,6],[11,12],[12,13]])).toEqual([[1,9],[11,13]]);expect(totalLength([[9,5],[3,1],[2,6],[11,12],[12,13]])).toBe(10)});
test('preserve inputs and independent output',()=>{const x=[[4,1],[8,10]],copy=structuredClone(x);const y=merge(x);expect(x).toEqual(copy);y[0][0]=-100;expect(x).toEqual(copy);totalLength(x);contains(x,2);expect(x).toEqual(copy)});
test('zero length and duplicates',()=>{expect(merge([[1,1],[3,3]])).toEqual([[1,1],[3,3]]);expect(merge([[1,4],[1,4],[2,2]])).toEqual([[1,4]]);expect(totalLength([[1,1],[1,1]])).toBe(0);expect(contains([[1,1]],1)).toBe(false)});
test('negative fractional and half-open boundaries',()=>{const x=[[-3,-1],[-1,0.5],[3,4]];expect(merge(x)).toEqual([[-3,0.5],[3,4]]);expect(totalLength(x)).toBe(4.5);for(const p of [-3,-1,0,3])expect(contains(x,p)).toBe(true);for(const p of [-4,0.5,2,4])expect(contains(x,p)).toBe(false)});
test('invalid length and nonfinite values',()=>{for(const x of [[[1]],[[1,2,3]],[[NaN,2]],[[1,Infinity]],[[1,-Infinity]],[[0,1],[3]]])for(const f of [merge,totalLength,(a)=>contains(a,0)])expect(()=>f(x)).toThrow();for(const p of [NaN,Infinity,-Infinity])expect(()=>contains([[0,1]],p)).toThrow()});
`;
export const reference = `export function mergeIntervals(intervals:number[][]):number[][] {
 const a=intervals.map(x=>{if(x.length!==2||!x.every(Number.isFinite))throw Error('interval');return [Math.min(x[0],x[1]),Math.max(x[0],x[1])]}).sort((a,b)=>a[0]-b[0]);
 const out:number[][]=[];for(const x of a){const last=out[out.length-1];if(last&&x[0]<=last[1])last[1]=Math.max(last[1],x[1]);else out.push(x)}return out;
}
export function totalLength(intervals:number[][]):number{return mergeIntervals(intervals).reduce((n,[a,b])=>n+b-a,0)}
export function containsPoint(intervals:number[][],point:number):boolean{if(!Number.isFinite(point))throw Error('point');return mergeIntervals(intervals).some(([a,b])=>point>=a&&point<b)}
`;
export function extractCode(content:string){const blocks=[...content.matchAll(/\x60\x60\x60(?:typescript|ts)?\s*\n([\s\S]*?)\x60\x60\x60/g)];if(blocks.length===1)return blocks[0][1];if(blocks.length>1)throw Error('Multiple code blocks');if(content.includes('export function'))return content;throw Error('No module code');}
