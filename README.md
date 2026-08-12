# Gohvio Sign

A free, open-source e-signature tool in a **single HTML file**. No account, no install, no upload to anyone's server — your document never leaves your browser unless you choose to email it.

Built by [Gohvio](https://gohvio.io), the AI review layer for executive reporting.

## What it does

- Upload a **PDF or Word (.docx)** document
- Drag **text, date (MM/DD/YYYY), and signature** blocks onto the pages
- Route the document through **up to 4 signers, in order** — each signer fills their own blocks
- Signatures can be **typed** (3 cursive fonts) or **drawn**
- The final result is one flattened, **signed PDF**

## How to use it

1. Open `index.html` in any modern browser (or use the hosted version).
2. Upload your document and drag blocks where people should sign. Use the "Blocks are for" picker to assign blocks to different signers.
3. Click **Download signing file** — you get a self-contained HTML file. Email it to your signer.
4. Your signer opens the file, clicks each highlighted block, fills it in, and clicks **Finish** to download the signed PDF (or pass it to the next signer).

Everything above works completely offline and free, forever.

## Sending by email (hosted service)

The **Send for signature** button uses Gohvio's hosted email service: it emails your signer a secure signing link, auto-forwards the document from signer to signer, and delivers the final signed PDF to everyone automatically. That service runs on Gohvio's servers and requires an access key — it is not part of this open-source code.

**[Get a key — $1/month](https://buy.stripe.com/bJe8wP2rD12GdkY0CY38405)** (recurring subscription, cancel anytime). Your key arrives by email within a minute; paste it into the tool once and you're set. Questions? Contact [emilygoh@gohvio.io](mailto:emilygoh@gohvio.io).

## Privacy & security

- The tool is 100% client-side JavaScript (pdf.js, pdf-lib, mammoth, html2canvas via CDN).
- Documents are processed in your browser's memory. Nothing is stored or transmitted unless you use the hosted send service.
- Signing links from the hosted service are HMAC-signed and expire after 30 days.
- **Your document can't be sent anywhere except to your signer.** Every outside library is locked to a cryptographic fingerprint, and the browser is instructed to block this page from contacting any server other than Snail Sign's own — so even if one of those libraries were tampered with, it could not read or leak your document.

### How that is enforced

- **Subresource Integrity.** Each `<script>` tag carries the official `sha512` hash of the exact library version it loads. If the CDN ever served a modified file, the browser refuses to run it and the tool fails closed rather than running unknown code over your document.
- **Content Security Policy.** Declared in a `<meta>` tag in `index.html` and, for hosts that support real headers, in [`_headers`](_headers). The `connect-src` directive is the important one — it allowlists a single endpoint, so injected code has nowhere to send data.
- **Known gap:** `pdf.worker.min.js` is loaded by URL rather than by `<script>` tag, so SRI cannot cover it. CSP restricts its origin but not its contents. Committing a local copy of that file to this repo would close it.

## License

[MIT](LICENSE) — use it, modify it, share it. A link back to [gohvio.io](https://gohvio.io) is appreciated but not required.
