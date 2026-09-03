# Decisions

## A. What I didn't build, and why

A few things are missing on purpose — they're out of scope for a welfare
triage MVP, not forgotten.

**Real staff authentication / SSO.** Staff identity is a server env var
(`STAFF_DEV_ID`), not a login system. Session auth or SSO against a
university identity provider is real work with its own security
surface — a fake version would have been worse than being honest it's
missing. Staff roles are flat too: anyone can claim any case, with no
admin/reviewer split.

**A knowledge-base CMS and vector search.** The 13 resources live in a
seed script, retrieved by keyword and category, not embeddings — fine at
this size, and easier to debug than either.

**Multi-tenancy.** There's no `Organization` entity — this is
single-tenant. Building tenant scoping without a real second institution
to test against would have been guesswork, not engineering.

**Notifications, university system integrations, AI fine-tuning,
analytics dashboards.** None of these were asked for, and each is its
own project.

## B. A decision a reasonable engineer could have made differently

I kept the safety decision outside the model. The safety engine
(`lib/safety/rules.ts`) is plain code that re-checks the raw message and
has the final say on urgency, safeguarding, and escalation — the AI's
classification is only a recommendation into it. The model is good at
classification, but it shouldn't be the final authority on a crisis or
immigration case.

A reasonable alternative is trusting a well-prompted model directly,
maybe with a second call acting as a judge. That would catch phrasing
the regex rules miss. The trade-off: less predictable (same message,
different answer on different days), extra latency and provider
dependency on the safety-critical path, and "the model decided" is a
worse answer for a safeguarding review than "rule 2 matched this exact
pattern." I'd rather have rules that are less flexible but easier to
test.

The same instinct shows up elsewhere: Zod validates the AI's output
before anything trusts it, conversation history is capped at a few
turns instead of unbounded, and a failed AI call defaults to escalation
instead of guessing.

## C. What would break first in production

**The Groq API becomes unavailable or rate-limited.** Not theoretical —
I hit Groq's own daily token quota during heavy testing on this project.
It degrades safely (a failed AI call falls back to conservative
escalation, never a silent failure), but a sustained outage means every
conversation escalates to staff instead of getting an answer. I'd catch
this via `/api/health` plus the `ai_unavailable` flag rate — a spike
there means Groq trouble, not a code bug.

**No rate limiting beyond payload-size caps.** A single user or script
could burn through the Groq quota above, or flood the case queue, and
nothing currently catches it before it happens.

**No real staff authentication.** This is the one that has to be fixed,
not just monitored, before real students and staff use this.
