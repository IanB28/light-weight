import assert from 'node:assert/strict';
import test from 'node:test';
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { Window } from 'happy-dom';
import type { WorkoutSession } from '@light-weight/domain';
import { TonnageEquivalenceModal } from '../components/TonnageEquivalenceModal.js';
import { ProfileView } from '../features/profile/ProfileView.js';
import { DEFAULT_USER_PROFILE } from './storage.js';
import { dictionaries, I18nProvider, useI18n } from './i18n.js';
import { PreferencesProvider, usePreferences } from './preferences-context.js';
import { formatTonnageCount, getTonnageEquivalences, REAL_WORLD_OBJECTS } from './tonnage.js';

function fixtureWindow(): { browser: Window; restore: () => void } {
  const browser = new Window({ url: 'http://localhost:5173/' });
  const names = ['window', 'document', 'localStorage', 'navigator', 'IS_REACT_ACT_ENVIRONMENT'] as const;
  const previous = names.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);
  Object.defineProperties(globalThis, {
    window: { configurable: true, value: browser },
    document: { configurable: true, value: browser.document },
    localStorage: { configurable: true, value: browser.localStorage },
    navigator: { configurable: true, value: browser.navigator },
    IS_REACT_ACT_ENVIRONMENT: { configurable: true, value: true }
  });
  return {
    browser,
    restore: () => {
      browser.close();
      for (const [name, descriptor] of previous) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else Reflect.deleteProperty(globalThis, name);
      }
    }
  };
}

function session(date: string, index: number): WorkoutSession {
  return {
    id: `streak-${index}`, userId: 'athlete', routineName: 'Training',
    startedAt: `${date}T12:00:00.000Z`, performedDate: date, sets: {}
  };
}

test('Profile streak renders 0, 1, 2 and 4 weeks with correct ES/EN grammar without changing the calculated value', (context) => {
  context.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-14T12:00:00.000Z') });
  const { browser, restore } = fixtureWindow();
  const dates = ['2026-10-14', '2026-10-07', '2026-09-30', '2026-09-23'];
  try {
    for (const language of ['es', 'en'] as const) {
      browser.localStorage.setItem('lightweight_preferences_v1', JSON.stringify({ language }));
      for (const count of [0, 1, 2, 4]) {
        const html = renderToStaticMarkup(React.createElement(PreferencesProvider, null,
          React.createElement(I18nProvider, null, React.createElement(ProfileView, {
            profile: DEFAULT_USER_PROFILE,
            userInfo: { id: 'athlete', name: 'Athlete', email: 'athlete@example.com' },
            history: dates.slice(0, count).map(session), exercises: [], onSave: () => {}
          }))));
        const document = browser.document;
        document.body.innerHTML = html;
        const summary = document.querySelector('.grid-cols-3.divide-x');
        const streak = summary?.children[2];
        assert.ok(streak, `streak cell for ${language}/${count}`);
        assert.equal(streak.querySelector('p')?.textContent, String(count));
        assert.equal(streak.querySelectorAll('p')[1]?.textContent, language === 'es'
          ? (count === 1 ? 'semana' : 'semanas')
          : (count === 1 ? 'week' : 'weeks'));
      }
    }
  } finally {
    restore();
    context.mock.timers.reset();
  }
});

test('Tonnage zero, small, medium and large equivalences preserve object weights, milestones and percentages', () => {
  assert.equal(formatTonnageCount('5.1', 'es-ES'), '5,1');
  assert.equal(formatTonnageCount('5.1', 'en-US'), '5.1');
  assert.deepEqual(REAL_WORLD_OBJECTS.map(({ id, unitKg }) => [id, unitKg]), [
    ['gorilla', 180], ['piano', 450], ['car', 1400], ['rhino', 2300],
    ['elephant', 5500], ['trex', 8000], ['plane', 41000], ['whale', 140000], ['statue', 225000]
  ]);
  for (const [weight, primaryId, milestoneId, targetKg] of [
    [0, 'gorilla', 'gorilla', 180],
    [180, 'gorilla', 'piano', 450],
    [2300, 'gorilla', 'elephant', 5500],
    [200000, 'trex', 'statue', 225000],
    [300000, 'plane', 'car100', 140000]
  ] as const) {
    const result = getTonnageEquivalences(weight);
    assert.equal(result.totalKg, weight);
    assert.equal(result.primary.id, primaryId);
    assert.equal(result.nextMilestone.id, milestoneId);
    assert.equal(result.nextMilestone.targetKg, targetKg);
    assert.equal(result.nextMilestone.remainingKg, Math.max(0, targetKg - weight));
    assert.equal(result.nextMilestone.progressPercent, Math.min(100, Math.round(weight / targetKg * 100)));
    assert.equal(result.breakdown.length, 9);
    for (const item of result.breakdown) {
      assert.equal(item.count, weight / item.unitKg);
      for (const language of ['es', 'en'] as const) {
        assert.ok(dictionaries[language][`tonnage.object.${item.id}` as keyof typeof dictionaries.es]);
      }
    }
  }
});

