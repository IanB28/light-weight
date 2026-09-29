import test from 'node:test';
import assert from 'node:assert/strict';
import { applyAsOfPrefillToUneditedSessions, HistoricalPrefillGate } from './historical-prefill-gate.js';

test('CASE C: a late response for an earlier historical date cannot replace the newer selection', async () => {
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

test('CASE B: editing a newly-added exercise after its request preserves the manual draft', () => {
  const bench = { exercise: { id: 'bench' }, sets: [80] };
  const row = { exercise: { id: 'row' }, sets: [70] };
  const editedBench = { ...bench, sets: [85] };
  const refreshedBench = { ...bench, sets: [75] };
  const refreshedRow = { ...row, sets: [72] };
  assert.deepEqual(applyAsOfPrefillToUneditedSessions([editedBench, row], [bench, row], [refreshedBench, refreshedRow]),
    [editedBench, refreshedRow]);
});

test('CASE A: adding an exercise hydrates only that new exercise, never an already-edited draft', () => {
  const editedBench = { exercise: { id: 'bench' }, sets: [87.5] };
  const rowSeed = { exercise: { id: 'row' }, sets: [0] };
  const remoteRow = { exercise: { id: 'row' }, sets: [72.5] };
  assert.deepEqual(applyAsOfPrefillToUneditedSessions(
    [editedBench, rowSeed], [rowSeed], [remoteRow]
  ), [editedBench, remoteRow]);
});

test('CASE D: changing routines invalidates the previous routine hydration request', () => {
  const gate = new HistoricalPrefillGate();
  const routineA = gate.start();
  const routineB = gate.start();
  assert.equal(routineA.signal.aborted, true);
  assert.equal(routineA.isCurrent(), false);
  assert.equal(routineB.isCurrent(), true);
});
