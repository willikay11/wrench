# Wrench — System Requirements

Last updated: 2026-07-16
Version: 2.0 — includes Rex AI character, persistent AI layer,
         landing page demo chat, and UI/UX additions

---

## 1. Functional Requirements

Functional requirements define what the system must do.
Each one is a capability that can be tested with a
pass/fail outcome.

---

### 1.1 Authentication

- FR-01: A user must be able to register with an email
  address and password

- FR-02: A user must be able to log in using Google OAuth
  (server-side token verification against Google public keys)

- FR-03: A user must be able to log in and receive an
  access token and refresh token

- FR-04: A user must be able to refresh their access token
  using a valid refresh token

- FR-05: A user must be able to log out, which invalidates
  their refresh token

- FR-06: A user must not be able to access any protected
  resource without a valid access token

- FR-07: A user must be able to request a password reset
  link sent to their email address

- FR-08: A user must be able to reset their password using
  a valid single-use reset token

---

### 1.2 Garage Management

- FR-09: A user must be able to add a car to their garage
  with year, make, model, engine, usage type, and notes

- FR-10: A user must be able to view all cars in their garage

- FR-11: A user must be able to add a modification to a car
  including name, category, cost, installation date, notes,
  and source (user/ai_assistant/ai_vision)

- FR-12: A user must be able to log a service record against
  a car including type, description, mileage, cost, shop name,
  and receipt photo

- FR-13: A user must not be able to view or modify another
  user's cars or data. All resources return 404 (not 403)
  when they exist but belong to another user

- FR-14: A user OR Rex must be able to create a build plan
  with named stages for a specific car

- FR-15: A user OR Rex must be able to add tasks to a build
  stage with estimated cost and due date

- FR-16: A user must be able to mark tasks as complete and
  track actual vs estimated cost per task and stage

- FR-17: A user must be able to view a summary of total
  estimated vs actual spend per build stage and across the
  full build plan

- FR-18: A user must be able to add tools to their garage
  inventory including name, brand, category, condition, and
  date acquired

---

### 1.3 Media Uploads

- FR-19: A user must be able to upload a photo against a car
  or modification (max 10MB, JPEG/PNG/WebP/HEIC)

- FR-20: A user must be able to upload a receipt against a
  budget entry (max 10MB, JPEG/PNG/WebP/PDF)

- FR-21: Uploaded images must be accessible only to the
  owning user. MIME type must be validated server-side
  using magic bytes, not file extension

- FR-22: A user must be able to upload one or more
  inspiration images to Rex for build plan generation

- FR-23: Rex must be able to analyse uploaded inspiration
  images using vision AI and generate a suggested build plan
  based on modifications visible in the image

---

### 1.4 Rex — Persistent AI Character

Rex (Repair and Enhancement Expert) is not a chatbot or
a navigation item. Rex is a persistent AI character that
lives on every screen of the Wrench application. Rex
replaces the concept of an "AI Assistant" menu item entirely.

- FR-24: Rex must be visible on every screen of the
  application as a persistent 56px circular disc anchored
  to the bottom-right corner of the viewport

- FR-25: Rex must display a minimal geometric face
  (two rectangular amber eyes and a thin mouth line) that
  animates continuously in the collapsed state:
  - Eyes perform a slow horizontal scan (3s loop)
  - Amber outer ring pulses in opacity (4s loop)
  - One eye blinks randomly every 15-20 seconds

- FR-26: Rex must change facial expression based on
  application state:
  - Service overdue: mouth curves down, one eye narrows
  - Build task completed: mouth curves up, eyes brighten
  - Budget over estimate: eyes widen, "!" appears for 2s
  - Idle on dashboard: neutral default expression

- FR-27: Rex must display a contextual speech bubble on
  hover showing a car-aware observation derived from the
  user's current screen and car data:
  - Example: "Your 350Z oil is 2,000 miles overdue."
  - Example: "Stage 2 is 60% done. Want to keep going?"
  - Example: "You added 3 mods this week. Nice pace."

