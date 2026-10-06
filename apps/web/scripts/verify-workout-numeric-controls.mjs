// Run against the actual App entry (Vite dev or built preview), never a wider SetRow fixture.
// Optional PLAYWRIGHT_MODULE points at an existing installation; no dependency changes needed.
// Browser storage is synthetic and isolated. All /api requests are blocked: no remote writes.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const { chromium, webkit } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url = process.env.WORKOUT_QA_URL || 'http://localhost:5188';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(url).hostname), 'Use a local dev server only');
const output = resolve(process.env.WORKOUT_QA_OUTPUT || 'output/playwright/vp3h3');
await mkdir(output, { recursive: true });
const widths = [320, 360, 375, 390, 393, 414, 430];
const themes = ['midnight', 'carbon', 'sunset', 'frost', 'aurora', 'amethyst'];
const quick = process.env.WORKOUT_QA_QUICK === '1';
const language = process.env.WORKOUT_QA_LANGUAGE === 'es' ? 'es' : 'en';
const labels = language === 'es' ? {
  train: 'Entrenar: continuar entrenamiento activo', increaseReps: 'Aumentar repeticiones de la serie 1',
  reduceReps: 'Reducir repeticiones de la serie 1', increaseWeight: 'Aumentar peso de la serie 1', reduceWeight: 'Reducir peso de la serie 1'
} : {
  train: 'Train: continue active workout', increaseReps: 'Increase reps for set 1',
  reduceReps: 'Reduce reps for set 1', increaseWeight: 'Increase weight for set 1', reduceWeight: 'Reduce weight for set 1'
};
const results = [];

function seed({ units, theme, mode, language }) {
  localStorage.clear();
  const user = { id: 'vp3h3-local-browser-only', email: 'qa@example.invalid', username: 'numericqa',
    displayName: 'Numeric QA', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  localStorage.setItem('lightweight_cached_auth_user_v1', JSON.stringify(user));
  localStorage.setItem('lightweight_data_scope', user.id);
  localStorage.setItem('lightweight_theme_settings', JSON.stringify({ glassTheme: theme, accentColor: 'indigo' }));
  localStorage.setItem('lightweight_preferences_v1', JSON.stringify({ units, language, weightInputMode: mode }));
  const exerciseSessions = ['total', 'added_weight', 'assisted'].map((loadMode, index) => ({
    exercise: { id: `numeric-qa-${index}`, name: `${loadMode} — Long exercise name for real narrow App shell`,
      category: index === 0 ? 'other' : 'bodyweight', primaryMuscle: 'chest',
      loading: { mechanism: index === 0 ? 'other' : 'bodyweight', loadMode, supportsKeyboard: true,
        supportsPlates: true, supportsExternalLoad: true, includeBarWeight: false,
        ...(loadMode === 'assisted' ? { bodyweightFactor: 1 } : {}) } },
    targetRepRange: [6, 12], usesAddedWeight: true, weightInputModeOverride: mode, skipped: false,
    sets: [80, 100, 102.5, 225.5, 0].map((weight, set) => ({ setIndex: set + 1,
      weightKg: units === 'imperial' ? weight * 0.45359237 : weight,
      reps: 123, completed: false, setType: 'working' }))
  }));
  localStorage.setItem('lightweight_active_workout', JSON.stringify({ isWorkoutActive: true,
    workoutStartTime: new Date().toISOString(), activeRoutineName: 'VP.3H3 — Real App numeric controls', exerciseSessions }));
}

function inspect(mode) {
  const main = document.querySelector('main.max-w-md');
  const rows = [...main.querySelectorAll('.grid.grid-cols-12.items-center')];
  const canvas = document.createElement('canvas').getContext('2d');
  const problems = [];
  const inputs = [];
  if (rows.length !== 15) problems.push(`Expected 15 restored App set rows, found ${rows.length}`);
  if (main.getBoundingClientRect().width > 448.1) problems.push('Real App max-w-md shell lost');
  if (document.documentElement.scrollWidth > innerWidth) problems.push('Horizontal document overflow');
  if (document.querySelector('vite-error-overlay')) problems.push('Vite error overlay');
  for (const [rowIndex, row] of rows.entries()) {
    const bounds = row.getBoundingClientRect();
    const cells = [...row.children].slice(0, 5).map(cell => cell.getBoundingClientRect());
    for (let i = 1; i < cells.length; i++) if (cells[i - 1].right > cells[i].left + 0.5)
      problems.push('Overlapping primary numeric cells');
    const buttons = [...row.querySelectorAll('button[aria-label]')].filter(button =>
      /^(Reduce|Increase|Reducir|Aumentar)/.test(button.getAttribute('aria-label')));
    if (buttons.length !== (mode === 'plates' ? 2 : 4)) problems.push('Missing numeric stepper');
    for (const button of buttons) {
      const box = button.getBoundingClientRect();
      const css = getComputedStyle(button);
      if (box.width < 44 || box.height < 44 || css.visibility !== 'visible') problems.push('Hidden or undersized stepper');
      if (box.left < bounds.left - 0.5 || box.right > bounds.right + 0.5) problems.push('Stepper outside row');
      if (css.pointerEvents === 'none' || button.disabled) problems.push('Inaccessible stepper');
    }
    const boxes = buttons.map(button => button.getBoundingClientRect());
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      if (boxes[i].right > boxes[j].left && boxes[j].right > boxes[i].left &&
          boxes[i].bottom > boxes[j].top && boxes[j].bottom > boxes[i].top) problems.push('Overlapping steppers');
    }
    for (const input of row.querySelectorAll('input')) {
      const css = getComputedStyle(input);
      const available = input.clientWidth - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight);
      canvas.font = `${css.fontWeight} ${css.fontSize} ${css.fontFamily}`;
      const textWidth = canvas.measureText(input.value || input.placeholder).width;
      if (parseFloat(css.fontSize) < 16) problems.push('Numeric input below 16px');
      if (textWidth > available + 0.5) problems.push(`Truncated ${input.value}`);
      if (input.inputMode === 'decimal') {
        if (/[+-]/.test(input.value) || input.placeholder !== '0') problems.push('Duplicated/signed draft');
        const prefix = input.parentElement.querySelector('span');
        const expectedPrefix = rowIndex < 5 ? '' : rowIndex < 10 ? '+' : '-';
        if ((prefix?.textContent || '') !== expectedPrefix) problems.push('Missing or incorrect loading prefix');
        if (prefix && prefix.getBoundingClientRect().right > input.getBoundingClientRect().left + parseFloat(css.paddingLeft))
          problems.push('Prefix overlaps digits');
      }
      inputs.push({ value: input.value, font: css.fontSize, width: input.clientWidth, available, textWidth });
      const expected = input.inputMode === 'decimal' ? ['80', '100', '102.5', '225.5', ''][rowIndex % 5] : '123';
      if (input.value !== expected) problems.push(`Incorrect restored number ${input.value} (expected ${expected})`);
    }
    for (const label of row.querySelectorAll('button span.truncate')) {
      if (label.scrollWidth > label.clientWidth) problems.push(`Truncated plate label ${label.textContent}`);
    }
  }
  return { problems, inputs, shellWidth: main.getBoundingClientRect().width, rows: rows.length,
    steppers: rows.reduce((sum, row) => sum + [...row.querySelectorAll('button[aria-label]')].filter(button =>
      /^(Reduce|Increase|Reducir|Aumentar)/.test(button.getAttribute('aria-label'))).length, 0) };
}

