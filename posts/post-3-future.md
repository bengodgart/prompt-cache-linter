Where this could go, if it's useful to anyone besides me.

Right now it checks requests you paste in one at a time, which is fine for
debugging a single call but slower if you're auditing a whole codebase of
prompt templates.

A few directions I'd consider if there's actual demand:

A "suggest a breakpoint" mode that looks at a request with no cache_control yet
and recommends where to put one, instead of only checking positions you already
chose.

A short companion post walking through cache_creation vs cache_read accounting
with real numbers, since that confusion comes up almost as often as the
busted-cache problem itself.

Not committing to either one yet. If you've hit a caching bug this would have
caught, or want a feature that isn't here, tell me and I'll take a look.

Link: LIVE_URL

#ClaudeAPI #PromptCaching
