# Wrench — System Requirements

Last updated: 2026-07-18
Version: 3.0 — adds budget tracker, Rex usage allowance,
         add car via Rex, add tools via Rex, responsive
         mobile/tablet design, fixed navigation, and
         profile consolidation

---

## 1. Functional Requirements

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

- FR-09: A user must be able to change their email address
  by providing their current password for verification.
  The new email must be confirmed via a verification link
  before it takes effect

- FR-10: A user must be able to change their password by
  providing their current password. All active sessions
  except the current one must be invalidated on success

- FR-11: A user must be able to connect and disconnect a
  Google OAuth account from their profile. Disconnecting
  Google must be blocked if the user has no password set
  — the system must prompt the user to set a password first

- FR-12: A user must be able to view all active sessions
  (device, browser, location, last active) and log out
  any individual session or all sessions at once

---

### 1.2 Garage Management

- FR-13: A user must be able to add a car to their garage
  with year, make, model, engine, usage type, and notes.
  Year must be validated between 1885 and 2030

- FR-14: A user must be able to view all cars in their
  garage as a horizontally scrollable spotlight row of
  cards, each showing the car photo (or placeholder
  silhouette), name, status badge, and mod count

- FR-15: A user must be able to add a modification to a
  car including name, category, cost, installation date,
  notes, photo, and source (user/ai_assistant/ai_vision)

- FR-16: A user must be able to log a service record
  against a car including type, description, mileage,
  cost, shop name, date, and receipt photo

- FR-17: A user must not be able to view or modify another
  user's cars or data. All resources return 404 (not 403)
  when they exist but belong to another user

- FR-18: A user OR Rex must be able to create a build plan
  with named stages for a specific car. Stages have a name,
  description, status (planned/in_progress/completed),
  estimated cost, and display order

- FR-19: A user OR Rex must be able to add tasks to a build
  stage with title, description, status, estimated cost,
  actual cost, and due date

- FR-20: A user must be able to mark tasks as complete by
  checking them inline on the build board. Actual cost must
  be trackable per task. Stage progress must update in real
  time as tasks are checked

- FR-21: A user must be able to drag and drop stages
  between columns (Planned / In Progress / Completed)
  on desktop. On mobile, stage movement is performed
  via an overflow menu (long press → action sheet)

- FR-22: A user must be able to reorder stages within
  a column via drag and drop on desktop

- FR-23: A user must be able to view a summary of total
  estimated vs actual spend per build stage and across
  the full build plan

- FR-24: A user must be able to add tools to their garage
  inventory including name, category, brand, model/part
  number, condition (new/good/fair/needs replacement),
  date acquired, notes, and photo. Tools are shared
  across all cars (not car-specific)

- FR-25: A user must be able to filter and search their
  tools by category, name, brand, and condition

---

### 1.3 Budget Tracker

- FR-26: A user must be able to set an overall build
  budget for a specific car. The budget is editable
  inline on the budget tab at any time

- FR-27: A user must be able to add a budget entry
  (expense) against a car including description, amount,
  category (parts/labour/tools/consumables/entry fees/other),
  date, linked build stage (optional), receipt upload
  (optional), and notes (optional)

- FR-28: All budget amounts must be stored as BIGINT cents
  server-side and displayed as formatted currency to the
  user. Floating point must never be used for monetary
  values

- FR-29: The budget tab must display a live summary of:
  total spent, total budgeted, and remaining budget.
  Summary stats must animate (counter transition) when
  a new entry is added or deleted

- FR-30: The budget tab must display a category breakdown
  bar showing spend proportions across all categories.
  The bar must update in real time when entries are added
  or deleted

- FR-31: A user must be able to edit and delete budget
  entries. Deleting an entry must offer an Undo action
  available for 4 seconds via the success toast

- FR-32: The budget entry list must support filtering by
  category, searching by description, sorting by date
  or amount, and filtering by date range

