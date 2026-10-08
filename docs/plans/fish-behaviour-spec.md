# Fish behaviour spec — for approval before code

*Drafted 2026-10-08. Status: ~~**AWAITING RICKY'S APPROVAL.** Nothing here is
built.~~ **APPROVED and BUILT 2026-10-08 — all three picks yes. Seen on the
glass: "much better, they're milling now."** Replaces the three invented models rejected on the glass the same day
(see CHANGELOG, "fish: bigger, faster, and a third attempt at behaviour").*

## What is wrong today, in one sentence

Every version so far moved **the group** — a shared target the school
chased, then a "home" it orbited — so the tank read as a current carrying
fish past the glass. In real tanks **the population stays put, and
individuals move**: short trips, long pauses, inside a zone each species
keeps.

## Sources

| Source | What it gave |
|---|---|
| **Ricky's clip 5** (`2026-10-08 09-42-51.mp4`, rainbowfish over carpet, planted freshwater — the look Ricky wants) | Sampled at 4/s, 2/s and every 4s across the full 31s |
| **Ricky's clip 2** (`09-40-35.mp4`, tetras + angelfish + platies) | Same sampling — the closest to our neon school |
| **Deskworlds riverscape** (`chaseleantj/deskworlds`, MIT, `scenes/riverscape/src/fish.js`) | A researched tetra model: station-keeping, burst-and-coast (Li et al. 2021), recruitment. **We take its shoaling and leave out its river current** — that current is what Ricky objected to |

Clips 1, 3, 4 are saltwater reef; not used, per Ricky ("freshwater riverbed
look").

## What the footage shows

1. **Most fish are nearly still at any moment.** Over 2s at 4 frames/s, most
   rainbowfish shift less than half a body length; some hold position.
2. **Movement is short bursts**, about 0.5–1 body length per quarter-second,
   then a glide to a stop.
3. **No shared heading.** Neighbours face opposite ways at the same moment.
4. **Fish turn in place, including toward the viewer** — a head-on silhouette
   for a frame or two mid-turn.
5. **Bodies tilt** a little nose-up or nose-down; not perfectly level.
6. **The distribution holds for 30 seconds.** Clip 5's fish fill the left two
   thirds of the tank, mid-to-upper water, start to finish. Clip 2's tetras
   keep the upper middle the whole clip.
7. **Each species has a zone.** Tetras up and middle; angelfish among the
   plant stems; platies low and in the foreground.
8. **Depth is constant traffic** — fish pass in front of and behind plants all
   the time, at visibly different sizes.

## The model

Units are **body lengths (BL)** so it survives any size change. At today's
2x scale a neon is 98px, so 1 BL/s ≈ 98px/s.

### Shoaling species (neons, cardinals, rasboras…)

Three states per fish:

| State | What the fish does | Numbers |
|---|---|---|
| **Hover** — the default | Holds a station point, drifting back to it if displaced; small tail flicks and in-place turns | Drift back ≤ 0.5 BL/s. A flick/turn on average every **7s** (random, exponential). Turns 10–37°; sometimes a full about-face through head-on |
| **Travel** — a short trip | Swims to a destination in **bursts and glides**, eases off on arrival | Peak ~2 BL/s, glide 30–65% of each stroke cycle. Trip length **2–6 BL** usually; **1 in 4 trips** goes anywhere in the species' zone |
| **Settle** | Glides to a stop, then becomes Hover | ~1.2s |

**When a fish leaves station:** on its own clock — on average every **4.5s**
(random, exponential, varied per fish by a "character" factor 0.8–1.2) — or
**recruited**: a hovering fish within ~2 BL of a neighbour that departed in the
last 1.2s follows it, at 15% chance per second, to a point near that
neighbour's destination. That is how small knots of the shoal move together
without the whole shoal flowing. **A follower never recruits others** (no
chains), and at most **~30% of the shoal** is travelling at once.

**On arrival:** 70% chance of another trip straight away, 30% settle → hover.

**Spacing:** ~1.5 BL to the nearest neighbour. Closer than ~0.8 BL → a flick
away. **No cohesion force while among neighbours** — only a fish with nobody
within ~4 BL heads back toward the others. **No alignment while hovering**
(Deskworlds aligns only with neighbours that are travelling).

**Zone, not target:** each species has a home region (its depth band plus a
horizontal extent, e.g. left two thirds for one shoal). Destinations are drawn
inside it. Nothing moves the zone. The population's spread should look the
same at minute 1 and minute 5.

**Depth:** part of each trip's destination (z chosen with the x/y), not a
random drift. A fish swimming to the back of the tank shrinks and passes
behind the wood and plants; one coming forward grows. No restoring-force
hacks needed.

### Centrepiece (gouramis)

Mostly hover, close to plants and wood: hovers **5–15s**, slow glides of
**1–3 BL** between plants, sometimes **inspects** a leaf (holds nose-to-it for
3–8s with small pecks). Turns are slow and deliberate. No shoaling.

### Bottom dwellers (corydoras)

Stay on the substrate: short scoots of **1–3 BL**, then **2–6s** foraging in
place, nose down. Occasionally (about once a minute) a quick dash up to the
surface and back, a real corydoras habit. Usually in a loose group of 2–3.

### Shrimp

Unchanged behaviour. **Visibility is a separate problem** (invisible on the
glass) and belongs with the variety work.

## Fitting it to our panel

- **Frame rate ~8–10 fps** limits what reads: anything cycling faster than
  ~3–4 Hz aliases. Burst-and-coast is a speed pattern of ~1.5–2 Hz — visible
  and fine. **Tail-beat cap rises from 1.5 to 2.5 Hz** (was set for 4 fps).
- **Side view, 2.5D.** The head-on turn already exists — the shader renders
  `face` passing through zero as the fish turning toward the viewer.
- **Nose tilt** follows vertical motion, capped at ±20°, as today.

## How we will judge it

**Only the glass decides** (the standing rule). Before asking Ricky to look, I
will check these in renders as a sanity filter only — they cannot pass it on
their own:

- At any moment, **~60–70% of the shoal is hovering**.
- The shoal's centre moves **less than ~2 BL over 30s**.
- Neighbours face **mixed directions** most of the time.
- No fish is pinned at the front or back depth limit for more than ~20s.

## Out of scope for this spec

Feeding, startle and escape (no input on the panel); species variety (a
separate item — but see question 2); shrimp visibility.

## Questions for Ricky

1. **Shoal size.** The reference clips show 20+ fish; ours has ~11 neons. At
   2x scale, 20 would crowd a 1280px tank. **My pick: 14–16**, testing on the
   glass.
2. **Two shoals in separate zones**, like clip 2's tetras and platies? It is
   the cheapest real variety, because zones are part of this model anyway.
   **My pick: yes, in this build** — one mid-upper, one lower.
3. **Rainbowfish as a species?** Clip 5 is your preferred look and it's
   rainbowfish. They're bigger and more colourful than neons and would read
   well at 3 ft. **My pick: add them** as a shoaling option.
