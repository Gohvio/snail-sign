/**
 * P0-3 (continued) — Word documents must keep their layout and lose nothing.
 *
 * The old converter forced every Word file into Georgia 15px with no spacing,
 * no alignment, no table borders and no page breaks, and clipped any block
 * taller than a page: in docx-02 rows 40-60 of a 60-row table simply vanished.
 * The DOCX output is a picture, so these checks read the laid-out page (the
 * same DOM that is photographed) through layoutDocx().
 *
 * ACCEPTANCE:
 *   - Page slices run from the top of the document to the bottom with no gap.
 *   - Every table row and paragraph sits wholly inside one page: none is cut
 *     in half, none falls between pages, none is missing.
 *   - Word's alignment, indents, list numbering, table borders, page breaks,
 *     header/footer and page size reach the page.
 */
import { test, expect } from '@playwright/test';
import { openApp, corpusBase64 } from '../helpers/app.mjs';

async function layout(page, file, probe) {
  return page.evaluate(async ({ b64, probe }) => {
    // The page's CSP forbids eval, so the probe is written out here, not passed as a string.
    function layoutProbe(host) {
      const find = (t) => Array.from(host.querySelectorAll('p')).find((p) => p.textContent.includes(t));
      const cs = (t) => getComputedStyle(find(t));
      const top0 = host.getBoundingClientRect().top;
      const td = host.querySelector('td');
      return {
        title: { align: cs('LAYOUT_TITLE').textAlign, size: parseFloat(cs('LAYOUT_TITLE').fontSize), weight: cs('LAYOUT_TITLE').fontWeight },
        right: cs('LAYOUT_RIGHT').textAlign,
        justified: cs('LAYOUT_JUSTIFIED').textAlign,
        indent: parseFloat(cs('LAYOUT_INDENTED').paddingLeft),
        labels: Array.from(host.querySelectorAll('.ss-num')).map((s) => s.textContent.trim()),
        border: getComputedStyle(td).borderTopStyle,
        shade: getComputedStyle(td).backgroundColor,
        pageTwoTop: find('LAYOUT_PAGE_TWO').getBoundingClientRect().top - top0,
      };
    }
    const u8 = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const L = await window.layoutDocx(u8.buffer);
    const top0 = L.host.getBoundingClientRect().top;
    const sel = (q) => Array.from(L.host.querySelectorAll(q));
    const box = (el) => { const r = el.getBoundingClientRect(); return { top: r.top - top0, bottom: r.bottom - top0, text: el.textContent }; };
    const out = {
      slices: L.slices, total: L.host.scrollHeight, geo: L.geo,
      rows: sel('tr').map(box), paras: sel(':scope > p, td p').map(box),
      text: L.host.textContent,
      header: L.header.map((h) => h.text), footer: L.footer.map((h) => h.text),
      probe: probe ? layoutProbe(L.host) : null,
    };
    L.host.remove();
    return out;
  }, { b64: corpusBase64(file), probe });
}

function expectWhollyInsideOnePage(items, slices, what) {
  for (const it of items) {
    const home = slices.filter(([s, e]) => it.top >= s - 0.5 && it.bottom <= e + 0.5);
    expect(home.length, `${what} "${it.text.slice(0, 40)}" is cut across a page boundary or outside every page`).toBeGreaterThanOrEqual(1);
  }
}

function expectContiguous(out) {
  expect(out.slices[0][0]).toBe(0);
  for (let i = 1; i < out.slices.length; i++) expect(out.slices[i][0]).toBe(out.slices[i - 1][1]);
  expect(out.slices.at(-1)[1]).toBeGreaterThanOrEqual(out.total - 0.5);
}

test('P0-3b a 60-row schedule table flows across pages with every row intact', async ({ page }) => {
  await openApp(page);
  const out = await layout(page, 'docx-02-tall-table.docx');
  expect(out.rows.length).toBe(60);
  expect(out.slices.length).toBeGreaterThan(1);
  expectContiguous(out);
  expectWhollyInsideOnePage(out.rows, out.slices, 'table row');
  expect(out.text).toContain('Schedule row 45');
  expect(out.text).toContain('CANARY_TABLE_END');
});

