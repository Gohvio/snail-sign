/**
 * Hardening: every document is rendered with eval disabled in pdf.js.
 * pdf.js's API object can't be patched to spy on, so this reads the page source.
 */
import { test, expect } from '@playwright/test';

test('the PDF renderer runs with eval disabled', async ({ page }) => {
  const res = await page.request.get('/index.html');
  const html = await res.text();
  const calls = [...html.matchAll(/getDocument\(\{[^}]*\}/g)].map((m) => m[0]);
  expect(calls.length, 'no getDocument call found').toBeGreaterThan(0);
  for (const c of calls) expect(c, 'getDocument called without isEvalSupported: false').toMatch(/isEvalSupported:\s*false/);
  expect(html.match(/getDocument\(/g).length, 'a getDocument call is not in the checked form').toBe(calls.length);
});
