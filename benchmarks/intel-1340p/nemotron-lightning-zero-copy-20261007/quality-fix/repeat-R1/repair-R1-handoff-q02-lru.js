import {isDeepStrictEqual} from 'node:util';let assertions=0;function eq(a,b){assertions++;if(!isDeepStrictEqual(a,b))throw Error('assertion '+assertions+' actual='+JSON.stringify(a)+' expected='+JSON.stringify(b));}
function referenceMerge(arr){const sorted=arr.map(x=>x.slice()).sort((a,b)=>a[0]-b[0]||a[1]-b[1]),out=[];for(const[a,b]of sorted){if(out.length&&a<=out[out.length-1][1])out[out.length-1][1]=Math.max(out[out.length-1][1],b);else out.push([a,b]);}return out;}
function referenceTopo(nodes,edges){const adj=new Map(nodes.map(n=>[n,new Set()])),degree=new Map(nodes.map(n=>[n,0]));for(const[a,b]of edges)if(!adj.get(a).has(b)){adj.get(a).add(b);degree.set(b,degree.get(b)+1);}let todo=nodes.filter(n=>degree.get(n)===0),out=[];while(todo.length){todo.sort();let n=todo.shift();out.push(n);for(const v of adj.get(n)){degree.set(v,degree.get(v)-1);if(degree.get(v)===0)todo.push(v);}}return out.length===nodes.length?out:null;}


class LRUCache {
  constructor(capacity) {
    if (capacity < 0) throw new Error('capacity must be nonnegative');
    this.capacity = capacity;
    this.map = new Map();
  }

  get(key) {
    const node = this.map.get(key);
    if (!node) return -1;
    // Move to the end (most recently used)
    this.map.delete(key);
    this.map.set(key, node);
    return node.value;
  }

  put(key, value) {
    if (this.capacity === 0) return;

    const node = this.map.get(key);
    if (node) {
      // Update existing key and move to end
      node.value = value;
      this.map.delete(key);
      this.map.set(key, node);
      return;
    }

    // Insert new entry
    if (this.map.size >= this.capacity) {
      // Evict the least recently used (first entry in Map)
      const firstKey = this.map.keys().next().value;
      this.map.delete(firstKey);
    }

    this.map.set(key, { key, value });
  }
}
let c=new LRUCache(2);c.put('a',0);c.put('b',false);eq(c.get('a'),0);c.put('c',3);eq(c.get('b'),-1);c.put('a',7);eq(c.get('c'),3);c.put('d',4);eq(c.get('a'),-1);eq(c.get('d'),4);let z=new LRUCache(0);z.put('a',1);eq(z.get('a'),-1);let one=new LRUCache(1);one.put(0,'');eq(one.get(0),'');one.put(0,null);eq(one.get(0),null);one.put('0',2);eq(one.get(0),-1);eq(one.get('0'),2);for(let capacity=0;capacity<5;capacity++){let actual=new LRUCache(capacity),ref=new Map();for(let i=0;i<150;i++){const k=(i*17)%9;if(i%3){const value=i%7===0?false:i;actual.put(k,value);ref.delete(k);if(capacity){ref.set(k,value);while(ref.size>capacity)ref.delete(ref.keys().next().value);}}else{const expected=ref.has(k)?ref.get(k):-1;if(ref.has(k)){ref.delete(k);ref.set(k,expected);}eq(actual.get(k),expected);}}}
console.log(JSON.stringify({passed:true,assertions}));
