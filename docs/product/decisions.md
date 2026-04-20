# Product Decisions

This document captures key product design decisions and the reasoning behind them. These decisions shape how Wrench onboards users, structures data, and presents information.

## 1. Conversation-First Onboarding

### Decision
New users don't fill out a "create build" form. Instead:
1. They land on the Wrench homepage
2. See: "What are you building?"
3. Enter a message describing their car and goal
4. The advisor asks max 3 clarifying questions
5. Builds the project silently after confirmation

### Why

**Reduces friction for casual users.** A form with 5 fields is intimidating. "Tell me about your car" is natural conversation.

The three-question pattern mirrors real-world advisor interaction:
- *You:* "I want to make my Civic faster"
- *Advisor:* "What year and generation?"
- *You:* "2018 FK7"
- *Advisor:* "Budget range?"
- *You:* "$5k"
- *Advisor:* "Great, I'm creating your project now"

No forms. No submit buttons. No "validation failed" errors.

### Evidence

- Automotive communities value approachability
- Enthusiasts are excited to talk about their car
- Complex questions can be answered naturally in chat, not form fields

### Tradeoff

Users must type rather than select from dropdowns. Typos happen ("2018 civic" vs "2018 Honda Civic"). Mitigated by having the advisor clarify: *"Did you mean 2018 Honda Civic Hatchback?"*

## 2. Multiple Goals per Build

### Decision
Builds don't have one goal; they have a **goals array**:
```
goals: ["daily driver", "track-ready", "fuel economy"]
```

The parts list is grouped by goal with colored indicators:
- 🔵 Daily driver parts
- 🔴 Track-ready parts
- 🟢 Fuel economy parts

Some parts appear under multiple goals (e.g., quality brakes improve both track AND safety for daily driving).

### Why

**Enthusiasts rarely have one goal.** A real build is multi-purpose:
- *"Make it faster (track), but still reliable (daily driver), and not bankrupt me (budget)"*
- *"Swap the engine (power), modernize the interior (comfort), but keep it period-correct (aesthetic)"*

Single goal = reductionist. Multiple goals = realistic.

### Evidence

Interviews with enthusiast forums (r/cars, ClubCivic, Miata.net) show builds are almost always multi-axis. Forcing a single goal means leaving context on the table.

### Implementation

Frontend displays parts grouped by goal. Backend stores parts with a `goal` column (which goal this part addresses). A single part can be tagged with multiple goals.

### Tradeoff

More complex data model and UI. Mitigated by:
- Clear grouping in the workspace
- Color coding makes goals visually distinct
- Parts service must output goal tags for each suggestion

## 3. No Budget Question Upfront

### Decision
During onboarding, we **do NOT ask** "What's your budget?"

Instead:
1. Generate the full, unconstrained parts list
2. Show pricing for each part
3. Advisor proactively suggests alternatives and phasing:
   - *"OEM parts are $800. Here's a quality aftermarket option at $250."*
   - *"Phase 1: essentials ($2k), Phase 2: nice-to-haves ($3k)"*

### Why

**Budget constraints thinking too early leads to suboptimal decisions.**

If you say "I have $3k," the advisor biases toward cheap parts and misses good $4k solutions that deliver 10x better value.

Showing the full menu first, then pointing out "here's how to do it for $3k" respects the user's intelligence and opens possibilities.

### Evidence

Luxury goods, automotive, and design markets show:
- Presenting price first anchors users to that price
- Showing full option, then filtering by budget feels less limiting
- Users respect "here's quality, here's budget option" more than "I can only afford this"

### Tradeoff

More information on screen upfront (not all users want this). Mitigated by:
- Collapsible "estimated cost" sections
- Advisor guidance on what matters most
- Clear pricing hierarchy (base price, shipping, labor estimates)

## 4. Mechanic Connection at the End, Not Onboarding

### Decision
We do NOT ask "Connect with a mechanic?" during the onboarding flow.

Instead:
- Mechanics are available as an advisor chip in the workspace
- User sees the full parts list and understands the build first
- Then decides if they want mechanic validation or labor