test('Tonnage modal renders localized zero, small, medium and large comparisons in ES and EN', () => {
  const { browser, restore } = fixtureWindow();
  try {
    for (const language of ['es', 'en'] as const) {
      browser.localStorage.setItem('lightweight_preferences_v1', JSON.stringify({ language, units: 'metric' }));
      for (const totalKg of [0, 180, 2300, 200000]) {
        const html = renderToStaticMarkup(React.createElement(PreferencesProvider, null,
          React.createElement(I18nProvider, null, React.createElement(TonnageEquivalenceModal, {
            isOpen: true, onClose: () => {}, totalKg
          }))));
        const data = getTonnageEquivalences(totalKg);
        assert.ok(html.includes(dictionaries[language]['tonnage.title']));
        assert.ok(html.includes(dictionaries[language]['tonnage.comparisons']));
        assert.ok(html.includes(dictionaries[language]['tonnage.explanation']));
        assert.ok(html.includes(dictionaries[language][`tonnage.object.${data.primary.id}` as keyof typeof dictionaries.es]));
        assert.ok(html.includes(dictionaries[language][`tonnage.milestone.${data.nextMilestone.id}` as keyof typeof dictionaries.es]));
        assert.ok(html.includes(`aria-label="${dictionaries[language]['tonnage.close']}"`));
        assert.ok(html.includes(dictionaries[language]['tonnage.continue']));
        assert.ok(html.includes(`${data.nextMilestone.progressPercent}%`));
      }
    }
  } finally {
    restore();
  }
});

test('Tonnage modal updates language immediately, retains conversion and closes through either action', async () => {
  const { browser, restore } = fixtureWindow();
  const container = browser.document.createElement('div');
  browser.document.body.appendChild(container);
  const root = createRoot(container as unknown as HTMLElement);
  function Harness() {
    const [open, setOpen] = useState(true);
    const { setLanguage } = useI18n();
    const { updatePreferences } = usePreferences();
    return React.createElement(React.Fragment, null,
      React.createElement('button', { onClick: () => setLanguage('en') }, 'English'),
      React.createElement('button', { onClick: () => setLanguage('es') }, 'Español'),
      React.createElement('button', { onClick: () => updatePreferences({ units: 'imperial' }) }, 'Imperial'),
      React.createElement('button', { onClick: () => setOpen(true) }, 'Open'),
      React.createElement(TonnageEquivalenceModal, { isOpen: open, onClose: () => setOpen(false), totalKg: 2300 }));
  }
  const click = async (label: string) => {
    const button = Array.from(browser.document.querySelectorAll('button')).find((item) =>
      item.textContent?.trim() === label || item.getAttribute('aria-label') === label);
    assert.ok(button, label);
    await act(async () => button.click());
  };
  try {
    await act(async () => root.render(React.createElement(PreferencesProvider, null,
      React.createElement(I18nProvider, null, React.createElement(Harness)))));
    assert.match(browser.document.body.textContent ?? '', /Equivalencias de tonelaje/);
    assert.match(browser.document.body.textContent ?? '', /Próximo hito: 1 elefante africano adulto/);
    await click('English');
    assert.match(browser.document.body.textContent ?? '', /Tonnage equivalents/);
    assert.match(browser.document.body.textContent ?? '', /Next milestone: 1 adult African elephant/);
    assert.doesNotMatch(browser.document.querySelector('[role="dialog"]')?.textContent ?? '', /Faltan|Comparaciones del mundo real|¿Cómo/);
    await click('Imperial');
    assert.match(browser.document.querySelector('[role="dialog"]')?.textContent ?? '', /lb/);
    await click('Close tonnage equivalents');
    assert.equal(browser.document.querySelector('[aria-modal="true"]'), null);
    await click('Open');
    await click('Keep lifting!');
    assert.equal(browser.document.querySelector('[role="dialog"]'), null);
    await click('Español');
    await click('Open');
    assert.match(browser.document.body.textContent ?? '', /Comparaciones del mundo real/);
  } finally {
    await act(async () => root.unmount());
    restore();
  }
});
