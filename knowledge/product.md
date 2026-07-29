---
type: Product
title: prompt-cache-linter
description: 'Paste an Anthropic Messages API request with cache_control markers and see what is cached at each breakpoint, plus a flag on any dynamic content before a breakpoint that will silently break the cache. Runs entirely in the browser.'
domain: AI & LLM Tooling
users: 'Developers using Anthropic prompt caching whose cost or latency graph never improved and who cannot see why.'
lifecycle: shipped
live_url: https://bengodgart.github.io/prompt-cache-linter/
pricing: 'Free. MIT licensed, no accounts.'
generated:
  by: claude-opus-5
  at: '2026-07-29T04:20:00+00:00'
status: stable
resource: https://github.com/bengodgart/prompt-cache-linter.git
---

# prompt-cache-linter

Paste an Anthropic Messages API request with `cache_control` markers and see what is cached
at each breakpoint, plus a flag on any dynamic content before a breakpoint that will
silently break the cache. Runs entirely in the browser.

## Who it is for

Developers using Anthropic prompt caching whose cost or latency graph never improved and who
cannot see why.

## What problem it solves

Prompt caching only pays off if the cached prefix is byte-for-byte identical on the next
call. A single dynamic value before a `cache_control` breakpoint, a timestamp, a request id,
a UUID, breaks that match every call, so the API writes a fresh and more expensive cache
entry instead of reading a cheap one. There is no error and no obvious symptom besides a
cost graph that never improves. A helpful-looking current time line dropped into a cached
system prompt quietly turns an intended 90 percent discount into full-price cache writes
forever.

Blog posts explain this. What did not exist was a small interactive tool that takes your
actual request, replays Anthropic's own tools-then-system-then-messages cache order, and
points at the exact block that is going to bust the cache. It also explains the
`cache_creation_input_tokens` and `cache_read_input_tokens` split in a `usage` object as a
plain hit or miss verdict.

Only content at or before an actual breakpoint is scanned. Dynamic content after the last
breakpoint is the normal uncached tail and is never flagged, because that is exactly where
per-request content belongs.

## Current state

Shipped and public on GitHub Pages. This is a heuristic, not a guarantee: it recognises
specific shapes, so a dynamic value with no obvious pattern, a customer name for instance,
can slip through, and image content blocks are skipped entirely since they carry binary
data rather than text.
