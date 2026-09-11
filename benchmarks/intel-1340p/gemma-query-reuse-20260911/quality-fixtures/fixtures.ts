/** SCRIPT_JDOC:
{"summary":"Frozen T02 offline coding, retrieval, and tool-cache fixtures with independent references and validators","kind":"read-only","weight":"lightweight","role":"module"}
*/

export const lockedSeeds = [42, 43] as const;
export type LockedSeed = (typeof lockedSeeds)[number];
export const maxGenerationTokens = 512;
export const fixtureScopeNote =
  'T02 offline fixture freeze only. Baseline/native outcomes pending. No fixture edits per candidate.';

export type CodingFixture = {
  readonly id: string;
  readonly kind: 'coding';
  readonly exportName: string;
  readonly prompt: string;
  readonly seeds: readonly LockedSeed[];
  readonly maxGenerationTokens: number;
  readonly referenceSource: string;
  readonly validatorSource: string;
  readonly lockedPerCandidate: true;
};

export type GroundedRetrievalFixture = {
  readonly id: string;
  readonly kind: 'grounded-retrieval';
  readonly instructions: string;
  readonly sourceTitle: string;
  readonly sourceText: string;
  readonly question: string;
  readonly expectedAnswer: {
    readonly shippedRelease: string;
    readonly rollbackApprover: string;
    readonly localIndexCache: string;
  };
  readonly requiredGroundingPhrases: readonly string[];
  readonly seeds: readonly LockedSeed[];
  readonly maxGenerationTokens: number;
  readonly lockedPerCandidate: true;
};

export type ToolCallExpectation = {
  readonly name: 'lookupTicket';
  readonly arguments: { readonly id: string };
};

export type TicketRecord = {
  readonly id: string;
  readonly owner: string;
  readonly severity: 'low' | 'medium' | 'high';
  readonly component: string;
};

export type ToolCacheRound = {
  readonly round: 1 | 2 | 3 | 4;
  readonly user: string;
  readonly expectedToolCalls: readonly ToolCallExpectation[];
  readonly providedToolResults: readonly TicketRecord[];
  readonly cacheKeysRead: readonly string[];
  readonly expectedAssistantResult: unknown;
};

export type ToolCacheFixture = {
  readonly id: string;
  readonly kind: 'tool-cache';
  readonly nonExecuting: true;
  readonly description: string;
  readonly tools: readonly ['lookupTicket'];
  readonly seeds: readonly LockedSeed[];
  readonly maxGenerationTokens: number;
  readonly lockedPerCandidate: true;
  readonly rounds: readonly ToolCacheRound[];
};

function fail(message: string): never {
  throw new Error(message);
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    fail(message);
  }
}

function stableStringify(value: unknown): string {
  return JSON.stringify(value);
}

function assertDeepEqual(actual: unknown, expected: unknown, label: string): void {
  if (stableStringify(actual) !== stableStringify(expected)) {
    fail(`${label}: expected ${stableStringify(expected)} but received ${stableStringify(actual)}`);
  }
}

