import assert from 'node:assert/strict';
import test from 'node:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Window } from 'happy-dom';
import { LineChart, type ChartPoint } from './LineChart.js';

const day = 24 * 60 * 60 * 1000;
const exerciseA: ChartPoint[] = [
  { t: day, y: 80, dateStr: 'Day 1' },
  { t: 2 * day, y: 85, dateStr: 'Day 2' },
  { t: 3 * day, y: 90, dateStr: 'Day 3' }
];
const exerciseB: ChartPoint[] = [
  { t: 4 * day, y: 60, dateStr: 'Day 4' },
  { t: 5 * day, y: 65, dateStr: 'Day 5' }
];

test('mounted LineChart survives empty, single, multi-point, exercise and metric transitions without stale tooltips', async () => {
  const browser = new Window({ url: 'http://localhost:5173/' });
  const globalNames = ['window', 'document', 'navigator', 'IS_REACT_ACT_ENVIRONMENT'] as const;
  const previous = globalNames.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);
  Object.defineProperties(globalThis, {
    window: { configurable: true, value: browser },
    document: { configurable: true, value: browser.document },
    navigator: { configurable: true, value: browser.navigator },
    IS_REACT_ACT_ENVIRONMENT: { configurable: true, value: true }
  });

  const container = browser.document.createElement('div');
  browser.document.body.appendChild(container);
  const root = createRoot(container as unknown as HTMLElement);
  const render = async (points: ChartPoint[], options: { unit?: string; goal?: number | null; invertY?: boolean } = {}) => {
    await act(async () => {
      root.render(React.createElement(LineChart, { points, ...options }));
    });
  };
  const tooltip = () => container.querySelector('div.shadow-lg')?.textContent ?? null;
  const selectPoint = async (index: number) => {
    const target = container.querySelectorAll('g.cursor-pointer')[index];
    assert.ok(target, `point ${index} is mounted`);
    await act(async () => {
      target.dispatchEvent(new browser.MouseEvent('click', { bubbles: true }));
    });
  };

  try {
    await render([]);
    assert.match(container.textContent ?? '', /Sin registros suficientes/);
    await render([exerciseA[0]]);
    assert.equal(container.querySelectorAll('svg').length, 1);
    await render(exerciseA);
    assert.equal(container.querySelectorAll('g.cursor-pointer').length, 3);
    assert.ok(container.querySelector('polyline'));

    await selectPoint(1);
    assert.match(tooltip() ?? '', /85 kg/);
    await render(exerciseB);
    assert.equal(tooltip(), null, 'exercise B must not show exercise A selection');
    await render(exerciseA);
    assert.equal(tooltip(), null, 'returning to exercise A must not revive a previous selection');

    await selectPoint(0);
    await render(exerciseA, { unit: 'lb', goal: 100 });
    assert.match(tooltip() ?? '', /80 lb/);
    assert.equal(container.querySelectorAll('g.cursor-pointer').length, 3);
    assert.match(container.textContent ?? '', /100/);

    const oneRm = exerciseA.map((point) => ({ ...point, y: point.y + 20 }));
    await render(oneRm, { unit: 'kg' });
    assert.equal(tooltip(), null, 'e1RM metric must clear the top-set selection');
    const rir = exerciseA.map((point) => ({ ...point, y: 3 }));
    await render(rir, { unit: 'RIR', invertY: true });
    assert.equal(container.querySelectorAll('g.cursor-pointer').length, 3);
    await selectPoint(2);
    assert.match(tooltip() ?? '', /3 RIR/);

    const weightEntries = [exerciseA[0]];
    await render(weightEntries, { unit: 'kg', goal: 75 });
    assert.equal(tooltip(), null, 'new weight dataset must not show old RIR tooltip');
    const withNewWeight = [...weightEntries, { t: 2 * day, y: 79, dateStr: 'New weight' }];
    await render(withNewWeight, { unit: 'kg', goal: 77 });
    assert.equal(container.querySelectorAll('g.cursor-pointer').length, 2);
    assert.match(container.textContent ?? '', /77/);
    await render(withNewWeight, { unit: 'lb', goal: 170 });
    assert.match(container.textContent ?? '', /170/);
    await render([]);
    assert.match(container.textContent ?? '', /Sin registros suficientes/);
  } finally {
    await act(async () => root.unmount());
    browser.close();
    for (const [name, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  }
});
