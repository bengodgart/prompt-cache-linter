// core.js
// Pure parsing and detection logic for the Prompt Cache Breakpoint Linter.
// No dependencies, no network calls. Runs as globals in the browser via
// <script src="core.js"></script>, and in Node via the module.exports
// footer at the bottom of this file.

// ---- Request shape validation ---------------------------------------------

// Check the pasted object looks like a Messages API request body. Collects
// every problem found instead of stopping at the first one.
function validateRequestShape(data) {
  const errors = [];
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    errors.push('Input is not a JSON object. Paste a full request body, for example { "model": "...", "messages": [...] }.');
    return errors;
  }
  if (data.messages === undefined) {
    errors.push('Missing "messages" array. A Messages API request always has one.');
  } else if (!Array.isArray(data.messages)) {
    errors.push('"messages" must be an array.');
  }
  if (data.tools !== undefined && !Array.isArray(data.tools)) {
    errors.push('"tools" must be an array if present.');
  }
  if (data.system !== undefined && typeof data.system !== 'string' && !Array.isArray(data.system)) {
    errors.push('"system" must be a string or an array of content blocks if present.');
  }
  return errors;
}

// ---- Cumulative prefix order: tools, then system, then messages ----------

// Flatten a request body into an ordered list of "blocks" in the same order
// Anthropic evaluates the cache: tools first, then the system prompt, then
// messages in conversation order. Each block that can carry a cache_control
// marker is its own entry, so we can tell exactly what a breakpoint covers.
function extractBlocks(data) {
  const blocks = [];
  let idx = 0;

  (data.tools || []).forEach((tool, i) => {
    blocks.push({
      index: idx++,
      source: 'tools',
      sourcePosition: i,
      type: 'tool',
      label: 'tools[' + i + '] ' + (tool && tool.name ? tool.name : '(unnamed tool)'),
      hasCacheControl: !!(tool && tool.cache_control),
      raw: tool,
    });
  });

  if (data.system !== undefined) {
    if (typeof data.system === 'string') {
      blocks.push({
        index: idx++,
        source: 'system',
        sourcePosition: 0,
        type: 'system_text',
        label: 'system (plain string)',
        hasCacheControl: false,
        raw: data.system,
      });
    } else if (Array.isArray(data.system)) {
      data.system.forEach((block, i) => {
        blocks.push({
          index: idx++,
          source: 'system',
          sourcePosition: i,
          type: (block && block.type) || 'system_block',
          label: 'system[' + i + '] ' + ((block && block.type) || 'block'),
          hasCacheControl: !!(block && block.cache_control),
          raw: block,
        });
      });
    }
  }

  (data.messages || []).forEach((message, mi) => {
    const role = (message && message.role) || 'unknown';
    if (typeof message.content === 'string') {
      blocks.push({
        index: idx++,
        source: 'messages',
        sourcePosition: mi,
        type: 'message_text',
        label: 'messages[' + mi + '] ' + role + ' text',
        hasCacheControl: false,
        raw: message.content,
      });
    } else if (Array.isArray(message.content)) {
      message.content.forEach((block, ci) => {
        const blockType = (block && block.type) || 'block';
        blocks.push({
          index: idx++,
          source: 'messages',
          sourcePosition: mi,
          type: blockType,
          label: 'messages[' + mi + '] ' + role + ' ' + blockType + '[' + ci + ']',
          hasCacheControl: !!(block && block.cache_control),
          raw: block,
        });
      });
    }
  });

  return blocks;
}

// Pull the text worth scanning for dynamic content out of a block. Image
// blocks are skipped (binary data, not authored text); everything else is
// reduced to a searchable string.
function blockSearchableText(raw) {
  if (raw === null || raw === undefined) return '';
  if (typeof raw === 'string') return raw;
  if (typeof raw === 'object') {
    if (raw.type === 'image') return '';
    if (raw.type === 'text' && typeof raw.text === 'string') return raw.text;
    if (raw.type === 'tool_result') {
      return typeof raw.content === 'string' ? raw.content : JSON.stringify(raw.content || '');
    }
    if (raw.type === 'tool_use') {
      return (raw.name || '') + ' ' + JSON.stringify(raw.input || {});
    }
    // Tool definitions and anything else: stringify the whole block, minus
    // the cache_control marker itself.
    const copy = Object.assign({}, raw);
    delete copy.cache_control;
    return JSON.stringify(copy);
  }
  return String(raw);
}

