/** SCRIPT_JDOC:
{"summary":"Offline reference and negative control tests for the frozen T02 fixture bundle","kind":"read-only","weight":"lightweight","role":"test"}
*/

import { expect, test } from 'bun:test';
import {
  assessSubmittedModule,
  codingFixtures,
  extractSubmittedModule,
  fixtureScopeNote,
  groundedRetrievalFixture,
  lockedSeeds,
  maxGenerationTokens,
  mergeIntervalsFixture,
  normaliseTagsFixture,
  referenceMergeIntervals,
  referenceNormaliseTags,
  ticketRecords,
  toolCacheFixture,
  validateMergeIntervalsImplementation,
  validateNormaliseTagsImplementation,
} from './fixtures';

test('fixture bundle keeps shared T02 limits', () => {
  expect(fixtureScopeNote).toContain('No fixture edits per candidate');
  expect(lockedSeeds).toEqual([42, 43]);
  expect(maxGenerationTokens).toBe(512);

  for (const fixture of codingFixtures) {
    expect(fixture.seeds).toEqual([42, 43]);
    expect(fixture.maxGenerationTokens).toBe(512);
    expect(fixture.lockedPerCandidate).toBe(true);
  }

  expect(groundedRetrievalFixture.seeds).toEqual([42, 43]);
  expect(groundedRetrievalFixture.maxGenerationTokens).toBe(512);
  expect(toolCacheFixture.seeds).toEqual([42, 43]);
  expect(toolCacheFixture.maxGenerationTokens).toBe(512);
});

test('coding prompts require exact named exports and JS-only output', () => {
  expect(normaliseTagsFixture.prompt).toContain('export function normaliseTags(tags)');
  expect(normaliseTagsFixture.prompt).toContain('Return only one fenced');
  expect(mergeIntervalsFixture.prompt).toContain('export function mergeIntervals(intervals)');
  expect(mergeIntervalsFixture.prompt).toContain('No imports');
});

test('reference module sources satisfy exact export contracts', () => {
  for (const fixture of codingFixtures) {
    const fenced = `\`\`\`js\n${fixture.referenceSource}\n\`\`\``;
    expect(extractSubmittedModule(fenced)).toBe(fixture.referenceSource);
    const assessment = assessSubmittedModule(fenced, fixture.exportName);
    expect(assessment.ok).toBe(true);
    expect(assessment.errors).toEqual([]);
  }
});

test('reference implementations pass behavioural validators', () => {
  expect(() => validateNormaliseTagsImplementation(referenceNormaliseTags)).not.toThrow();
  expect(() => validateMergeIntervalsImplementation(referenceMergeIntervals)).not.toThrow();
});

test('wrong export names are rejected before any sandbox execution', () => {
  const wrongNormalise = 'export function normalizeTags(tags) { return Array.isArray(tags) ? [] : []; }';
  const wrongMerge = 'export function mergeInterval(intervals) { return intervals; }';

  const normaliseAssessment = assessSubmittedModule(wrongNormalise, 'normaliseTags');
  expect(normaliseAssessment.ok).toBe(false);
  expect(normaliseAssessment.errors.some((error) => error.includes('missing exact named export normaliseTags'))).toBe(true);

  const mergeAssessment = assessSubmittedModule(wrongMerge, 'mergeIntervals');
  expect(mergeAssessment.ok).toBe(false);
  expect(mergeAssessment.errors.some((error) => error.includes('missing exact named export mergeIntervals'))).toBe(true);
});

test('truncated modules are rejected before any sandbox execution', () => {
  const truncated = 'export function mergeIntervals(intervals) {\n  return intervals.map((pair) =>';
  const assessment = assessSubmittedModule(truncated, 'mergeIntervals');
  expect(assessment.ok).toBe(false);
  expect(assessment.errors.some((error) => error.startsWith('syntax error:'))).toBe(true);
});

test('incorrect implementations with correct export names fail validators', () => {
  function incorrectNormaliseTags(tags: unknown): string[] {
    if (!Array.isArray(tags)) {
      throw new Error('tags must be an array');
    }
    return tags.map((tag) => String(tag).toLowerCase());
  }

  function incorrectMergeIntervals(intervals: unknown): number[][] {
    if (!Array.isArray(intervals)) {
      throw new Error('intervals must be an array');
    }
    return intervals.map((entry) => {
      if (!Array.isArray(entry) || entry.length !== 2) {
        throw new Error('invalid interval');
      }
      return [Number(entry[0]), Number(entry[1])];
    });
  }

  expect(() => validateNormaliseTagsImplementation(incorrectNormaliseTags)).toThrow();
  expect(() => validateMergeIntervalsImplementation(incorrectMergeIntervals)).toThrow();
});

test('grounded retrieval fixture keeps expected facts anchored in its source note', () => {
  expect(groundedRetrievalFixture.instructions).toContain('only from the provided source');
  for (const phrase of groundedRetrievalFixture.requiredGroundingPhrases) {
    expect(groundedRetrievalFixture.sourceText).toContain(phrase);
  }
  expect(groundedRetrievalFixture.question).toContain('shippedRelease');
  expect(groundedRetrievalFixture.expectedAnswer).toEqual({
    shippedRelease: 'not in source',
    rollbackApprover: 'Mira Patel',
    localIndexCache: '64 MiB',
  });
});

test('tool/cache fixture is four rounds, nonexecuting, and cache-aware', () => {
  expect(toolCacheFixture.nonExecuting).toBe(true);
  expect(toolCacheFixture.rounds).toHaveLength(4);
  expect(toolCacheFixture.tools).toEqual(['lookupTicket']);

  const [round1, round2, round3, round4] = toolCacheFixture.rounds;

  expect(round1.expectedToolCalls).toEqual([{ name: 'lookupTicket', arguments: { id: 'OPS-17' } }]);
  expect(round1.providedToolResults).toEqual([ticketRecords['OPS-17']]);
  expect(round1.expectedAssistantResult).toEqual({ id: 'OPS-17', owner: 'Mira', severity: 'medium' });

  expect(round2.expectedToolCalls).toEqual([]);
  expect(round2.cacheKeysRead).toEqual(['OPS-17']);
  expect(round2.expectedAssistantResult).toEqual({ id: 'OPS-17', component: 'cache warmer', usedCache: true });

  expect(round3.expectedToolCalls).toEqual([{ name: 'lookupTicket', arguments: { id: 'OPS-18' } }]);
  expect(round3.cacheKeysRead).toEqual(['OPS-17']);
  expect(round3.providedToolResults).toEqual([ticketRecords['OPS-18']]);
  expect(round3.expectedAssistantResult).toEqual({
    id: 'OPS-18',
    owner: 'Jon',
    severity: 'high',
    moreSevereThanOps17: true,
  });

  expect(round4.expectedToolCalls).toEqual([]);
  expect(round4.cacheKeysRead).toEqual(['OPS-17', 'OPS-18']);
  expect(round4.expectedAssistantResult).toEqual({
    tickets: [
      { id: 'OPS-17', owner: 'Mira' },
      { id: 'OPS-18', owner: 'Jon' },
    ],
    usedCache: true,
  });
});
