# Wrench — SLOs and Error Budgets

## Purpose

This document defines Wrench's Service Level
Objectives (SLOs), the error budget for each,
the policy governing how error budgets are spent,
and the reasoning behind every target value.

Related: observability-design.md (metrics and burn rate alerts)
Related: dashboards-and-alerts.md (alert rules)

---

## 1. SLI, SLO, SLA — Definitions

```
SLI (Service Level INDICATOR):
The actual measurement. A PromQL query that
produces a number between 0 and 1 (or 0-100%).
"The percentage of CRUD requests returning
 non-5xx status codes in the last 30 days."

SLO (Service Level OBJECTIVE):
The internal target the engineering team sets
for itself. A threshold on the SLI.
"The SLI must be >= 99.5% over any 30-day window."

SLA (Service Level AGREEMENT):
An external contract with paying customers.
Legally binding. Includes financial penalties
for breach.
"We guarantee 99.0% availability. If we fall
 below this, you receive a 20% service credit."

THE CHAIN:
SLI (what you measure)
  → SLO (what you target internally)
    → SLA (what you promise externally)

WHAT WRENCH HAS NOW:
SLOs — internal targets, no contractual obligation.
No SLA yet — Wrench is pre-launch with no paying
enterprise customers. SLAs are introduced when
businesses depend on the platform for revenue.

WHY NOT SET THE SLA AT THE SLO TARGET:
SLO: 99.5% → SLA: 99.0%

The gap between SLO and SLA is the buffer.
If you SLA at your SLO target:
→ One bad incident breaches both simultaneously
→ You owe service credits AND your engineering
  team's alarm fires at the same moment
→ No warning before contractual penalty

With a buffer:
SLO breach at 99.4% → engineering alarm fires
→ team investigates and fixes
→ SLA of 99.0% never reached
→ no service credits owed
SLO breach is the early warning system
before the SLA breach becomes a business problem.
```

---

## 2. Why SLOs Are Set Below Actual Performance

```
Setting an SLO requires knowing your actual
performance first. Never set an SLO before
measuring.

CORRECT PROCESS:
1. Measure actual performance for 30-60 days
2. Establish a baseline (e.g. p99 is 99.8%)
3. Set SLO below baseline with headroom
   (e.g. SLO at 99.5% if baseline is 99.8%)
4. The headroom absorbs normal variance
   without burning error budget

FOR WRENCH AT LAUNCH:
SLO targets are hypotheses based on architecture
review and load testing. They must be validated
against real production traffic in the first
30-60 days and adjusted if needed.

If actual performance is consistently 99.9%:
→ SLO of 99.5% is too lenient (lots of wasted budget)
→ Tighten to 99.7% after 60 days of data

If actual performance is consistently 99.3%:
→ SLO of 99.5% is impossible to hit
→ Fix the reliability issue first, THEN set the SLO
→ Never set an SLO you cannot currently meet
```

---

## 3. Defined SLOs

### SLO 1 — CRUD API Availability

```
WHAT IT MEASURES:
The percentage of non-AI API requests that
return a non-5xx HTTP status code.

SLI QUERY (30-day rolling):
sum(rate(wrench_http_requests_total{
  status_code!~"5..",
  path!="/health",
  path!~".*/chat"
}[30d]))
/
sum(rate(wrench_http_requests_total{
  path!="/health",
  path!~".*/chat"
}[30d]))

TARGET: >= 99.5%

ERROR BUDGET:
100% - 99.5% = 0.5% of requests can fail
Over 30 days = 3.6 hours of complete outage
              OR many small incidents totalling
              0.5% of all requests

WHY 99.5%:
Wrench's CRUD layer depends entirely on
components you control (Go API, Postgres,
Redis, Kong). 99.5% is achievable and
maintainable with the current architecture.

99.9% was considered and rejected:
→ Error budget would be only 43.8 minutes/month
→ A single deployment incident could exhaust it
→ Too little room for normal operations

99.0% was considered and rejected:
→ 7.2 hours of downtime/month is too permissive
→ Does not reflect the reliability we can achieve
→ Would not be acceptable to users

WHY /health AND /chat ARE EXCLUDED:
/health: polled by Kong every 3 seconds — high
         volume of guaranteed-200 requests that
         would make the SLI look better than reality

/chat: has its own SLO (SLO 3) with different
       targets reflecting its different reliability
       profile
```

