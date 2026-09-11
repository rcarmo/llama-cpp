import { mergeIntervals } from './candidate.js';

function fail(message) { throw new Error(message); }
function deepEqual(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function assertEqual(actual, expected, label) {
  if (!deepEqual(actual, expected)) fail(label + ': expected ' + JSON.stringify(expected) + ' but received ' + JSON.stringify(actual));
}
function assertThrows(run, label) {
  let threw = false;
  try { run(); } catch { threw = true; }
  if (!threw) fail(label + ': expected throw');
}

assertEqual(mergeIntervals([]), [], 'handles empty input');
const complex = [[5, 1], [2, 4], [8, 8], [7, 9], [12, 10]];
const snapshot = complex.map((interval) => [...interval]);
assertEqual(mergeIntervals(complex), [[1, 5], [7, 9], [10, 12]], 'sorts, reverses, merges');
assertEqual(complex, snapshot, 'does not mutate input');
assertEqual(mergeIntervals([[1, 1], [3, 4], [4, 5]]), [[1, 1], [3, 5]], 'keeps zero-length and merges touching');
assertEqual(mergeIntervals([[-3, -1], [-1, 0.5], [3, 4]]), [[-3, 0.5], [3, 4]], 'supports negative and fractional ranges');
const output = mergeIntervals([[0, 2], [5, 6]]);
output[0][0] = 99;
assertEqual(mergeIntervals([[0, 2], [5, 6]]), [[0, 2], [5, 6]], 'returns independent output arrays');
assertThrows(() => mergeIntervals('not-an-array'), 'rejects non-array input');
assertThrows(() => mergeIntervals([[1], [2, 3]]), 'rejects wrong interval length');
assertThrows(() => mergeIntervals([[1, Infinity]]), 'rejects non-finite numbers');
console.log('mergeIntervals validator passed');