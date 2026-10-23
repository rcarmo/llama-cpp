import {isDeepStrictEqual} from 'node:util';let assertions=0;function eq(a,b){assertions++;if(!isDeepStrictEqual(a,b))throw Error('assertion '+assertions+' actual='+JSON.stringify(a)+' expected='+JSON.stringify(b));}
function referenceMerge(arr){const sorted=arr.map(x=>x.slice()).sort((a,b)=>a[0]-b[0]||a[1]-b[1]),out=[];for(const[a,b]of sorted){if(out.length&&a<=out[out.length-1][1])out[out.length-1][1]=Math.max(out[out.length-1][1],b);else out.push([a,b]);}return out;}
function referenceTopo(nodes,edges){const adj=new Map(nodes.map(n=>[n,new Set()])),degree=new Map(nodes.map(n=>[n,0]));for(const[a,b]of edges)if(!adj.get(a).has(b)){adj.get(a).add(b);degree.set(b,degree.get(b)+1);}let todo=nodes.filter(n=>degree.get(n)===0),out=[];while(todo.length){todo.sort();let n=todo.shift();out.push(n);for(const v of adj.get(n)){degree.set(v,degree.get(v)-1);if(degree.get(v)===0)todo.push(v);}}return out.length===nodes.length?out:null;}


function mergeIntervals(xs) {
  // Handle empty input
  if (xs.length === 0) return [];

  // Create a shallow copy of the intervals and sort by start, then end
  const sorted = [...xs].sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  const merged = [];
  let current = [...sorted[0]]; // copy first interval to avoid mutating the copy

  for (let i = 1; i < sorted.length; i++) {
    const next = sorted[i];
    // Intervals overlap or touch if next.start <= current.end
    if (next[0] <= current[1]) {
      // Extend current interval if needed
      if (next[1] > current[1]) {
        current[1] = next[1];
      }
    } else {
      // No overlap – push the current interval and start a new one
      merged.push(current);
      current = [...next];
    }
  }
  // Push the last accumulated interval
  merged.push(current);

  return merged;
}
const original=[[5,7],[1,3],[2,4],[7,8],[-2,-1],[1,3]];const before=JSON.stringify(original);eq(mergeIntervals(original),[[-2,-1],[1,4],[5,8]]);eq(original,JSON.parse(before));eq(mergeIntervals([]),[]);eq(mergeIntervals([[1,9],[2,3],[9,11]]),[[1,11]]);eq(mergeIntervals([[0,0],[1,1]]),[[0,0],[1,1]]);for(let seed=1;seed<=80;seed++){let arr=[];for(let i=0;i<12;i++){let a=((seed*17+i*13)%31)-15,b=a+((seed+i)%7);arr.push([a,b]);}const expected=referenceMerge(arr);eq(mergeIntervals(arr),expected);}
console.log(JSON.stringify({passed:true,assertions}));
