// Shared helpers. The harness drives the REAL index.html — it never patches it.
// Everything in Snail Sign is a top-level `function` / `var` in a classic script,
// so it is reachable on `window` from page.evaluate.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const CORPUS = join(HERE, '..', 'fixtures', 'corpus');

export function corpusBytes(name) {
  return readFileSync(join(CORPUS, name));
}

export function corpusBase64(name) {
  return corpusBytes(name).toString('base64');
}

const VENDOR = join(HERE, '..', 'vendor');

/** Open the app with the third-party libs loaded and no network calls escaping. */
export async function openApp(page, opts = {}) {
  const outbound = [];

  // Serve the cdnjs libraries from vendor/ at the exact pinned versions the site
  // loads. Keeps the Gauntlet offline and deterministic. The real SRI attributes
  // on index.html are still asserted statically in smoke.spec.mjs.
  await page.route('**://cdnjs.cloudflare.com/**', async (route) => {
    const file = route.request().url().split('/').pop().split('?')[0];
    const local = join(VENDOR, file);
    try {
      return await route.fulfill({
        status: 200,
        contentType: 'application/javascript',
        body: readFileSync(local),
      });
    } catch {
      outbound.push('UNVENDORED: ' + route.request().url());
      return route.abort();
    }
  });

  // Hard block: no test may ever hit the live Supabase function or Stripe.
  await page.route('**://xaffxerlsieiaqorlelm.supabase.co/**', async (route) => {
    outbound.push(route.request().url());
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, mocked: true }),
    });
  });
  await page.route('**://*.stripe.com/**', (route) => {
    outbound.push(route.request().url());
    return route.abort();
  });

  // Google Fonts: stubbed so a run never depends on a third party being up.
  // Which third parties the page contacts at all is asserted in smoke.spec.mjs.
  const thirdParty = [];
  await page.route('**://fonts.googleapis.com/**', (route) => {
    thirdParty.push(route.request().url());
    return route.fulfill({ status: 200, contentType: 'text/css', body: '/* stubbed by the Gauntlet */' });
  });
  await page.route('**://fonts.gstatic.com/**', (route) => {
    thirdParty.push(route.request().url());
    return route.fulfill({ status: 200, contentType: 'font/woff2', body: '' });
  });

  const consoleErrors = [];
  const failedRequests = [];
  const trackPings = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));
  page.on('requestfailed', (r) => failedRequests.push(`${r.url()} — ${r.failure()?.errorText}`));
  page.on('request', (r) => {
    if (r.url().includes('supabase.co')) {
      try { trackPings.push(r.postData() || ''); } catch { /* no body */ }
    }
  });

  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(
    () => !!(window.pdfjsLib && window.PDFLib && window.mammoth && window.html2canvas && window.JSZip),
    null,
    { timeout: 60_000 }
  );

  if (opts.esignKey) {
    await page.evaluate((k) => localStorage.setItem('gohvioEsignKey', k), opts.esignKey);
  }

  return { outbound, consoleErrors, failedRequests, trackPings, thirdParty };
}
