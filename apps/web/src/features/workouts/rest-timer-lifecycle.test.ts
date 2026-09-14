import test from 'node:test';
import assert from 'node:assert/strict';
import { RestTimerLifecycle } from './rest-timer-lifecycle.js';
import type { RestTimerNotifier } from './rest-timer-notifier.js';

test('rest notifier schedules, reschedules, cancels and notifies foreground completion', () => {
  const calls: Array<[string, number?]> = [];
  const notifier: RestTimerNotifier = {
    schedule: (endAt) => calls.push(['schedule', endAt]),
    cancel: () => calls.push(['cancel']),
    notifyForegroundFinished: () => calls.push(['finished'])
  };
  const lifecycle = new RestTimerLifecycle(notifier, () => 1_000);
  const endAt = lifecycle.start(30);
  assert.equal(endAt, 31_000);
  assert.equal(lifecycle.adjust(endAt, 15), 46_000);
  assert.equal(lifecycle.adjust(46_000, -10), 36_000);
  lifecycle.cancel();
  lifecycle.finishInForeground();
  assert.deepEqual(calls, [
    ['schedule', 31_000], ['schedule', 46_000], ['schedule', 36_000],
    ['cancel'], ['finished'], ['cancel']
  ]);
});
