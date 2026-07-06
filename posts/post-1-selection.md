A single misplaced timestamp can quietly bust your Anthropic prompt cache on every call.

Prompt caching promises up to 90 percent savings on the tokens you send repeatedly:
a long system prompt, a tool list, a reference document. You set a cache_control
breakpoint once and expect it to keep paying off.

Except caching only works if the cached prefix matches byte for byte, every time.
Drop a "current time" line, a session id, or a request id into that cached block,
and it never matches again. No error. No warning. Just a cost or latency graph that
never improves, and no obvious reason why.

It's documented in Anthropic's own caching docs. It's been written up as "the one
caveat nobody mentions." But I couldn't find a tool that actually looks at your
request and tells you which line is the problem.

So I built one.

Paste your request, see the breakpoint, see the flag.

Build post and demo coming next.

#ClaudeAPI #PromptEngineering