- FR-28: Rex must display a notification dot on his disc
  when he has a proactive observation to surface. The dot
  must pulse once and remain solid until the user opens Rex.
  Triggers:
  - Service record older than 6 months
  - Build stage with no updates in 3+ weeks
  - User about to exceed their stage budget
  - User has been in the app 10+ minutes without logging anything

- FR-29: Clicking Rex's disc must open a full-screen panel
  (85% viewport height) that slides up from the bottom with
  a 280ms ease-out animation

- FR-30: Rex's expanded panel must display:
  - Rex's larger animated face (64px) in the header
  - Current car context bar: "Looking at: [car name] — Stage N"
  - Scrollable conversation history
  - Smart suggestion chips that change based on current screen
  - Multi-line text input with send button
  - Rex's opening message tailored to notification context
    if the panel was opened after a notification dot

- FR-31: Rex must be able to embed ACTION CARDS inline
  within his messages. Action card types:

  Type A — Information card:
  Shows retrieved data (service schedule, overdue items)
  with direct action buttons (Log service now / Dismiss)

  Type B — Mod suggestion card:
  Shows a recommended upgrade with reason, estimated cost,
  budget fit check, and actions (Add to build plan / Log as mod / Ignore)

  Type C — Build plan card:
  Shows a Rex-drafted stage with tasks and cost estimates
  with actions (Add this stage / Edit first / No thanks)

  Type D — Budget alert card:
  Shows budget vs actual with overage and breakdown
  with actions (See full breakdown / Update budget)

  Type E — Quick log card:
  Shows an inline mini form (date, mileage, shop, cost)
  pre-filled where possible, with a single Log it action

- FR-32: Rex must have distinct personality moments:
  - Onboarding (first open): eyes animate open slowly,
    Rex introduces himself with dry humour
  - Empty garage: Rex makes a wry observation about the
    empty state with a prompt to add the first car
  - First mod logged: Rex blinks twice and responds
    with a dry acknowledgement
  - Build stage completed: Rex shows his most pronounced
    smile and prompts to start the next stage

- FR-33: Rex must have contextual awareness of:
  - Which car the user is currently viewing
  - The last 3 actions taken in the current session
  - Overdue service records for the current car
  - Build stage progress (stalled stages)
  - Budget status (over/under for current stage)
  - Time since the user's last session

- FR-34: Rex must support the following AI capabilities
  in his conversation interface, using the user's car data
  as context:
  - Answering questions about the user's specific car
    (not generic car advice)
  - Drafting build stages and tasks with cost estimates
  - Suggesting next upgrades based on current build state
    and budget remaining
  - Reviewing and summarising service history
  - Logging service records via quick log action cards
  - Adding modifications via mod suggestion action cards
  - Generating build plans from uploaded inspiration images
  - Suggesting tools needed for a specific job based on
    the user's existing garage tools inventory

- FR-35: Rex must stream responses token by token rather
  than waiting for the full response before displaying.
  A typing indicator (three amber dots, staggered 150ms)
  must appear while Rex is generating a response

- FR-36: If the primary AI provider (Anthropic Claude) is
  unavailable, Rex must fall back to the secondary provider
  (OpenAI) automatically. Rex's personality and action card
  behaviour must remain consistent across both providers

- FR-37: Rex's conversation history must be persisted per
  car per user and viewable across sessions

---

### 1.5 Landing Page Demo Chat

- FR-38: The landing page must include an embedded Rex
  demo chat widget that allows unauthenticated visitors
  to try Rex with a pre-populated demo car context

- FR-39: The demo chat must display a demo car context
  banner at the top of the chat:
  "Demo car: 2003 Nissan 350Z · VQ35DE · BC Racing coilovers
   · JWT intake · 87,000 miles"

- FR-40: The demo chat must offer two pre-suggested
  prompt chips:
  - "Why is my 350Z misfiring at boost?"
  - "What should I upgrade next given my current mods?"