### SLO 2 — CRUD API Latency

```
WHAT IT MEASURES:
The percentage of non-AI requests completing
within 500ms as measured at the Go API.

SLI QUERY (30-day rolling):
sum(rate(wrench_http_request_duration_seconds_bucket{
  le="0.5",
  path!="/health",
  path!~".*/chat"
}[30d]))
/
sum(rate(wrench_http_request_duration_seconds_count{
  path!="/health",
  path!~".*/chat"
}[30d]))

TARGET: >= 99% of requests under 500ms

ERROR BUDGET:
1% of CRUD requests allowed to exceed 500ms.
At 100 requests/day per user: ~1 slow response/day.

WHY 500ms:
User expectation for a CRUD action (adding a mod,
loading the garage page) is a sub-second response.
500ms is the standard threshold at which users
perceive an application as "slow."
Below 200ms: feels instant.
200-500ms: noticeable but acceptable.
Above 500ms: feels sluggish, erodes trust.

WHY 99% COVERAGE (not 99.5%):
The 1% headroom absorbs:
→ Occasional slow DB queries during maintenance
→ Cache cold starts after deployments
→ Brief Redis latency spikes
Without the headroom, normal operational
variance would burn the error budget.

MEASUREMENT LIMITATION (documented):
This SLI measures server-side latency only —
from Go API receipt to Go API response.
It does NOT include:
→ DNS resolution time
→ TCP/TLS handshake time
→ Network transit (both directions)

A user on a slow mobile network may experience
800ms total latency even when the server
responds in 80ms.

Grafana Faro (Real User Monitoring) is used
as a SECONDARY SIGNAL to track total user
experience latency, but it is not used as
the primary SLI because:
→ Network latency is outside Wrench's control
→ RUM data is affected by user device and
  network variability (not actionable)
→ GDPR consent requirements make RUM coverage
  incomplete

Server-side measurement is the primary SLO.
RUM data informs infrastructure decisions
(e.g. whether to add Fly.io regions) but
does not burn the error budget.
```

### SLO 3 — AI Assistant Availability

```
WHAT IT MEASURES:
The percentage of AI chat requests that return
a successful response (including responses
served via the OpenAI fallback).

SLI QUERY (30-day rolling):
rate(wrench_ai_requests_total{status="success"}[30d])
/
rate(wrench_ai_requests_total[30d])

TARGET: >= 99%

ERROR BUDGET:
1% of AI requests can fail = 7.2 hours/month
(versus 3.6 hours for CRUD SLO)

WHY 99% (NOT 99.5% LIKE CRUD):
The AI feature depends on external providers:
→ Anthropic Claude API (primary)
→ OpenAI (fallback)

Anthropic's published API availability is
typically 99.5-99.9% but this is THEIR target,
not yours. If Anthropic has a bad month:
→ Anthropic: 99.3% available (within their SLO)
→ Your OpenAI fallback adds coverage
→ But fallback may also have periods of
  degraded performance

Setting your AI SLO at 99.5% when you cannot
control two critical dependencies means:
→ A Claude incident breaches your SLO
→ Your error budget is consumed by events
  outside your control
→ Feature deploys are blocked because budget
  is exhausted by a vendor incident

99% = 7.2 hours of allowed downtime per month.
Enough buffer to absorb a Claude API incident
without breaching your SLO.

WHY "SUCCESS" INCLUDES FALLBACK:
A response served by OpenAI when Claude is
unavailable is still a successful response —
the user received an AI answer.
The fallback exists precisely to maintain
availability when Claude is degraded.
The SLI reflects user experience (did they
get an answer?) not provider choice.

WHAT COUNTS AS FAILURE FOR THIS SLI:
→ 500 Internal Server Error on /chat
→ 503 Service Unavailable (circuit breaker open)
→ Timeout with no response
→ SSE stream error event (not done event)

WHAT DOES NOT COUNT AS FAILURE:
→ 429 Rate Limited (user hit their quota —
  this is correct behaviour, not a failure)
→ 401 Unauthorized (authentication failure —
  not an AI availability issue)
→ 422 Validation Error (bad request)
```

