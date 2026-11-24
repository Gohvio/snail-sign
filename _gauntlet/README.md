# The Gauntlet

This folder is the test harness for Snail Sign. **Nothing in here is part of the
website.** It lives in the site's repository as `_gauntlet/`: GitHub Pages builds
the site with Jekyll, which never publishes a folder whose name starts with an
underscore, so none of it is served. It reads the repository root and never writes to it. CI runs it on
every pull request (`.github/workflows/gauntlet.yml`, check name "Gauntlet").

That separation is deliberate. Snail Sign is one hand-written HTML file with no
build step, and that is a genuine strength — there is no toolchain to rot and
nothing between the source and what ships. The absence of tests was never caused
by the single-file design. Tests can live outside the deployed folder and drive
the real page exactly as a browser does, which is what this does.

## Running it

First time only:

```
cd _gauntlet
npm run setup
```

That installs the test browser, generates the document corpus, and copies the
JavaScript libraries the site uses so the tests can run with no internet connection.

Then, any time:

```
npm run gauntlet          # run everything (what CI runs)
npm run report            # open the last run in a browser
```

## How to read a result

Every test in `tests/` is written from the customer's side: what must be true for
the product to be honest. Every test here passes on `main`, so a **failing** test
means a change broke something, and the "Gauntlet" check on the pull request goes red.

This repository is public. A test for a defect that is not fixed yet would publish
how to exploit it, so those tests are kept privately and each one lands here in the
pull request that fixes it, arriving green.

Each test file opens with a plain-English explanation of the defect, why it matters
to a real signer, and an **ACCEPTANCE** block describing exactly what "fixed" means.
Read that block before changing any code — it is the specification.

## What is in here

| Folder | What it is |
|---|---|
| `tests/` | `smoke.spec.mjs` for the things that must never break, plus one file per fixed defect so it cannot come back |
| `fixtures/build-corpus.mjs` | Generates the document torture corpus — awkward PDFs and Word files designed to break the converter |
| `fixtures/corpus/` | The generated documents. Not committed; regenerate with `npm run corpus` |
| `helpers/app.mjs` | Opens the real `index.html`, blocks all production traffic, serves libraries locally |
| `vendor/` | The libraries at the exact versions the site loads, copied from npm. The page still carries its SRI hashes, so the browser refuses any copy that doesn't match |

## Safety rules the harness enforces on itself

- Every request to the live Supabase function and to Stripe is intercepted. No test
  can send a real email, charge a card, or write to the production database.
- Libraries are served from `vendor/`, so a CDN outage can never turn a run red and
  a run never depends on the network.
- The site folder is served read-only. The harness cannot modify what ships.

## The document corpus

`npm run corpus` builds the documents the tests use: a simple PDF, a hundred-page
PDF, simple and fully formatted Word contracts, a Word table taller than a page,
two hundred numbered clauses, and markup disguised as document text.

Several carry a canary string near the end. If the canary does not survive into the
finished PDF, content was silently dropped.