- FR-33: When a new entry causes the total spend to exceed
  the set budget, a warning must be shown:
  - Live total in the amount field turns red with
    "over budget by $X" during entry
  - Warning toast (amber, not green) after submission
  - Rex notification dot fires immediately
  - Rex's opening message addresses the overage

- FR-34: A user must be able to upload a receipt against
  a budget entry (JPEG/PNG/WebP/PDF, max 10MB). Receipt
  upload failure must not block entry submission — the
  receipt can be added later via edit

---

### 1.4 Media Uploads

- FR-35: A user must be able to upload a photo against a
  car, modification, or tool (max 10MB, JPEG/PNG/WebP/HEIC)

- FR-36: A user must be able to upload a receipt against a
  budget entry or service record (max 10MB,
  JPEG/PNG/WebP/PDF)

- FR-37: Uploaded files must be validated server-side using
  magic bytes (not file extension). Only declared MIME types
  are accepted. Files are uploaded to Cloudinary with
  strip_metadata: true applied on all uploads

- FR-38: A user must be able to upload one or more
  inspiration images to Rex for build plan generation

- FR-39: Rex must be able to analyse uploaded inspiration
  images using vision AI and generate a suggested build
  plan based on modifications visible in the image

---

### 1.5 Rex — Persistent AI Character

Rex (Repair and Enhancement Expert) is not a chatbot or
a navigation item. Rex is a persistent AI character that
lives on every screen of the Wrench application.

- FR-40: Rex must be visible on every authenticated screen
  as a persistent 56px circular disc anchored to the
  bottom-right corner of the viewport. On mobile, Rex sits
  above the bottom navigation bar (bottom: 80px, right: 16px)

- FR-41: Rex must display a minimal geometric face
  (two rectangular amber eyes and a thin mouth line) that
  animates continuously in the collapsed state:
  - Eyes perform a slow horizontal scan (3s loop)
  - Amber outer ring pulses in opacity (4s loop)
  - One eye blinks randomly every 15-20 seconds
  All animations must be disabled when the OS
  prefers-reduced-motion setting is active

- FR-42: Rex must change facial expression based on
  application state:
  - Service overdue: mouth curves down, one eye narrows
  - Build task completed: mouth curves up, eyes brighten
  - Budget over estimate: eyes widen, "!" appears for 2s
  - Rex message allowance exhausted: both eyes closed
    (resting state), amber ring at 40% opacity,
    no idle animations
  - Idle on dashboard: neutral default expression

- FR-43: On desktop, Rex must display a contextual speech
  bubble on hover. On mobile, Rex must display the speech
  bubble on long press (auto-dismisses after 2 seconds).
  The speech bubble must contain a car-aware observation
  derived from the user's current screen and car data

- FR-44: Rex must display a notification dot on his disc
  when he has a proactive observation to surface. The dot
  must pulse once and remain solid until opened. Triggers:
  - Service record older than 6 months
  - Build stage with no updates in 3+ weeks
  - User about to exceed their stage budget
  - Total spend exceeds set build budget
  - Rex message allowance exhausted (notification dot
    also triggers at 75% and 90% of allowance consumed)
  - User in app 10+ minutes without logging anything

- FR-45: Clicking Rex's disc must open a full-screen panel
  on mobile (100% viewport height) and an 85% viewport
  height panel on desktop, sliding up from the bottom
  with a 280ms ease-out animation. The bottom navigation
  bar must be hidden behind the panel when open on mobile

- FR-46: Rex's expanded panel must display:
  - Rex's larger animated face (64px) in the header
  - Current car context bar: "Looking at: [car] — Stage N"
  - Scrollable conversation history
  - Smart suggestion chips (horizontal scroll on mobile)
    that change based on current screen context
  - Multi-line text input with send button
    (font size minimum 16px on mobile to prevent
    iOS auto-zoom on input focus)
  - Rex message usage bar (always visible above input):
    usage count, progress bar, reset date

