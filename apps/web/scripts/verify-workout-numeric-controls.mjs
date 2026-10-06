// Run against the actual App entry (Vite dev or built preview), never a wider SetRow fixture.
// Optional PLAYWRIGHT_MODULE points at an existing installation; no dependency changes needed.
// Browser storage is synthetic and isolated. All /api requests are blocked: no remote writes.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const { chromium, webkit } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url = process.env.WORKOUT_QA_URL || 'http://localhost:5188';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(url).hostname), 'Use a local dev server only');
const referenceUrl = process.env.WORKOUT_QA_REFERENCE_URL;
if (referenceUrl) assert.ok(['localhost', '127.0.0.1'].includes(new URL(referenceUrl).hostname), 'Use a local historical App only');
const versions = referenceUrl ? [{ name: 'historical', url: referenceUrl }, { name: 'restored', url }] : [{ name: 'restored', url }];
const output = resolve(process.env.WORKOUT_QA_OUTPUT || 'output/playwright/vp3-r2');
await mkdir(output, { recursive: true });
const widths = [320, 360, 375, 390, 393, 414, 430, 448];
const themes = ['midnight', 'carbon', 'sunset', 'frost', 'aurora', 'amethyst'];
const selectedThemes = process.env.WORKOUT_QA_THEMES ? process.env.WORKOUT_QA_THEMES.split(',') : themes;
assert.ok(selectedThemes.length && selectedThemes.every(theme => themes.includes(theme)), 'Unsupported theme');
const quick = process.env.WORKOUT_QA_QUICK === '1';
const checkedWidths = process.env.WORKOUT_QA_WIDTHS ? process.env.WORKOUT_QA_WIDTHS.split(',').map(Number) : quick ? [390] : widths;
assert.ok(checkedWidths.length && checkedWidths.every(width => widths.includes(width)), 'Unsupported viewport');
const geometryOnly = process.env.WORKOUT_QA_GEOMETRY_ONLY === '1';
const screenshotWidths = process.env.WORKOUT_QA_SCREENSHOT_WIDTHS ? process.env.WORKOUT_QA_SCREENSHOT_WIDTHS.split(',').map(Number) : widths;
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
  const user = { id: 'vp3-r2-local-browser-only', email: 'qa@example.invalid', username: 'numericqa',
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
      reps: set === 4 ? 0 : 123, completed: set === 1, rir: set === 2 ? 6 : undefined, setType: ['working', 'warmup', 'drop', 'backoff', 'working'][set] }))
  }));
  localStorage.setItem('lightweight_active_workout', JSON.stringify({ isWorkoutActive: true,
    workoutStartTime: new Date().toISOString(), activeRoutineName: 'VP.3-R2 — Real App numeric controls', exerciseSessions }));
}

