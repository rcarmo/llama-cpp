export function mergeIntervals(intervals:number[][]):number[][] {
 const a=intervals.map(x=>{if(x.length!==2||!x.every(Number.isFinite))throw Error('interval');return [Math.min(x[0],x[1]),Math.max(x[0],x[1])]}).sort((a,b)=>a[0]-b[0]);
 const out:number[][]=[];for(const x of a){const last=out[out.length-1];if(last&&x[0]<=last[1])last[1]=Math.max(last[1],x[1]);else out.push(x)}return out;
}