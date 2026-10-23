function uniqueStable(xs) {
  const seen = new Set();
  return xs.filter(x => {
    if (seen.has(x)) return false;
    seen.add(x);
    return true;
  });
}

const assert = (condition) => { if (!condition) throw Error("assertion"); };
const a=[3,1,3,2,1];assert(JSON.stringify(uniqueStable(a))==="[3,1,2]");assert(JSON.stringify(a)==="[3,1,3,2,1]");assert(uniqueStable([]).length===0);assert(JSON.stringify(uniqueStable(["a","b","a"]))==='["a","b"]');const x={};assert(uniqueStable([x,x,{}]).length===2);assert(uniqueStable([NaN,NaN]).length===1);console.log("CODE_EXEC_PASS cpu six assertions");