### SLO 4 — AI Assistant Latency

```
WHAT IT MEASURES:
The percentage of AI requests where the
COMPLETE response (all tokens streamed) was
delivered within 10 seconds.

SLI QUERY (30-day rolling):
sum(rate(wrench_ai_request_duration_seconds_bucket{
  le="10"
}[30d]))
/
sum(rate(wrench_ai_request_duration_seconds_count[30d]))

TARGET: >= 95% of AI requests under 10 seconds

ERROR BUDGET:
5% of AI requests allowed to exceed 10 seconds.
At 20 requests/day: ~1 response/day may exceed 10s.

WHY 95% COVERAGE (not 99% like CRUD):
The additional 4% headroom (vs CRUD's 1%)
accommodates:
→ Claude's variable inference time
  (complex questions take longer)
→ Long build plan generation (vision requests)
→ Claude API performance variation under load
  (Anthropic's server load is outside your control)
→ Large conversation history requiring more
  context processing

With 99% coverage requirement:
A cluster of slow Claude responses during
peak Anthropic usage would breach the SLO
before you could act. With 95% coverage:
5 slow responses per 100 are expected and budgeted.

WHY 10 SECONDS (not 500ms like CRUD):
User expectation for AI responses differs from
CRUD. Users have been trained by ChatGPT,
Claude.ai, Gemini to expect AI to "think."
3-8 seconds is normal and expected.
10 seconds is the outer bound of patience.

Streaming mitigates perceived latency further:
The user sees tokens appearing at ~0.5-2s
even if the full response takes 8s.
The SLO measures completion time but the
user experience is measured by time_to_first_token
(separate metric, target: p95 < 3s).

COMPLEMENTARY METRIC (not an SLO):
wrench_ai_time_to_first_token_seconds
Target: p95 < 3s
This is monitored on Dashboard 2 and alerts
via Slack if breached for 10 minutes.
Not a formal SLO because first-token time
is also partially outside Wrench's control
(Claude thinking time before streaming begins).
```

---

## 4. SLO Summary Table

```
SLO   Feature          SLI                    Target  Budget/month
----------------------------------------------------------------------
1     CRUD availability non-5xx rate           99.5%   3.6 hours
2     CRUD latency      p99 < 500ms            99.0%   1% of requests
3     AI availability   success rate           99.0%   7.2 hours
4     AI latency        p95 < 10s              95.0%   5% of requests
```

---

## 5. Error Budget Calculations

### Budget in time

```
SLO 1 (99.5% availability, 30-day window):
Budget = (1 - 0.995) × 30 days × 24 hours
       = 0.005 × 720 hours
       = 3.6 hours of complete outage

If availability is partial (50% error rate):
Effective outage hours = 3.6 / 0.5 = 7.2 hours
(a 50% error rate burns budget twice as fast
as a 100% error rate, paradoxically — because
half the budget is consumed per hour)

Actually: budget_consumed_per_hour =
  actual_error_rate × total_requests_per_hour
  / (total_requests_per_hour × allowed_error_rate)
= actual_error_rate / allowed_error_rate
= burn_rate
```

### Burn rate formula

```
burn_rate = actual_error_rate / allowed_error_rate

For SLO 1 (99.5% → 0.5% allowed errors):

Normal operation (0.1% errors):
burn_rate = 0.001 / 0.005 = 0.2x (burning slowly)

At SLO boundary (0.5% errors):
burn_rate = 0.005 / 0.005 = 1x (sustainable)

Incident (5% errors):
burn_rate = 0.05 / 0.005 = 10x

Major outage (50% errors):
burn_rate = 0.50 / 0.005 = 100x
```