function assertThrows(run: () => unknown, label: string): void {
  let threw = false;
  try {
    run();
  } catch {
    threw = true;
  }
  if (!threw) {
    fail(`${label}: expected throw`);
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function compileAsScriptOnly(source: string): void {
  const transformed = source
    .replace(/\bexport\s+function\b/g, 'function')
    .replace(/\bexport\s*\{[^}]+\}\s*;?/g, '');
  // Parsing only: new Function compiles the module body but does not execute it.
  // This keeps contract checks local and avoids running submitted code on the host.
  void new Function(`${transformed}\nreturn true;`);
}

export function extractSubmittedModule(responseText: string): string {
  const codeBlocks = [...responseText.matchAll(/```(?:javascript|js|typescript|ts)?\s*\n([\s\S]*?)```/g)];
  if (codeBlocks.length === 1) {
    return codeBlocks[0][1].trim();
  }
  if (codeBlocks.length > 1) {
    fail('Multiple code blocks found');
  }
  if (/\bexport\s+function\b/.test(responseText)) {
    return responseText.trim();
  }
  fail('No module code found');
}

export type ModuleAssessment = {
  readonly ok: boolean;
  readonly source: string;
  readonly errors: readonly string[];
};

export function assessSubmittedModule(responseText: string, expectedExportName: string): ModuleAssessment {
  const source = extractSubmittedModule(responseText);
  const errors: string[] = [];
  const exactNamedExport = new RegExp(`\\bexport\\s+function\\s+${escapeRegExp(expectedExportName)}\\b`);
  if (!exactNamedExport.test(source)) {
    errors.push(`missing exact named export ${expectedExportName}`);
  }
  if (/\bexport\s+default\b/.test(source) || /\bmodule\.exports\b|\bexports\./.test(source)) {
    errors.push('default or CommonJS export not allowed');
  }
  try {
    compileAsScriptOnly(source);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(`syntax error: ${message}`);
  }
  return { ok: errors.length === 0, source, errors };
}

export function referenceNormaliseTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) {
    fail('tags must be an array');
  }

  const output: string[] = [];
  const seen = new Set<string>();

  for (const tag of tags) {
    if (typeof tag !== 'string') {
      fail('tag must be a string');
    }
    const normalised = tag
      .trim()
      .toLowerCase()
      .replace(/[\s_]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '');

    if (!normalised || seen.has(normalised)) {
      continue;
    }

    seen.add(normalised);
    output.push(normalised);
  }

  return output;
}

export function validateNormaliseTagsImplementation(fn: (tags: unknown) => string[]): void {
  const original = ['  Alpha  ', 'beta_gamma', 'beta gamma', '__Gamma__', ' ', '---', 'ALPHA'];
  const snapshot = [...original];
  assertDeepEqual(
    fn(original),
    ['alpha', 'beta-gamma', 'gamma'],
    'normaliseTags normalises, drops empties, and deduplicates',
  );
  assertDeepEqual(original, snapshot, 'normaliseTags does not mutate the input array');

  const secondInput = ['Multi__ Part--Name ', 'multi part name', 'Already-Good'];
  const secondSnapshot = [...secondInput];
  const secondOutput = fn(secondInput);
  assertDeepEqual(secondOutput, ['multi-part-name', 'already-good'], 'normaliseTags collapses separators');
  secondOutput[0] = 'changed';
  assertDeepEqual(secondInput, secondSnapshot, 'normaliseTags returns an independent array');

  assertThrows(() => fn('alpha'), 'normaliseTags rejects non-array input');
  assertThrows(() => fn(['ok', 3] as unknown), 'normaliseTags rejects non-string members');
}

export const normaliseTagsReferenceSource = `export function normaliseTags(tags) {
  if (!Array.isArray(tags)) throw new Error('tags must be an array');
  const out = [];
  const seen = new Set();
  for (const tag of tags) {
    if (typeof tag !== 'string') throw new Error('tag must be a string');
    const value = tag
      .trim()
      .toLowerCase()
      .replace(/[\\s_]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '');
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}`;

export const normaliseTagsValidatorSource = `import { normaliseTags } from './candidate.js';

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
console.log('normaliseTags validator passed');`;

export const normaliseTagsPrompt = `Write a JavaScript module. Return only one fenced \`\`\`js code block.
Export exactly:
export function normaliseTags(tags)
Requirements:
- tags must be an array and every item must be a string; otherwise throw Error.
- Never mutate the input array.
- For each tag: trim outer whitespace, lowercase it, replace runs of spaces or underscores with '-', collapse repeated '-', then remove leading and trailing '-'.
- Drop empty results.
- Deduplicate while preserving first occurrence order.
- Return a new array.
- No imports, no external libraries, no explanation.`;

export function referenceMergeIntervals(intervals: unknown): number[][] {
  if (!Array.isArray(intervals)) {
    fail('intervals must be an array');
  }

  const prepared = intervals.map((entry) => {
    if (
      !Array.isArray(entry) ||
      entry.length !== 2 ||
      typeof entry[0] !== 'number' ||
      typeof entry[1] !== 'number' ||
      !Number.isFinite(entry[0]) ||
      !Number.isFinite(entry[1])
    ) {
      fail('invalid interval');
    }
    const [left, right] = entry;
    return left <= right ? [left, right] : [right, left];
  });

  prepared.sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  const merged: number[][] = [];
  for (const interval of prepared) {
    const last = merged[merged.length - 1];
    if (!last || interval[0] > last[1]) {
      merged.push([...interval]);
      continue;
    }
    if (interval[1] > last[1]) {
      last[1] = interval[1];
    }
  }

  return merged;
}