test('P0-3b 200 numbered clauses keep every clause, none split', async ({ page }) => {
  await openApp(page);
  const out = await layout(page, 'docx-03-long-clause-list.docx');
  expectContiguous(out);
  expectWhollyInsideOnePage(out.paras, out.slices, 'clause');
  expect(out.text).toContain('Clause number 200 of the agreement.');
  expect(out.text).toContain('CANARY_CLAUSE_END');
});

test('P0-3b Word layout reaches the page', async ({ page }) => {
  await openApp(page);
  const out = await layout(page, 'docx-11-layout.docx', true);
  const p = out.probe;
  expect(p.title.align).toBe('center');
  expect(p.title.size).toBeCloseTo(26.67, 1);          // 20pt
  expect(Number(p.title.weight)).toBeGreaterThanOrEqual(700);
  expect(p.right).toBe('right');
  expect(p.justified).toBe('justify');
  expect(p.indent).toBeCloseTo(48, 0);                  // 0.5in
  expect(p.labels).toEqual(['1.', '2.', '(a)']);
  expect(p.border).toBe('solid');
  expect(p.shade).toBe('rgb(217, 226, 243)');
  expect(out.geo.wTw).toBe(11906);                      // A4 stays A4
  expect(out.slices.length).toBe(2);                    // the hard page break is honoured
  expect(p.pageTwoTop).toBeGreaterThanOrEqual(out.slices[1][0] - 0.5);
  expect(out.header.join(' ')).toContain('LAYOUT_HEADER');
  expect(out.footer.join(' ')).toContain('\u0001');     // PAGE field becomes the page number
  for (const t of ['LAYOUT_TITLE', 'LAYOUT_ITEM_NESTED', 'LAYOUT_CELL_B', 'LAYOUT_PAGE_TWO']) expect(out.text).toContain(t);
});

test('P0-3b the produced PDF keeps the document page size', async ({ page }) => {
  await openApp(page);
  const sizes = await page.evaluate(async (b64) => {
    const u8 = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const pdf = await window.PDFLib.PDFDocument.load(Uint8Array.from(atob(await window.docxToPdfBase64(u8.buffer)), (c) => c.charCodeAt(0)));
    return pdf.getPages().map((pg) => [Math.round(pg.getWidth()), Math.round(pg.getHeight())]);
  }, corpusBase64('docx-11-layout.docx'));
  expect(sizes).toEqual([[595, 842], [595, 842]]);
});

// Numbering must survive paragraphs that cannot be matched by text.
import JSZip from 'jszip';
const NSW = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const run = (t) => `<w:r><w:t xml:space="preserve">${t}</w:t></w:r>`;
const numPr = (id) => `<w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="${id}"/></w:numPr></w:pPr>`;
async function listDoc(body) {
  const z = new JSZip();
  z.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/></Types>`);
  z.file('_rels/.rels', `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
  z.file('word/_rels/document.xml.rels', `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rN" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/></Relationships>`);
  z.file('word/numbering.xml', `<?xml version="1.0"?><w:numbering ${NSW}><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="0"/></w:num></w:numbering>`);
  z.file('word/document.xml', `<?xml version="1.0"?><w:document ${NSW}><w:body>${body}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`);
  return (await z.generateAsync({ type: 'nodebuffer' })).toString('base64');
}
async function labelled(page, b64) {
  return page.evaluate(async (b64) => {
    const L = await window.layoutDocx(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer);
    const out = Array.from(L.host.querySelectorAll('p')).filter((p) => p.textContent.trim())
      .map((p) => p.textContent.replace(/\s+/g, ' ').trim());
    L.host.remove();
    return out;
  }, b64);
}
const clause = (i, id = 1, extra = '') => `<w:p>${numPr(id)}${run('Clause ' + i)}${extra}</w:p>`;

test('P0-3b a non-breaking hyphen does not shift clause numbers', async ({ page }) => {
  await openApp(page);
  const b64 = await listDoc(clause(1) + clause(2) + `<w:p>${numPr(1)}${run('Clause 3 co')}<w:r><w:noBreakHyphen/></w:r>${run('op')}</w:p>` + clause(4) + clause(5));
  const out = await labelled(page, b64);
  expect(out[0]).toBe('1. Clause 1');
  expect(out[2].startsWith('3. Clause 3')).toBe(true);
  expect(out[4]).toBe('5. Clause 5');
});

