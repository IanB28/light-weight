import assert from 'node:assert/strict';
import test from 'node:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Window } from 'happy-dom';
import type { Exercise, Routine } from '@light-weight/domain';
import { PlanView } from './PlanView.js';
import { AuthProvider } from '../lib/auth-context.js';
import type { WeeklySchedule } from '../lib/storage.js';

const bench: Exercise = {
  id: 'bench', name: 'Bench Press', category: 'barbell', primaryMuscle: 'chest', secondaryMuscles: []
};
const row: Exercise = {
  id: 'row', name: 'Barbell Row', category: 'barbell', primaryMuscle: 'back', secondaryMuscles: []
};
const schedule: WeeklySchedule = {
  monday: null, tuesday: null, wednesday: null, thursday: null,
  friday: null, saturday: null, sunday: null
};

async function mountedPlan(run: (fixture: {
  document: Document;
  browser: Window;
  render: (active: boolean) => Promise<void>;
  click: (label: string) => Promise<void>;
  input: (element: HTMLInputElement, value: string) => Promise<void>;
  saved: Routine[];
  started: string[];
}) => Promise<void>, routines: Routine[] = []) {
  const browser = new Window({ url: 'http://localhost:5173/' });
  const globalNames = ['window', 'document', 'navigator', 'IS_REACT_ACT_ENVIRONMENT', 'fetch', 'requestAnimationFrame'] as const;
  const previous = globalNames.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);
  Object.defineProperties(globalThis, {
    window: { configurable: true, value: browser },
    document: { configurable: true, value: browser.document },
    navigator: { configurable: true, value: browser.navigator },
    IS_REACT_ACT_ENVIRONMENT: { configurable: true, value: true },
    fetch: { configurable: true, value: async () => new Response(JSON.stringify({ error: 'AUTH_REQUIRED' }), { status: 401 }) },
    requestAnimationFrame: { configurable: true, value: browser.requestAnimationFrame.bind(browser) }
  });
  const container = browser.document.createElement('div');
  browser.document.body.appendChild(container);
  const root = createRoot(container as unknown as HTMLElement);
  const saved: Routine[] = [];
  const started: string[] = [];
  const render = async (active: boolean) => {
    await act(async () => root.render(React.createElement(AuthProvider, null,
      React.createElement(PlanView, {
        isActive: active, routines, exercises: [bench, row], weeklySchedule: schedule,
        onSelectAndStartRoutine: (id) => started.push(id), onSaveRoutine: (routine) => saved.push(routine)
      }))));
  };
  const click = async (label: string) => {
    const button = Array.from(browser.document.querySelectorAll('button'))
      .find((item) => item.textContent?.trim() === label || item.getAttribute('aria-label') === label);
    assert.ok(button, `button ${label} exists`);
    await act(async () => button.dispatchEvent(new browser.MouseEvent('click', { bubbles: true })));
  };
  const input = async (element: HTMLInputElement, value: string) => {
    await act(async () => {
      Object.getOwnPropertyDescriptor(browser.HTMLInputElement.prototype, 'value')?.set?.call(element, value);
      // ReactDOM is imported before Happy DOM is installed in this Node test process.
      // Invoke the mounted control's current handler; real input events are covered in browser QA.
      const propsKey = Object.keys(element).find((key) => key.startsWith('__reactProps$'));
      assert.ok(propsKey);
      const props = (element as unknown as Record<string, { onChange?: (event: { target: HTMLInputElement }) => void }>)[propsKey];
      props.onChange?.({ target: element });
    });
  };
  try {
    await run({ document: browser.document as unknown as Document, browser, render, click, input, saved, started });
  } finally {
    await act(async () => root.unmount());
    browser.close();
    for (const [name, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  }
}

test('mounted Plan preserves a new routine draft through postpone, tab navigation, resume and one explicit save', async () => {
  await mountedPlan(async ({ document, browser, render, click, input, saved }) => {
    await render(true);
    await click('Nueva rutina');
    const name = document.querySelector('input[placeholder="Ej: Empuje Pesado (Push A)"]') as HTMLInputElement | null;
    assert.ok(name, 'create editor name input mounted');
    await input(name, 'Draft Push');
    assert.equal(name.value, 'Draft Push');
    await click('Siguiente');
    assert.ok(document.body.textContent?.includes('Añadir más ejercicios'), 'Next advances to exercise step');
    const benchChoice = Array.from(document.querySelectorAll('button'))
      .find((button) => button.getAttribute('aria-pressed') === 'false' && button.textContent?.includes('Bench Press'));
    assert.ok(benchChoice);
    await act(async () => benchChoice.dispatchEvent(new browser.MouseEvent('click', { bubbles: true }) as unknown as Event));
    await click('Editar series para Bench Press');
    const weight = document.querySelector('input[aria-label="Peso base: 1"]') as HTMLInputElement | null;
    assert.ok(weight);
    await input(weight, '42.5');
    const search = document.querySelector('input[placeholder="Buscar ejercicios…"]') as HTMLInputElement | null;
    assert.ok(search);
    await input(search, 'row');
    assert.ok(document.querySelector('[role="dialog"][aria-modal="true"]'));
    await click('Continuar después');
    assert.ok(!document.querySelector('[role="dialog"][aria-modal="true"]'));
    const resume = Array.from(document.querySelectorAll('button')).find((button) => button.textContent?.trim() === 'Continuar edición');
    assert.ok(resume);
    assert.ok(document.activeElement === resume, 'focus moves to the resume action');
    await render(false);
    assert.ok(!document.querySelector('[role="dialog"][aria-modal="true"]'));
    await render(true);
    await click('Continuar edición');
    assert.ok(document.querySelector('[role="dialog"][aria-modal="true"]'));
    assert.equal((document.querySelector('input[aria-label="Peso base: 1"]') as HTMLInputElement).value, '42.5');
    assert.equal((document.querySelector('input[placeholder="Buscar ejercicios…"]') as HTMLInputElement).value, 'row');
    assert.ok(document.activeElement?.getAttribute('aria-label') === 'Cerrar', 'focus re-enters the resumed dialog');
    await click('Atrás');
    assert.equal((document.querySelector('input[placeholder="Ej: Empuje Pesado (Push A)"]') as HTMLInputElement).value, 'Draft Push');
    assert.equal(saved.length, 0, 'postpone and navigation never save');
    await click('Siguiente');
    await click('Guardar rutina');
    assert.equal(saved.length, 1, 'save callback fires only for explicit save and only once');
    assert.equal(saved[0].name, 'Draft Push');
    assert.deepEqual(saved[0].exerciseIds, ['bench']);
    assert.equal(saved[0].template?.exercises[0].sets[0].targetWeightKg, 42.5);
    assert.ok(!document.querySelector('[role="dialog"][aria-modal="true"]'));
  });
});

test('mounted Plan preserves an existing routine edit and explicitly discards it', async () => {
  const routine: Routine = {
    id: 'push', userId: 'local-anonymous', name: 'Push Day', exerciseIds: ['bench', 'row'],
    template: { version: 2, exercises: [
      { exerciseId: 'bench', sets: [{ setType: 'working', targetWeightKg: 80 }] },
      { exerciseId: 'row', sets: [{ setType: 'working', targetWeightKg: 70 }] }
    ] }
  };
  await mountedPlan(async ({ document, render, click, input, saved }) => {
    await render(true);
    await click('Push Day2 ejercicios');
    await click('Editar rutina');
    await click('Siguiente');
    await click('Mover abajo: Bench Press');
    await click('Editar series para Bench Press');
    await click('Añadir serie');
    const secondWeight = document.querySelector('input[aria-label="Peso base: 2"]') as HTMLInputElement | null;
    assert.ok(secondWeight);
    await input(secondWeight, '65');
    await click('Continuar después');
    assert.ok(!document.querySelector('[role="dialog"][aria-modal="true"]'));
    await render(false);
    await render(true);
    await click('Continuar edición');
    assert.ok(document.body.textContent?.includes('2 series'));
    assert.equal((document.querySelector('input[aria-label="Peso base: 2"]') as HTMLInputElement).value, '65');
    assert.deepEqual(
      Array.from(document.querySelectorAll('button[aria-label^="Editar series para"]'))
        .map((button) => button.getAttribute('aria-label')),
      ['Editar series para Barbell Row', 'Editar series para Bench Press']
    );
    assert.equal(document.activeElement?.getAttribute('aria-label'), 'Cerrar');
    await click('Cerrar');
    await click('Descartar');
    assert.ok(!document.querySelector('[role="dialog"][aria-modal="true"]'));
    assert.ok(document.activeElement?.textContent?.includes('Push Day'), 'discard returns focus to the edited routine');
    assert.equal(saved.length, 0);
    await click('Push Day2 ejercicios');
    await click('Editar rutina');
    await click('Siguiente');
    assert.deepEqual(
      Array.from(document.querySelectorAll('button[aria-label^="Editar series para"]'))
        .map((button) => button.getAttribute('aria-label')),
      ['Editar series para Bench Press', 'Editar series para Barbell Row']
    );
    await click('Editar series para Bench Press');
    assert.ok(document.body.textContent?.includes('1 serie'), 'discard starts the original routine afresh');
  }, [routine]);
});
