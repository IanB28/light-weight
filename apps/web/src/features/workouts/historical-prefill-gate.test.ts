import test from 'node:test';
import assert from 'node:assert/strict';
import { applyAsOfPrefillToUneditedSessions, HistoricalPrefillGate } from './historical-prefill-gate.js';

test('a late response for an earlier historical date cannot replace the newer selection', async () => {
  const gate = new HistoricalPrefillGate();
  const earlierDate = gate.start();
  let resolveEarlier!: () => void;
  const earlierResponse = new Promise<void>((resolve) => { resolveEarlier = resolve; });
  const newerDate = gate.start();
  resolveEarlier();
  await earlierResponse;
  assert.equal(earlierDate.signal.aborted, true);
  assert.equal(earlierDate.isCurrent(), false);
  assert.equal(newerDate.isCurrent(), true);
  gate.cancel();
  assert.equal(newerDate.isCurrent(), false);
});

test('as-of hydration preserves manually edited sets while refreshing untouched exercises', () => {
  const bench = { exercise: { id: 'bench' }, sets: [80] };
  const row = { exercise: { id: 'row' }, sets: [70] };
  const editedBench = { ...bench, sets: [85] };
  const refreshedBench = { ...bench, sets: [75] };
  const refreshedRow = { ...row, sets: [72] };
  assert.deepEqual(applyAsOfPrefillToUneditedSessions([editedBench, row], [bench, row], [refreshedBench, refreshedRow]),
    [editedBench, refreshedRow]);
});