test('P0-3b a symbol character does not shift clause numbers', async ({ page }) => {
  await openApp(page);
  const b64 = await listDoc(clause(1) + clause(2) + `<w:p>${numPr(1)}${run('Clause 3 ')}<w:r><w:sym w:font="Symbol" w:char="F0B7"/></w:r></w:p>` + clause(4) + clause(5));
  const out = await labelled(page, b64);
  expect(out[2].startsWith('3. Clause 3')).toBe(true);
  expect(out[4]).toBe('5. Clause 5');
});

test('P0-3b seven awkward paragraphs in a row do not lose later numbers', async ({ page }) => {
  await openApp(page);
  const odd = Array.from({ length: 7 }, (_, i) => `<w:p>${run('note ' + i)}<w:r><w:noBreakHyphen/></w:r></w:p>`).join('');
  const out = await labelled(page, await listDoc(clause(1) + odd + clause(2) + clause(3)));
  expect(out[0]).toBe('1. Clause 1');
  expect(out.at(-2)).toBe('2. Clause 2');
  expect(out.at(-1)).toBe('3. Clause 3');
});

test('P0-3b a list split across two numIds keeps counting', async ({ page }) => {
  await openApp(page);
  const out = await labelled(page, await listDoc(clause(1, 1) + clause(2, 1) + clause(3, 2)));
  expect(out).toEqual(['1. Clause 1', '2. Clause 2', '3. Clause 3']);
});

// The completeness check must be able to fail: if a page shows less than its
// slice, the conversion has to stop instead of producing a short PDF.
test('P0-3b a page that comes up short stops the conversion', async ({ page }) => {
  await openApp(page);
  const msg = await page.evaluate(async (b64) => {
    const real = window.layoutDocx;
    window.layoutDocx = async (buf) => {
      const L = await real(buf);
      L.slices[0][1] -= 40;          // page 1 now ends 40px early; page 2 still starts at the old end
      return L;
    };
    try {
      await window.docxToPdfBase64(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer);
      return 'no error';
    } catch (e) { return e.message; } finally { window.layoutDocx = real; }
  }, corpusBase64('docx-02-tall-table.docx'));
  expect(msg).toContain('could not be placed on a page');
});