function inspect({ mode, historical }) {
  const main = document.querySelector('main.max-w-md');
  const rows = [...main.querySelectorAll('.grid.grid-cols-12.items-center')];
  const canvas = document.createElement('canvas').getContext('2d');
  const problems = [], limitations = [], inputs = [], controls = [], rowGeometry = [], completionGeometry = [];
  const visible = innerWidth >= 390;
  if (rows.length !== 15) problems.push(`Expected 15 restored App set rows, found ${rows.length}`);
  if (main.getBoundingClientRect().width > 448.1) problems.push('Real App max-w-md shell lost');
  if (document.documentElement.scrollWidth > innerWidth) problems.push('Horizontal document overflow');
  if (document.querySelector('vite-error-overlay')) problems.push('Vite error overlay');
  for (const [rowIndex, row] of rows.entries()) {
    const bounds = row.getBoundingClientRect();
    const cells = [...row.children];
    if (cells.map(cell => [...cell.classList].find(c => c.startsWith('col-span-'))).join(',') !==
      'col-span-1,col-span-4,col-span-3,col-span-2,col-span-2') problems.push('Not exactly five historical cells');
    const boxes = cells.map(cell => cell.getBoundingClientRect());
    for (let i = 1; i < boxes.length; i++) {
      if (boxes[i - 1].right > boxes[i].left + 0.5) problems.push('Overlapping primary numeric cells');
      if (Math.abs((boxes[i].top + boxes[i].bottom) / 2 - (boxes[0].top + boxes[0].bottom) / 2) > 0.5)
        problems.push('Detached secondary row');
    }
    rowGeometry.push({ width: bounds.width, height: bounds.height, cells: boxes.map(b => ({ width: b.width, height: b.height })) });
    const buttons = [...row.querySelectorAll('button[aria-label]')].filter(button =>
      /^(Reduce|Increase|Reducir|Aumentar)/.test(button.getAttribute('aria-label')));
    if (buttons.length !== (mode === 'plates' ? 2 : 4)) problems.push('Missing numeric stepper');
    for (const button of buttons) {
      const box = button.getBoundingClientRect(), css = getComputedStyle(button);
      const shown = css.display !== 'none' && css.visibility === 'visible' && box.width > 0 && box.height > 0;
      if (shown !== visible) problems.push('Incorrect historical stepper visibility');
      if (shown && (box.left < bounds.left - 0.5 || box.right > bounds.right + 0.5)) problems.push('Stepper outside row');
      if (shown && (css.pointerEvents === 'none' || button.disabled)) problems.push('Inaccessible stepper');
      const nominal = /weight|peso/.test(button.getAttribute('aria-label')) ? 28 : 24;
      if (shown && (box.width > nominal + 0.5 || box.height < 43.5)) problems.push('Unexpected stepper geometry');
      controls.push({ rowIndex, label: button.getAttribute('aria-label'), shown, nominal, width: box.width, height: box.height });
      if (!shown || box.width < 44) limitations.push({ kind: shown ? 'historical-small-target' : 'historical-hidden-below-390', rowIndex, width: box.width });
    }
    for (const cell of cells.slice(1, 3)) {
      const control = cell.querySelector('input') || cell.querySelector('button:not([class*="hidden"])');
      const step = [...cell.querySelectorAll('button[aria-label]')].filter(b => buttons.includes(b));
      if (step.length && !(step[0].compareDocumentPosition(control) & Node.DOCUMENT_POSITION_FOLLOWING &&
        control.compareDocumentPosition(step[1]) & Node.DOCUMENT_POSITION_FOLLOWING)) problems.push('Incorrect inline order');
      const shownChildren = [...cell.children].map(e => e.getBoundingClientRect()).filter(b => b.width > 0);
      for (let i = 1; i < shownChildren.length; i++) if (shownChildren[i - 1].right > shownChildren[i].left + 0.5)
        problems.push('Overlapping inline controls');
    }
    for (const input of row.querySelectorAll('input')) {
      const css = getComputedStyle(input), available = input.clientWidth - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight);
      canvas.font = `${css.fontWeight} ${css.fontSize} ${css.fontFamily}`;
      const textWidth = canvas.measureText(input.value || input.placeholder).width;
      const clipped = textWidth > available + 0.5;
      if (!historical && parseFloat(css.fontSize) < 16) problems.push('Numeric input below 16px');
      if (clipped) limitations.push({ kind: 'historical-input-clipping', rowIndex, value: input.value, available, textWidth });
      if (input.inputMode === 'decimal') {
        if (/[+-]/.test(input.value) || (!historical && input.placeholder !== '0')) problems.push('Duplicated/signed draft');
        const prefix = input.parentElement.querySelector('span'), expectedPrefix = rowIndex < 5 ? '' : rowIndex < 10 ? '+' : '-';
        if ((prefix?.textContent || '') !== expectedPrefix) problems.push('Missing or incorrect loading prefix');
        if (prefix && prefix.getBoundingClientRect().right > input.getBoundingClientRect().left + parseFloat(css.paddingLeft))
          problems.push('Prefix overlaps digits');
      }
      inputs.push({ rowIndex, mode: input.inputMode, value: input.value, font: css.fontSize, width: input.clientWidth, available, textWidth, clipped });
      const expected = input.inputMode === 'decimal' ? ['80', '100', '102.5', '225.5', ''][rowIndex % 5] : rowIndex % 5 === 4 ? '' : '123';
      if (input.value !== expected) problems.push(`Incorrect restored number ${input.value} (expected ${expected})`);
    }
    for (const label of row.querySelectorAll('button span.truncate')) {
      if (label.scrollWidth > label.clientWidth) limitations.push({ kind: 'historical-plate-clipping', rowIndex, value: label.textContent });
    }
    const complete = cells[4].querySelector('button');
    const rir = cells[3].querySelector('button');
    const r = rir.getBoundingClientRect(), c = complete.getBoundingClientRect();
    const overlapX = Math.max(0, Math.min(r.right, c.right) - Math.max(r.left, c.left));
    const overlapY = Math.max(0, Math.min(r.bottom, c.bottom) - Math.max(r.top, c.top));
    if (overlapX > 0.5 && overlapY > 0.5) problems.push('RIR/completion overlap');
    if (c.right > bounds.right + 0.5 || c.left < bounds.left - 0.5) problems.push('Completion outside row');
    const css = getComputedStyle(complete);
    completionGeometry.push({ rowIndex, width: c.width, height: c.height, left: c.left, right: c.right,
      rirLeft: r.left, rirRight: r.right, overlapX, overlapY, rowHeight: bounds.height,
      flexShrink: css.flexShrink, flexBasis: css.flexBasis, minWidth: css.minWidth });
    if (c.width < 44) limitations.push({ kind: 'historical-completion-shrink', rowIndex, width: c.width, height: c.height });
    if (complete.getAttribute('aria-pressed') !== String(rowIndex % 5 === 1)) problems.push('Completed state lost');
    if (complete.disabled !== (rowIndex % 5 === 4)) problems.push('Invalid/valid completion state lost');
  }
  return { problems, limitations, inputs, controls, rowGeometry, completionGeometry, shellWidth: main.getBoundingClientRect().width, rows: rows.length };
}