- FR-47: Rex must be able to embed ACTION CARDS inline
  within his messages. Action card types:

  Type A — Information card:
  Shows retrieved data (service schedule, overdue items)
  with direct action buttons (Log service now / Dismiss)

  Type B — Mod suggestion card:
  Shows a recommended upgrade with reason, estimated cost,
  budget fit check, and actions
  (Add to build plan / Log as mod / Ignore)

  Type C — Build plan card:
  Shows a Rex-drafted stage with tasks and cost estimates
  with Rex confidence indicator (High/Medium/Low) and
  actions (Add this stage / Edit first / No thanks)

  Type D — Budget alert card:
  Shows budget vs actual with overage and breakdown
  with actions (See full breakdown / Update budget)

  Type E — Quick log card:
  Shows an inline mini form (date, mileage, shop, cost)
  pre-filled where possible, with a single Log it action

  Type F — Car creation card:
  Shows Rex's extraction of car details from a
  conversational description as structured fields.
  Missing required fields are highlighted for user
  completion. Rex never guesses required fields.
  Includes confidence indicators (confirmed ✓ / assumed ~)
  with actions (Add to garage / Edit details / Not yet)

  Type G — Tool creation card:
  Shows Rex's extraction of tool details from conversation.
  Same confidence indicator pattern as Type F.
  Condition field shows amber (~) when assumed by Rex
  with a note: "Rex assumed 'Good' condition — edit
  if different" and actions (Add to toolbox / Edit / Not yet)

- FR-48: Rex must have distinct personality moments:
  - Onboarding (first open): eyes animate open slowly,
    Rex introduces himself with dry humour
  - Empty garage: Rex makes a wry observation with a
    prompt to add the first car
  - First mod logged: Rex blinks twice and responds
    with a dry acknowledgement
  - Build stage completed: Rex shows his most pronounced
    smile and prompts to start the next stage
  - Account deletion (farewell): Rex's eyes close,
    farewell message with dry warmth
  - Rex at message limit: "Rex needs a rest" with
    resting state — not a paywall message

- FR-49: Rex must have contextual awareness of:
  - Which car the user is currently viewing
  - The last 3 actions taken in the current session
  - Overdue service records for the current car
  - Build stage progress (stalled stages)
  - Budget status (over/under for current stage and total)
  - Time since the user's last session
  - Current Rex message allowance consumption

- FR-50: Rex must support the following AI capabilities:
  - Answering questions about the user's specific car
    (not generic car advice)
  - Drafting build stages and tasks with cost estimates
    and Rex confidence indicators (High/Medium/Low)
  - Suggesting next upgrades based on current build state
    and budget remaining
  - Reviewing and summarising service history
  - Logging service records via Type E quick log cards
  - Adding modifications via Type B mod suggestion cards
  - Generating build plans from uploaded inspiration images
  - Suggesting tools needed for a job based on the
    user's existing garage tools inventory
  - Creating cars via conversational extraction (Type F)
  - Adding tools via conversational extraction (Type G)

- FR-51: Rex must stream responses token by token.
  A typing indicator (three amber dots, staggered 150ms)
  must appear while Rex is generating a response.
  For complex generations (build plan drafts), a
  contextual loading message must replace the typing
  indicator after 2 seconds if still generating

- FR-52: If the primary AI provider (Anthropic Claude) is
  unavailable, Rex must fall back to the secondary provider
  (OpenAI) automatically. Rex's personality and action card
  behaviour must remain consistent across both providers.
  If both providers are unavailable, Rex must remain visible
  but respond with a clear, in-character unavailability
  message

- FR-53: Rex's conversation history must be persisted per
  car per user and viewable in full across sessions via
  the Message History section of Settings

---

### 1.6 Rex — Car and Tool Creation via Conversation

- FR-54: Rex must be able to create a car in the user's
  garage when the user describes their car conversationally.
  Rex extracts structured fields (year, make, model, engine,
  primary use) and presents a Type F action card for
  confirmation before creating the record

