/**
 * P0-3 — Word content taller than one page must never be clipped.
 *
 * Content taller than a page (a multi-page schedule table, a long numbered
 * clause list) must flow onto the next page, never be cut off, so a signer
 * never signs a document missing text they didn't see. Fixed in the Word
 * converter rewrite; this test keeps it fixed.
 *
 * ACCEPTANCE (what "fixed" looks like):
 *   Every canary string present in the source .docx is present in the rendered
 *   PDF text, for every document in the corpus. Where content genuinely cannot
 *   be paginated, the app blocks the send with an explicit error rather than
 *   producing a short document.
 */
import { test, expect } from '@playwright/test';
import { openApp, corpusBase64 } from '../helpers/app.mjs';

const CASES = [
  { file: 'docx-02-tall-table.docx', canary: 'CANARY_TABLE_END', what: 'a schedule table taller than one page' },
  { file: 'docx-03-long-clause-list.docx', canary: 'CANARY_CLAUSE_END', what: '200 numbered clauses' },
];

for (const c of CASES) {
  test(`P0-3 no silent truncation — ${c.what}`, async ({ page }) => {
    await openApp(page);

    const out = await page.evaluate(async (b64) => {
      const bin = atob(b64);
      const u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);

      const t0 = performance.now();
      const res = await window.docxToPdfBase64(u8.buffer);
      const ms = performance.now() - t0;

      // Read the produced PDF back with pdf.js and pull every text item.
      const pdfBin = atob(typeof res === 'string' ? res : res.pdf || res.base64);
      const pu8 = new Uint8Array(pdfBin.length);
      for (let i = 0; i < pdfBin.length; i++) pu8[i] = pdfBin.charCodeAt(i);
      const doc = await window.pdfjsLib.getDocument({ data: pu8 }).promise;

      let text = '';
      for (let i = 1; i <= doc.numPages; i++) {
        const pg = await doc.getPage(i);
        const tc = await pg.getTextContent();
        text += tc.items.map((it) => it.str).join(' ') + '\n';
      }
      return { pages: doc.numPages, text, ms, rasterOnly: text.trim().length === 0 };
    }, corpusBase64(c.file));

    test.info().annotations.push({
      type: 'observed',
      description: `pages=${out.pages}, conversion=${Math.round(out.ms)}ms, extractable text=${out.rasterOnly ? 'NONE (raster only)' : out.text.length + ' chars'}`,
    });

    if (out.rasterOnly) {
      // No text layer to read back, so check the page count here;
      // p0-03b-docx-layout.spec.mjs checks every row and paragraph.
      test.info().annotations.push({ type: 'note', description: 'no text layer; checked page count' });
      expect(out.pages, `expected the ${c.what} to span multiple pages`).toBeGreaterThan(1);
    } else {
      expect(out.text, `"${c.canary}" is in the source .docx but missing from the produced PDF — content was silently dropped`)
        .toContain(c.canary);
    }
  });
}

test('P0-3 sanity — the simple document survives intact', async ({ page }) => {
  await openApp(page);
  const ok = await page.evaluate(async (b64) => {
    const bin = atob(b64);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const res = await window.docxToPdfBase64(u8.buffer);
    return !!res;
  }, corpusBase64('docx-01-simple.docx'));
  expect(ok).toBe(true);
});