export function validateMergeIntervalsImplementation(fn: (intervals: unknown) => number[][]): void {
  assertDeepEqual(fn([]), [], 'mergeIntervals handles empty input');

  const complex = [[5, 1], [2, 4], [8, 8], [7, 9], [12, 10]];
  const complexSnapshot = complex.map((interval) => [...interval]);
  assertDeepEqual(fn(complex), [[1, 5], [7, 9], [10, 12]], 'mergeIntervals sorts, reverses, and merges');
  assertDeepEqual(complex, complexSnapshot, 'mergeIntervals does not mutate nested input arrays');

  assertDeepEqual(fn([[1, 1], [3, 4], [4, 5]]), [[1, 1], [3, 5]], 'mergeIntervals keeps zero-length intervals and merges touching ranges');
  assertDeepEqual(fn([[-3, -1], [-1, 0.5], [3, 4]]), [[-3, 0.5], [3, 4]], 'mergeIntervals supports negative and fractional ranges');

  const output = fn([[0, 2], [5, 6]]);
  output[0][0] = 99;
  assertDeepEqual(fn([[0, 2], [5, 6]]), [[0, 2], [5, 6]], 'mergeIntervals returns independent output arrays');

  assertThrows(() => fn('not-an-array'), 'mergeIntervals rejects non-array input');
  assertThrows(() => fn([[1], [2, 3]] as unknown), 'mergeIntervals rejects wrong interval length');
  assertThrows(() => fn([[1, Number.POSITIVE_INFINITY]] as unknown), 'mergeIntervals rejects non-finite numbers');
}

export const mergeIntervalsReferenceSource = `export function mergeIntervals(intervals) {
  if (!Array.isArray(intervals)) throw new Error('intervals must be an array');
  const prepared = intervals.map((entry) => {
    if (!Array.isArray(entry) || entry.length !== 2 || !entry.every((value) => typeof value === 'number' && Number.isFinite(value))) {
      throw new Error('invalid interval');
    }
    const [left, right] = entry;
    return left <= right ? [left, right] : [right, left];
  });
  prepared.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged = [];
  for (const interval of prepared) {
    const last = merged[merged.length - 1];
    if (!last || interval[0] > last[1]) merged.push([...interval]);
    else if (interval[1] > last[1]) last[1] = interval[1];
  }
  return merged;
}`;

export const mergeIntervalsValidatorSource = `import { mergeIntervals } from './candidate.js';

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
console.log('mergeIntervals validator passed');`;

export const mergeIntervalsPrompt = `Write a JavaScript module. Return only one fenced \`\`\`js code block.
Export exactly:
export function mergeIntervals(intervals)
Requirements:
- intervals must be an array of [start, end] pairs of finite numbers; otherwise throw Error.
- Reverse endpoints when start > end.
- Return a new array of sorted merged intervals.
- Overlapping or touching intervals must merge.
- Keep zero-length intervals.
- Never mutate the input array or nested arrays.
- No imports, no external libraries, no explanation.`;

export const normaliseTagsFixture: CodingFixture = Object.freeze({
  id: 'coding-normalise-tags-v1',
  kind: 'coding',
  exportName: 'normaliseTags',
  prompt: normaliseTagsPrompt,
  seeds: lockedSeeds,
  maxGenerationTokens,
  referenceSource: normaliseTagsReferenceSource,
  validatorSource: normaliseTagsValidatorSource,
  lockedPerCandidate: true,
});

export const mergeIntervalsFixture: CodingFixture = Object.freeze({
  id: 'coding-merge-intervals-v1',
  kind: 'coding',
  exportName: 'mergeIntervals',
  prompt: mergeIntervalsPrompt,
  seeds: lockedSeeds,
  maxGenerationTokens,
  referenceSource: mergeIntervalsReferenceSource,
  validatorSource: mergeIntervalsValidatorSource,
  lockedPerCandidate: true,
});