- FR-55: Rex must be able to create a tool in the user's
  garage inventory when the user mentions a tool
  conversationally. Rex extracts structured fields
  (name, category, condition) and presents a Type G action
  card. Rex must distinguish confirmed extractions (✓)
  from assumed values (~) in the confidence indicators

- FR-56: Cars and tools created by Rex via conversation
  must be marked source: 'ai_assistant' and
  confirmed: false until the user reviews and confirms
  the pre-filled details. Rex must never guess required
  fields — missing fields must be left blank and
  highlighted for user completion

- FR-57: A user must be able to confirm, edit, or delete
  any Rex-generated record. Once confirmed: true, the
  record is treated as verified data in RAG context
  at full weight

---

### 1.7 Landing Page Demo Chat

- FR-58: The landing page must include an embedded Rex
  demo chat widget allowing unauthenticated visitors
  to try Rex with a pre-populated demo car context:
  "Demo car: 2003 Nissan 350Z · VQ35DE · BC Racing
  coilovers · JWT intake · 87,000 miles"

- FR-59: The demo chat must offer two pre-suggested
  prompt chips and display a typing indicator before
  each Rex response. Demo responses must reference
  the demo car's specific mods, not generic car advice

- FR-60: The demo chat must limit unauthenticated
  visitors to exactly 2 messages before displaying
  an inline account gate card (not a modal) within
  the chat thread. The gate card must:
  - Leave all previous messages visible above it
  - Disable the input after appearing
  - Contain a "Create free account" primary button
    and a "Continue browsing" ghost link

---

### 1.8 Rex Message Allowance

- FR-61: Each user is allocated 100 Rex messages per
  calendar month. The allowance resets on the 1st of
  each month at midnight UTC

- FR-62: One message is consumed each time the user sends
  a message to Rex and Rex responds, including action
  card generations. The following do NOT consume messages:
  Rex's proactive notifications, disc hover speech bubbles,
  onboarding messages, and landing page demo chat

- FR-63: Rex must communicate approaching and reached
  limits in-character (not as system banners):
  - At 75% consumed (first session after crossing):
    Rex mentions it conversationally as an aside
  - At 90% consumed (first session after crossing):
    Rex mentions the remaining count after answering
  - At 5 messages remaining: Rex appends the count
    after his answer ("...that's message 96 of 100")
  - At 1 message remaining: Rex notes it is his last
    message for the month after answering
  - At limit: input is disabled, Rex enters resting
    state. The panel shows "Rex needs a rest" with a
    countdown to reset. Never uses paywall language

- FR-64: The Rex panel must display a persistent usage
  indicator above the input bar showing:
  - Usage count ("47 / 100")
  - Progress bar (amber < 90%, red ≥ 90%)
  - Reset date ("Resets August 1")
  - When at limit: "Rex is resting until August 1"
  Language must always use "messages" — never "tokens",
  "API calls", "credits", or raw token counts

- FR-65: The Settings page must include a Rex & Usage
  section displaying:
  - Large usage display with animated bar (on page load)
  - Stats: messages used, messages remaining, resets in
  - Monthly usage history bar chart (6 months)
  - Daily breakdown (collapsible)
  - Usage breakdown by conversation type
  - A "What's included" feature list with a placeholder
    for future plan options ("More options coming")

---

### 1.9 RAG Pipeline and Embeddings

- FR-66: When a user adds a car (manually or via Rex),
  the system must automatically generate and store an
  embedding of the car's base profile within 5 seconds
  (source_type: car_profile)

- FR-67: The system must enrich newly added cars with
  known common issues and maintenance information for
  that make, model, and year — stored as embeddings
  (source_type: car_knowledge). This must complete via
  async job within 30 seconds of car creation

- FR-68: Every modification, service record, build stage,
  build task, budget entry, tool record, and free-text
  note must be embedded and stored in pgvector when
  created or updated

- FR-69: Rex's RAG retrieval must always include the
  car's base profile embedding regardless of similarity
  score — it is always relevant context

---

