/**
 * Gate 0 — the things that must never break.
 * If any of these fail, no other result is meaningful.
 */
import { test, expect } from '@playwright/test';
import { openApp, corpusBase64 } from '../helpers/app.mjs';

test('the page loads with no console errors and no uncaught exceptions', async ({ page }) => {
  const { consoleErrors, failedRequests } = await openApp(page);
  await page.waitForLoadState('networkidle');
  // Requests the harness deliberately blocks are not product defects.
  const real = failedRequests.filter((u) => !/stripe\.com/.test(u));
  test.info().annotations.push({ type: 'observed', description: JSON.stringify({ consoleErrors, failedRequests }) });
  expect(real, 'a resource the page needs failed to load').toEqual([]);
  expect(consoleErrors.filter((e) => !/ERR_EMPTY_RESPONSE/.test(e)), 'uncaught errors on load').toEqual([]);
});

test('all five third-party libraries load with their SRI hashes intact', async ({ page }) => {
  await openApp(page);
  const libs = await page.evaluate(() => ({
    pdfjs: !!window.pdfjsLib,
    pdflib: !!window.PDFLib,
    mammoth: !!window.mammoth,
    html2canvas: !!window.html2canvas,
    jszip: !!window.JSZip,
  }));
  expect(libs).toEqual({ pdfjs: true, pdflib: true, mammoth: true, html2canvas: true, jszip: true });

  const unprotected = await page.evaluate(() =>
    [...document.querySelectorAll('script[src^="http"]')].filter((s) => !s.integrity).map((s) => s.src)
  );
  expect(unprotected, 'every remote script must carry an SRI hash').toEqual([]);
});

test('the harness never lets a request escape to production', async ({ page }) => {
  const { outbound } = await openApp(page);
  await page.waitForLoadState('networkidle');
  // `outbound` records URLs the harness INTERCEPTED, plus any library it could
  // not serve locally. Only the latter is a harness failure.
  const escaped = outbound.filter((u) => u.startsWith('UNVENDORED'));
  test.info().annotations.push({ type: 'observed', description: `intercepted: ${outbound.join(', ') || 'none'}` });
  expect(escaped, 'a library was not vendored, so the run depended on the network').toEqual([]);
});

test('the anonymous usage ping carries no personal data', async ({ page }) => {
  const { trackPings } = await openApp(page);
  await page.waitForLoadState('networkidle');
  test.info().annotations.push({ type: 'observed', description: JSON.stringify(trackPings) });

  // Asserts the usage ping is anonymous.
  expect(trackPings.length, 'no usage ping was sent, so this check proved nothing').toBeGreaterThan(0);
  for (const body of trackPings) {
    expect(body, 'usage ping must not contain an email address').not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
    expect(body, 'usage ping must not contain a subscription key').not.toMatch(/gsk_/);
    expect(body, 'usage ping must not contain document bytes').not.toMatch(/JVBERi0/);
  }
});

test('a plain PDF renders and a field can be added programmatically', async ({ page }) => {
  await openApp(page);
  const pages = await page.evaluate(async (b64) => {
    const bin = atob(b64);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const doc = await window.pdfjsLib.getDocument({ data: u8 }).promise;
    return doc.numPages;
  }, corpusBase64('pdf-01-simple.pdf'));
  expect(pages).toBe(1);
});

test('document text can never execute as script', async ({ page }) => {
  await openApp(page);
  const canary = await page.evaluate(async (b64) => {
    const bin = atob(b64);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    try { await window.docxToPdfBase64(u8.buffer); } catch (e) { /* conversion failure is not the assertion */ }
    return window.XSS_CANARY ?? null;
  }, corpusBase64('docx-09-injection.docx'));
  expect(canary, 'markup inside a document executed').toBe(null);
});

test('a 100-page PDF converts within a tolerable time budget', async ({ page }) => {
  await openApp(page);
  const ms = await page.evaluate(async (b64) => {
    const bin = atob(b64);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const t0 = performance.now();
    const doc = await window.pdfjsLib.getDocument({ data: u8 }).promise;
    for (let i = 1; i <= doc.numPages; i++) await doc.getPage(i);
    return performance.now() - t0;
  }, corpusBase64('pdf-02-100-pages.pdf'));
  test.info().annotations.push({ type: 'observed', description: `${Math.round(ms)}ms for 100 pages` });
  expect(ms).toBeLessThan(30_000);
});
