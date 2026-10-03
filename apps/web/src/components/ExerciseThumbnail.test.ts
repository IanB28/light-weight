import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ExerciseThumbnail } from './ExerciseThumbnail.js';
import { shouldShowExerciseImage } from '../lib/exercise-thumbnail-state.js';

const render = (props: React.ComponentProps<typeof ExerciseThumbnail>) =>
  renderToStaticMarkup(React.createElement(ExerciseThumbnail, props));

test('catalog image has decorative alt, lazy async decoding and contained movement', () => {
  const markup = render({ exercise: { img: 'demo.jpg' } });
  assert.match(markup, /demo\.jpg/);
  assert.match(markup, /alt=""/);
  assert.match(markup, /loading="lazy"/);
  assert.match(markup, /decoding="async"/);
  assert.match(markup, /object-contain/);
  assert.match(render({ exercise: { img: 'demo.jpg' }, alt: 'Exercise demonstration' }), /alt="Exercise demonstration"/);
});

test('custom or unresolved exercise gets a stable icon fallback', () => {
  for (const exercise of [undefined, null, {}]) {
    const markup = render({ exercise });
    assert.doesNotMatch(markup, /<img/);
    assert.match(markup, /<svg/);
    assert.match(markup, /data-testid="exercise-thumbnail"/);
  }
  assert.match(render({ exercise: null, alt: 'Exercise demonstration' }), /role="img" aria-label="Exercise demonstration"/);
});

test('failed CDN URL switches to fallback without image retry', () => {
  const url = 'https://cdn.example/broken.jpg';
  assert.equal(shouldShowExerciseImage(url, null), true);
  assert.equal(shouldShowExerciseImage(url, url), false);
  assert.equal(shouldShowExerciseImage(null, url), false);
  assert.equal(shouldShowExerciseImage('https://cdn.example/new.jpg', url), true);
});

test('all size variants have fixed geometry and common surface tokens', () => {
  const sizes = { xs: 'size-9', sm: 'size-10', md: 'size-11', lg: 'size-12', fill: 'size-full' } as const;
  for (const [size, className] of Object.entries(sizes)) {
    const markup = render({ size: size as keyof typeof sizes });
    assert.match(markup, new RegExp(`data-size="${size}"`));
    assert.ok(markup.includes(className));
    assert.match(markup, /border-border-subtle/);
    assert.match(markup, /bg-surface-input/);
  }
});