### 1.10 User Profile and Settings

- FR-70: A user's profile must be accessible from a
  single location only: the avatar in the top-right
  of the top bar. On desktop, clicking the avatar
  opens a dropdown. On mobile, tapping the avatar
  opens a bottom sheet. The profile must not appear
  in the sidebar or any other location

- FR-71: The profile dropdown/sheet must include:
  display name, email, links to Profile Settings and
  Rex & Usage, a Help and feedback link, and a Sign out
  option. Sign out must require inline confirmation
  (within the dropdown/sheet, not a separate modal)
  to prevent accidental sign-out

- FR-72: A user must be able to update their display
  name, profile photo, "about your garage" bio
  (used by Rex as context), and location in Profile
  Settings. Save state must show "Saved ✓" confirmation
  inline on the button

- FR-73: A user must be able to export all their data
  (cars, mods, service records, build plans, budget
  entries, tools, conversations) before deleting
  their account

- FR-74: Account deletion must require a three-step
  confirmation flow:
  Step 1: Show summary of data that will be deleted
    with Rex's "before you go" message and data export
    option
  Step 2: Collect optional deletion reason
  Step 3: Require the user to type "DELETE" (exact,
    case-sensitive) to activate the final button
  All data must be permanently deleted within 30 days

---

### 1.11 Navigation and Layout

- FR-75: On desktop (1280px+), the primary navigation
  must be a fixed left sidebar that does not scroll
  with the main content. The sidebar must remain
  fully visible at all scroll positions. Main content
  scrolls independently in its own scroll container

- FR-76: On tablet (768px–1279px), the sidebar must
  collapse to icon-only mode (56px width). Full labels
  are shown only at 1024px and above

- FR-77: On mobile (< 768px), the primary navigation
  must be a fixed bottom tab bar with five items:
  Garage, Build, Budget, Tools, Settings. Labels must
  be visible (10px, below icons). The active tab must
  show an amber top-line indicator and amber icon/label

- FR-78: The bottom tab bar must be 64px tall plus
  device safe area padding. It must remain fixed and
  visible at all times on mobile except when a full-screen
  sheet or Rex panel is open

- FR-79: The Build and Budget tabs must use a car picker
  bottom sheet when no car is currently selected. The
  last selected car must be remembered per section.
  A car switcher pill must be visible in the top bar
  when already viewing a car's Build or Budget section

- FR-80: On mobile, the build planner kanban board must
  replace the three-column layout with a tabbed column
  view (Planned / In Progress / Completed as tabs).
  One column is visible at a time. Swiping or tapping
  a tab switches columns

- FR-81: The sidebar must contain a Rex usage mini widget
  at the bottom (replacing the profile section which has
  moved to the top bar). The widget shows "Rex · 47/100
  messages" with a thin amber bar and reset date.
  Clicking navigates to /settings/usage

- FR-82: All tappable elements on mobile must have a
  minimum touch target of 44px × 44px. All text inputs
  on mobile must have a minimum font size of 16px to
  prevent iOS automatic zoom on focus

- FR-83: A notification badge (amber dot) must appear
  on the Build tab in the bottom navigation when any
  build stage is overdue or stalled. No other tabs
  show badges in v1

---

## 2. Non-Functional Requirements

---

### 2.1 Performance

- NFR-01: CRUD API endpoints must respond in under 200ms
  at the 95th percentile under normal load
  (up to 500 concurrent users)

- NFR-02: Rex must return the first response token within
  3 seconds at the 95th percentile

- NFR-03: Rex must complete a full response within
  10 seconds at the 95th percentile

- NFR-04: Image and receipt uploads must complete within
  5 seconds for files up to 10MB on standard broadband

- NFR-05: The web frontend must achieve a Lighthouse
  performance score of 85 or above on mobile (390px)

- NFR-06: Vision-based build plan generation from an
  inspiration image must return the first token within
  8 seconds at the 95th percentile

