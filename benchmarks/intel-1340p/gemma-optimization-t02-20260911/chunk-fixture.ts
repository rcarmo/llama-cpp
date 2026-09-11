/** SCRIPT_JDOC:
{"summary":"Versioned small array-chunking replacement while retaining mergeIntervals exact-export failure","kind":"read-only","weight":"lightweight","role":"module"}
*/
export const chunkFixture={
 id:'coding-chunk-v1',exportName:'chunk',seeds:[42,43],maxGenerationTokens:512,
 prompt:'Write a JavaScript module. Return only one fenced js code block. Export exactly: export function chunk(items, size). items must be an array; size must be a positive integer; otherwise throw Error. Return a new array of consecutive slices of at most size elements. Preserve order, never mutate items, and return [] for an empty input. Slices must be new arrays. No imports, libraries or explanation.',
 referenceSource:`export function chunk(items,size){if(!Array.isArray(items)||!Number.isInteger(size)||size<1)throw Error('input');const out=[];for(let i=0;i<items.length;i+=size)out.push(items.slice(i,i+size));return out;}`,
 validatorSource:`import{chunk}from'./candidate.js';
const eq=(a,b)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw Error('Mismatch')};
const input=[1,2,3,4,5],out=chunk(input,2);eq(out,[[1,2],[3,4],[5]]);out[0][0]=9;eq(input,[1,2,3,4,5]);eq(chunk([],3),[]);eq(chunk([1,2],8),[[1,2]]);eq(chunk([1,2],1),[[1],[2]]);
for(const [a,n]of [[null,2],['abc',2],[[1],0],[[1],-1],[[1],1.5],[[1],NaN],[[1],Infinity]]){let threw=false;try{chunk(a,n)}catch{threw=true}if(!threw)throw Error('Missingvalidation')};console.log('PASS chunk');`,
 history:'Added before anycandidate comparison after two exact-export failures of frozenmergeIntervals; oldfixture/outcomes retained, not renamed into a pass.'
};