- FR-41: The demo chat must limit unauthenticated visitors
  to exactly 2 messages before displaying an inline account
  gate card (not a modal) within the chat thread:
  - The gate card must show both previous messages and
    AI responses above it (nothing is hidden)
  - The input must be disabled after the gate appears
  - The gate card must contain a "Create free account"
    primary button and a "Continue browsing" ghost link

- FR-42: The demo chat AI responses must feel contextual
  and reference the demo car's specific mods and specs,
  not generic car information

---

### 1.6 RAG Pipeline and Embeddings

- FR-43: When a user adds a car, the system must
  automatically generate and store an embedding of the
  car's base profile (year, make, model, engine, usage type)
  within 5 seconds (source_type: car_profile)

- FR-44: The system must enrich newly added cars with
  known common issues and maintenance information for that
  make, model, and year — stored as embeddings for use by
  Rex (source_type: car_knowledge). This enrichment must
  complete via async job within 30 seconds of car creation

- FR-45: Every modification, service record, build stage,
  build task, and free-text note must be embedded and stored
  in pgvector when created or updated

- FR-46: Rex's RAG retrieval must always include the car's
  base profile embedding regardless of similarity score —
  it is always relevant context

- FR-47: Records created by Rex must be marked as
  unconfirmed (confirmed: false) and presented to the user
  for review. The source field must be one of:
  user | ai_assistant | ai_vision

- FR-48: A user must be able to confirm, edit, or delete
  Rex-generated records. Once confirmed: true, the record
  is treated as verified data in RAG context at full weight

---

## 2. Non-Functional Requirements

Non-functional requirements define how well the system
performs. Every requirement is measurable.

---

### 2.1 Performance

- NFR-01: CRUD API endpoints must respond in under 200ms
  at the 95th percentile under normal load
  (up to 500 concurrent users)

- NFR-02: Rex must return the first response token within
  3 seconds at the 95th percentile

- NFR-03: Rex must complete a full response within
  10 seconds at the 95th percentile

- NFR-04: Image uploads must complete within 5 seconds
  for files up to 10MB on a standard broadband connection

- NFR-05: The web frontend must achieve a Lighthouse
  performance score of 85 or above on mobile

- NFR-06: Vision-based build plan generation from an
  inspiration image must return the first token within
  8 seconds at the 95th percentile

- NFR-07: Car profile embeddings (FR-43) must be generated
  and stored within 5 seconds of a car being added —
  before the user's first Rex query is possible

- NFR-08: Rex's disc animation must not consume more than
  2% CPU on a mid-range device. All animations must respect
  prefers-reduced-motion: the disc remains visible but
  all animations are disabled when the OS setting is active

- NFR-09: Rex's expanded panel must open (slide-up
  complete) within 300ms of the user clicking his disc

---

### 2.2 Availability

- NFR-10: The API must maintain 99.5% uptime measured
  over any 30-day rolling window (allows ~3.6 hours
  downtime per month)

- NFR-11: Planned maintenance must not require more than
  15 minutes of downtime per deployment

- NFR-12: The system must remain partially functional if
  the AI provider is unavailable — garage management and
  build planning must continue to work. Rex's disc must
  remain visible but respond with a clear unavailability
  message if both Claude and OpenAI are down

---

### 2.3 Scalability

- NFR-13: The system must support 10,000 registered users
  and 500 concurrent users at launch without degradation
  of NFR-01

- NFR-14: The architecture must support scaling to 100,000
  registered users within 12 months without a redesign of
  core components

- NFR-15: The Go API must be stateless — any API pod must
  be able to handle any request without shared in-process state

---

### 2.4 Security

- NFR-16: All data transmission must use TLS 1.2 or higher —
  no unencrypted HTTP on any external connection

- NFR-17: Passwords must be hashed using bcrypt with a
  minimum cost factor of 12

- NFR-18: Access tokens must expire within 15 minutes
  of issuance

- NFR-19: Rex's chat endpoint must be rate limited to
  20 requests per user per hour to prevent abuse and
  control API costs