### Monthly budget consumption check

```
On any given day N of 30, check:

budget_consumed_so_far vs N/30

GOOD:    budget_consumed < N/30
         Burning slower than sustainable.
         e.g. Day 20: budget < 66% consumed

ON TRACK: budget_consumed ≈ N/30
          Burning at sustainable 1x rate.

DANGER:  budget_consumed > N/30
         Burning faster than sustainable.
         e.g. Day 25: budget 85% consumed
         85% / 83% elapsed = 1.02x burn rate
         At this rate: 85% + (1.02 × 17%) = 102.3%
         → Will breach by end of month

BREACH:  budget_consumed > 100%
         SLO has been breached this month.
         Post-mortem required.
         Adjust targets or fix reliability.
```

---

## 6. Error Budget Policy

This policy is agreed by the engineering and
product teams. It is applied AUTOMATICALLY
based on budget consumption — not on a
case-by-case basis. Consistency matters more
than flexibility here.

```
GREEN ZONE (< 50% budget consumed):

State:   Budget healthy. Plenty of room.
Deploys: Unrestricted. Deploy freely.
Risk:    Normal risk appetite. Experiment.
Focus:   Feature velocity.

YELLOW ZONE (50-75% budget consumed):

State:   Budget moderately consumed.
Deploys: Proceed with care.
         → Risky changes require extra review
         → Deploy during low-traffic hours only
           (not Friday afternoon, not peak evenings)
         → Rollback plan documented before deploy
Risk:    Reduced risk appetite.
Focus:   Balance features and reliability.

ORANGE ZONE (75-90% budget consumed):

State:   Budget significantly consumed.
         Current situation at Day 25, 85% consumed.
Deploys: Feature deploys DEFERRED to next month.
         Only critical bug fixes and security patches.
         → Any deploy requires incident commander
           designation before proceeding
         → Post-deploy monitoring for 1 hour minimum
Risk:    Low risk appetite.
Focus:   Reliability first. Investigate root cause
         of budget consumption.
Comms:   Engineering lead notifies product team.
         "No feature deploys this month — reliability focus."

RED ZONE (> 90% budget consumed):

State:   Budget nearly exhausted.
Deploys: FEATURE FREEZE. No deploys except:
         → Critical security patches
         → Rollback of a recent bad deploy
         All other deploys require VP Engineering approval.
Risk:    Minimal risk only.
Focus:   All hands on reliability.
         Root cause analysis of what consumed the budget.
Comms:   Engineering lead and VP Engineering notified.
         Status page updated if users are impacted.
         Post-mortem scheduled.

POST-BUDGET (> 100% consumed — SLO breached):

State:   SLO breached this month.
Action:  Post-mortem completed within 5 business days.
         Post-mortem must answer:
         → What caused the breach?
         → Was the SLO target too aggressive?
         → What changes prevent recurrence?
         → Should the SLO be adjusted?
Comms:   If an SLA existed: service credits issued.
         Status page incident closed with summary.
```

### What "deploy" means in this policy

```
COUNTS AS A DEPLOY (subject to policy):
→ Any new feature code reaching production
→ Infrastructure configuration changes
→ Database migrations
→ Dependency version upgrades
→ Kong configuration changes

DOES NOT COUNT (exempt from policy):
→ Reverting a recent deploy (rollback)
→ Emergency security patches
→ Hotfixes for active data integrity issues
  (these are themselves consuming budget — fix them)
→ Documentation or comment changes
→ Environment variable updates (no code change)
```

---

## 7. Monthly Error Budget Review

At the end of every month, the engineering
team holds a 30-minute budget review:

