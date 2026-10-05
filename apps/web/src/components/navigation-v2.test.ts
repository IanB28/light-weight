import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BottomNav, BottomNavItem, type TabType } from './BottomNav.js';
import { WeightWidget } from './WeightWidget.js';
import { MaskedPngIcon } from './ui/MaskedPngIcon.js';
import { NAVIGATION_ICON_ASSETS, SEMANTIC_ICON_ASSETS } from './ui/icon-assets.js';

const tabs: TabType[] = ['home', 'plan', 'workout', 'stats', 'exercises'];

test('MaskedPngIcon uses both CSS mask engines, currentColor, className, and decorative semantics', () => {
  const html = renderToStaticMarkup(React.createElement(MaskedPngIcon, {
    src: '/icons/navigation/home.png',
    className: 'size-5 test-class',
    opticalScale: 1.05
  }));

  assert.match(html, /aria-hidden="true"/);
  assert.match(html, /data-icon-src="\/icons\/navigation\/home\.png"/);
  assert.match(html, /size-5 test-class/);
  assert.match(html, /background-color:currentColor/);
  assert.match(html, /mask-image:url\(&quot;\/icons\/navigation\/home\.png&quot;\)/);
  assert.match(html, /-webkit-mask-image:url\(&quot;\/icons\/navigation\/home\.png&quot;\)/);
  assert.match(html, /mask-repeat:no-repeat/);
  assert.match(html, /mask-position:center/);
  assert.match(html, /mask-size:contain/);
  assert.doesNotMatch(html, /<img/);
});

