# PRD: Prompt Cache Breakpoint Linter

**One-liner:** A free single-page linter for Anthropic prompt caching. Paste a Messages
API request with `cache_control` markers and see exactly which blocks are cached at each
breakpoint, with a flag on any dynamic-looking content sitting before a breakpoint that
will silently bust the cache.

**Usefulness:** Anthropic prompt caching silently misses when dynamic content (a
timestamp, a UUID, "current time") sits before a breakpoint, and the
`cache_creation_input_tokens` vs `cache_read_input_tokens` vs `input_tokens` accounting
confuses most people who try it. This is documented behavior (Anthropic's own prompt
caching docs describe the cumulative prefix and the tools-then-system-then-messages
order) and a widely repeated real-world gotcha (a timestamp in a cached system prompt
invalidates the whole prefix every call). Many blog explainers exist; none of them are
interactive. This answers "will this cache hit?", not "what will it cost?" (that is a
separate class of tool). Useful to one Claude API developer on day one: paste the
request, see the cache-buster.

## v1 scope (built)

1. One input: paste a Messages API request body (tools, system, messages, with
   `cache_control` markers).
2. Renders the cumulative prefix and shows which blocks are cached at each breakpoint,
   respecting the tools-then-system-then-messages order, including requests with more
   than one breakpoint.
3. Flags dynamic-looking content sitting before a breakpoint: ISO timestamps, calendar
   dates, UUIDs, Unix epoch timestamps (seconds and milliseconds), per-request
   identifiers, and relative-time phrases. Each flag explains in plain words why it busts
   the cache. Dynamic content after the last breakpoint is correctly left unflagged.
4. Optional: paste a `usage` object and get a plain-English explanation of
   `cache_creation_input_tokens`, `cache_read_input_tokens`, and `input_tokens`, plus a
   one-line hit/miss/mixed verdict.
5. A built-in good vs cache-busting example pair. The busting example is flagged; the
   good example passes clean. Both are one click away via Load example buttons.

## Non-goals (not built, per brief)

- Making real API calls.
- Exact cost math (a separate class of cost-focused tools covers that).
- Accounts or saved requests.
- A "pro" tier.

## Demo path (2 minutes)

1. Open `index.html`.
2. Click Load cache-busting example. See one breakpoint found and two problems flagged:
   an ISO timestamp and a session id, both inside the cached system prompt.
3. Click Load good example. See the same structure with those two values removed: one
   breakpoint, zero flags, and the real per-request question left uncached after it.
4. Optionally paste a `usage` object (or load one of the two usage examples) and click
   Explain usage to see the hit/miss verdict and a plain-English read on each field.

## Done-when checklist

- [x] Pasting the cache-busting example flags the timestamp inside the cached system
      block in under 2 minutes, using only the Load example button.
- [x] The built-in busting example is flagged and the good example passes clean. Proven
      in `test.js` and independently exercised against the live `index.html` UI logic.
- [x] README cites the Anthropic caching docs and the tools-then-system-then-messages
      cumulative-prefix order.
- [x] Copy passes a no-em-dash sweep.
- [x] Nothing requires sign-up; no network request happens during an analyze.

Mid-build ideas that came up and were not built go in `parking_lot.md`.
