# ADR-007: Media Storage — Cloudinary vs S3 + CloudFront

## Status
Accepted

## Date
2026-06-22

## Context
Wrench users upload media in four categories:
- Modification photos (FR-28)
- Service record receipts (FR-29)
- Build inspiration images for AI vision analysis
  (FR-27, FR-28)
- User profile avatars

Requirements for the media storage solution:
- Photos must be private — accessible only to the
  owning user (FR-30, NFR-17)
- Images must be served quickly to users globally
- Images must be displayable at multiple sizes
  (thumbnail in lists, full size on detail pages)
  without storing duplicate files
- Receipts must support both image formats and PDF
- Upload and delivery must work within Cloudinary's
  or AWS's free tier at launch scale (10K users)

Two architectural approaches were evaluated:
1. Cloudinary (managed media platform: storage +
   CDN + transformations in one service)
2. AWS S3 (storage) + CloudFront (CDN) + a custom
   image transformation pipeline

## Decision
Use **Cloudinary** for all media storage, delivery,
and transformation.

### Upload flow
```
1. Client requests upload via POST /upload/photo
   or POST /upload/receipt (multipart/form-data)
2. Go API validates file (MIME type via magic bytes,
   size limit 10MB, allowed types per endpoint)
3. Go API uploads to Cloudinary via server-side SDK
   using a signed upload (API key never exposed
   to the client)
4. Cloudinary returns: secure URL, public_id,
   width, height, format, bytes
5. Go API returns UploadResponse to client
6. Client includes the returned URL when creating
   or updating a mod, service record, or budget entry
```

### Folder structure
```
wrench/
  cars/{carId}/
    mods/{modId}/
    service/{recordId}/
    inspiration/{conversationId}/
  users/{userId}/
    avatar/
  receipts/{carId}/{entryId}/
```

### Access control
```
Photo type      Cloudinary access mode
─────────────────────────────────────────
mod photos      Authenticated (signed URL,
                 24-hour expiry)
service photos  Authenticated (signed URL,
                 24-hour expiry)
receipts        Authenticated (signed URL,
                 1-hour expiry — financial
                 documents, shorter window)
inspiration     Authenticated (signed URL,
                 24-hour expiry)
avatars         Public (low sensitivity,
                 needs fast unauthenticated
                 display across the app)
```

Signed URLs are generated server-side by the Go API
on each request that returns a media URL, ensuring
expired links cannot be used and access is tied
to the authenticated user's ownership.

### Image transformations
Cloudinary URL-based transformations are used
instead of storing multiple file sizes:

```
Original upload:
https://res.cloudinary.com/wrench/image/upload/
  v1/cars/{carId}/mods/{modId}/photo.jpg

Thumbnail (garage grid view, 200x200, auto quality):
https://res.cloudinary.com/wrench/image/upload/
  w_200,h_200,c_fill,q_auto/
  v1/cars/{carId}/mods/{modId}/photo.jpg

Full width (mod detail page, 800px, WebP):
https://res.cloudinary.com/wrench/image/upload/
  w_800,f_webp,q_auto/
  v1/cars/{carId}/mods/{modId}/photo.jpg
```

One file is stored. Every size and format variant
is generated on-demand by Cloudinary and cached
at their CDN edge after first request.

## Reasoning

### Why Cloudinary over S3 + CloudFront

**Operational simplicity for a single-engineer team:**

S3 + CloudFront requires configuring:
- S3 bucket with correct private ACLs
- IAM policies and roles for the Go API to
  write objects
- CloudFront distribution pointing at the bucket
- Origin Access Control or signed URL infrastructure
  to keep the bucket private while serving via CDN
- CORS configuration on both S3 and CloudFront
- A separate image transformation service
  (e.g. Lambda@Edge with Sharp, or imgproxy)
  to generate thumbnails and format conversions

Each of these is a distinct piece of infrastructure
that must be configured correctly, monitored, and
maintained. For a solo developer building Wrench
across system design, backend, frontend, AI, and
DevOps simultaneously, this represents multiple
days of setup and ongoing operational surface area.

Cloudinary replaces all of the above with a single
SDK integration and API key. Upload, storage,
CDN delivery, and transformation are one service
with one point of configuration.

**Image transformations are the deciding factor:**

Wrench displays photos at multiple sizes across
the application: thumbnails in the garage grid,
medium previews in mod lists, full size on detail
pages, and potentially different crops for mobile
versus desktop layouts in the future.

With Cloudinary, every size and format variant is
a URL parameter change — no additional storage,
no additional processing pipeline, no additional
code.

With S3 + CloudFront, achieving the same capability
requires either:
- Storing multiple pre-generated sizes per upload
  (increases storage cost and upload complexity —
  every upload becomes multiple uploads)