test('BottomNav renders five equal-width destinations with one selected internal pill and exact assets', () => {
  for (const currentTab of tabs) {
    const html = renderToStaticMarkup(React.createElement(BottomNav, {
      currentTab,
      isWorkoutActive: false,
      onSelectTab: () => undefined
    }));

    assert.equal((html.match(/type="button"/g) || []).length, 5);
    assert.equal((html.match(/aria-current="page"/g) || []).length, 1);
    assert.equal((html.match(/data-active="true"/g) || []).length, 1);
    assert.equal((html.match(/bottom-nav-item /g) || []).length, 5);
    assert.match(html, /bottom-nav-surface[^\"]*rounded-full/);
    assert.match(html, /Inicio/);
    assert.match(html, /Plan/);
    assert.match(html, /Entrenar/);
    assert.match(html, /Progreso/);
    assert.match(html, /Ejercicios/);
    for (const asset of Object.values(NAVIGATION_ICON_ASSETS)) {
      assert.match(html, new RegExp(asset.src.replaceAll('/', '\\/').replace('.', '\\.')));
    }
  }
});

test('BottomNavItem invokes the selected tab and keeps running workout state independent', () => {
  let selected: TabType | null = null;
  const item = BottomNavItem({
    tab: { id: 'workout', label: 'Entrenar', icon: NAVIGATION_ICON_ASSETS.workout },
    isActive: false,
    isWorkoutActive: true,
    mobileKeyboardOpen: false,
    workoutActiveLabel: 'Continuar entrenamiento activo',
    sessionActiveLabel: 'Sesión en curso',
    onSelectTab: (tab) => { selected = tab; }
  }) as React.ReactElement<{ onClick: () => void }>;

  item.props.onClick();
  assert.equal(selected, 'workout');

  const html = renderToStaticMarkup(item);
  assert.doesNotMatch(html, /aria-current="page"/);
  assert.match(html, /data-workout-running="true"/);
  assert.match(html, /data-testid="workout-running-indicator"/);
  assert.match(html, /Sesión en curso/);
});

test('navigation layout keeps equal tab widths and visual-only selection with accessibility fallbacks', () => {
  const source = readFileSync(new URL('../../src/components/BottomNav.tsx', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../../src/index.css', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../../src/App.tsx', import.meta.url), 'utf8');
  assert.match(source, /EDITABLE_SELECTOR/);
  assert.match(source, /addEventListener\('focusin'/);
  assert.match(source, /inert=\{mobileKeyboardOpen\}/);
  assert.match(source, /aria-hidden=\{mobileKeyboardOpen \|\| undefined\}/);
  assert.match(css, /--bottom-nav-bottom-gap: max\(0\.5rem, env\(safe-area-inset-bottom\)\)/);
  assert.match(source, /pointer-events-none fixed inset-x-0 bottom-0/);
  assert.doesNotMatch(source, /pointer-events-none (?:sticky|absolute) inset-x-0 bottom-0/);
  assert.match(source, /createPortal\(navigation, document\.body\)/);
  assert.match(source, /mobileKeyboardOpen \? 'translate-y-\[120%\]' : 'transform-none'/);
  assert.match(source, /motion-reduce:transition-none/);
  assert.doesNotMatch(source, /w-1\/5/);
  assert.doesNotMatch(source, /translate3d/);
  assert.doesNotMatch(source, /scale-\[1\.08\]|active:scale/);
  assert.doesNotMatch(source, /BarChart2|Calendar|Dumbbell|\bHome\b|\bList\b/);
  assert.match(css, /\.bottom-nav-item\s*\{\s*flex: 1 1 0%/);
  assert.doesNotMatch(css, /flex-grow|transition:\s*width|transition:\s*flex/);
  assert.match(css, /\.bottom-nav-item::before\s*\{[^}]*border-radius: 9999px/s);
  assert.match(css, /\.bottom-nav-item\[data-active="true"\]::before\s*\{[^}]*background: var\(--nav-active-bg\)/s);
  assert.match(css, /@supports not \(\(backdrop-filter:/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /prefers-reduced-transparency/);
  assert.match(css, /prefers-contrast: more/);
  assert.match(css, /@media \(forced-colors: active\)\s*\{\s*\.bottom-nav-surface/);
  assert.match(css, /\.pb-page-safe\s*\{[^}]*--bottom-nav-height[^}]*safe-area-inset-bottom/s);
  assert.match(app, /min-h-\[100dvh\][^"\n]*overflow-x-clip/);
  assert.doesNotMatch(app, /overflow-x-hidden/);
});

test('keyboard-hidden destinations leave the tab order without changing selection or labels', () => {
  const html = renderToStaticMarkup(React.createElement(BottomNavItem, {
    tab: { id: 'plan', label: 'Plan', icon: NAVIGATION_ICON_ASSETS.plan },
    isActive: true,
    isWorkoutActive: false,
    mobileKeyboardOpen: true,
    workoutActiveLabel: 'Continuar entrenamiento activo',
    sessionActiveLabel: 'Sesión en curso',
    onSelectTab: () => undefined
  }));
  assert.match(html, /tabindex="-1"/);
  assert.match(html, /aria-current="page"/);
  assert.match(html, /aria-label="Plan"/);
  assert.doesNotMatch(html, /workout-running-indicator/);
});

test('semantic icon call sites use bodyweight artwork while Stats balance retains Scale', () => {
  const profile = readFileSync(new URL('../../src/features/profile/ProfileView.tsx', import.meta.url), 'utf8');
  const tracker = readFileSync(new URL('../../src/components/WeightTrackerCard.tsx', import.meta.url), 'utf8');
  const modal = readFileSync(new URL('../../src/components/BodyweightModal.tsx', import.meta.url), 'utf8');
  const widget = readFileSync(new URL('../../src/components/WeightWidget.tsx', import.meta.url), 'utf8');
  const stats = readFileSync(new URL('../../src/views/StatsView.tsx', import.meta.url), 'utf8');

  assert.match(profile, /SEMANTIC_ICON_ASSETS\.personalRecord/);
  assert.doesNotMatch(profile, /<Award/);
  assert.match(tracker, /SEMANTIC_ICON_ASSETS\.bodyweight/);
  assert.match(tracker, /SEMANTIC_ICON_ASSETS\.goalWeight/);
  assert.match(modal, /SEMANTIC_ICON_ASSETS\.bodyweight/);
  assert.match(modal, /SEMANTIC_ICON_ASSETS\.goalWeight/);
  assert.match(widget, /icon === 'target'/);
  assert.match(widget, /SEMANTIC_ICON_ASSETS\.goalWeight/);
  assert.match(widget, /SEMANTIC_ICON_ASSETS\.bodyweight/);
  assert.match(stats, /SEMANTIC_ICON_ASSETS\.bodyweight/);
  assert.match(stats, /<Scale className="w-3\.5 h-3\.5" \/>\s*<span>\{t\('stats\.balance'\)\}/);
});

test('WeightWidget semantic API renders the bodyweight and goal masks', () => {
  const bodyweight = renderToStaticMarkup(React.createElement(WeightWidget, {
    value: 75,
    unit: 'kg',
    label: 'Peso actual',
    icon: 'scale',
    onChange: () => undefined
  }));
  const goal = renderToStaticMarkup(React.createElement(WeightWidget, {
    value: 70,
    unit: 'kg',
    label: 'Meta',
    icon: 'target',
    onChange: () => undefined
  }));

  assert.match(bodyweight, /data-icon-src="\/icons\/ui\/weight\.png"/);
  assert.match(goal, /data-icon-src="\/icons\/ui\/goal\.png"/);
});

test('the committed PNGs are the exact supplied artwork', () => {
  const expected = new Map([
    ['/icons/navigation/home.png', 'fcff8a857e112dd33944ffada1d1a808bf59c9f8918bd49925b1e4c9106130ef'],
    ['/icons/navigation/plan.png', '7924898f089917f2a114f8d6e8599e833c84737e88868a73fb05a117b2cffd54'],
    ['/icons/navigation/workout.png', '598a490d9dba61c96b8f3f762c047232b018a397930b83e553fb226717363f66'],
    ['/icons/navigation/progress.png', 'd761ebd736a96cf48d57e3ff20e31133348316be3531b5434f4ab69c325c4455'],
    ['/icons/navigation/exercises.png', 'f5735d26dfc774c92ad5a4e79d698a4d15aff302b81a141356618fa0505a908d'],
    ['/icons/ui/pr_icon.png', '6fe0279560c883a128fc95b8802d4b831f453c546370001616ab2516709088f6'],
    ['/icons/ui/weight.png', '28aa197625e43db28b6042fcc3306bfe516dd0c78cd22de6f8d666c93d4f8102'],
    ['/icons/ui/goal.png', '9dffeadab613b85fdab48e7937487febe94541dfdb1db5983bb6b5304ed3afb6']
  ]);

  const allAssets = [...Object.values(NAVIGATION_ICON_ASSETS), ...Object.values(SEMANTIC_ICON_ASSETS)];
  for (const asset of allAssets) {
    const bytes = readFileSync(new URL(`../../public${asset.src}`, import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), expected.get(asset.src));
  }
});