export const codingFixtures = [normaliseTagsFixture, mergeIntervalsFixture] as const;

export const groundedRetrievalFixture: GroundedRetrievalFixture = Object.freeze({
  id: 'grounded-retrieval-release-note-v1',
  kind: 'grounded-retrieval',
  instructions:
    'Answer only from the provided source note. If a requested fact is missing, say "not in source". Keep the answer concise.',
  sourceTitle: 'Release note excerpt',
  sourceText: `Release note excerpt\n- Candidate release: cedar-17\n- Rollback approval owner: Mira Patel\n- Local index cache: 64 MiB\n- Validation window: 14 minutes\n- Data source: offline benchmark packet only`,
  question: 'Using only the note, return a JSON object with keys shippedRelease, rollbackApprover, localIndexCache. If no shipped release is established, use the exact string not in source for shippedRelease. The other values are strings.',
  expectedAnswer: {
    shippedRelease: 'not in source',
    rollbackApprover: 'Mira Patel',
    localIndexCache: '64 MiB',
  },
  requiredGroundingPhrases: ['Mira Patel', '64 MiB'],
  seeds: lockedSeeds,
  maxGenerationTokens,
  lockedPerCandidate: true,
});

export const ticketRecords = {
  'OPS-17': Object.freeze({
    id: 'OPS-17',
    owner: 'Mira',
    severity: 'medium',
    component: 'cache warmer',
  }),
  'OPS-18': Object.freeze({
    id: 'OPS-18',
    owner: 'Jon',
    severity: 'high',
    component: 'restore path',
  }),
} as const satisfies Record<string, TicketRecord>;

export const toolCacheFixture: ToolCacheFixture = Object.freeze({
  id: 'tool-cache-ticket-walk-v1',
  kind: 'tool-cache',
  nonExecuting: true,
  description:
    'Four-round nonexecuting lookupTicket workflow. Rounds 2 and 4 must reuse cached tool results instead of re-calling the tool.',
  tools: ['lookupTicket'],
  seeds: lockedSeeds,
  maxGenerationTokens,
  lockedPerCandidate: true,
  rounds: [
    {
      round: 1,
      user: 'Check ticket OPS-17. Return JSON with keys id, owner, severity.',
      expectedToolCalls: [{ name: 'lookupTicket', arguments: { id: 'OPS-17' } }],
      providedToolResults: [ticketRecords['OPS-17']],
      cacheKeysRead: [],
      expectedAssistantResult: { id: 'OPS-17', owner: 'Mira', severity: 'medium' },
    },
    {
      round: 2,
      user: 'Using the previous tool result without calling the tool again, return JSON with keys id, component, usedCache (true).',
      expectedToolCalls: [],
      providedToolResults: [],
      cacheKeysRead: ['OPS-17'],
      expectedAssistantResult: { id: 'OPS-17', component: 'cache warmer', usedCache: true },
    },
    {
      round: 3,
      user: 'Now check OPS-18. Return JSON with keys id, owner, severity, moreSevereThanOps17 (a boolean). Severity order is low, medium, high.',
      expectedToolCalls: [{ name: 'lookupTicket', arguments: { id: 'OPS-18' } }],
      providedToolResults: [ticketRecords['OPS-18']],
      cacheKeysRead: ['OPS-17'],
      expectedAssistantResult: {
        id: 'OPS-18',
        owner: 'Jon',
        severity: 'high',
        moreSevereThanOps17: true,
      },
    },
    {
      round: 4,
      user: 'Using the previous tool results without calling tools, return JSON with keys tickets (array of objects with id and owner in ascending ticket order), usedCache (true).',
      expectedToolCalls: [],
      providedToolResults: [],
      cacheKeysRead: ['OPS-17', 'OPS-18'],
      expectedAssistantResult: {
        tickets: [
          { id: 'OPS-17', owner: 'Mira' },
          { id: 'OPS-18', owner: 'Jon' },
        ],
        usedCache: true,
      },
    },
  ],
});