- NFR-20: Authentication endpoints must be rate limited to
  5 attempts per IP per 15 minutes to prevent brute force

- NFR-21: A user must never be able to read or modify data
  belonging to another user — ownership must be validated
  on every request, including uploaded media files

- NFR-22: OAuth tokens received from Google must be verified
  against Google's public keys server-side before a session
  is created. The system must never trust a client-provided
  identity claim without server-side verification

- NFR-23: The system must reject file uploads exceeding
  10MB. Accepted file types are limited to JPEG, PNG, WebP,
  and HEIC for photos, and the above plus PDF for receipts.
  MIME type must be validated server-side using magic bytes.

- NFR-24: The landing page demo chat (FR-38) must be rate
  limited to 10 requests per IP per hour to prevent abuse
  of unauthenticated AI access

---

### 2.5 Data

- NFR-25: User data must be retained for the lifetime of
  the account and deleted within 30 days of account deletion

- NFR-26: The system must perform automated database backups
  every 24 hours with a minimum 30-day retention period

- NFR-27: Recovery Point Objective (RPO): maximum 24 hours
  of data loss in a catastrophic failure

- NFR-28: Recovery Time Objective (RTO): system must be
  restorable within 2 hours of a catastrophic failure

---

### 2.6 Observability

- NFR-29: Every API request must produce a structured log
  entry containing: request_id, user_id, method, path,
  status_code, and duration_ms. PII (email, name, VIN,
  financial amounts, AI conversation content) must never
  appear in logs

- NFR-30: Every API request must be traceable end-to-end
  from frontend through Go API to database and external
  services via OpenTelemetry. Rex's RAG pipeline must
  produce child spans for: embed question, pgvector search,
  build prompt, and Claude/OpenAI API call

- NFR-31: An alert must fire within 5 minutes of the
  5xx error rate exceeding 1% over a 5-minute window

- NFR-32: Rex's Claude API cost must be tracked as a
  Prometheus counter (wrench_claude_api_cost_usd_total)
  and alert when hourly spend exceeds 2x the same hour's
  7-day average AND absolute spend exceeds $50

---

### 2.7 Compliance

- NFR-33: The system must comply with GDPR for users in
  the European Union — users must be able to request export
  of all their data and deletion of their account and all
  associated data within 30 days

- NFR-34: The system must not log or store personally
  identifiable information in application logs — userId
  (UUID) references are acceptable but email addresses,
  names, and financial details must not appear in log output

---

## 3. Requirement Traceability

Key relationships between requirements:

```
FR-24 to FR-33 (Rex character)
  → depends on: FR-34 to FR-36 (Rex AI capabilities)
  → depends on: FR-43 to FR-48 (RAG pipeline)
  → depends on: NFR-02, NFR-03 (Rex latency targets)
  → depends on: NFR-08, NFR-09 (Rex animation/performance)

FR-38 to FR-42 (landing page demo chat)
  → depends on: NFR-24 (demo rate limiting)
  → must NOT expose: full RAG pipeline of real user data
  → uses: pre-populated demo car context only

FR-23 (vision-based build plans from images)
  → depends on: FR-22 (inspiration image upload)
  → depends on: NFR-06 (vision latency target)
  → requires: vision-capable model on both primary
    (Claude) and fallback (OpenAI) providers

FR-47, FR-48 (Rex-generated records)
  → applies to: FR-11 (mods), FR-14 (build stages),
    FR-15 (build tasks)
  → source field must be tracked on: carMods,
    buildStages, buildTasks tables
```

---

## 4. Out of Scope (v1)

The following are explicitly excluded from v1 and
documented to prevent scope creep:

- Social features (sharing garages, following other builders)
- Parts marketplace or purchasing integration
- OBD-II live diagnostics integration
- Native mobile app (iOS/Android) — web only at launch
- Multi-user garage access (shared garage between family members)
- Parts catalogue or fitment database
- Direct payment processing (costs are tracked, not processed)