import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { AppLogo } from '../../components/brand/AppLogo.js';

const webRootDir = path.resolve(process.cwd());
const publicDir = path.join(webRootDir, 'public');

test('AppLogo component renders clean SVG reference with required attributes and accessibility props', () => {
  // 1. Default render
  const defaultHtml = ReactDOMServer.renderToStaticMarkup(
    React.createElement(AppLogo)
  );
  assert.match(defaultHtml, /<img\b/);
  assert.match(defaultHtml, /src="\/brand\/app-icon\.svg"/);
  assert.match(defaultHtml, /width="32"/);
  assert.match(defaultHtml, /height="32"/);
  assert.match(defaultHtml, /loading="lazy"/);
  assert.match(defaultHtml, /decoding="async"/);
  assert.match(defaultHtml, /alt="Light Weight"/);

  // 2. Custom size and class
  const customHtml = ReactDOMServer.renderToStaticMarkup(
    React.createElement(AppLogo, { size: 28, className: 'shrink-0 custom-logo' })
  );
  assert.match(customHtml, /width="28"/);
  assert.match(customHtml, /height="28"/);
  assert.match(customHtml, /class="[^"]*shrink-0 custom-logo[^"]*"/);

  // 3. Priority loading for auth / above-the-fold
  const priorityHtml = ReactDOMServer.renderToStaticMarkup(
    React.createElement(AppLogo, { priority: true, 'aria-hidden': 'true' })
  );
  assert.match(priorityHtml, /loading="eager"/);
  assert.match(priorityHtml, /fetchPriority="high"/i);
  assert.match(priorityHtml, /aria-hidden="true"/);
});

test('manifest.webmanifest defines standalone PWA identity with valid existing brand assets', () => {
  const manifestPath = path.join(publicDir, 'manifest.webmanifest');
  assert.ok(fs.existsSync(manifestPath), 'manifest.webmanifest must exist in public');

  const rawManifest = fs.readFileSync(manifestPath, 'utf8');
  const manifest = JSON.parse(rawManifest);

  assert.equal(manifest.name, 'Light Weight');
  assert.equal(manifest.short_name, 'Light Weight');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.orientation, 'portrait-primary');
  assert.equal(manifest.theme_color, '#000000');
  assert.equal(manifest.background_color, '#000000');

  assert.ok(Array.isArray(manifest.icons) && manifest.icons.length >= 4, 'Manifest must declare at least 4 icons');

  // Verify all referenced icons exist on disk and have non-zero size
  for (const icon of manifest.icons) {
    assert.ok(icon.src, 'Icon must have src');
    assert.ok(icon.sizes, 'Icon must have sizes');
    assert.ok(icon.type, 'Icon must have type');

    // src is formatted as "/brand/..."
    const relativeAssetPath = icon.src.replace(/^\//, '');
    const diskPath = path.join(publicDir, relativeAssetPath);
    assert.ok(fs.existsSync(diskPath), `Referenced icon ${icon.src} must exist at ${diskPath}`);
    const stat = fs.statSync(diskPath);
    assert.ok(stat.size > 0, `Icon ${icon.src} must not be empty`);
  }

  // Ensure maskable icon exists
  const maskableIcon = manifest.icons.find((i: { purpose?: string }) => i.purpose === 'maskable');
  assert.ok(maskableIcon, 'A maskable icon must be specified in manifest');
  assert.equal(maskableIcon.sizes, '512x512');
});

test('apple-touch-icon-180 exists and is valid for iOS home screen', () => {
  const appleTouchPath = path.join(publicDir, 'brand', 'apple-touch-icon-180.png');
  assert.ok(fs.existsSync(appleTouchPath), 'apple-touch-icon-180.png must exist');
  const stat = fs.statSync(appleTouchPath);
  assert.ok(stat.size > 1000, 'apple-touch-icon-180.png must be non-trivial');
});

test('index.html links brand assets, manifest, and standalone viewport settings', () => {
  const indexPath = path.join(webRootDir, 'index.html');
  const html = fs.readFileSync(indexPath, 'utf8');

  assert.match(html, /<link rel="icon" type="image\/svg\+xml" href="\/brand\/app-icon\.svg"\s*\/>/);
  assert.match(html, /<link rel="icon" type="image\/png" sizes="192x192" href="\/brand\/icon-192\.png"\s*\/>/);
  assert.match(html, /<link rel="apple-touch-icon" sizes="180x180" href="\/brand\/apple-touch-icon-180\.png"\s*\/>/);
  assert.match(html, /<link rel="manifest" href="\/manifest\.webmanifest"\s*\/>/);
  assert.match(html, /viewport-fit=cover/);
  assert.match(html, /apple-mobile-web-app-capable/);
});

test('sw.js uses versioned caches, network-first navigation, and bypasses api requests', () => {
  const swPath = path.join(publicDir, 'sw.js');
  const swCode = fs.readFileSync(swPath, 'utf8');

  // Verify cache versioning
  assert.match(swCode, /const SHELL_CACHE = 'light-weight-shell-v2';/);
  assert.match(swCode, /const ASSETS_CACHE = 'light-weight-assets-v2';/);

  // Verify lifecycle handlers
  assert.match(swCode, /self\.skipWaiting\(\)/);
  assert.match(swCode, /self\.clients\.claim\(\)/);

  // Verify API bypass
  assert.match(swCode, /url\.pathname\.startsWith\('\/api\/'\)/);

  // Verify navigation uses network-first
  assert.match(swCode, /request\.mode === 'navigate'/);
  assert.match(swCode, /fetch\(request\)/);
});

test('vercel.json ensures sw.js and manifest.webmanifest are never cached indefinitely', () => {
  const vercelPath = path.join(webRootDir, 'vercel.json');
  const vercelConfig = JSON.parse(fs.readFileSync(vercelPath, 'utf8'));

  const headers = vercelConfig.headers as Array<{ source: string; headers: Array<{ key: string; value: string }> }>;
  assert.ok(Array.isArray(headers), 'vercel.json must have headers');

  const swHeader = headers.find(h => h.source === '/sw.js');
  assert.ok(swHeader, 'Header rule for /sw.js must exist');
  const swCacheControl = swHeader.headers.find(kv => kv.key.toLowerCase() === 'cache-control');
  assert.match(swCacheControl?.value || '', /no-cache/);

  const manifestHeader = headers.find(h => h.source === '/manifest.webmanifest');
  assert.ok(manifestHeader, 'Header rule for /manifest.webmanifest must exist');
  const manifestCacheControl = manifestHeader.headers.find(kv => kv.key.toLowerCase() === 'cache-control');
  assert.match(manifestCacheControl?.value || '', /no-cache/);
});