const engines = process.env.WORKOUT_QA_ENGINE ? [process.env.WORKOUT_QA_ENGINE] : quick ? ['chromium'] : ['chromium', 'webkit'];
assert.ok(engines.every(engine => ['chromium', 'webkit'].includes(engine)), 'Unsupported browser engine');
for (const engineName of engines) {
  const engine = engineName === 'chromium' ? chromium : webkit;
  const browser = await engine.launch({ headless: true, timeout: 15_000, ...(engineName === 'chromium' && process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
  try {
    for (const theme of quick ? ['midnight'] : themes) for (const units of quick ? [process.env.WORKOUT_QA_UNITS === 'imperial' ? 'imperial' : 'metric'] : ['metric', 'imperial']) {
      for (const mode of quick ? ['keyboard'] : ['keyboard', 'plates']) {
        const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true,
          isMobile: engineName === 'chromium', serviceWorkers: 'block', reducedMotion: 'reduce' });
        await context.addInitScript(seed, { units, theme, mode, language });
        await context.route('**/api/**', route => route.abort());
        const page = await context.newPage();
        page.setDefaultTimeout(30_000);
        page.setDefaultNavigationTimeout(30_000);
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        try {
          for (const width of quick ? [320] : widths) {
            console.log(`CHECK ${engineName}/${theme}/${units}/${mode}/${width}`);
            await page.setViewportSize({ width, height: 844 });
            if (width === 320) {
              await page.goto(url);
              await page.getByRole('button', { name: labels.train }).click();
              await page.locator('input[inputmode="numeric"]').first().waitFor();
            }
            await page.waitForLoadState('networkidle');
            await page.evaluate(() => document.fonts.ready);
            const result = await page.evaluate(inspect, mode);
            assert.deepEqual(result.problems, [], `${engineName}/${theme}/${units}/${mode}/${width}`);
            if (results.length === 0) {
              // Prove this browser assertion detects the original regression, not merely markup presence.
              const hidden = await page.addStyleTag({ content: '[role="group"] button { display: none !important; }' });
              const regression = await page.evaluate(inspect, mode);
              assert.ok(regression.problems.includes('Hidden or undersized stepper'));
              await hidden.evaluate(element => element.remove());
            }
            assert.deepEqual(errors, [], 'Browser runtime errors');
            // Chromium exercises actions at every width; WebKit does so at 320px per configuration.
            // Both engines measure visibility, targets, prefixes and full values at every width.
            const interactionsChecked = engineName === 'chromium' || width === 320;
            if (interactionsChecked) {
            const reps = page.locator('input[inputmode="numeric"]').first();
            await page.getByRole('button', { name: labels.increaseReps, exact: true }).first().click();
            assert.equal(await reps.inputValue(), '124');
            await page.getByRole('button', { name: labels.reduceReps, exact: true }).first().click();
            assert.equal(await reps.inputValue(), '123');
            if (mode === 'keyboard') {
              const weight = page.locator('input[inputmode="decimal"]').first();
              await page.getByRole('button', { name: labels.increaseWeight, exact: true }).first().tap();
              await page.waitForFunction(expected => document.querySelector('input[inputmode="decimal"]').value === expected, units === 'metric' ? '82.5' : '85', { timeout: 10_000 });
              await page.getByRole('button', { name: labels.reduceWeight, exact: true }).first().tap();
              await page.waitForFunction(() => document.querySelector('input[inputmode="decimal"]').value === '80', null, { timeout: 10_000 });
              // Real keyboard focus and Enter commit through App -> useWorkoutSession.
              await weight.fill('102.5');
              await weight.press('Enter');
              assert.equal(await weight.inputValue(), '102.5');
              const plus = page.getByRole('button', { name: labels.increaseReps, exact: true }).first();
              await plus.focus();
              await plus.press('Space');
              assert.equal(await reps.inputValue(), '124');
              await page.getByRole('button', { name: labels.reduceReps, exact: true }).first().press('Enter');
              assert.equal(await reps.inputValue(), '123');
              for (const index of [9, 14]) {
                const zero = page.locator('input[inputmode="decimal"]').nth(index);
                await zero.fill('');
                await zero.press('Enter');
                assert.equal(await zero.inputValue(), '');
                assert.equal(await zero.evaluate(input => input.parentElement.querySelectorAll('span').length), 1);
                assert.equal(await zero.getAttribute('placeholder'), '0');
              }
              await weight.fill('80');
              await weight.press('Enter');
              await page.waitForFunction(() => document.querySelector('input[inputmode="decimal"]').value === '80', null, { timeout: 10_000 });
            }
            }
            results.push({ engine: engineName, theme, units, mode, width, language, interactionsChecked, ...result });
            if (mode === 'keyboard' && units === 'imperial') {
              await page.locator('input[inputmode="decimal"]').nth(13).scrollIntoViewIfNeeded();
              await page.screenshot({ path: resolve(output, `${engineName}-${theme}-${width}.png`) });
              await page.locator('.grid.grid-cols-12.items-center').nth(13).screenshot({ path: resolve(output, `${engineName}-${theme}-${width}-signed-row.png`) });
            }
          }
          // Short visual viewport simulates keyboard occlusion, not a physical iOS keyboard.
          if (mode === 'keyboard') {
            await page.setViewportSize({ width: 393, height: 430 });
            const last = page.locator('input[inputmode="decimal"]').last();
            await last.focus();
            await last.scrollIntoViewIfNeeded();
            const box = await last.boundingBox();
            assert.ok(box.y >= 0 && box.y + box.height <= 430, 'Focused input under keyboard viewport');
            assert.equal(await page.evaluate(() => visualViewport.scale), 1);
          }
        } catch (error) {
          await page.screenshot({ path: resolve(output, 'failure.png') }).catch(() => {});
          await writeFile(resolve(output, 'failure.html'), await page.content()).catch(() => {});
          await writeFile(resolve(output, 'partial-results.json'), JSON.stringify(results, null, 2));
          throw error;
        } finally { await context.close(); }
      }
    }
  } finally { await browser.close(); }
  await writeFile(resolve(output, `${engineName}-results.json`), JSON.stringify(results.filter(item => item.engine === engineName), null, 2));
}
await writeFile(resolve(output, 'results.json'), JSON.stringify(results, null, 2));
console.log(JSON.stringify({ pass: results.length, failed: 0, engines: [...new Set(results.map(item => item.engine))],
  widths: [...new Set(results.map(item => item.width))], themes: [...new Set(results.map(item => item.theme))],
  actualAppEntry: true, remoteApiBlocked: true, output }, null, 2));
