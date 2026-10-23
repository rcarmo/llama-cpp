import {isDeepStrictEqual} from 'node:util';let assertions=0;function eq(a,b){assertions++;if(!isDeepStrictEqual(a,b))throw Error('assertion '+assertions+' actual='+JSON.stringify(a)+' expected='+JSON.stringify(b));}
function referenceMerge(arr){const sorted=arr.map(x=>x.slice()).sort((a,b)=>a[0]-b[0]||a[1]-b[1]),out=[];for(const[a,b]of sorted){if(out.length&&a<=out[out.length-1][1])out[out.length-1][1]=Math.max(out[out.length-1][1],b);else out.push([a,b]);}return out;}
function referenceTopo(nodes,edges){const adj=new Map(nodes.map(n=>[n,new Set()])),degree=new Map(nodes.map(n=>[n,0]));for(const[a,b]of edges)if(!adj.get(a).has(b)){adj.get(a).add(b);degree.set(b,degree.get(b)+1);}let todo=nodes.filter(n=>degree.get(n)===0),out=[];while(todo.length){todo.sort();let n=todo.shift();out.push(n);for(const v of adj.get(n)){degree.set(v,degree.get(v)-1);if(degree.get(v)===0)todo.push(v);}}return out.length===nodes.length?out:null;}
function topoSort(nodes, edges) {
  // Build adjacency list and in‑degree count.
  const adj = {};
  const indeg = {};
  for (const n of nodes) {
    adj[n] = [];
    indeg[n] = 0;
  }
  for (const [from, to] of edges) {
    // Ignore duplicate edges – they do not affect the graph structure.
    if (!adj[from].includes(to)) {
      adj[from].push(to);
    }
    indeg[to]++;
  }

  // Initialise the set of nodes with no incoming edges.
  // We use a sorted array so that we can always pick the lexicographically smallest.
  let ready = [];
  for (const n of nodes) {
    if (indeg[n] === 0) ready.push(n);
  }
  ready.sort();

  const result = [];

  while (ready.length > 0) {
    // Pick the smallest lexicographically.
    const node = ready.shift(); // removes the first (smallest) element
    result.push(node);

    // Decrease in‑degree of neighbours.
    for (const nb of adj[node]) {
      indeg[nb]--;
      if (indeg[nb] === 0) {
        // Insert nb into ready keeping it sorted.
        // Because ready is small (at most nodes.length) a simple linear insert is fine.
        let inserted = false;
        for (let i = 0; i < ready.length; i++) {
          if (nb < ready[i]) {
            ready.splice(i, 0, nb);
            inserted = true;
            break;
          }
        }
        if (!inserted) ready.push(nb);
      }
    }
  }

  // If we didn't process all nodes, a cycle exists.
  if (result.length !== nodes.length) return null;

  return result;
}
eq(topoSort(['c','b','a'],[['a','c'],['b','c'],['a','c']]),['a','b','c']);eq(topoSort(['a','b'],[['a','b'],['b','a']]),null);eq(topoSort(['a'],[['a','a']]),null);eq(topoSort([],[]),[]);eq(topoSort(['z','a','m'],[]),['a','m','z']);for(let seed=1;seed<=60;seed++){let nodes=['h','g','f','e','d','c','b','a'],edges=[];for(let i=0;i<8;i++)for(let j=i+1;j<8;j++)if((i*31+j*7+seed)%4===0){edges.push([String.fromCharCode(97+i),String.fromCharCode(97+j)]);if(seed%2)edges.push(edges[edges.length-1].slice());}const n=JSON.stringify(nodes),e=JSON.stringify(edges);eq(topoSort(nodes,edges),referenceTopo(nodes,edges));eq(JSON.stringify(nodes),n);eq(JSON.stringify(edges),e);}
console.log(JSON.stringify({passed:true,assertions}));
