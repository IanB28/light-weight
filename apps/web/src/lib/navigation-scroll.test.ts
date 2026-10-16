import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Window } from 'happy-dom';
import { useNavigationScroll } from './useNavigationScroll.js';
import { RestTimerBar } from '../components/RestTimerBar.js';
import type { TabType } from '../components/BottomNav.js';
import type { PlanSection } from '../views/PlanSectionSelector.js';

async function mounted(run: (fixture: {
  browser: Window;
  render: (tab: TabType, section?: PlanSection, session?: string | null, height?: number) => Promise<void>;
  navigate: (tab: TabType, section?: PlanSection, session?: string | null, height?: number) => Promise<void>;
  scroll: (y: number) => void;
  flushFrames: () => void;
  calls: number[];
  renderTimer: (seconds: number, reserve: boolean) => Promise<void>;
  heights: number[];
  resizeTimer: (height: number) => void;
}) => Promise<void>) {
  const browser = new Window({ url: 'http://localhost/' });
  const keys = ['window', 'document', 'navigator', 'IS_REACT_ACT_ENVIRONMENT', 'ResizeObserver'] as const;
  const previous = keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const);
  let resize: (() => void) | undefined;
  let timerHeight = 66;
  class Observer {
    constructor(callback: () => void) { resize = callback; }
    observe() {}
    disconnect() { resize = undefined; }
  }
  Object.defineProperties(globalThis, {
    window: { configurable: true, value: browser }, document: { configurable: true, value: browser.document },
    navigator: { configurable: true, value: browser.navigator },
    IS_REACT_ACT_ENVIRONMENT: { configurable: true, value: true },
    ResizeObserver: { configurable: true, value: Observer }
  });
  let y = 0, height = 3000, frameId = 0;
  const frames = new Map<number, FrameRequestCallback>();
  const calls: number[] = [], heights: number[] = [];
  Object.defineProperties(browser, {
    scrollY: { configurable: true, get: () => y }, innerHeight: { configurable: true, value: 844 },
    scrollTo: { configurable: true, value: (options: ScrollToOptions) => { y = options.top ?? 0; calls.push(y); } },
    requestAnimationFrame: { configurable: true, value: (callback: FrameRequestCallback) => { frames.set(++frameId, callback); return frameId; } },
    cancelAnimationFrame: { configurable: true, value: (id: number) => frames.delete(id) }
  });
  Object.defineProperty(browser.document.documentElement, 'scrollHeight', { configurable: true, get: () => height });
  browser.HTMLElement.prototype.getBoundingClientRect = () => new browser.DOMRect(0, 0, 0, timerHeight);
  const container = browser.document.createElement('div'); browser.document.body.append(container);
  const root = createRoot(container as unknown as HTMLElement);
  let capture = () => {};
  function Harness(props: { tab: TabType; section: PlanSection; session: string | null; height: number }) {
    height = props.height;
    capture = useNavigationScroll(props.tab, props.section, props.session);
    return React.createElement('main', null, props.tab);
  }
  const render = async (tab: TabType, section: PlanSection = 'week', session: string | null = 'session-a', nextHeight = 3000) => {
    await act(async () => root.render(React.createElement(Harness, { tab, section, session, height: nextHeight })));
  };
  const onHeight = (value: number) => heights.push(value);
  try {
    await run({ browser, calls, heights, render,
      navigate: async (...args) => { capture(); await render(...args); },
      scroll: value => { y = value; browser.dispatchEvent(new browser.Event('scroll')); },
      flushFrames: () => { const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback(0)); },
      renderTimer: async (secondsLeft, reserveSpace) => {
        await act(async () => root.render(React.createElement(RestTimerBar, {
          secondsLeft, reserveSpace, totalSeconds: 90, onAddSeconds: () => {}, onDismiss: () => {}, onHeightChange: onHeight
        })));
      },
      resizeTimer: value => { timerHeight = value; resize?.(); }
    });
  } finally {
    await act(async () => root.unmount()); browser.close();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key);
    }
  }
}

