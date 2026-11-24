// Builds the Snail Sign document torture corpus.
// Run: npm run corpus
// Output: fixtures/corpus/  (gitignored — regenerate, never commit)

import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib';
import JSZip from 'jszip';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'corpus');

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const manifest = [];
function emit(name, bytes, note) {
  writeFileSync(join(OUT, name), Buffer.from(bytes));
  manifest.push({ name, bytes: bytes.length, note });
  console.log(`  ${name}  ${(bytes.length / 1024).toFixed(1)} KB  — ${note}`);
}

/* ------------------------------------------------------------------ */
/* PDFs                                                                */
/* ------------------------------------------------------------------ */

async function makePdf(pages, opts = {}) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pages.length; i++) {
    const spec = pages[i];
    const page = doc.addPage(spec.size || [612, 792]);
    if (spec.rotate) page.setRotation(degrees(spec.rotate));
    const { height } = page.getSize();
    let y = height - (spec.topMargin ?? 72);
    for (const line of spec.lines || []) {
      page.drawText(line, { x: spec.leftMargin ?? 72, y, size: spec.size2 || 11, font, color: rgb(0, 0, 0) });
      y -= 16;
    }
  }
  return doc.save();
}

console.log('PDFs');

emit('pdf-01-simple.pdf', await makePdf([
  { lines: ['MUTUAL NON-DISCLOSURE AGREEMENT', '', 'This Agreement is entered into as of the date below.', '', 'Signature: ______________________', 'Date: ______________________'] },
]), 'baseline happy path — one page, one signature block');

emit('pdf-02-100-pages.pdf', await makePdf(
  Array.from({ length: 100 }, (_, i) => ({ lines: [`Page ${i + 1} of 100`, 'Clause text repeated to force paging.'] }))
), 'long document — pagination, memory, render throughput');

/* ------------------------------------------------------------------ */
/* DOCX                                                                */
/* ------------------------------------------------------------------ */

const NS = `xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"`;

const CONTENT_TYPES = (extra = '') => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Default Extension="png" ContentType="image/png"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
${extra}
</Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