```
AGENDA:

1. BUDGET CONSUMPTION (5 min)
   How much budget was consumed for each SLO?
   Were any SLOs breached?

2. TOP INCIDENTS (10 min)
   What were the 3 incidents that consumed
   the most budget this month?
   Incident → root cause → was it preventable?

3. CAUSE ANALYSIS (5 min)
   Were incidents caused by:
   → Our code (fully preventable)
   → Our infrastructure (partially preventable)
   → External dependencies (limited control)
   This informs where reliability investment
   should go next month.

4. TARGET REVIEW (5 min)
   Are SLO targets still appropriate?
   → Consistently at 10% consumption: too lenient,
     tighten the target
   → Consistently at 90%+ consumption: too strict,
     loosen the target OR invest in reliability
   → 50-80% consumption: healthy range

5. NEXT MONTH PLAN (5 min)
   What reliability improvements are planned?
   What is the risk profile of planned deploys?
   Are there planned maintenance windows that
   will consume budget? (announce in advance)

OUTPUT:
→ Budget consumption report (Grafana screenshot)
→ Top 3 incidents documented
→ Action items for reliability improvements
→ Any SLO target changes with justification
```

---

## 8. Relationship Between SLOs

```
The four SLOs are not independent.
Infrastructure failures cascade:

Postgres primary down:
→ CRUD writes fail (SLO 1 burns)
→ Auth fails (SLO 1 burns)
→ RAG pipeline fails (SLO 3 burns)
→ All four SLOs may burn simultaneously

Redis down:
→ Rate limiting fails (fail-open per ADR-003)
→ Cache misses (performance degrades — SLO 2 may burn)
→ SLO 1 and SLO 3 likely unaffected if Postgres up

Claude API down with OpenAI fallback working:
→ SLO 3 (AI availability) unaffected
  (fallback responses count as success)
→ SLO 4 (AI latency) may burn
  (if OpenAI is slower than Claude for this workload)
→ SLO 1 and SLO 2 unaffected

Claude API down AND OpenAI down:
→ SLO 3 and SLO 4 burn rapidly
→ SLO 1 and SLO 2 unaffected
  (garage management still works)

This cascade analysis informs incident priority:
A DB primary failure is a Tier 1 incident
affecting ALL SLOs simultaneously.
A Claude API failure is a Tier 1 incident
affecting only AI SLOs.
Response urgency reflects which SLOs are at risk.
```

---

## 9. SLO Targets — Accepted Limitations

```
These limitations are documented explicitly.
They are known gaps, not oversights.

LIMITATION 1 — Server-side latency only:
SLO 2 and SLO 4 measure latency at the server.
They do not capture network transit time,
DNS resolution, or TLS handshake from the
user's perspective.
A user on a slow connection may experience
poor latency even when both SLOs are green.

Mitigation: Grafana Faro RUM as secondary signal.
Action trigger: if RUM shows consistent user
latency > 1.5s while server SLOs are green,
evaluate adding Fly.io regions closer to
high-traffic user geographies.

LIMITATION 2 — No SLO for AI response quality:
SLO 3 measures AI availability (did a response
arrive?) not quality (was the response correct?).
A hallucinated answer counts as "success."

Mitigation: User feedback mechanism (thumbs up/down
on AI responses) as a quality signal.
Future: evaluate automated RAG quality scoring.

LIMITATION 3 — 30-day rolling window:
A bad day at the start of the month is
forgotten by the end. Users who experienced
the bad day remember it even when the SLO
shows green.

This is the standard industry approach.
Rolling windows smooth over single incidents
and reflect sustained reliability better than
calendar-month windows.

LIMITATION 4 — Rate limiting not counted as failure:
429 responses are excluded from SLO 3.
A user who hits their rate limit did not
receive an AI response — from their perspective,
the service failed them.

Accepted: rate limiting is intentional behaviour
per NFR-15 (cost control). Including 429s in
the SLI would penalise correct behaviour.
The rate limit UX (clear message, retry-after)
is the mitigation for user experience.
```

---

## References

- observability-design.md (SLI metrics and queries)
- dashboards-and-alerts.md (burn rate alert rules)
- failure-modes.md (incident runbooks)
- Requirements: NFR-09, NFR-10, NFR-11 (scalability),
  NFR-06 (availability), NFR-07 (RTO)
- Google SRE Book Chapter 4: Service Level Objectives
- Google SRE Workbook Chapter 5: Alerting on SLOs