### Why

**Mechanic input is valuable only with context.**

If asked during onboarding, the user hasn't seen the parts list yet. They might dismiss mechanics thinking "I'll DIY." Or, they might book a mechanic for hand-holding, not for genuine labor.

By showing the parts list first, the user can decide:
- *"I can source these, but do I need a lift and press for this suspension?"* → Ask mechanic
- *"This engine swap is beyond me."* → Book labor

### Evidence

Sequencing matters. Users respect sequence that builds context → decision.

### Tradeoff

Mechanics don't get engaged as early. But earlier engagement with uncontextualized users wastes both parties' time.

## 5. AI Provider Abstraction (Gemini Dev, Claude Prod)

### Decision
The backend abstracts away the AI provider. During development, Gemini Flash (free). In production, Claude Sonnet (premium).

Users are unaware of this. They get consistent quality at reasonable cost.

```bash
# development
AI_PROVIDER=gemini

# production
AI_PROVIDER=claude
```

### Why

**Cost-effective development, quality-focused production.**

- Gemini Flash: 1500 free requests/day. Perfect for team iteration.
- Claude Sonnet: $3 per 1M tokens. Worth it for paying users.

By swapping at the config layer, we iterate cheap and deploy premium.

### Evidence

Cost constraints are real for bootstrapped teams. Gemini free tier + Claude premium tier = best of both.

### Tradeoff

Dev and prod AI behavior might differ slightly. Prompts must be generic enough for both. Mitigated by integration tests that can run with either provider.

See [ADR 003](../engineering/adr/003-ai-provider-abstraction.md) for details.

## 6. Parts Sourcing (Not Yet Implemented)

### Decision
Parts suggest 3–5 vendor options with:
- Real-time pricing from RockAuto, Amazon, eBay, Etsy, etc.
- Shipping estimate
- Seller rating / stock status
- Direct link to buy

### Why

Enthusiasts hate price hunting. If Wrench can show *"This header is $250 on Amazon (ships free), $240 on RockAuto (in stock, ships 3 days)"*, users stay in Wrench and buy.

Network effect: If we become the sourcing hub, users return. If they have to leave Wrench to find prices, we lose them.

### Implementation Status

**Not yet implemented.** Requires:
1. Vendor API integrations (RockAuto, Amazon Product Ads, eBay API)
2. Price caching (prices change hourly)
3. Inventory polling
4. Affiliate tracking (optional, but enables monetization)

Current schema supports this (`part_listings` table exists), but business logic TBD.

## 7. Build Visibility (Private by Default, Public Optional)

### Decision
Builds are private by default (`is_public = false`).

Users can opt-in to make their build public, allowing:
- Other users to view and get inspired
- Mechanics to discover and validate projects
- Community feedback on parts choices

### Why

Privacy-first. User data (build choices, budget, timeline) is personal. But many users *want* to share their project for social proof and feedback.

By making it opt-in, we respect privacy while enabling community features.

### Evidence

Communities like r/cars thrive on shared projects. But not everyone wants public projects. Opt-in > opt-out for privacy.

### Tradeoff

Requires effort to build community features (search, filtering, favoriting). These are future enhancements.

## 8. Role-Based Access (Team Builds)

### Decision
**Currently:** One user owns one build.

**Future:** Multiple users can join a build (mechanic, friend, consultant, etc.) with role-based permissions:
- **Owner** — Full access, can delete
- **Editor** — Can modify parts and goals
- **Viewer** — Can read and comment
- **Mechanic** — Special editor role for labor estimation

### Why

Most builds are solo, but collaboration happens:
- Friends help with parts selection
- Mechanics validate the plan before committing labor
- Shop owners want to see the full build for quoting

Role-based access enables this without opening security holes.

### Implementation Status

**Not yet implemented.** Requires:
1. New `build_members` join table
2. RLS policy update (policies need to check role)
3. Frontend UI for inviting members
4. Notifications for members when build updates

Current RLS policy (`Users can manage own builds`) will need refactoring.

