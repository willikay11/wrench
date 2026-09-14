# ADR-010: Car Imagery — Vehicle Catalogue vs Runtime Image Search

## Status
Accepted — amended 2026-09-13 (fallback is a branded
placeholder, not a silhouette)

## Date
2026-09-13

## Context
FR-14 asks for every car in the garage to show "the car
photo (or a branded placeholder)". In practice most
people adding a car do not have a photo to hand, so the
garage row fills with empty frames and looks unfinished.

Separately, FR-13 takes make and model as free text.
That produces one car under several spellings —
"Nissan", "nissan", "Nisan" — which Rex cannot recognise
as the same vehicle, and which nothing can match to parts,
guides or other owners.

Three approaches were evaluated for giving a car an image
when its owner has not uploaded one:
1. Rex searches the web for a photo when a car is added,
   using its make, model and year
2. A curated vehicle catalogue the add-car sheet searches,
   with representative images attached to catalogue
   entries
3. No image — a placeholder only

## Decision
Use a **curated vehicle catalogue**, keyed down to the
**generation**, with the owner's own upload taking
precedence and a branded placeholder as the fallback.

### Catalogue shape
```
vehicleMakes        Nissan
  vehicleModels       350Z
    vehicleGenerations  Z33 · 2002–2009 · coupe
                        (+ optional image, attribution,
                         licence, source URL)
```

Tables and constraints: `/docs/schema.md`
(Vehicle Catalogue).

### How a car uses it
- The add-car sheet searches catalogue makes and models,
  and **also accepts any typed value**. A car that is not
  in the catalogue is still a car.
- A car links to a catalogue generation through a
  nullable `generationId`. Free-text cars are first-class
  and behave exactly as before.
- When a link is made, the car's make, model and year
  must agree with the generation it points to (WRE-265).

### Image precedence
```
1. The owner's uploaded photo            source: upload
2. The linked generation's catalogue     source: catalogue
   image, labelled "representative"
   and shown with its attribution
3. A branded placeholder: the Wrench     (no image)
   mark on a dark panel, picturing no
   car, with a prompt to add a photo
```

The API resolves this order and returns the result. No
client re-implements it.

### Image sourcing
- Catalogue images come **only** from sources whose
  licence permits display in a commercial product.
- Every image is stored with its attribution, licence and
  source URL. The database refuses an image row without
  all three, so an uncredited image cannot be stored.
- Catalogue images are platform reference data, not user
  data, and are served publicly from Cloudinary. Their
  folder and access mode belong to ADR-007.
- No model is involved in finding or choosing images.

## Reasoning

### Why a catalogue over runtime image search

**Licensing.** An image found by searching the web belongs
to someone. Displaying it in a commercial product without
a licence is a copyright exposure on every car added. A
catalogue moves the licensing decision to one reviewed
place, per image, before anything is shown.

**Reliability.** Search results for "2003 Nissan 350Z"
include the wrong car, a modified car, watermarked stock
imagery, forum screenshots and sale listings with
registration plates visible. A wrong photo beside a user's
real car reads as a data error.

**Cost and latency.** Driving a model through a web search
for every car added spends tokens and seconds on a lookup
a database answers in milliseconds, and repeats the spend
for every owner of the same common car. A catalogue pays
once per generation.

**Consistency.** A catalogue link turns three spellings
of a make into one entity, which Rex, matching and search
can all rely on. Runtime search improves the picture and
nothing else.

### Why generation, not make and model
A 1992 and a 2022 Honda Civic share a make and a model and
look nothing alike. The same is true of most long-running
nameplates. An image keyed on make and model is wrong for
most of the years it covers, and a wrong-generation photo
looks more fake than no photo. The generation is the
smallest unit at which a single representative image is
honest.

### Why searchable fields that accept free text, not dropdowns
Wrench's users own grey imports, kit cars, restomods, rare
trims and cars back to 1885. A closed list refuses every
car it has not heard of, at the exact moment the person is
trying to start using the product. Search-with-fallback
gets the consistency benefit for common cars and costs
rare cars nothing.

### Why the upload stays primary
Wrench tracks a specific car's build. The owner's widebody
orange Z33 is the car; a stock silver one is a stand-in.
The catalogue image is labelled as representative and is
replaced the moment the owner uploads their own.

### Why a branded placeholder rather than an empty frame
An empty frame reads as broken. The placeholder makes the
garage look deliberate, and pictures no car at all, so it
cannot be taken for the user's car. It carries a prompt to
add a photo, which is the actual fix.

## Consequences

### Positive
- The garage looks complete for every car, uploaded or not
- Common cars get consistent make, model and generation
  data that Rex and future features can match on
- No per-car token spend or search latency on add
- Image licensing is decided once, per image, and the
  credit is enforced by the database

### Negative — accepted trade-offs

**Curation burden.** The catalogue is maintained, not
discovered. The starter seed covers common enthusiast
cars only, is weighted to US and Japanese market model
years, and is approximate at the edges of generations
where launch dates differed by market.

**No images at launch.** The seed carries no images. Until
a licensed source is chosen, every car without an upload
shows the branded placeholder. This is the correct failure
mode, not
a gap to fill with unlicensed images.

**Consistency rules add validation.** A linked car whose
year falls outside its generation, or whose make no longer
matches, must be refused or unlinked (WRE-265).

## Amendment — 2026-09-13

The fallback was first a body-style silhouette: an outline
drawn per body style. It is replaced by a branded
placeholder — the Wrench mark on a dark textured panel,
with "No photo yet" and a prompt to add a photo.

**Why:** a drawn outline is still a picture of a car, and
a hand-drawn one looks unfinished beside real photos. Any
picture of a car next to someone's own car reads as that
car. The placeholder pictures none, uses only the brand
mark the project already owns, and turns the gap into the
prompt that fills it.

`bodyStyle` remains part of the catalogue and of every car
response. It no longer drives an image; the add-car sheet
shows it in words when confirming a catalogue match.

## Revisit Trigger
Revisit when ANY of the following is true:

1. More than 40% of cars added in a month have no
   catalogue link — coverage is too thin, and a bulk
   import source should be evaluated
2. A licensed image provider is chosen — its terms may
   change how images are stored or served
3. The catalogue needs non-engineers to edit it — it has
   outgrown migrations and needs admin tooling

## Alternatives Rejected

**Runtime image search by Rex:**
Rejected for licensing exposure on every car, unreliable
results, and per-car token and latency cost for a problem
a lookup solves. Acceptable only as an offline,
human-reviewed aid to *finding* licensed images for the
catalogue — never as the source of what users see.

**Make and model as strict dropdowns:**
Rejected because a closed list refuses rare and imported
cars at activation.

**Images keyed on make and model:**
Rejected because a single image is wrong for most of the
years a nameplate spans.

**A third-party vehicle data API at request time:**
Rejected as a runtime dependency on the add-car path, with
cost and availability risk and no generation-level images.
NHTSA's vPIC data (public domain, US market, makes and
models by year) remains a candidate *seeding* source, with
generations added by hand, since vPIC has no generation
concept.

**Placeholder only, no catalogue:**
Rejected because it solves neither the unfinished-looking
garage for common cars nor the free-text consistency
problem.

## References
- Requirements: FR-13, FR-14, FR-17, FR-35
- Schema: /docs/schema.md (Vehicle Catalogue)
- API design: /docs/api/openapi.yaml (catalogue endpoints)
- Related ADRs: ADR-007 (media storage — car photos and
  catalogue images), ADR-003 (caching — catalogue
  responses are a later caching candidate)
- Tickets: WRE-263 through WRE-268
