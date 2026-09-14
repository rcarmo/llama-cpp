import {test,expect} from 'bun:test';
import {mergeIntervals as merge,totalLength,containsPoint as contains} from './candidate';
test('empty',()=>{expect(merge([])).toEqual([]);expect(totalLength([])).toBe(0);expect(contains([],1)).toBe(false)});
test('reversed unsorted overlapping touching',()=>{expect(merge([[9,5],[3,1],[2,6],[11,12],[12,13]])).toEqual([[1,9],[11,13]]);expect(totalLength([[9,5],[3,1],[2,6],[11,12],[12,13]])).toBe(10)});
test('preserve inputs and independent output',()=>{const x=[[4,1],[8,10]],copy=structuredClone(x);const y=merge(x);expect(x).toEqual(copy);y[0][0]=-100;expect(x).toEqual(copy);totalLength(x);contains(x,2);expect(x).toEqual(copy)});
test('zero length and duplicates',()=>{expect(merge([[1,1],[3,3]])).toEqual([[1,1],[3,3]]);expect(merge([[1,4],[1,4],[2,2]])).toEqual([[1,4]]);expect(totalLength([[1,1],[1,1]])).toBe(0);expect(contains([[1,1]],1)).toBe(false)});
test('negative fractional and half-open boundaries',()=>{const x=[[-3,-1],[-1,0.5],[3,4]];expect(merge(x)).toEqual([[-3,0.5],[3,4]]);expect(totalLength(x)).toBe(4.5);for(const p of [-3,-1,0,3])expect(contains(x,p)).toBe(true);for(const p of [-4,0.5,2,4])expect(contains(x,p)).toBe(false)});
test('invalid length and nonfinite values',()=>{for(const x of [[[1]],[[1,2,3]],[[NaN,2]],[[1,Infinity]],[[1,-Infinity]],[[0,1],[3]]])for(const f of [merge,totalLength,(a)=>contains(a,0)])expect(()=>f(x)).toThrow();for(const p of [NaN,Infinity,-Infinity])expect(()=>contains([[0,1]],p)).toThrow()});