- NFR-07: Car profile embeddings must be generated and
  stored within 5 seconds of a car being added —
  before the user's first Rex query is possible

- NFR-08: Rex's disc animations must not consume more
  than 2% CPU on a mid-range device. All animations
  must be disabled when prefers-reduced-motion is active.
  The disc remains visible but static in this mode

- NFR-09: Rex's expanded panel must complete its slide-up
  animation within 300ms of the user tapping his disc

- NFR-10: Car creation via Rex (Type F card) must present
  the confirmation action card within 3 seconds of the
  user's message at the 95th percentile

- NFR-11: Budget summary stats and category bar must
  recalculate and animate within 200ms of a new entry
  being confirmed

---

### 2.2 Availability

- NFR-12: The API must maintain 99.5% uptime measured
  over any 30-day rolling window

- NFR-13: Planned maintenance must not require more than
  15 minutes of downtime per deployment

- NFR-14: The system must remain partially functional if
  the AI provider is unavailable — garage management,
  build planning, budget tracking, and tools must
  continue to work fully. Rex's disc must remain visible
  but respond with a clear in-character unavailability
  message if both Claude and OpenAI are down

---

### 2.3 Scalability

- NFR-15: The system must support 10,000 registered users
  and 500 concurrent users at launch without degradation
  of NFR-01

- NFR-16: The architecture must support scaling to 100,000
  registered users within 12 months without a redesign
  of core components

- NFR-17: The Go API must be stateless — any API pod must
  be able to handle any request without shared in-process
  state

---

### 2.4 Security

- NFR-18: All data transmission must use TLS 1.2 or
  higher — no unencrypted HTTP on any external connection

- NFR-19: Passwords must be hashed using bcrypt with a
  minimum cost factor of 12

- NFR-20: Access tokens must expire within 15 minutes
  of issuance

- NFR-21: Rex's chat endpoint must be rate limited to
  20 requests per user per hour at the API layer,
  independent of the 100 message/month allowance
  (the API limit prevents burst abuse; the monthly
  allowance controls total consumption)

- NFR-22: Authentication endpoints must be rate limited
  to 5 attempts per IP per 15 minutes

- NFR-23: A user must never be able to read or modify
  data belonging to another user — ownership must be
  validated on every request including uploaded media

- NFR-24: OAuth tokens from Google must be verified
  against Google's public keys server-side before a
  session is created

- NFR-25: The system must reject file uploads exceeding
  10MB. MIME type must be validated server-side using
  magic bytes. Accepted types: JPEG, PNG, WebP, HEIC
  for photos; the above plus PDF for receipts

- NFR-26: The landing page demo chat must be rate limited
  to 10 requests per IP per hour

- NFR-27: Budget amounts must never be stored or
  transmitted as floating point values. All monetary
  values must use BIGINT cents server-side

---

### 2.5 Data

- NFR-28: User data must be retained for the lifetime of
  the account and deleted within 30 days of account
  deletion (GDPR Article 17)

- NFR-29: The system must perform automated database
  backups every 24 hours with a minimum 30-day retention

- NFR-30: Recovery Point Objective (RPO): maximum 24
  hours of data loss in a catastrophic failure

- NFR-31: Recovery Time Objective (RTO): system must be
  restorable within 2 hours of a catastrophic failure

---

### 2.6 Observability

- NFR-32: Every API request must produce a structured log
  entry containing: request_id, user_id, method, path,
  status_code, and duration_ms. PII (email, name, VIN,
  financial amounts, AI conversation content) must never
  appear in logs

- NFR-33: Every API request must be traceable end-to-end
  via OpenTelemetry. Rex's RAG pipeline must produce
  child spans for: embed question, pgvector search,
  build prompt, and Claude/OpenAI API call

- NFR-34: An alert must fire within 5 minutes of the
  5xx error rate exceeding 1% over a 5-minute window

- NFR-35: Rex's Claude API cost must be tracked as a
  Prometheus counter and alert when hourly spend exceeds
  2x the same hour's 7-day average AND exceeds $50