## 9. Guest Mode with Anonymous Authentication

### Decision
Users do not need to sign up before creating their first build.

On the home page:
1. Click "What are you building?" → No sign-in required
2. Chat with the AI advisor and build understanding
3. Confirm the build → `supabase.auth.signInAnonymously()` creates a guest session
4. Build is created under the anonymous user_id
5. User can view the build immediately
6. If they want to save across devices, they sign up/login (at which point they can merge the anonymous session)

### Why

**Maximizes time-to-value.** Asking users to sign up before they've seen value is friction. Let them experience Wrench first, then earn their account.

Casual users might never sign up (that's fine—they got value). Engaged users will sign up to sync across devices or share with friends.

Anonymous sessions in Supabase are free and lightweight. The conversion path is clear: guest → signed-up user.

### Evidence

Freemium products (Figma, Notion, Canva) show sign-up friction is the #1 drop-off point. Remove it upfront, and more users explore.

### Implementation

- Home page has no auth requirement (public route)
- Conversation endpoint is unauthenticated (GET health check + POST message)
- `createBuild()` requires auth, so AI advisor says "Confirming your build" just before the silent `signInAnonymously()` call
- RLS policies permit anonymous users to create/view their own builds
- If a user signs up later, we show a prompt: "Sign in to save this build to your account"

### Tradeoff

Anonymous users cannot sync across devices until they sign up. But this is the conversion moment—they've already invested time understanding their build.

## 10. Cost Tracking and Budget Variance

### Decision
**Currently:** We show estimated price per part and total project cost.

**Future:** Users can log actual spend (purchase receipts, labor hours) and see variance:
- Estimated: $5,000
- Actual (so far): $3,200
- Remaining budget: $1,800

### Why

Builds rarely hit estimated cost. Labor takes longer. Parts break. Vendors go out of stock.

Tracking actual spend lets users make mid-project decisions: "We're $800 over budget; should we cut the audio system?"

### Implementation Status

**Not yet implemented.** Requires:
1. New `spend_logs` table (what was spent, when, category)
2. Receipt upload and parsing (nice-to-have, not MVP)
3. Actual labor hour tracking
4. Variance reporting

Schema is ready (`parts.price_estimate` exists); business logic TBD.

## Related Decisions

See [Architecture Decision Records](../engineering/adr/) for technical decisions that enable these product choices:
- [ADR 001: FastAPI](../engineering/adr/001-fastapi-over-node.md) — Supports complex business logic
- [ADR 002: Supabase](../engineering/adr/002-supabase-for-auth-and-db.md) — RLS enables privacy + community features
- [ADR 003: AI Abstraction](../engineering/adr/003-ai-provider-abstraction.md) — Enables cost-effective development

## Decision Log

| Date | Decision | Status |
|------|----------|--------|
| 2026-03-31 | Conversation-first onboarding | ✅ Implemented |
| 2026-03-31 | Multiple goals per build | ✅ Implemented |
| 2026-03-31 | No upfront budget question | ✅ Implemented |
| 2026-03-31 | Mechanic connection at end | ✅ Implemented |
| 2026-03-31 | AI provider abstraction | ✅ Implemented |
| 2026-04-15 | Build visibility (private by default) | ✅ Implemented |
| 2026-04-20 | Guest mode with anonymous auth | ✅ Implemented |
| TBD | Parts sourcing integration | 🔲 Planned |
| TBD | Team/shared builds | 🔲 Planned |
| TBD | Cost tracking | 🔲 Planned |

## Questions for Future Refinement

1. **Monetization:** Should we take affiliate commission on part sales? This aligns incentives (we make money when users buy through us), but adds complexity.

2. **Mechanic vetting:** How do we ensure mechanics in the network are legitimate? Verified hours, reviews, insurance?

3. **Parts recommendation ranking:** Optimize for price, quality, availability, or user feedback? Different users have different priorities.

4. **Mobile app:** Is this a mobile-first product? Desktop-first? Responsive web (current)?

5. **Export:** Should users be able to export their build (PDF, spreadsheet) for sharing with shops?