test('mounted navigation starts transient screens at top and restores the active Workout before DOM height clamps it', async () => {
  await mounted(async f => {
    await f.render('workout'); f.scroll(600);
    await f.navigate('home', 'week', 'session-a', 1100); assert.equal(f.browser.scrollY, 0);
    await f.navigate('workout'); assert.equal(f.browser.scrollY, 600);
    await f.navigate('stats'); f.scroll(450);
    await f.navigate('profile'); assert.equal(f.browser.scrollY, 0);
    f.scroll(100); await f.navigate('stats'); assert.equal(f.browser.scrollY, 0);
  });
});

test('mounted Plan retains independent Week and Exercises offsets without storing browser data', async () => {
  await mounted(async f => {
    await f.render('plan'); f.scroll(140);
    await f.navigate('plan', 'exercises'); assert.equal(f.browser.scrollY, 0); f.scroll(600);
    await f.navigate('plan', 'week'); assert.equal(f.browser.scrollY, 140);
    await f.navigate('home'); await f.navigate('plan', 'exercises'); assert.equal(f.browser.scrollY, 600);
    assert.equal(f.browser.localStorage.length, 0);
    assert.equal(f.browser.sessionStorage.length, 0);
  });
});

test('mounted scroll restoration does not run on ticks, same-tab renders, resize, focus or body-lock changes', async () => {
  await mounted(async f => {
    await f.render('workout'); f.scroll(180); const count = f.calls.length;
    await f.render('workout'); f.browser.dispatchEvent(new f.browser.Event('resize'));
    f.browser.document.body.style.overflow = 'hidden'; f.flushFrames();
    f.browser.document.body.style.overflow = ''; await f.render('workout');
    assert.equal(f.calls.length, count); assert.equal(f.browser.scrollY, 180);
  });
});

test('mounted Workout scroll is invalidated on finish/cancel and a replacement session starts at top', async () => {
  await mounted(async f => {
    await f.render('workout'); f.scroll(500); await f.navigate('home', 'week', null);
    await f.navigate('workout', 'week', 'session-b'); assert.equal(f.browser.scrollY, 0);
    f.scroll(250); await f.navigate('plan', 'week', 'session-b');
    await f.navigate('workout', 'week', 'session-c'); assert.equal(f.browser.scrollY, 0);
  });
});

test('mounted navigation ignores modal offsets, waits for focus/body unlock, and clamps to available height', async () => {
  await mounted(async f => {
    await f.render('plan'); f.scroll(200);
    f.browser.document.body.style.overflow = 'hidden'; f.scroll(0);
    const count = f.calls.length; await f.navigate('workout'); assert.equal(f.calls.length, count);
    f.browser.document.body.style.overflow = ''; f.flushFrames(); assert.equal(f.browser.scrollY, 0);
    await f.navigate('plan', 'week', 'session-a', 944); assert.equal(f.browser.scrollY, 100);
  });
});

test('mounted rest slot remains measured, hidden and inert after expiry, then releases on session end', async () => {
  await mounted(async f => {
    await f.renderTimer(90, true); assert.deepEqual(f.heights, [66]);
    assert.ok(f.browser.document.querySelector('.bottom-above-nav'));
    await f.renderTimer(0, true);
    assert.equal(f.browser.document.querySelector('.bottom-above-nav'), null);
    const slot = f.browser.document.querySelector('.rest-timer-slot'); assert.ok(slot);
    assert.equal(slot.getAttribute('aria-hidden'), 'true'); assert.ok(slot.hasAttribute('inert'));
    f.resizeTimer(82); assert.equal(f.heights.at(-1), 82);
    await f.renderTimer(0, false); assert.equal(f.browser.document.querySelector('.rest-timer-slot'), null);
  });
});
