import{chunk}from'./candidate.js';
const eq=(a,b)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw Error('Mismatch')};
const input=[1,2,3,4,5],out=chunk(input,2);eq(out,[[1,2],[3,4],[5]]);out[0][0]=9;eq(input,[1,2,3,4,5]);eq(chunk([],3),[]);eq(chunk([1,2],8),[[1,2]]);eq(chunk([1,2],1),[[1],[2]]);
for(const [a,n]of [[null,2],['abc',2],[[1],0],[[1],-1],[[1],1.5],[[1],NaN],[[1],Infinity]]){let threw=false;try{chunk(a,n)}catch{threw=true}if(!threw)throw Error('Missingvalidation')};console.log('PASS chunk');