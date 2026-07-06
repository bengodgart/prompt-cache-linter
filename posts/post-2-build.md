Built a small tool this week: a linter for Anthropic prompt cache breakpoints.

The interesting part wasn't the regex for dates and UUIDs. It was getting the cache
order right. Anthropic caches a cumulative prefix in a fixed sequence: tools, then
the system prompt, then messages, in order. A cache_control marker on any block
means "everything up to and including this is cached." Get that order wrong and
every flag you show is misleading.

Once the order was right, the rest followed: walk the blocks, find the breakpoints,
scan only what's actually inside the cached region for anything that looks like it
changes per request.

Two-minute demo:
1. Open the page, click "Load cache-busting example."
2. It flags a timestamp and a session id sitting inside the cached system prompt,
   with a plain-English reason for each.
3. Click "Load good example" to see the same request with those two things removed:
   one breakpoint, zero flags.

Everything runs in your browser. Nothing you paste gets uploaded, nothing gets
logged, and you can check that yourself in the Network tab.

Link: LIVE_URL

#ClaudeAPI #BuildInPublic
