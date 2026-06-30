# ADR-009: Service Architecture — Monolith vs Microservices

## Status
Accepted

## Date
2026-06-22

## Context
Wrench's backend must handle several distinct
functional areas: authentication, garage management
(cars, mods, service records), build planning,
budget tracking, the AI assistant with its RAG
pipeline, and media upload handling.

Two architectural patterns were evaluated for how
this functionality is organized and deployed:
1. A monolith — one Go application, one deployable
   unit, containing all functional areas
2. Microservices — functional areas split into
   independently deployable services communicating
   over the network

This decision affects deployment complexity,
development velocity, debugging difficulty,
infrastructure cost, and the team's ability to
ship features quickly during the 3-month build
window.

The team building Wrench is a single engineer.
The system is pre-launch, with no production
traffic and no validated assumptions yet about
which functional areas will need to scale
independently of others.

## Decision
Build Wrench as a **well-structured monolith**.

### Internal structure
Despite being a single deployable unit, the
Go application is organized with clear internal
boundaries that mirror what would become service
boundaries if a future split is needed:

```
/cmd
  /api              ← single entry point, starts
                       the HTTP server

/internal
  /auth             ← registration, login, JWT,
                       refresh tokens, OAuth
  /cars             ← cars, modifications,
                       service records
  /build            ← build stages, tasks
  /budget           ← budget entries, summaries
  /tools            ← garage tools
  /ai               ← chat, RAG pipeline,
                       conversations
  /upload           ← Cloudinary integration
  /shared
    /db             ← database connection pooling,
                       primary/replica routing
                       (see ADR-004)
    /cache          ← Redis client (see ADR-003)
    /middleware     ← auth middleware, logging,
                       request ID injection
    /observability  ← OTel instrumentation
                       (see ADR-006)
```

Each internal package (`auth`, `cars`, `build`,
`budget`, `tools`, `ai`, `upload`) follows the
handler → service → repository layering pattern,
and does not directly import another domain
package's internal types. Cross-domain
communication happens through well-defined
interfaces, not direct struct access. This
discipline is what makes a future extraction
into separate services straightforward if
ever required, without forcing it prematurely.

### Deployment
```
One Docker image, containing the full Go binary.
Deployed as multiple identical pod replicas
across AZ-1 and AZ-2 (see scalability-design.md).

Every pod runs the complete application —
auth, cars, build, budget, tools, ai, upload —
behind Kong and the load balancer described
in ADR-008.
```

## Reasoning

### Why a monolith is correct for Wrench right now

**Deployment and operational simplicity:**
A monolith deploys as one artifact. CI/CD (per
Sprint 2's pipeline) builds one Docker image, runs
one test suite, and deploys one set of pods. With
microservices, each service would need its own
pipeline, its own deployment configuration, its
own health checks, and its own monitoring
dashboards — multiplying operational surface area
by the number of services, with no corresponding
benefit at current scale.

**No service boundaries have been validated yet:**
Microservices are most valuable when different
parts of a system have genuinely different scaling
characteristics, different teams owning different
services, or different deployment cadences. None
of these conditions exist for Wrench at launch:
- One engineer owns all functional areas — there
  is no team boundary to mirror with a service
  boundary
- No production traffic exists yet to reveal which
  functional areas actually need independent
  scaling (the AI/RAG pipeline is the most likely
  candidate, per the capacity estimates showing it
  as the most expensive operation per user, but
  this is a hypothesis, not validated data)
- Deployment cadence is uniform — every feature
  ships together during active development

Splitting into services now would mean guessing
at boundaries based on assumption rather than
observed behavior, a well-documented anti-pattern
in distributed systems design.

**Network calls are expensive and add failure modes:**
Every service boundary introduced is a network
call that did not previously exist. A request that
touches auth, cars, and the AI pipeline within a
monolith is a sequence of function calls within
one process — fast, and the only failure mode is
the process itself failing.

The same request across microservices becomes
a sequence of HTTP or gRPC calls between services,
each with its own latency, its own potential for
timeout, its own retry logic, and its own partial
failure mode (the auth service responds but the
cars service times out — what does the client see?).
This complexity is justified when service
boundaries reduce coupling that is actively causing
problems. At Wrench's current stage, it would only
add failure surface without solving a real problem.

**Refactoring cost is lower than premature
extraction cost:**
If a functional area genuinely needs independent
scaling or deployment later (most likely candidate:
the AI/RAG pipeline, given its distinct latency
profile, external API dependencies, and cost
characteristics), the internal package boundaries
already in place (see Internal Structure above)
make extraction a refactor, not a rewrite.

The reverse is not true: merging poorly-designed
microservices back into a monolith after
discovering the split was premature is significantly
more costly than extracting a well-bounded internal
package into a service later.

### Why internal structure still matters

Building a monolith does not mean building an
unstructured one. The package boundaries documented
above exist specifically so that:
- Code in `/internal/ai` cannot directly query
  the `cars` table — it must go through the
  `cars` package's defined interface, exactly as
  it would need to make an API call to a separate
  `cars` service in a microservices architecture
- Each domain package has its own handler, service,
  and repository layers, mirroring what each
  package would look like as a standalone service's
  internal structure
- This discipline is enforced through code review
  and Go's own import system (internal packages
  cannot be imported from outside the module in
  ways that violate intended boundaries)

