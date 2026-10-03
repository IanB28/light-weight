import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AppCard, ElevatedSurface } from './Surface.js';
import { Button, IconButton } from './Button.js';
import { Badge, Chip, SegmentedControl } from './SelectionControls.js';
import { SearchInput } from './FormControls.js';
import { SectionHeader } from './SectionHeader.js';
import { Modal, BottomSheet } from './Disclosure.js';
import { OptionPicker } from './OptionPicker.js';
import { EmptyState, LoadingState, ErrorState } from './FeedbackState.js';

const source = (path: string) => readFileSync(resolve(process.cwd(), 'src', path), 'utf8');
const render = (element: React.ReactElement) => renderToStaticMarkup(element);

test('shared primitives avoid legacy dark-only classes and arbitrary visual roles', () => {
  for (const path of [
    'components/ui/Button.tsx', 'components/ui/Surface.tsx',
    'components/ui/SectionHeader.tsx', 'components/ui/SelectionControls.tsx',
    'components/ui/FormControls.tsx', 'components/ui/Disclosure.tsx',
    'components/ui/OptionPicker.tsx', 'components/ui/FeedbackState.tsx',
    'components/ViewHeader.tsx'
  ]) {
    const contents = source(path);
    assert.doesNotMatch(contents, /\b(?:text-white|text-zinc-\d+|bg-black(?:\/\d+)?|border-white(?:\/\d+)?|rounded-\[)/, path);
    assert.doesNotMatch(contents, /#[0-9a-f]{3,8}\b/i, path);
    assert.doesNotMatch(contents, /backdrop-blur-(?:sm|md|lg|xl|2xl|3xl)|\bshadow-(?:sm|md|lg|xl|2xl)/, path);
  }
});

test('all six themes and semantic accessibility fallbacks remain defined in the CSS authority', () => {
  const css = source('index.css');
  assert.match(css, /:root\s*\{/);
  for (const theme of ['carbon', 'sunset', 'frost', 'aurora', 'amethyst']) {
    assert.match(css, new RegExp(`html\\[data-theme="${theme}"\\]\\s*\\{`));
  }
  for (const token of ['surface-solid', 'surface-elevated-solid', 'focus-ring', 'overlay-backdrop', 'overlay-backdrop-solid', 'warning', 'warning-soft']) {
    assert.match(css, new RegExp(`--${token}:`), token);
  }
  assert.match(css, /html\[data-theme="frost"\]\s*\{[^}]*--focus-ring:[^}]*--overlay-backdrop:/s);
  assert.match(css, /@supports not \(\(backdrop-filter:/);
  assert.match(css, /@media \(prefers-reduced-transparency: reduce\)/);
  assert.match(css, /@media \(prefers-contrast: more\)/);
  assert.match(css, /@media \(forced-colors: active\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /\.ui-focus-visible:focus-visible/);
  assert.match(css, /\.ui-screen-title/);
  assert.match(css, /\.ui-section-title/);
  assert.match(css, /\.ui-card-title/);
  assert.match(css, /\.ui-metric/);
  assert.match(css, /\.ui-unit/);
  assert.match(css, /\.ui-control-surface\s*\{[^}]*border-color:\s*var\(--text-secondary\)/s);
  assert.match(css, /\.ui-selected-option\s*\{[^}]*var\(--accent-color\)/s);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.ui-pressable:active:not\(:disabled\)\s*\{\s*transform:\s*none/s);
});

test('Button variants and sizes retain stable geometry and native disabled/loading semantics', () => {
  for (const variant of ['primary', 'secondary', 'ghost', 'danger'] as const) {
    const html = render(React.createElement(Button, { variant, size: 'md' }, variant));
    assert.match(html, /ui-focus-visible ui-pressable/);
    assert.match(html, /min-h-11/);
    assert.doesNotMatch(html, /active:scale-\[/);
  }
  for (const [size, height] of [['sm', 'min-h-10'], ['md', 'min-h-11'], ['lg', 'min-h-12']] as const) {
    assert.match(render(React.createElement(Button, { size }, size)), new RegExp(height));
  }
  const loading = render(React.createElement(Button, { loading: true }, 'Save'));
  assert.match(loading, /disabled=""/);
  assert.match(loading, /aria-busy="true"/);
  assert.match(loading, /aria-hidden="true"/);
  assert.match(render(React.createElement(Button, { disabled: true }, 'Save')), /disabled=""/);
});

test('IconButton requires a label by type and has practical circular touch targets', () => {
  assert.match(source('components/ui/Button.tsx'), /'aria-label': string/);
  for (const [size, dimension] of [['sm', 'size-11'], ['md', 'size-12']] as const) {
    const html = render(React.createElement(IconButton, { 'aria-label': 'Close', size }, '×'));
    assert.match(html, /aria-label="Close"/);
    assert.match(html, new RegExp(dimension));
    assert.match(html, /rounded-full/);
  }
});

test('AppCard and ElevatedSurface expose normal, compact, elevated, and interactive levels', () => {
  assert.match(render(React.createElement(AppCard, null, 'Normal')), /glass-surface[^\"]*p-card/);
  assert.match(render(React.createElement(AppCard, { compact: true }, 'Compact')), /p-card-compact/);
  assert.match(render(React.createElement(AppCard, { elevated: true }, 'Elevated')), /ui-elevated-surface/);
  const interactive = render(React.createElement(AppCard, { interactive: true }, 'Interactive'));
  assert.match(interactive, /ui-interactive-surface/);
  assert.doesNotMatch(interactive, /scale-\[/);
  assert.match(render(React.createElement(ElevatedSurface, null, 'Floating')), /ui-elevated-surface/);
});

test('Badge is passive while Chip and segmented options expose stable selection', () => {
  assert.match(render(React.createElement(Badge, null, 'Syncing')), /<span[^>]*>Syncing<\/span>/);
  const chip = render(React.createElement(Chip, { selected: true }, 'Chest'));
  assert.match(chip, /aria-pressed="true"/);
  assert.match(chip, /ui-focus-visible/);
  assert.doesNotMatch(chip, /shadow-accent|scale-\[/);
  const segmented = render(React.createElement(SegmentedControl, {
    value: 'grid', label: 'Layout', options: [{ value: 'grid', label: 'Grid' }, { value: 'list', label: 'List' }], onChange: () => undefined
  }));
  assert.match(segmented, /role="group" aria-label="Layout"/);
  assert.equal((segmented.match(/aria-pressed="true"/g) || []).length, 1);
  assert.equal((segmented.match(/min-h-11/g) || []).length, 2);
  assert.doesNotMatch(segmented, /shadow-sm|scale-\[/);
  assert.match(segmented, /ui-segmented-control/);
});

test('SearchInput and OptionPicker retain labels and selection semantics', () => {
  const search = render(React.createElement(SearchInput, { label: 'Search exercises', placeholder: 'Search' }));
  assert.match(search, /<label/);
  assert.match(search, /Search exercises/);
  assert.match(search, /type="search"/);
  assert.match(search, /ui-focus-visible ui-control-surface h-11/);
  const picker = render(React.createElement(OptionPicker, {
    value: 'all', options: [{ value: 'all', label: 'All' }, { value: 'barbell', label: 'Barbell' }],
    onChange: () => undefined, ariaLabel: 'Equipment'
  }));
  assert.match(picker, /aria-haspopup="dialog"/);
  assert.match(picker, /aria-expanded="false"/);
  const pickerSource = source('components/ui/OptionPicker.tsx');
  for (const attribute of ['role="listbox"', 'role="option"', 'aria-selected']) assert.ok(pickerSource.includes(attribute));
  assert.match(pickerSource, /ui-selected-option/);
});

test('SectionHeader keeps a distinct title, metadata, and width-bounded action', () => {
  const html = render(React.createElement(SectionHeader, {
    title: 'A long section heading', meta: 'Metadata', action: React.createElement(Button, null, 'Action')
  }));
  assert.match(html, /<h2[^>]*ui-section-title/);
  assert.match(html, /Metadata/);
  assert.match(html, /max-w-\[45%\]/);
  assert.match(html, /Action/);
});

test('Modal and BottomSheet retain dialog linkage, focus behavior, and safe-area geometry', () => {
  const modal = render(React.createElement(Modal, {
    open: true, onClose: () => undefined, title: 'Settings', description: 'Choose an option', children: React.createElement('p', null, 'Body')
  }));
  assert.match(modal, /ui-modal-backdrop/);
  assert.match(modal, /ui-modal-surface/);
  assert.match(modal, /role="dialog" aria-modal="true"/);
  const titleId = modal.match(/aria-labelledby="([^"]+)"/)?.[1];
  const descriptionId = modal.match(/aria-describedby="([^"]+)"/)?.[1];
  assert.ok(titleId && modal.includes(`id="${titleId}"`));
  assert.ok(descriptionId && modal.includes(`id="${descriptionId}"`));
  const sheet = render(React.createElement(BottomSheet, {
    open: true, onClose: () => undefined, title: 'Filters', children: React.createElement('p', null, 'Body')
  }));
  assert.match(sheet, /bottom-0 left-0 right-0/);
  assert.match(sheet, /safe-area-inset-bottom/);
  assert.match(sheet, /sm:static/);
  const disclosureSource = source('components/ui/Disclosure.tsx');
  for (const contract of ['createPortal(content, document.body)', "event.key === 'Escape'", "event.key !== 'Tab'", 'previousFocus.current.focus()', "document.body.style.overflow = 'hidden'"]) {
    assert.ok(disclosureSource.includes(contract), contract);
  }
});

test('Empty, Loading, and Error states share geometry with restrained semantic tones', () => {
  const empty = render(React.createElement(EmptyState, { title: 'Nothing here', description: 'Try another filter', icon: React.createElement('span', null, '•') }));
  const loading = render(React.createElement(LoadingState, { title: 'Loading' }));
  const error = render(React.createElement(ErrorState, { title: 'Could not load', onAction: () => undefined, actionLabel: 'Retry' }));
  for (const html of [empty, loading, error]) assert.match(html, /size-11 shrink-0/);
  assert.match(loading, /motion-safe:animate-spin/);
  assert.match(error, /bg-danger-soft/);
  assert.match(error, /Retry/);
});

test('ViewHeader consumes shared screen hierarchy without changing status behavior', () => {
  const header = source('components/ViewHeader.tsx');
  assert.match(header, /ui-screen-title/);
  assert.match(header, /ui-focus-visible/);
  for (const contract of ['subscribeToSyncStatus', 'ProfileIdentityButton', 'onOpenSettings', 'isWorkoutActive', 'isOffline']) {
    assert.ok(header.includes(contract), contract);
  }
});
