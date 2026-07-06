// test.js
// Plain Node script, no test framework. Run: node test.js
// Prints PASS/FAIL per assertion and exits 1 if anything failed.

const core = require('./core.js');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log('PASS: ' + message);
  } else {
    failed++;
    console.log('FAIL: ' + message);
  }
}

// 1. Happy path: the built-in good example has one breakpoint and passes clean.
{
  const result = core.analyzeRequest(core.EXAMPLE_GOOD_REQUEST);
  assert(result.ok === true, 'good example parses as a valid request');
  assert(result.breakpoints.length === 1, 'good example has exactly one cache breakpoint');
  assert(result.flags.length === 0, 'good example produces zero flags');
}

// 2. Key detection: the busting example (the "one caveat nobody mentions" bug,
// a timestamp inside the cached system block) is flagged, and collects every
// finding rather than stopping at the first.
{
  const result = core.analyzeRequest(core.EXAMPLE_BUSTING_REQUEST);
  assert(result.ok === true, 'busting example parses as a valid request');
  assert(result.flags.length >= 2, 'busting example flags at least two problems (timestamp and session id)');
  assert(result.flags.some((f) => f.category === 'iso_timestamp'), 'busting example flags the ISO timestamp before the breakpoint');
  assert(result.flags.some((f) => f.category === 'per_request_id'), 'busting example flags the session id before the breakpoint');
}

// 3. Edge case: no cache_control anywhere means nothing is cached, so nothing
// can be flagged even though the content is dynamic-looking.
{
  const noBreakpoint = {
    messages: [{ role: 'user', content: 'Current server time: 2026-07-06T14:32:07Z' }],
  };
  const result = core.analyzeRequest(noBreakpoint);
  assert(result.breakpoints.length === 0, 'a request with no cache_control has zero breakpoints');
  assert(result.flags.length === 0, 'dynamic content is not flagged when nothing in the request is cached');
}

// 4. Edge case: dynamic content AFTER the last breakpoint is the normal,
// expected uncached tail and must not be flagged.
{
  const tailDynamic = {
    system: [
      { type: 'text', text: 'You are a helpful assistant with a static prompt.', cache_control: { type: 'ephemeral' } },
    ],
    messages: [{ role: 'user', content: 'Request id req_9f8e7d6c5b, please summarize.' }],
  };
  const result = core.analyzeRequest(tailDynamic);
  assert(result.breakpoints.length === 1, 'tail-dynamic fixture has one breakpoint');
  assert(result.flags.length === 0, 'dynamic content placed after the last breakpoint is not flagged');
}

// 5. UUID detection.
{
  const uuidReq = {
    system: [
      { type: 'text', text: 'Trace id: 8f14e45f-ceea-467e-bd52-2f4dd1a5f6a7 for this deployment.', cache_control: { type: 'ephemeral' } },
    ],
    messages: [{ role: 'user', content: 'hello' }],
  };
  const result = core.analyzeRequest(uuidReq);
  assert(result.flags.some((f) => f.category === 'uuid'), 'a UUID before a breakpoint is flagged');
}

// 6. Unix epoch (milliseconds) detection.
{
  const epochReq = {
    system: [
      { type: 'text', text: 'Server boot epoch: 1751800000000 ms.', cache_control: { type: 'ephemeral' } },
    ],
    messages: [{ role: 'user', content: 'hello' }],
  };
  const result = core.analyzeRequest(epochReq);
  assert(result.flags.some((f) => f.category === 'epoch_millis'), 'a millisecond Unix timestamp before a breakpoint is flagged');
}

// 7. Shape validation collects every problem instead of stopping at the first.
{
  const badShape = { tools: 'not-an-array' }; // also missing "messages"
  const errors = core.validateRequestShape(badShape);
  assert(errors.length >= 2, 'a request missing messages and with a malformed tools field reports both problems');
}

// 8. Usage explainer: a read-only call reports HIT, a creation-only call reports MISS.
{
  const hit = core.explainUsage(core.EXAMPLE_USAGE_HIT);
  assert(hit.ok === true && /HIT/.test(hit.verdict), 'a usage object with only cache_read_input_tokens is explained as a cache hit');

  const miss = core.explainUsage(core.EXAMPLE_USAGE_MISS);
  assert(miss.ok === true && /MISS/.test(miss.verdict), 'a usage object with only cache_creation_input_tokens is explained as a cache miss');
}

// 9. Self-verifying round trip: stripping the injected dynamic content out of
// the busting example's cached block should make it pass exactly as clean as
// the good example, proving the flags are caused by that content and nothing else.
{
  const stripped = JSON.parse(JSON.stringify(core.EXAMPLE_BUSTING_REQUEST));
  stripped.system[0].text = stripped.system[0].text
    .replace('Current server time: 2026-07-06T14:32:07Z. ', '')
    .replace('Session: session_8f3ab2c9d1. ', '');
  const result = core.analyzeRequest(stripped);
  assert(result.flags.length === 0, 'removing the injected timestamp and session id from the busting example makes it pass clean');
}

console.log('');
console.log(passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