function docXml(bodyInner, sectPrExtra = '') {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${NS}><w:body>
${bodyInner}
<w:sectPr>${sectPrExtra}<w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>
</w:body></w:document>`;
}

const p = (text, style = '') => `<w:p>${style}<w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;

async function makeDocx(parts) {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', parts.contentTypes || CONTENT_TYPES());
  zip.file('_rels/.rels', ROOT_RELS);
  zip.file('word/document.xml', parts.document);
  if (parts.docRels) zip.file('word/_rels/document.xml.rels', parts.docRels);
  for (const [path, content] of Object.entries(parts.extra || {})) zip.file(path, content);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

console.log('DOCX');

emit('docx-01-simple.docx', await makeDocx({
  document: docXml([
    p('MUTUAL NON-DISCLOSURE AGREEMENT'),
    p('1. The parties agree to keep confidential information confidential.'),
    p('Signature: ______________________'),
  ].join('')),
}), 'baseline happy path');

// A single table taller than one page.
{
  const rows = Array.from({ length: 60 }, (_, i) =>
    `<w:tr><w:tc><w:tcPr><w:tcW w:w="4000" w:type="dxa"/></w:tcPr>${p(`Schedule row ${i + 1}`)}</w:tc><w:tc><w:tcPr><w:tcW w:w="4000" w:type="dxa"/></w:tcPr>${p(`Value ${i + 1}`)}</w:tc></w:tr>`
  ).join('');
  emit('docx-02-tall-table.docx', await makeDocx({
    document: docXml(p('SCHEDULE A') + `<w:tbl><w:tblPr><w:tblW w:w="8000" w:type="dxa"/></w:tblPr>${rows}</w:tbl>` + p('END OF SCHEDULE — CANARY_TABLE_END')),
  }), 'one table taller than a page — CANARY_TABLE_END must survive to the PDF');
}

// 200 numbered clauses.
{
  const items = Array.from({ length: 200 }, (_, i) => p(`${i + 1}. Clause number ${i + 1} of the agreement.`)).join('');
  emit('docx-03-long-clause-list.docx', await makeDocx({
    document: docXml(p('TERMS') + items + p('CANARY_CLAUSE_END')),
  }), '200 clauses — CANARY_CLAUSE_END must survive to the PDF');
}

// Adversarial content: script-looking text that must never execute.
emit('docx-09-injection.docx', await makeDocx({
  document: docXml([
    p('&lt;script&gt;window.XSS_CANARY=1&lt;/script&gt;'),
    p('&lt;img src=x onerror="window.XSS_CANARY=2"&gt;'),
    p('Normal clause after the payload.'),
  ].join('')),
}), 'adversarial: markup in document text must render as text, never execute');


// Layout fidelity: a contract with real Word formatting (alignment, indents,
// spacing, numbering format, table borders and widths, page breaks, tabs,
// header/footer, A4 page size).
{
  const r = (t, rp = '') => `<w:r><w:rPr>${rp}</w:rPr><w:t xml:space="preserve">${t}</w:t></w:r>`;
  const pp = (ppr, runs) => `<w:p><w:pPr>${ppr}</w:pPr>${runs}</w:p>`;
  const num = (lvl) => `<w:numPr><w:ilvl w:val="${lvl}"/><w:numId w:val="1"/></w:numPr>`;
  const cell = (t, w, hdr) => `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${hdr ? '<w:shd w:val="clear" w:fill="D9E2F3"/>' : ''}</w:tcPr>${pp('', r(t))}</w:tc>`;
  const body = [
    pp('<w:jc w:val="center"/>', r('LAYOUT_TITLE', '<w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:b/><w:sz w:val="40"/>')),
    pp('<w:jc w:val="right"/>', r('LAYOUT_RIGHT', '<w:i/>')),
    pp('<w:jc w:val="both"/><w:spacing w:after="240"/>', r('LAYOUT_JUSTIFIED a paragraph long enough to wrap across more than one line so that justification is visible on the page.')),
    pp('<w:ind w:left="720"/>', r('LAYOUT_INDENTED')),
    pp(num(0), r('LAYOUT_ITEM_ONE')),
    pp(num(0), r('LAYOUT_ITEM_TWO')),
    pp(num(1), r('LAYOUT_ITEM_NESTED')),
    `<w:tbl><w:tblPr><w:tblW w:w="9000" w:type="dxa"/><w:tblBorders><w:top w:val="single" w:sz="8"/><w:left w:val="single" w:sz="8"/><w:bottom w:val="single" w:sz="8"/><w:right w:val="single" w:sz="8"/><w:insideH w:val="single" w:sz="4"/><w:insideV w:val="single" w:sz="4"/></w:tblBorders></w:tblPr><w:tblGrid><w:gridCol w:w="2500"/><w:gridCol w:w="6500"/></w:tblGrid><w:tr>${cell('LAYOUT_CELL_A', 2500, true)}${cell('LAYOUT_CELL_B', 6500, true)}</w:tr></w:tbl>`,
    `<w:p><w:r><w:br w:type="page"/></w:r></w:p>`,
    pp('<w:tabs><w:tab w:val="left" w:pos="5040"/></w:tabs>', r('LAYOUT_PAGE_TWO') + '<w:r><w:tab/></w:r>' + r('Date')),
  ].join('');
  const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
  const hf = (tag, t) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:${tag} ${W}><w:p>${r(t)}</w:p></w:${tag}>`;
  emit('docx-11-layout.docx', await makeDocx({
    contentTypes: CONTENT_TYPES(
      '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>' +
      '<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>' +
      '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>'),
    document: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W}><w:body>${body}<w:sectPr><w:headerReference w:type="default" r:id="rH"/><w:footerReference w:type="default" r:id="rF"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708"/></w:sectPr></w:body></w:document>`,
    docRels: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rN" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/><Relationship Id="rH" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/><Relationship Id="rF" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/></Relationships>`,
    extra: {
      'word/numbering.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering ${W}><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl><w:lvl w:ilvl="1"><w:start w:val="1"/><w:numFmt w:val="lowerLetter"/><w:lvlText w:val="(%2)"/><w:pPr><w:ind w:left="1440" w:hanging="360"/></w:pPr></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`,
      'word/header1.xml': hf('hdr', 'LAYOUT_HEADER'),
      'word/footer1.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr ${W}><w:p>${r('Page ')}<w:fldSimple w:instr=" PAGE "><w:r><w:t>1</w:t></w:r></w:fldSimple>${r(' of ')}<w:fldSimple w:instr=" NUMPAGES "><w:r><w:t>1</w:t></w:r></w:fldSimple></w:p></w:ftr>`,
    },
  }), 'layout fidelity: alignment, indents, numbering (a), borders, page break, tabs, header/footer, A4');
}

writeFileSync(join(OUT, 'MANIFEST.json'), JSON.stringify({ generated: new Date().toISOString(), documents: manifest }, null, 2));
console.log(`\n${manifest.length} documents written to fixtures/corpus/`);