- NFR-36: Rex message allowance consumption must be
  tracked per user per calendar month. The counter must
  be consistent between client and server. If a
  discrepancy of more than 5 messages is detected,
  the server value wins and the client corrects silently

---

### 2.7 Responsive Design

- NFR-37: All screens must be fully functional at
  390px (mobile), 768px (tablet), and 1280px (desktop)
  viewport widths

- NFR-38: The desktop sidebar must be implemented as a
  fixed positioned element that does not participate in
  the document scroll. Main content must scroll
  independently in its own overflow container

- NFR-39: On mobile, the bottom navigation bar must be
  implemented as a fixed positioned element above the
  device safe area. It must not overlap content when
  a sheet or Rex panel is open

- NFR-40: All form inputs on mobile must have a minimum
  font-size of 16px to prevent automatic zoom on iOS

- NFR-41: Drag and drop interactions (kanban board,
  stage reordering) are only required on desktop and
  tablet (768px+). Mobile uses menu-based alternatives

---

### 2.8 Compliance

- NFR-42: The system must comply with GDPR — users must
  be able to export all their data and delete their
  account with all associated data removed within 30 days

- NFR-43: The system must not log PII in application
  logs — userId (UUID) references are acceptable but
  email addresses, names, and financial details must
  not appear in log output

---

## 3. Requirement Traceability

```
FR-40 to FR-53 (Rex character and AI)
  → depends on: FR-66 to FR-69 (RAG pipeline)
  → depends on: NFR-02, NFR-03 (Rex latency)
  → depends on: NFR-08, NFR-09 (Rex animation)
  → depends on: FR-61 to FR-65 (message allowance)

FR-54 to FR-57 (Rex car and tool creation)
  → depends on: FR-47 Type F and G action cards
  → depends on: NFR-10 (car creation latency)
  → source field tracked on: cars, carMods,
    buildStages, buildTasks, garageTools tables

FR-58 to FR-60 (landing page demo chat)
  → depends on: NFR-26 (demo rate limiting)
  → must NOT expose real user data or RAG pipeline
  → uses pre-populated demo car context only

FR-61 to FR-65 (message allowance)
  → depends on: NFR-21 (API rate limit)
  → depends on: NFR-36 (allowance observability)
  → counter stored: per userId per calendar month
  → Rex panel FR-46 always shows usage bar

FR-26 to FR-34 (budget tracker)
  → depends on: NFR-27 (BIGINT cents)
  → depends on: FR-35 to FR-36 (receipt uploads)
  → FR-33 (over budget) triggers FR-44 Rex notification

FR-75 to FR-83 (navigation and layout)
  → depends on: NFR-37 to NFR-41 (responsive NFRs)
  → FR-70 (profile in one place) changes FR-81
    (sidebar Rex widget replaces profile)
  → FR-80 (mobile kanban) requires FR-21 menu
    alternative to replace drag-and-drop

FR-39 (vision build plan)
  → depends on: FR-38 (inspiration image upload)
  → depends on: NFR-06 (vision latency)
  → requires vision-capable model on both Claude
    and OpenAI providers
```

---

## 4. Out of Scope (v1)

The following are explicitly excluded from v1:

- Paid subscription plans or in-app billing
  (v1 uses Wrench's API key for all Rex messages)
- BYOK (Bring Your Own Key) Anthropic API key support
  (documented for v2 consideration)
- Social features (sharing garages, following builders)
- Parts marketplace or purchasing integration
- OBD-II live diagnostics integration
- Native mobile app (iOS/Android) — responsive web only
- Multi-user garage access (shared garage)
- Parts catalogue or fitment database
- Apple Sign-In (placeholder shown, not implemented)
- Two-factor authentication (placeholder shown)
- Strava, Instagram, YouTube integrations (placeholder)
- Keyboard shortcuts (placeholder shown)
- Weekly or monthly email digest (Settings UI exists,
  email sending not implemented in v1)