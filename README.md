# Prompt Cache Breakpoint Linter

Paste an Anthropic Messages API request with `cache_control` markers and see exactly what
is cached at each breakpoint, plus a flag on any dynamic-looking content sitting before a
breakpoint that will silently break the cache. Runs entirely in your browser. Nothing you
paste is uploaded.

Live: https://bengodgart.github.io/prompt-cache-linter/

## Demo

1. Open `index.html` (or the live link above).
2. Click **Load cache-busting example**. It fills the box with a request that looks
   reasonable and analyzes it automatically.
3. See the result: the system prompt is cached (breakpoint 1), and two problems are flagged
   inside it:
   ```
   ISO timestamp in system[0] text: 2026-07-06T14:32:07Z
   Per-request ID in system[0] text: Session: session_8f3ab2c9d1
   ```
   Both sit inside the cached block, so both invalidate the entire prefix on every call.
4. Click **Load good example** to see the same request structure with the timestamp and
   session id removed: one breakpoint, zero flags, and the actual user question left
   uncached after the breakpoint, right where per-request content belongs.

The busting example is intentionally bad by design: it exists to show a real cache-buster
being caught, not to represent a request you would want to send.

## Quickstart

```
cd prompt-cache-linter
python -m http.server 8000    # or just open index.html directly
node test.js
```

## Why this exists

Anthropic prompt caching only pays off if the cached prefix is byte-for-byte identical on
the next call. A single dynamic value placed before a `cache_control` breakpoint, a
timestamp, a request id, a UUID, breaks that match on every single call, so the API writes
a fresh (more expensive) cache entry instead of reading a cheap one. This is documented
behavior, cited below, and it is also a widely repeated gotcha: a "current time" or
similar helpful-looking line dropped into a cached system prompt quietly turns an intended
90 percent discount into full-price cache writes forever, with no error and no obvious
symptom besides a cost or latency graph that never improves. On top of that, the
`cache_creation_input_tokens` / `cache_read_input_tokens` / `input_tokens` split in a
`usage` object confuses people who are new to caching. There are blog posts explaining all
of this. There was no small interactive tool that takes your actual request, replays
Anthropic's own tools-then-system-then-messages cache order, and points at the exact block
that is going to bust the cache.

## What it checks

- **Cache order and breakpoints**: rebuilds the cumulative prefix in the order Anthropic
  evaluates it, tools first, then the system prompt, then messages in conversation order.
  Any block with a `cache_control` marker is a breakpoint; everything up to and including
  that block is cached.
- **ISO 8601 timestamps and calendar dates**, for example `2026-07-06T14:32:07Z`.
- **UUIDs**, the standard 8-4-4-4-12 hex format.
- **Unix epoch timestamps** in seconds or milliseconds, the shape a raw `Date.now()` call
  produces.
- **Per-request identifiers**: a small heuristic for tokens like `session_`, `request_`,
  or `trace_` followed by an id.
- **Relative-time phrases** such as "current time" or "as of now".

Only content that sits at or before an actual breakpoint is scanned and flagged. Dynamic
content placed after the last breakpoint is the normal, expected uncached tail and is never
flagged: that is exactly where per-request content belongs. This is a heuristic, not a
guarantee. It recognizes specific shapes, so a dynamic value with no obvious pattern (a
customer's name, say) can slip through, and image content blocks are skipped entirely since
they carry binary data, not text.

### Sources

- Anthropic, prompt caching documentation (cumulative prefix, tools then system then
  messages order, breakpoint behavior):
  https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching
- Anthropic, Messages API reference for `cache_control` and `usage` fields:
  https://docs.anthropic.com/en/api/messages
- A widely shared community writeup on prompt caching savings, and its one common gotcha:
  a timestamp or other per-request value placed inside the cached system prompt
  invalidates the whole prefix on every call.

## Tests

```
node test.js
```

Sample output (last lines):

```
PASS: a usage object with only cache_read_input_tokens is explained as a cache hit
PASS: a usage object with only cache_creation_input_tokens is explained as a cache miss
PASS: removing the injected timestamp and session id from the busting example makes it pass clean

17 passed, 0 failed
```

The suite covers the happy path (the good example, one breakpoint, zero flags), the key
detection this tool exists for (the busting example's timestamp and session id, both
flagged), two edge cases (no breakpoints at all, and dynamic content correctly left
unflagged after the last breakpoint), individual detection categories (UUID, Unix epoch),
shape validation collecting multiple problems at once, the usage explainer's hit/miss
verdicts, and a self-verifying round trip: stripping the injected dynamic content out of
the busting example makes it pass exactly as clean as the good example.

## Tech notes

Single page, one script file, no backend, no framework, no build step, no dependencies.
`core.js` holds all the parsing, cache-order, and detection logic as plain functions and
runs unchanged in both the browser (as globals) and Node (`node test.js`). Open the
Network tab while using the page and it stays empty; nothing is ever sent anywhere.

## Privacy

Everything runs in your browser. Nothing you paste is uploaded, stored, or transmitted.

## License

MIT. See `LICENSE`.
