import { normaliseTags } from './candidate.js';

function fail(message) { throw new Error(message); }
function deepEqual(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function assert(condition, message) { if (!condition) fail(message); }
function assertEqual(actual, expected, label) {
  if (!deepEqual(actual, expected)) fail(label + ': expected ' + JSON.stringify(expected) + ' but received ' + JSON.stringify(actual));
}
function assertThrows(run, label) {
  let threw = false;
  try { run(); } catch { threw = true; }
  if (!threw) fail(label + ': expected throw');
}

const original = ['  Alpha  ', 'beta_gamma', 'beta gamma', '__Gamma__', ' ', '---', 'ALPHA'];
const snapshot = [...original];
assertEqual(normaliseTags(original), ['alpha', 'beta-gamma', 'gamma'], 'normalises, drops empties, deduplicates');
assertEqual(original, snapshot, 'does not mutate input');
const secondInput = ['Multi__ Part--Name ', 'multi part name', 'Already-Good'];
const secondSnapshot = [...secondInput];
const secondOutput = normaliseTags(secondInput);
assertEqual(secondOutput, ['multi-part-name', 'already-good'], 'collapses separators');
secondOutput[0] = 'changed';
assertEqual(secondInput, secondSnapshot, 'returns independent array');
assertThrows(() => normaliseTags('alpha'), 'rejects non-array input');
assertThrows(() => normaliseTags(['ok', 3]), 'rejects non-string members');
console.log('normaliseTags validator passed');