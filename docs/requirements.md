## Functional Requirements
Functional requirements define what the system must do. Each one is a capability that can be tested with a pass/fail outcome

### 1.1 Authentication
- FR-01: A user must be able to register with an email address and password
- FR-02: A user must be able to login with social logins: Google
- FR-03: A user must be able to log in and receive an access token and refresh token
- FR-04: A user must be able to refresh their access token using a valid refresh token
- FR-05: A user must be able to log out, which invalidates their refresh token
- FR-06: A user must not be able to access any protected resource without a valid access token
- FR-07: A user must be able to request for a password reset link/token
- FR-08: A user must be able to reset their password

### 1.2 Garage Management
- FR-09: A user must be able to add a car to their garage with year, make, model, and engine details
- FR-10: A user must be able to view all cars in their garage
- FR-11: A user must be able to add a modification to a car, including name, category, cost, and installation date
- FR-12: A user must be able to log a service record against a car, including type, mileage, and cost
- FR-13: A user must not be able to view or modify another user's cars or data

### 1.3 Build Planner
- FR-14: A user OR the AI assistant must be able to create a build plan with named stages for a specific car
- FR-15: A user OR the AI assistant must be able to add tasks to a build stage with estimated cost and due date
- FR-16: A user must be able to mark tasks as complete and track actual vs estimated cost
- FR-17: A user must be able to view a summary of total estimated vs actual spend per build stage
- FR-18: A user must be able to add the tools they have in their garage.
### 1.4 AI Assistant
- FR-19: A user must be able to ask a question about their car and receive a response from the AI assistant
- FR-20: The AI assistant must have access to the user's car profile, modifications, and service history when generating a response
- FR-21: The AI assistant must stream its response token by token rather than waiting for the full response before displaying
- FR-22: A user must be able to view their conversation history with the AI assistant
- FR-23: If the primary AI provider (Anthropic) is unavailable, the system must fall back to the secondary provider (OpenAI) automatically
- FR-24: The AI assistant must be able to view the tools the user has in their garage and be able to suggest tools to get to complete the job.
- FR-25: A user must be able to upload one or more inspiration images to the AI assistant
- FR-26: The AI assistant must be able to analyse uploaded inspiration images and generate a suggested build plan based on the modifications visible in the image
- FR-27: When a user adds a car to their garage, the system must automatically generate and store an embedding of the car's base profile (year, make, model, engine)
- FR-28: The system must enrich newly added cars with known common issues and maintenance information for that make, model, and year — stored as embeddings for use by the AI assistant
- FR-33: Records created by the AI assistant must be marked as unconfirmed and presented to the user for review before being treated as verified data. The user must be able to confirm, edit, or delete AI-generated records.

### 1.5 Media Uploads
- FR-29: A user must be able to upload a photo against a car or modification
- FR-30: A user must be able to upload a receipt against a budget entry


## Non Functional Requirements
Non-functional requirements define how well the system performs.

### 2.1 Performance
- NFR-01: CRUD API endpoints must respond in under 200ms at the 95th percentile under normal load (up to 500 concurrent users)
- NFR-02: AI chat requests must return the first token within 3 seconds at the 95th percentile
- NFR-03: AI chat requests must complete within 10 seconds at the 95th percentile
- NFR-04: Image uploads must complete within 5 seconds for files up to 10MB on a standard broadband connection
- NFR-05: The web frontend must achieve a Lighthouse performance score of 85 or above on mobile
- NFR-30: Car profile embeddings must be generated and stored within 5 seconds of a car being added to a user's garage — before the user's first AI query is possible

### 2.2 Availability
- NFR-06: The API must maintain 99.5% uptime measured over any 30-day rolling window (allows ~3.6 hours downtime per month)
- NFR-07: Planned maintenance must not require more than 15 minutes of downtime per deployment
- NFR-08: The system must remain partially functional if the AI provider is unavailable — garage management and build planning must continue to work

### 2.3 Scalability
- NFR-09: The system must support 10,000 registered users and 500 concurrent users at launch without degradation of NFR-01
- NFR-10: The architecture must support scaling to 100,000 registered users within 12 months without a redesign of core components
- NFR-11: The Go API must be stateless

### 2.4 Security
- NFR-12: All data transmission must use TLS 1.2 or higher — no unencrypted HTTP on any external connection
- NFR-13: Passwords must be hashed using bcrypt with a minimum cost factor of 12
- NFR-14: Access tokens must expire within 15 minutes of issuance
- NFR-15: The AI chat endpoint must be rate limited to 20 requests per user per hour to prevent abuse and control API costs
- NFR-16: Authentication endpoints must be rate limited to 5 attempts per IP per 15 minutes to prevent brute force attacks
- NFR-17: A user must never be able to read or modify data belonging to another user — ownership must be validated on every request
### 2.5 Data

- NFR-18: User data must be retained for the lifetime of the account and deleted within 30 days of account deletion
- NFR-19: The system must perform automated database backups every 24 hours with a minimum 30-day retention period
- NFR-20: Recovery Point Objective (RPO): maximum 24 hours of data loss in a catastrophic failure
- NFR-21: Recovery Time Objective (RTO): system must be restorable within 2 hours of a catastrophic failure
### 2.6 Observability
- NFR-22: Every API request must produce a structured log entry containing request_id, user_id, method, path, status_code, and duration_ms
- NFR-23: Every API request must be traceable end-to-end from frontend through Go API to database and external services via OpenTelemetry
- NFR-24: An alert must fire within 5 minutes of the 5xx error rate exceeding 1% over a 5-minute window
- NFR-25: OAuth tokens received from Google must be verified against Google's public keys before a session is created — the system must never trust a client-provided identity claim without server-side verification
- NFR-26: Vision-based build plan generation from an inspiration image must return the first token within 8 seconds at the 95th percentile.
- NFR-27: The system must reject file uploads exceeding 10MB. Accepted file types are limited to JPEG, PNG, WebP, and PDF (receipts only). MIME type must be validated server-side.
### 2.7 Compliance
- NFR-28: The system must comply with GDPR for users in the European Union — users must be able to request export of all their data and deletion of their account and associated data
- NFR-29: The system must not log or store personally identifiable information (PII) in application logs — user_id references are acceptable but email addresses, names, and financial details must not appear in log output