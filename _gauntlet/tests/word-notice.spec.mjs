/**
 * A converted Word file can differ slightly from Word's own layout, so the
 * sender is told so and must confirm they've checked every page before the
 * document can be sent or downloaded for signing. PDFs need no such step.
 */
import { test, expect } from '@playwright/test';
import { openApp, corpusBytes } from '../helpers/app.mjs';

async function upload(page, name, type) {
  await page.evaluate(async ({ b64, name, type }) => {
    const u8 = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    await window.handleFile(new File([u8], name, { type }));
    state.fields = [{ id: 'f1', type: 'signature', page: 0, x: 0.1, y: 0.8, w: 0.3, h: 0.06, signer: 1 }];
  }, { b64: corpusBytes(name).toString('base64'), name, type });
}
const sendOpen = (page) => page.evaluate(() => getComputedStyle(document.getElementById('sendOverlay')).display !== 'none');

test('Word upload: the notice shows and sending waits for the tick', async ({ page }) => {
  await openApp(page);
  await upload(page, 'docx-01-simple.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  await expect(page.locator('#wordNotice')).toBeVisible();
  await expect(page.locator('#wordNotice')).toContainText('Converted from Word');
  await expect(page.locator('#wordNotice')).toContainText('save it as PDF in Word');

  await page.evaluate(() => openSendModal());
  expect(await sendOpen(page)).toBe(false);
  await expect(page.locator('#wordNotice')).toHaveClass(/needs-tick/);
  await expect(page.locator('#toast')).toContainText('checked every page');
  expect(await page.evaluate(() => document.activeElement.id)).toBe('wordChecked');

  let downloaded = false;
  page.on('download', () => { downloaded = true; });
  await page.evaluate(() => generateSigningFile());
  expect(downloaded).toBe(false);

  await page.locator('#wordChecked').check();
  await expect(page.locator('#wordNotice')).not.toHaveClass(/needs-tick/);
  await page.evaluate(() => openSendModal());
  expect(await sendOpen(page)).toBe(true);
});

test('PDF upload: no notice, nothing to tick', async ({ page }) => {
  await openApp(page);
  await upload(page, 'pdf-01-simple.pdf', 'application/pdf');
  await expect(page.locator('#wordNotice')).toBeHidden();
  await page.evaluate(() => openSendModal());
  expect(await sendOpen(page)).toBe(true);
});
