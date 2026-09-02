# Decisions

## A. What we didn't build, and why

A few things were left out on purpose because they're genuinely out of
scope for a welfare triage MVP, not because they were forgotten.

**Real staff authentication / SSO.** Staff identity is a server env var
(`STAFF_DEV_ID`), not a login system. Wiring up session-based auth or an
SSO integration against a real university identity provider is a real
piece of work with its own security surface, and building a fake version
of it would have been worse than being honest that it's missing.

**Staff roles and permissions.** Every staff member can see and claim
every case; there's no admin/reviewer/read-only distinction. A real
deployment would likely want a "who can see safeguarding cases"
boundary, but that's a policy call for whoever runs this, not something
to guess at.

**A knowledge-base CMS.** The 13 knowledge resources live in a seed
script, not an editable admin screen — fine for a fixed set, not if
staff need to update guidance themselves.

**Vector search / RAG.** Retrieval is deterministic keyword and category
matching against a small table, not embeddings. At 13 resources this is
more debuggable than a vector index, and correctness matters more than
recall here.

**Notifications, university system integrations, AI fine-tuning,
analytics dashboards.** None of these were asked for, and each is its
own project — adding any would have meant guessing at requirements
nobody stated.

## B. A decision a reasonable engineer could have made differently

The safety engine (`lib/safety/rules.ts`) is deterministic, code-only
logic that re-checks the raw message and has the final say over urgency,
safeguarding, and escalation — the AI's classification is only ever a
recommendation into it. A reasonable alternative would be to trust a
well-prompted model directly, maybe with a second model call acting as a
"judge" over the first. That would catch phrasing the regex rules don't
anticipate and need less rule-maintenance as language evolves. It would
cost non-determinism (the same message could get different answers on
different days), extra latency and provider dependency on the
safety-critical path, and weaker auditability — "the model decided" is a
worse answer for a safeguarding review than "rule 2 matched this exact
pattern." Given this is a welfare/safety system, we took the more
boring, testable option.

## C. What would break first in production

**The Groq API becomes unavailable or rate-limited.** Not theoretical —
we hit Groq's own daily token quota during heavy verification testing on
this project. The system degrades safely (a failed AI call falls back to
a conservative escalation, never a silent failure), but a sustained
outage means every conversation escalates to staff instead of getting an
answer. Detectable via `/api/health` plus watching the `ai_unavailable`
safety flag rate — a spike there means Groq trouble, not a code bug.

**No rate limiting beyond payload-size caps.** A single user or script
could burn through Groq quota (see above) or flood the case queue.
Nothing currently catches this before it happens.

**No real staff authentication.** This is the one that has to be fixed,
not just monitored, before real students and staff use this.