// For each block, work out whether it sits at or before some cache_control
// breakpoint (the cache covers everything up to and including that block).
// A block after the last breakpoint is not cached at all.
function computeCachedRegions(blocks) {
  const breakpointIndices = [];
  blocks.forEach((b, i) => {
    if (b.hasCacheControl) breakpointIndices.push(i);
  });
  return blocks.map((b, i) => {
    const coveringBreakpointIndex = breakpointIndices.find((bi) => bi >= i);
    return Object.assign({}, b, {
      cached: coveringBreakpointIndex !== undefined,
      coveringBreakpointIndex: coveringBreakpointIndex,
    });
  });
}

// ---- Dynamic content detection ---------------------------------------------

// Patterns for content that looks like it changes on every request. Each
// match records where in the source text it was found and a plain-English
// explanation of why it breaks caching when it sits before a breakpoint.
function detectDynamicContent(text) {
  if (!text) return [];
  const found = [];
  const claimedRanges = [];

  function overlapsClaimed(start, end) {
    return claimedRanges.some((r) => start < r.end && end > r.start);
  }
  function claim(start, end) {
    claimedRanges.push({ start: start, end: end });
  }

  // ISO 8601 timestamp (date + time), e.g. 2026-07-06T14:32:07Z.
  const tsRe = /\b\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?\b/g;
  let m;
  while ((m = tsRe.exec(text))) {
    claim(m.index, m.index + m[0].length);
    found.push({
      category: 'iso_timestamp',
      value: m[0],
      index: m.index,
      explanation: 'Looks like an ISO 8601 timestamp. It changes on every call, so if it sits before a cache breakpoint the prefix never matches a previous request and Anthropic writes a fresh cache entry instead of reading one.',
    });
  }

  // Calendar date only, skipped if it is already part of a timestamp match above.
  const dateRe = /\b\d{4}-\d{2}-\d{2}\b/g;
  while ((m = dateRe.exec(text))) {
    if (overlapsClaimed(m.index, m.index + m[0].length)) continue;
    claim(m.index, m.index + m[0].length);
    found.push({
      category: 'iso_date',
      value: m[0],
      index: m.index,
      explanation: 'Looks like a calendar date. If today\'s date is baked into a block before a breakpoint, the cache will only ever hit for the rest of that same day and miss every day after.',
    });
  }

  // UUID.
  const uuidRe = /\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/g;
  while ((m = uuidRe.exec(text))) {
    claim(m.index, m.index + m[0].length);
    found.push({
      category: 'uuid',
      value: m[0],
      index: m.index,
      explanation: 'Looks like a UUID. These are normally generated fresh per request or session, so one inside the cached prefix guarantees a miss on every call.',
    });
  }

  // Unix timestamp in milliseconds (Date.now() shape, 13 digits starting with 1).
  const epochMsRe = /\b1\d{12}\b/g;
  while ((m = epochMsRe.exec(text))) {
    if (overlapsClaimed(m.index, m.index + m[0].length)) continue;
    claim(m.index, m.index + m[0].length);
    found.push({
      category: 'epoch_millis',
      value: m[0],
      index: m.index,
      explanation: 'Looks like a Unix timestamp in milliseconds (the shape Date.now() produces). Like any timestamp, it is different on every call and will bust the cache if it sits before a breakpoint.',
    });
  }

  // Unix timestamp in seconds (10 digits starting with 1).
  const epochSecRe = /\b1\d{9}\b/g;
  while ((m = epochSecRe.exec(text))) {
    if (overlapsClaimed(m.index, m.index + m[0].length)) continue;
    claim(m.index, m.index + m[0].length);
    found.push({
      category: 'epoch_seconds',
      value: m[0],
      index: m.index,
      explanation: 'Looks like a Unix timestamp in seconds. Like any timestamp, it changes on every call and will bust the cache if it sits before a breakpoint.',
    });
  }

  // Per-request / per-session identifiers.
  const idRe = /\b(session|sess|request|req|trace|txn|run|order|correlation|corr)[_-][a-zA-Z0-9]{6,}\b/gi;
  while ((m = idRe.exec(text))) {
    claim(m.index, m.index + m[0].length);
    found.push({
      category: 'per_request_id',
      value: m[0],
      index: m.index,
      explanation: 'Looks like a per-request or per-session identifier. These are normally unique on every call, so one inside the cached prefix defeats caching for that whole block.',
    });
  }

  // Relative-time phrases that usually mean the surrounding text is generated fresh.
  const phraseRe = /\b(current time|current date|today's date|as of now|right now)\b/gi;
  while ((m = phraseRe.exec(text))) {
    found.push({
      category: 'relative_time_phrase',
      value: m[0],
      index: m.index,
      explanation: 'Contains a phrase like "' + m[0] + '" which usually means the surrounding text is generated fresh per request, even if this exact wording stays the same.',
    });
  }

  return found;
}

// ---- Full request analysis -------------------------------------------------

// Parse, order, and flag a request body in one pass. Only content that sits
// at or before an actual cache_control breakpoint gets flagged: dynamic
// content after the last breakpoint is the normal, expected uncached tail.
function analyzeRequest(data) {
  const shapeErrors = validateRequestShape(data);
  if (shapeErrors.length) {
    return { ok: false, errors: shapeErrors };
  }

  const blocks = computeCachedRegions(extractBlocks(data));
  const breakpoints = blocks.filter((b) => b.hasCacheControl);
  const flags = [];

  blocks.forEach((b) => {
    if (!b.cached) return;
    const text = blockSearchableText(b.raw);
    detectDynamicContent(text).forEach((match) => {
      flags.push(Object.assign({ blockLabel: b.label, blockIndex: b.index }, match));
    });
  });

  return { ok: true, blocks: blocks, breakpoints: breakpoints, flags: flags };
}

// ---- Usage object explainer -------------------------------------------------

// Turn a pasted `usage` object into a plain-English explanation of what each
// field means and a one-line verdict on what happened to the cache this call.
function explainUsage(usage) {
  if (usage === null || typeof usage !== 'object' || Array.isArray(usage)) {
    return { ok: false, errors: ['Input is not a JSON object. Paste a usage object, for example { "input_tokens": 15, "cache_creation_input_tokens": 0, "cache_read_input_tokens": 1842, "output_tokens": 210 }.'] };
  }

  const fields = ['input_tokens', 'cache_creation_input_tokens', 'cache_read_input_tokens', 'output_tokens'];
  const errors = [];
  fields.forEach((f) => {
    if (usage[f] !== undefined && typeof usage[f] !== 'number') {
      errors.push('"' + f + '" must be a number if present.');
    }
  });
  if (errors.length) return { ok: false, errors: errors };

  const input = usage.input_tokens || 0;
  const created = usage.cache_creation_input_tokens || 0;
  const read = usage.cache_read_input_tokens || 0;
  const output = usage.output_tokens || 0;

  let verdict;
  if (created > 0 && read === 0) {
    verdict = 'Cache MISS (or first write): this call wrote ' + created + ' new tokens to the cache. It did not reuse an existing cache entry.';
  } else if (read > 0 && created === 0) {
    verdict = 'Cache HIT: this call reused ' + read + ' cached tokens instead of reprocessing them.';
  } else if (read > 0 && created > 0) {
    verdict = 'Mixed result: ' + read + ' tokens were read from an existing cache entry and ' + created + ' new tokens were written, most likely a second breakpoint extending the prefix.';
  } else {
    verdict = 'No cache activity: nothing was read from or written to the cache on this call.';
  }

  const lines = [
    'input_tokens (' + input + '): tokens outside any cached prefix, processed fresh every call at the standard rate. Usually the newest, most dynamic part of the request.',
    'cache_creation_input_tokens (' + created + '): tokens written to the cache on this call, because this exact prefix was not already cached. Writing costs more than a normal input token.',
    'cache_read_input_tokens (' + read + '): tokens served from an existing cache entry instead of being reprocessed. Reading costs much less than a normal input token.',
    'output_tokens (' + output + '): tokens generated in the response. Caching has no effect on output tokens.',
  ];

  return { ok: true, verdict: verdict, lines: lines, totals: { input: input, created: created, read: read, output: output } };
}

// ---- Example fixtures -------------------------------------------------------

// Good example: a static tool + system prompt, cached with one breakpoint at
// the end of the system block, with the actual per-request question left
// uncached after the breakpoint, right where dynamic content belongs.
// Declared with var (not const) so it attaches as a real window property in
// the browser; index.html reads these fixtures via window.EXAMPLE_*.
var EXAMPLE_GOOD_REQUEST = {
  model: 'claude-opus-4-20250514',
  max_tokens: 1024,
  tools: [
    {
      name: 'search_manual',
      description: 'Search the product manual for a topic and return the matching section.',
      input_schema: {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query'],
      },
    },
  ],
  system: [
    {
      type: 'text',
      text:
        'You are a support assistant for Acme printers. Use the manual below to answer ' +
        'questions accurately and cite the section number.\n\n' +
        'SECTION 1: Setup\nUnpack the printer, remove all shipping tape, and connect the power cable.\n\n' +
        'SECTION 2: Troubleshooting\nIf the printer shows a paper jam error, open the rear tray and check for obstructions.',
      cache_control: { type: 'ephemeral' },
    },
  ],
  messages: [
    {
      role: 'user',
      content: "My printer says paper jam but I don't see any paper stuck.",
    },
  ],
};

// Cache-busting example: identical static structure, but the developer added
// a "helpful" current-time line and a session id inside the same cached
// system block. This is the documented "one caveat nobody mentions": a
// single dynamic value before the breakpoint invalidates the entire prefix
// on every call.
var EXAMPLE_BUSTING_REQUEST = {
  model: 'claude-opus-4-20250514',
  max_tokens: 1024,
  tools: [
    {
      name: 'search_manual',
      description: 'Search the product manual for a topic and return the matching section.',
      input_schema: {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query'],
      },
    },
  ],
  system: [
    {
      type: 'text',
      text:
        'You are a support assistant for Acme printers. Current server time: 2026-07-06T14:32:07Z. ' +
        'Session: session_8f3ab2c9d1. Use the manual below to answer questions accurately and cite ' +
        'the section number.\n\n' +
        'SECTION 1: Setup\nUnpack the printer, remove all shipping tape, and connect the power cable.\n\n' +
        'SECTION 2: Troubleshooting\nIf the printer shows a paper jam error, open the rear tray and check for obstructions.',
      cache_control: { type: 'ephemeral' },
    },
  ],
  messages: [
    {
      role: 'user',
      content: "My printer says paper jam but I don't see any paper stuck.",
    },
  ],
};

// Usage fixtures for the optional usage-object explainer.
var EXAMPLE_USAGE_HIT = {
  input_tokens: 15,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 1842,
  output_tokens: 210,
};

var EXAMPLE_USAGE_MISS = {
  input_tokens: 15,
  cache_creation_input_tokens: 1842,
  cache_read_input_tokens: 0,
  output_tokens: 210,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    validateRequestShape: validateRequestShape,
    extractBlocks: extractBlocks,
    blockSearchableText: blockSearchableText,
    computeCachedRegions: computeCachedRegions,
    detectDynamicContent: detectDynamicContent,
    analyzeRequest: analyzeRequest,
    explainUsage: explainUsage,
    EXAMPLE_GOOD_REQUEST: EXAMPLE_GOOD_REQUEST,
    EXAMPLE_BUSTING_REQUEST: EXAMPLE_BUSTING_REQUEST,
    EXAMPLE_USAGE_HIT: EXAMPLE_USAGE_HIT,
    EXAMPLE_USAGE_MISS: EXAMPLE_USAGE_MISS,
  };
}