// Hidden Word text (w:vanish) must not reach the signer's PDF: Word doesn't
// print it, so the signer would be signing wording nobody saw on paper.
async function hiddenDoc() {
  const z = new JSZip();
  z.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`);
  z.file('_rels/.rels', `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
  z.file('word/_rels/document.xml.rels', `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rS" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  z.file('word/styles.xml', `<?xml version="1.0"?><w:styles ${NSW}><w:style w:type="character" w:styleId="Secret"><w:name w:val="Secret"/><w:rPr><w:vanish/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="HiddenPara"><w:name w:val="HiddenPara"/><w:rPr><w:vanish/></w:rPr></w:style></w:styles>`);
  const hid = (t) => `<w:r><w:rPr><w:vanish/></w:rPr><w:t xml:space="preserve">${t}</w:t></w:r>`;
  z.file('word/document.xml', `<?xml version="1.0"?><w:document ${NSW}><w:body>` +
    `<w:p>${run('Clause 1 visible.')}${hid(' HIDDEN_DIRECT')}</w:p>` +
    `<w:p>${run('Clause 2 visible.')}<w:r><w:rPr><w:rStyle w:val="Secret"/></w:rPr><w:t> HIDDEN_CHARSTYLE</w:t></w:r></w:p>` +
    `<w:p><w:pPr><w:pStyle w:val="HiddenPara"/><w:rPr><w:vanish/></w:rPr></w:pPr>${run('HIDDEN_PARASTYLE whole paragraph')}</w:p>` +
    `<w:p><w:pPr><w:pStyle w:val="HiddenPara"/></w:pPr><w:r><w:rPr><w:vanish w:val="0"/></w:rPr><w:t>UNHIDDEN_OVERRIDE</w:t></w:r></w:p>` +
    `<w:p>${run('Clause 3 visible.')}</w:p>` +
    `<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`);
  return (await z.generateAsync({ type: 'nodebuffer' })).toString('base64');
}

test('P0-3b hidden Word text never reaches the page, and the sender is told', async ({ page }) => {
  await openApp(page);
  const out = await page.evaluate(async (b64) => {
    const L = await window.layoutDocx(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer);
    const text = L.host.textContent;
    const paras = Array.from(L.host.querySelectorAll('p')).map((p) => p.textContent.trim());
    L.host.remove();
    return { text, paras, count: window.docxHiddenCount };
  }, await hiddenDoc());
  for (const h of ['HIDDEN_DIRECT', 'HIDDEN_CHARSTYLE', 'HIDDEN_PARASTYLE']) expect(out.text).not.toContain(h);
  for (const v of ['Clause 1 visible.', 'Clause 2 visible.', 'Clause 3 visible.', 'UNHIDDEN_OVERRIDE']) expect(out.text).toContain(v);
  expect(out.paras).toEqual(['Clause 1 visible.', 'Clause 2 visible.', 'UNHIDDEN_OVERRIDE', 'Clause 3 visible.']);
  expect(out.count).toBe(3);
});

// Hidden text: style-only hidden paragraphs, footnotes, field markers and
// Word's toggle rule.
async function hiddenDoc2() {
  const z = new JSZip();
  z.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/word/footnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml"/></Types>`);
  z.file('_rels/.rels', `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
  z.file('word/_rels/document.xml.rels', `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rS" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rN" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/><Relationship Id="rF" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes" Target="footnotes.xml"/></Relationships>`);
  z.file('word/styles.xml', `<?xml version="1.0"?><w:styles ${NSW}><w:style w:type="paragraph" w:styleId="HiddenPara"><w:name w:val="HiddenPara"/><w:rPr><w:vanish/></w:rPr></w:style><w:style w:type="character" w:styleId="Secret"><w:name w:val="Secret"/><w:rPr><w:vanish/></w:rPr></w:style></w:styles>`);
  z.file('word/numbering.xml', `<?xml version="1.0"?><w:numbering ${NSW}><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1)"/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`);
  z.file('word/footnotes.xml', `<?xml version="1.0"?><w:footnotes ${NSW}><w:footnote w:id="1"><w:p>${run('Note visible.')}<w:r><w:rPr><w:vanish/></w:rPr><w:t xml:space="preserve"> HIDDEN_FOOTNOTE</w:t></w:r></w:p></w:footnote></w:footnotes>`);
  const np = (style, body) => `<w:p><w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ''}<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>${body}</w:p>`;
  z.file('word/document.xml', `<?xml version="1.0"?><w:document ${NSW}><w:body>` +
    np('', run('Clause one')) +
    np('HiddenPara', run('HIDDEN_STYLEONLY clause')) +
    np('', run('Clause two') + '<w:r><w:footnoteReference w:id="1"/></w:r>') +
    // a hidden field: the begin/end markers must survive so mammoth can still read the file
    `<w:p><w:r><w:rPr><w:vanish/></w:rPr><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:rPr><w:vanish/></w:rPr><w:instrText> TC "x" </w:instrText></w:r><w:r><w:rPr><w:vanish/></w:rPr><w:fldChar w:fldCharType="end"/></w:r>${run('After field.')}</w:p>` +
    // toggle: paragraph style hides, character style hides again -> Word shows it
    `<w:p><w:pPr><w:pStyle w:val="HiddenPara"/></w:pPr><w:r><w:rPr><w:rStyle w:val="Secret"/></w:rPr><w:t>TOGGLED_VISIBLE</w:t></w:r></w:p>` +
    `<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`);
  return (await z.generateAsync({ type: 'nodebuffer' })).toString('base64');
}

test('P0-3b hidden text: style-only paragraphs, footnotes, fields and the toggle rule', async ({ page }) => {
  await openApp(page);
  const out = await page.evaluate(async (b64) => {
    const buf = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer;
    const L = await window.layoutDocx(buf);
    const text = L.host.textContent;
    const paras = Array.from(L.host.querySelectorAll('p')).map((p) => p.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean);
    L.host.remove();
    let pdfOk = true;
    try { await window.docxToPdfBase64(buf); } catch (e) { pdfOk = e.message; }
    return { text, paras, pdfOk };
  }, await hiddenDoc2());
  expect(out.text).not.toContain('HIDDEN_STYLEONLY');
  expect(out.text).not.toContain('HIDDEN_FOOTNOTE');
  expect(out.text).toContain('Note visible.');
  expect(out.text).toContain('After field.');
  expect(out.text).toContain('TOGGLED_VISIBLE');
  expect(out.paras[0]).toBe('1) Clause one');
  expect(out.paras[1].startsWith('2) Clause two')).toBe(true);   // the hidden clause leaves no empty number
  expect(out.pdfOk).toBe(true);
});

// A file whose only hidden content is a picture must still be rewritten for
// mammoth, so the picture never reaches the PDF, and the sender is told.
test('P0-3b a hidden picture is left out and counted', async ({ page }) => {
  await openApp(page);
  const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';
  const drawing = `<w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><wp:extent cx="952500" cy="952500"/><wp:docPr id="1" name="Pic"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="1" name="Pic"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rImg"/></pic:blipFill><pic:spPr/></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing>`;
  const z = new JSZip();
  z.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`);
  z.file('_rels/.rels', `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
  z.file('word/_rels/document.xml.rels', `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rImg" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/p.png"/></Relationships>`);
  z.file('word/media/p.png', Buffer.from(PNG, 'base64'));
  const doc = (hidden) => `<?xml version="1.0"?><w:document ${NSW}><w:body><w:p>${run('Visible clause.')}<w:r>${hidden ? '<w:rPr><w:vanish/></w:rPr>' : ''}${drawing}</w:r></w:p><w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`;
  const build = async (hidden) => { z.file('word/document.xml', doc(hidden)); return (await z.generateAsync({ type: 'nodebuffer' })).toString('base64'); };
  const probe = (b64) => page.evaluate(async (b64) => {
    const L = await window.layoutDocx(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer);
    const imgs = L.host.querySelectorAll('img').length;
    L.host.remove();
    return { imgs, count: window.docxHiddenCount };
  }, b64);
  expect(await probe(await build(false))).toEqual({ imgs: 1, count: 0 });   // control: the picture is real
  expect(await probe(await build(true))).toEqual({ imgs: 0, count: 1 });
});

// A bold paragraph style must not spread over a run Word shows as regular
// (a clause whose lead-in is bold and whose body is not).
test('P0-3b a regular run inside a bold-style paragraph stays regular', async ({ page }) => {
  await openApp(page);
  const z = new JSZip();
  z.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`);
  z.file('_rels/.rels', `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
  z.file('word/_rels/document.xml.rels', `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rS" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  z.file('word/styles.xml', `<?xml version="1.0"?><w:styles ${NSW}><w:style w:type="paragraph" w:styleId="Clause"><w:name w:val="Clause"/><w:rPr><w:b/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:rPr><w:i/></w:rPr></w:style></w:styles>`);
  z.file('word/document.xml', `<?xml version="1.0"?><w:document ${NSW}><w:body>` +
    `<w:p><w:pPr><w:pStyle w:val="Clause"/></w:pPr>${run('LEAD_BOLD.')}<w:r><w:rPr><w:b w:val="0"/></w:rPr><w:t xml:space="preserve"> BODY_REGULAR text.</w:t></w:r></w:p>` +
    `<w:p><w:pPr><w:pStyle w:val="Clause"/></w:pPr>${run('ALL_BOLD heading')}</w:p>` +
    `<w:p><w:pPr><w:pStyle w:val="Quote"/></w:pPr>${run('LEAD_ITALIC')}<w:r><w:rPr><w:i w:val="0"/></w:rPr><w:t xml:space="preserve"> BODY_UPRIGHT</w:t></w:r></w:p>` +
    `<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`);
  const b64 = (await z.generateAsync({ type: 'nodebuffer' })).toString('base64');
  const st = await page.evaluate(async (b64) => {
    const L = await window.layoutDocx(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer);
    const look = (word) => {
      const tw = document.createTreeWalker(L.host, NodeFilter.SHOW_TEXT); let n;
      while ((n = tw.nextNode())) if (n.nodeValue.includes(word)) {
        const cs = getComputedStyle(n.parentElement);
        return { weight: Number(cs.fontWeight), style: cs.fontStyle };
      }
      return null;
    };
    const out = { lead: look('LEAD_BOLD'), body: look('BODY_REGULAR'), all: look('ALL_BOLD'), it: look('LEAD_ITALIC'), up: look('BODY_UPRIGHT') };
    L.host.remove();
    return out;
  }, b64);
  expect(st.lead.weight).toBeGreaterThanOrEqual(700);
  expect(st.body.weight).toBeLessThan(600);
  expect(st.all.weight).toBeGreaterThanOrEqual(700);
  expect(st.it.style).toBe('italic');
  expect(st.up.style).toBe('normal');
});
