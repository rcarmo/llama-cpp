import {test,expect} from 'bun:test';
import {mergeIntervalInterval as merge} from './candidate';
test('empty and single reversed',()=>{expect(merge([])).toEqual([]);expect(merge([[5,1]])).toEqual([[1,5]])});
test('unsorted overlapping touching nested',()=>{expect(merge([[9,5],[3,1],[2,6],[11,12],[12,13]])).toEqual([[1,9],[11,13]]);expect(merge([[1,10],[2,3],[5,6]])).toEqual([[1,10]])});
test('preserve input and independent output',()=>{const x=[[4,1],[8,10]],copy=structuredClone(x);const y=merge(x);expect(x).toEqual(copy);y[0][0]=-100;expect(x).toEqual(copy)});
test('zero and duplicate intervals',()=>{expect(merge([[1,1],[3,3]])).toEqual([[1,1],[3,3]]);expect(merge([[1,4],[1,4],[2,2]])).toEqual([[1,4]])});
test('negative fractional endpoints',()=>expect(merge([[-3,-1],[-1,0.5],[3,4]])).toEqual([[-3,0.5],[3,4]]));
test('invalid lengths/nonfinite/non-numeric',()=>{for(const x of [[[1]],[[1,2,3]],[[NaN,2]],[[1,Infinity]],[[1,-Infinity]],[[0,1],[3]],[["1",2]]])expect(()=>merge(x as number[][])).toThrow()});