async function activateNumericControl(page, control, touch = false) {
  // Test actual hit targets away from the frozen sticky header / bottom nav.
  await control.evaluate(button => button.scrollIntoView({ block: 'center' }));
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await control.evaluate(button => {
    const box = button.getBoundingClientRect();
    return button.contains(document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2));
  }), true, 'Numeric stepper center receives pointer hit');
  if (touch) await control.tap(); else await control.click();
}

const engines = process.env.WORKOUT_QA_ENGINE ? [process.env.WORKOUT_QA_ENGINE] : quick ? ['chromium'] : ['chromium', 'webkit'];
assert.ok(engines.every(engine => ['chromium', 'webkit'].includes(engine)), 'Unsupported browser engine');
for (const engineName of engines) {
  const engine = engineName === 'chromium' ? chromium : webkit;
  const browser = await engine.launch({ headless: true, timeout: 15_000, ...(engineName === 'chromium' && process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
  try {
    for (const version of versions) for (const theme of quick ? ['midnight'] : selectedThemes) for (const units of quick ? [process.env.WORKOUT_QA_UNITS === 'imperial' ? 'imperial' : 'metric'] : ['metric', 'imperial']) {
      for (const mode of quick ? [process.env.WORKOUT_QA_MODE === 'plates' ? 'plates' : 'keyboard'] : ['keyboard', 'plates']) {
        const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true,
          isMobile: engineName === 'chromium', serviceWorkers: 'block', reducedMotion: 'reduce' });
        await context.addInitScript(seed, { units, theme, mode, language });
        await context.route('**/*', route => {
          const requestUrl = new URL(route.request().url());
          return requestUrl.pathname.startsWith('/api/') || !['localhost', '127.0.0.1'].includes(requestUrl.hostname)
            ? route.abort() : route.continue();
        });
        const page = await context.newPage();
        page.setDefaultTimeout(30_000);
        page.setDefaultNavigationTimeout(30_000);
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        try {
          for (const width of checkedWidths) {
            console.log(`CHECK ${version.name}/${engineName}/${theme}/${units}/${mode}/${width}`);
            await page.setViewportSize({ width, height: 844 });
            if (width === checkedWidths[0]) {
              await page.goto(version.url);
              await page.getByRole('button', { name: labels.train }).click();
              await page.locator('input[inputmode="numeric"]').first().waitFor();
            }
            await page.waitForLoadState('networkidle');
            await page.evaluate(() => document.fonts.ready);
            const inspection = { mode, historical: version.name === 'historical' };
            const result = await page.evaluate(inspect, inspection);
            const baseline = results.find(item => item.version === 'historical' && item.engine === engineName &&
              item.theme === theme && item.units === units && item.mode === mode && item.width === width);
            if (version.name === 'restored' && baseline) {
              for (const input of result.inputs.filter(input => input.clipped)) {
                const prior = baseline.inputs.find(item => item.rowIndex === input.rowIndex && item.mode === input.mode);
                if (!prior?.clipped) result.problems.push(`New clipping outside historical exceptions: row ${input.rowIndex}, ${input.value}`);
              }
              for (const limitation of result.limitations.filter(item => item.kind === 'historical-plate-clipping')) {
                if (!baseline.limitations.some(item => item.kind === limitation.kind && item.rowIndex === limitation.rowIndex))
                  result.problems.push('New plate label clipping');
              }
            }
            assert.deepEqual(result.problems, [], `${engineName}/${theme}/${units}/${mode}/${width}`);
            if (version.name === 'restored' && width === 320 && theme === 'midnight') {
              const rigid = await page.addStyleTag({ content: '.grid.grid-cols-12.items-center > :last-child > button { flex-shrink: 0 !important; }' });
              const regression = await page.evaluate(inspect, inspection);
              assert.ok(regression.problems.includes('RIR/completion overlap'), 'Geometry guard detects rigid completion regression');
              await rigid.evaluate(element => element.remove());
            }
            if (width === 390 && theme === 'midnight') {
              // Prove this browser assertion detects the original regression, not merely markup presence.
              const hidden = await page.addStyleTag({ content: 'button[class*="min-[390px]:flex"] { display: none !important; }' });
              const regression = await page.evaluate(inspect, inspection);
              assert.ok(regression.problems.includes('Incorrect historical stepper visibility'));
              await hidden.evaluate(element => element.remove());
            }
            assert.deepEqual(errors, [], 'Browser runtime errors');
            // Both real engines measure every width; exercise editing below/at the gate,
            // including available steppers at 390px in every configuration.
            const interactionsChecked = !geometryOnly;
            if (interactionsChecked) {
            const firstRow = page.locator('.grid.grid-cols-12.items-center').first();
            const completion = firstRow.locator(':scope > :last-child > button');
            const rir = firstRow.locator(':scope > :nth-child(4) > button');
            const beforeHeight = await firstRow.evaluate(row => row.getBoundingClientRect().height);
            for (const control of [completion, rir]) {
              // Center in the real scroll viewport: nearest-edge scrolling can put
              // an upper row behind the existing sticky WorkoutHeader.
              await control.evaluate(button => button.scrollIntoView({ block: 'center' }));
              await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
              assert.equal(await control.evaluate(button => {
                const box = button.getBoundingClientRect();
                return button.contains(document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2));
              }), true, 'Control center receives pointer hit');
            }
            await rir.tap();
            assert.equal(await rir.getAttribute('aria-expanded'), 'true');
            await page.getByRole('option').nth(1).click();
            assert.equal(await rir.getAttribute('aria-expanded'), 'false');
            assert.equal(await rir.locator('span').textContent(), '0');
            await rir.focus();
            await rir.press('Enter');
            await page.getByRole('option').first().click();
            assert.equal(await rir.locator('span').textContent(), '—');
            await completion.tap();
            assert.equal(await completion.getAttribute('aria-pressed'), 'true');
            await completion.press('Enter');
            assert.equal(await completion.getAttribute('aria-pressed'), 'false');
            const skipRest = page.getByRole('button', { name: /^(Saltar descanso|Skip rest)$/ });
            if (await skipRest.count()) await skipRest.click();
            const disabled = page.locator('.grid.grid-cols-12.items-center').nth(4).locator(':scope > :last-child > button');
            assert.equal(await disabled.isDisabled(), true);
            await disabled.scrollIntoViewIfNeeded();
            const disabledBox = await disabled.boundingBox();
            await page.mouse.click(disabledBox.x + disabledBox.width / 2, disabledBox.y + disabledBox.height / 2);
            assert.equal(await disabled.getAttribute('aria-pressed'), 'false');
            assert.equal(await firstRow.evaluate(row => row.getBoundingClientRect().height), beforeHeight, 'Interaction leaves row height unchanged');
            const reps = page.locator('input[inputmode="numeric"]').first();
            if (width >= 390) {
            await activateNumericControl(page, page.getByRole('button', { name: labels.increaseReps, exact: true }).first());
            assert.equal(await reps.inputValue(), '124');
            await activateNumericControl(page, page.getByRole('button', { name: labels.reduceReps, exact: true }).first());
            assert.equal(await reps.inputValue(), '123');
            }
            await reps.fill('124');
            await reps.press('Tab');
            assert.equal(await reps.inputValue(), '124');
            await reps.fill('123');
            await reps.press('Tab');
            if (mode === 'keyboard') {
              const weight = page.locator('input[inputmode="decimal"]').first();
              if (width >= 390) {
              await activateNumericControl(page, page.getByRole('button', { name: labels.increaseWeight, exact: true }).first(), true);
              await page.waitForFunction(expected => document.querySelector('input[inputmode="decimal"]').value === expected, units === 'metric' ? '82.5' : '85', { timeout: 10_000 });
              await activateNumericControl(page, page.getByRole('button', { name: labels.reduceWeight, exact: true }).first(), true);
              await page.waitForFunction(() => document.querySelector('input[inputmode="decimal"]').value === '80', null, { timeout: 10_000 });
              }
              // Real keyboard focus and Enter commit through App -> useWorkoutSession.
              await weight.fill('102.5');
              await weight.press('Enter');
              assert.equal(await weight.inputValue(), '102.5');
              if (width >= 390) {
              const plus = page.getByRole('button', { name: labels.increaseReps, exact: true }).first();
              await plus.focus();
              await plus.press('Space');
              assert.equal(await reps.inputValue(), '124');
              await page.getByRole('button', { name: labels.reduceReps, exact: true }).first().press('Enter');
              assert.equal(await reps.inputValue(), '123');
              }
              for (const index of [9, 14]) {
                const zero = page.locator('input[inputmode="decimal"]').nth(index);
                await zero.fill('');
                await zero.press('Enter');
                assert.equal(await zero.inputValue(), '');
                assert.equal(await zero.evaluate(input => input.parentElement.querySelectorAll('span').length), 1);
                if (version.name === 'restored') assert.equal(await zero.getAttribute('placeholder'), '0');
              }
              await weight.fill('80');
              await weight.press('Enter');
              await page.waitForFunction(() => document.querySelector('input[inputmode="decimal"]').value === '80', null, { timeout: 10_000 });
            }
            }
            results.push({ version: version.name, engine: engineName, theme, units, mode, width, language, interactionsChecked, ...result });
            if (mode === 'keyboard' && units === 'imperial' && screenshotWidths.includes(width)) {
              await page.locator('input[inputmode="decimal"]').nth(13).scrollIntoViewIfNeeded();
              await page.screenshot({ path: resolve(output, `${version.name}-${engineName}-${theme}-${width}.png`) });
              await page.locator('.grid.grid-cols-12.items-center').nth(13).screenshot({ path: resolve(output, `${version.name}-${engineName}-${theme}-${width}-signed-row.png`) });
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
    if (referenceUrl) {
      // Compose two unaltered actual-App screenshots, not a replacement fixture.
      const compare = await browser.newPage();
      for (const theme of quick ? ['midnight'] : selectedThemes) for (const width of checkedWidths) {
        for (const suffix of ['', '-signed-row']) {
          const paths = ['historical', 'restored'].map(version => resolve(output, `${version}-${engineName}-${theme}-${width}${suffix}.png`));
          const images = await Promise.all(paths.map(path => readFile(path).then(bytes => `data:image/png;base64,${bytes.toString('base64')}`).catch(() => null)));
          if (images.some(image => !image)) continue;
          const png = await compare.evaluate(async images => {
            const loaded = await Promise.all(images.map(src => new Promise(resolve => { const img = new Image(); img.onload = () => resolve(img); img.src = src; })));
            const canvas = document.createElement('canvas');
            canvas.width = loaded[0].width + loaded[1].width;
            canvas.height = Math.max(...loaded.map(img => img.height)) + 24;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#000000'; ctx.font = '14px sans-serif';
            ctx.fillText('Historical 56074a8', 8, 17); ctx.fillText('Restored current App', loaded[0].width + 8, 17);
            ctx.drawImage(loaded[0], 0, 24); ctx.drawImage(loaded[1], loaded[0].width, 24);
            return canvas.toDataURL('image/png').split(',')[1];
          }, images);
          await writeFile(resolve(output, `comparison-${engineName}-${theme}-${width}${suffix}.png`), Buffer.from(png, 'base64'));
        }
      }
      await compare.close();
    }
  } finally { await browser.close(); }
  await writeFile(resolve(output, `${engineName}-results.json`), JSON.stringify(results.filter(item => item.engine === engineName), null, 2));
}
await writeFile(resolve(output, 'results.json'), JSON.stringify(results, null, 2));
console.log(JSON.stringify({ pass: results.length, failed: 0, engines: [...new Set(results.map(item => item.engine))],
  widths: [...new Set(results.map(item => item.width))], themes: [...new Set(results.map(item => item.theme))],
  versions: versions.map(version => version.name), acceptedLimitations: results.reduce((sum, item) => sum + item.limitations.length, 0),
  actualAppEntry: true, remoteApiBlocked: true, output }, null, 2));