- Building a Lambda@Edge transformation pipeline
  (additional service, additional cold-start
  latency on first request per size, additional
  code to write and maintain)

This single capability gap represents the most
significant practical difference between the
two approaches for Wrench's specific use case.

**Free tier sufficiency:**

Cloudinary free tier: 25GB storage, 25GB monthly
bandwidth, 25,000 transformations per month —
permanent free tier, not time-limited.

Per the capacity estimation (10K users, average
10 photos per car at 2MB each, 2 cars per user):
estimated photo storage requirement is 400GB at
10K users — exceeding Cloudinary's free tier.

This is an accepted limitation addressed in
Consequences below. The free tier comfortably
covers Wrench at early-stage user counts
(estimated 500-1,500 users before storage costs
become material), which aligns with the
12-month migration evaluation window.

S3's free tier (5GB storage, 12 months only) and
CloudFront's free tier (1TB transfer, permanent)
would be exceeded even faster on the storage side,
and the 12-month limit on S3's free tier means
costs begin regardless of usage after one year.

## Consequences

### Positive
- Single SDK integration handles upload, storage,
  CDN delivery, and transformation
- No image transformation pipeline to build or
  maintain
- Significant reduction in infrastructure setup
  time, allowing focus on Wrench's core differentiators
  (AI assistant, RAG pipeline, build planner)
- Signed URL generation is built into the Cloudinary
  SDK — no custom signing logic required
- Automatic format optimisation (q_auto, f_auto)
  serves WebP to supporting browsers automatically,
  improving load times without manual format
  detection logic

### Negative — accepted trade-offs

**Vendor lock-in:**
Cloudinary URLs are stored directly in the database
(CarMod.photos, ServiceRecord.receipts, etc.).
Migrating away from Cloudinary requires:
1. Downloading every asset from Cloudinary
2. Re-uploading to the new storage provider
3. Updating every stored URL in the database
4. Verifying no broken image links remain

This is a real migration cost, accepted because
the operational savings during early development
outweigh the future migration effort, which is
a one-time cost versus the ongoing savings.

**Cost at scale:**
Cloudinary's pricing per GB above the free tier
is higher than raw S3 storage costs. At significant
scale (50K+ users), the cost difference between
Cloudinary and S3 + CloudFront becomes material.

This is the basis for the migration trigger below.

**Less granular control:**
Cloudinary manages the underlying infrastructure.
Wrench cannot apply custom CDN caching rules,
custom origin configurations, or AWS-specific
optimisations that a raw S3 + CloudFront setup
would allow. This is an accepted trade-off for
reduced operational complexity.

## Migration Trigger
This decision will be revisited when ANY of the
following conditions are met:

1. Monthly active users exceed 50,000
2. Cloudinary monthly cost exceeds $200
3. Total media storage exceeds 500GB

At that point, migrate to S3 + CloudFront with
a dedicated image transformation service
(imgproxy self-hosted on a small EC2 or Fly.io
instance is the preferred target — open source,
lower cost than Lambda@Edge at sustained volume,
and supports the same on-the-fly transformation
URL pattern Cloudinary provides).

Migration approach:
1. Stand up S3 bucket, CloudFront distribution,
   and imgproxy instance
2. Write a background job to copy all existing
   Cloudinary assets to S3
3. Update database records to point to new URLs
   (or maintain a URL rewrite layer to avoid
   a one-time bulk database update)
4. Switch new uploads to S3 + CloudFront
5. Decommission Cloudinary once migration is
   verified complete

## Alternatives Rejected

**S3 + CloudFront (no transformation service):**
Rejected as the baseline comparison. Requires
significant additional setup (IAM, bucket policies,
CORS, signed URLs) and provides no image
transformation capability without an additional
service. The operational cost is not justified
at Wrench's current stage.

**S3 + CloudFront + Lambda@Edge (Sharp):**
Provides equivalent transformation capability
to Cloudinary. Rejected for now due to setup
complexity (Lambda@Edge deployment, cold start
latency on first request per transformation
variant, additional IAM permissions) relative
to Cloudinary's single SDK integration. This
is the most likely target if migration is
triggered, but premature at current scale.

**Self-hosted media server (e.g. raw file storage
on the application server):**
Rejected outright. Provides no CDN, no
transformation capability, couples media storage
to application server lifecycle, and creates a
single point of failure with no redundancy.

## References
- Requirements: FR-28, FR-29, FR-30, NFR-04, NFR-17, NFR-27
- Capacity estimates: /docs/capacity-estimation.md
- API design: /docs/api/openapi.yaml (upload endpoints)
- Related ADRs: ADR-001 (REST API design)