This is the senior engineering signal a monolith
of this kind sends: the decision to NOT split into
microservices was deliberate and reasoned, not a
failure to consider the alternative. The codebase
is structured to make that future decision easy
if data later supports it.

## Consequences

### Positive
- Single CI/CD pipeline, single deployment
  artifact, dramatically reduced operational
  complexity for a solo developer
- No network latency or partial failure modes
  between functional areas — cross-domain calls
  are in-process function calls
- Faster development velocity during the 3-month
  build window — no service contract negotiation,
  no need to version internal APIs between services
  that do not yet exist
- Internal package structure preserves the option
  to extract services later without requiring
  a rewrite
- Easier debugging and tracing — a single process
  with OTel instrumentation, rather than correlating
  traces across multiple independently deployed
  services (though OTel handles this well per
  ADR-006, it is simply unnecessary complexity
  to introduce without a service boundary to trace
  across)

### Negative — accepted trade-offs

**All functional areas scale together:**
If the AI/RAG pipeline experiences a usage spike,
the entire application scales (more pods), even
though auth and budget tracking are not under
the same load. This is less resource-efficient
than scaling only the bottlenecked service.
Accepted because at launch scale (10K users,
documented in capacity-estimation.md), this
inefficiency is negligible in absolute infrastructure
cost, and Go's resource efficiency means even
over-provisioned pods are inexpensive.

**A bug in one domain can affect the whole process:**
An unhandled panic in the `ai` package, if not
properly recovered via middleware, could crash
the entire pod rather than just the AI functionality.
Mitigated by standard Go panic recovery middleware
applied at the HTTP handler level, ensuring a panic
in any single request does not crash the process
or affect other concurrent requests.

**Deployment of any change requires deploying
the whole application:**
A one-line fix to the `budget` package requires
redeploying the entire Go binary, not just that
package. Mitigated by the CI/CD pipeline (Sprint 2)
being fast and reliable, and by the graceful
shutdown and rolling deployment strategy (see
scalability-design.md) ensuring zero-downtime
deploys regardless of how small the change is.

## Migration Trigger
This decision will be revisited when ANY of the
following conditions are met, based on observed
production data rather than speculation:

1. The AI/RAG pipeline's resource consumption
   (CPU, memory, or Claude API concurrency limits)
   becomes a bottleneck that requires scaling
   independently of the rest of the application,
   evidenced by sustained high resource utilization
   on AI-handling pods while other request types
   remain comfortably under capacity
2. A second engineer or team joins the project
   and genuine team-boundary reasons emerge to
   own and deploy specific domains independently
3. A specific domain's deployment cadence needs
   to differ meaningfully from the rest of the
   application (e.g. the AI package needs frequent
   prompt and RAG tuning deploys while core CRUD
   functionality is stable and rarely changes)

If triggered, the `/internal/ai` package is the
most likely first candidate for extraction into
a standalone service, given its distinct external
dependencies (Claude API, OpenAI Embeddings API),
distinct latency profile (multi-second responses
versus sub-200ms CRUD operations), and distinct
cost characteristics that justify independent
monitoring and scaling.

## Alternatives Rejected

**Microservices from day one:**
Rejected as premature. No validated data exists
about which domains need independent scaling.
Introduces significant operational overhead
(multiple deployment pipelines, multiple services
to monitor, network calls between domains that
were previously function calls) without a
corresponding benefit at current scale. This
is a well-documented anti-pattern — splitting
services based on anticipated rather than
observed boundaries frequently results in
boundaries that do not match real usage patterns,
requiring costly re-splitting later.

**Modular monolith with separate databases per
domain:**
A middle-ground approach where the application
remains a single deployable unit but each domain
owns a separate database/schema, simulating service
boundaries without network calls. Rejected because
it introduces the data-ownership complexity of
microservices (no cross-domain joins, eventual
consistency concerns between domains) without
the actual benefit of independent deployability
or scaling. The shared single database with
clear package-level code boundaries (this ADR's
decision) achieves the same discipline with
significantly less complexity.

**Serverless functions per endpoint:**
Each API endpoint deployed as an independent
serverless function (e.g. AWS Lambda). Rejected
primarily due to cold start latency being
incompatible with the AI chat endpoint's SSE
streaming requirements (NFR-02, NFR-03), and
because the operational model of managing
dozens of independent functions does not suit
a solo developer more than a single deployable
monolith does.

## References
- Scalability design: /docs/scalability-design.md
- Capacity estimates: /docs/capacity-estimation.md
- CI/CD pipeline: Sprint 2, /docs/architecture/
- Requirements: NFR-09, NFR-10, NFR-11
- Related ADRs: ADR-001 (REST API), ADR-006
  (observability), ADR-008 (Kong API Gateway)
- Martin Fowler: MonolithFirst