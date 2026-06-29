# ADR-001: API Protocol — REST vs GraphQL vs gRPC

## Status
Accepted

## Date
2026-06-22

## Context
Wrench requires an API layer between the Next.js frontend
and the Go backend. Three protocols were evaluated:
REST, GraphQL, and gRPC.

The API must support:
- Standard CRUD operations for cars, modifications,
  service records, build stages, and budget entries
- Server-Sent Events (SSE) for streaming AI responses
- File uploads for photos and receipts
- Consumption by a Next.js web frontend today and
  potential iOS and Android apps in the future

The API contract must be stable, well-documented,
and straightforward to consume across multiple clients.

## Decision
Use **REST** with OpenAPI 3.0 documentation.

## Reasoning

### Why not GraphQL
GraphQL was evaluated as a candidate because it allows
clients to request exactly the fields they need,
reducing over-fetching.

However, for Wrench's data model GraphQL introduces
more complexity than it solves:

- Wrench's data relationships are straightforward and
  hierarchical (user → cars → mods, service, build).
  GraphQL's flexibility is most valuable for complex,
  deeply nested, or unpredictable query patterns —
  none of which apply here.
- The build plan endpoint intentionally returns a
  nested response (stages with tasks) shaped for the
  UI. This is achievable and cleaner with a dedicated
  REST endpoint than with GraphQL resolvers.
- GraphQL requires a schema definition layer, resolver
  functions, and a separate toolchain. This adds
  meaningful complexity for a solo developer on a
  tight timeline.
- SSE streaming for AI responses is not natively
  supported in GraphQL without adding subscriptions,
  which introduces WebSocket complexity.
- File uploads in GraphQL require the multipart
  request specification, which is non-standard and
  poorly supported across clients.

### Why not gRPC
gRPC was evaluated for its performance characteristics
and strongly typed contracts.

However:
- gRPC is not natively supported in browsers without
  a proxy layer (gRPC-Web). This adds an additional
  infrastructure component (Envoy or similar) that
  increases operational complexity.
- The Next.js frontend cannot call gRPC endpoints
  directly — every request would need to be proxied.
- gRPC's performance advantages are most significant
  for high-throughput internal service-to-service
  communication. Wrench's frontend-to-API traffic
  does not require this level of performance at
  current or projected scale.
- gRPC would be a valid choice if Wrench later splits
  into microservices with internal service
  communication. This is documented as a future
  consideration in ADR-009.

### Why REST
REST is the correct choice for Wrench because:

- The data model maps naturally to REST resources:
  /cars, /cars/{carId}/mods, /cars/{carId}/service.
  Every resource has a clear owner and a predictable
  URL structure.
- SSE is natively supported over HTTP — the AI chat
  endpoint streams tokens without any additional
  protocol layer.
- File uploads use standard multipart/form-data,
  supported universally across all HTTP clients.
- OpenAPI 3.0 generates interactive documentation
  automatically, served at api.wrench.ai/docs.
- Every HTTP client — browsers, iOS, Android,
  Postman, curl — speaks REST natively. No SDK
  or code generation required for consumers.
- The team (currently one engineer) already has
  REST experience. No learning curve.

### Derived fields as a REST design principle
All REST responses in Wrench include derived fields
(costFormatted, percentComplete, amountFormatted)
calculated server-side. This enforces DRY across
client boundaries — web, iOS, and Android all
display identical values without duplicating
business logic or edge case handling.

### Error contract
All errors follow RFC 7807 Problem Details format
with a stable, machine-readable type URI. This allows
clients to programmatically handle specific error
types without string matching on human-readable
messages that can change.

## Consequences

### Positive
- Simple, universally understood API contract
- Native SSE support for AI streaming
- OpenAPI documentation generated automatically
- No proxy layer required for browser clients
- Familiar to all future engineers joining the project

### Negative
- Clients may over-fetch or under-fetch data compared
  to GraphQL. Mitigated by designing response shapes
  to match UI needs (e.g. nested build plan response,
  CarDetail with recentMods included).
- No built-in real-time subscription support beyond
  SSE. If Wrench later needs multi-user real-time
  collaboration, WebSockets would need to be added.

## Alternatives Rejected
- **GraphQL:** Over-engineered for this data model.
  SSE and file upload support are non-standard.
- **gRPC:** No native browser support. Proxy layer
  required. Performance benefits not needed at
  current scale.

## Future Considerations
If Wrench introduces internal microservices
(see ADR-009), gRPC becomes a valid choice for
service-to-service communication while REST
remains the external client-facing protocol.

## References
- Requirements: NFR-01 (API latency targets)
- Related ADRs: ADR-009 (monolith vs microservices)
- OpenAPI spec: /docs/api/openapi.yaml