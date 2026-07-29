---
type: Tech Stack
title: prompt-cache-linter stack
description: 'Frameworks, storage and services prompt-cache-linter runs on.'
runtime: Browser
framework: 'None. Plain HTML, CSS and JavaScript.'
build: 'None. No build step and no dependencies.'
storage: 'None. Nothing you paste is uploaded, stored or transmitted.'
hosting: GitHub Pages
tests: 'node test.js, 17 assertions'
generated:
  by: claude-opus-5
  at: '2026-07-29T04:24:12+00:00'
status: stable
---

# Stack

* **Runtime**: the browser. There is no backend and no framework.
* **Framework**: none. Single page, one script file.
* **Build**: none. No build step, no dependencies.
* **Files that carry the logic**: `core.js` holds all the parsing, cache-order and detection
  logic as plain functions. `index.html` is the page, `test.js` is the suite.
* **Detections**: ISO 8601 timestamps and calendar dates, UUIDs, Unix epoch timestamps in
  seconds or milliseconds, per-request identifier prefixes such as `session_`, `request_`
  and `trace_`, and relative-time phrases such as current time or as of now.
* **Hosting**: GitHub Pages.
* **Tests**: `node test.js`, 17 assertions including a self-verifying round trip: stripping
  the injected dynamic content out of the cache-busting example makes it pass exactly as
  clean as the good example.

## Notes

`core.js` runs unchanged in both the browser, as globals, and Node. The cache-order model
follows Anthropic's documented prompt caching behaviour, cited with links in the README
rather than inferred.
