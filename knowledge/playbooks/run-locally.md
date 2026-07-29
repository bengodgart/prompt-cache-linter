---
type: Playbook
title: Run prompt-cache-linter locally
description: 'How to open prompt-cache-linter and run its tests on a dev machine.'
generated:
  by: claude-opus-5
  at: '2026-07-29T04:24:12+00:00'
status: stable
---

# Steps

1. Clone the repo: `git clone https://github.com/bengodgart/prompt-cache-linter.git`
2. `cd prompt-cache-linter`
3. `python -m http.server 8000`, or just open `index.html` directly.
4. Click **Load cache-busting example** to see a timestamp and a session id caught inside a
   cached system prompt, then **Load good example** for the same structure with both removed.

## Available scripts

* `node test.js` runs the test suite, 17 assertions.

## Common failures

* Dynamic content after the last breakpoint is never flagged. That is correct behaviour, not
  a missed detection: the uncached tail is where per-request content belongs.
* Detection is shape-based. A dynamic value with no recognisable pattern, such as a customer
  name, will not be flagged, and image content blocks are skipped entirely.
* The cache-busting example is intentionally bad. It exists to show a real cache-buster being
  caught, not to model a request worth sending.

## Deploying

It is a static page, so GitHub Pages hosts it for $0.
