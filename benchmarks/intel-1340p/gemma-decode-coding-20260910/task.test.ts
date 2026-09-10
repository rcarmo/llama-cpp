import {test,expect} from 'bun:test';
import {extractCode,instruction,tests} from './task';
test('single fenced and raw modules extracted; ambiguity/missingcode rejected',()=>{
 expect(extractCode('```typescript\nexport function a(){}\n```')).toBe('export function a(){}\n');
 expect(extractCode('export function a(){}')).toBe('export function a(){}');
 expect(()=>extractCode('No module')).toThrow('No module');
 expect(()=>extractCode('```ts\na\n```\n```ts\nb\n```')).toThrow('Multiple');
});
test('fixed task includes independent edge-case semantics',()=>{
 for(const word of ['half-open','finite','Never mutate','Zero-length'])expect(instruction).toContain(word);
 for(const name of ['invalid length','independent output','half-open boundaries','reversed'])expect(tests).toContain(name);
});
