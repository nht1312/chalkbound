# Phase 3 — Drawing: task plan

Source: `docs/ROADMAP.md` Phase 3; `SPEC.md` §6 (drawing and blueprints), §7.1
(sword), §14 (audio/VFX), §15 (UI); `docs/ARCHITECTURE.md` §4.5, §5.3 and §6;
`docs/SPEC_AUDIT.md` RD-01, RD-08, R-01, R-07, R-11, D-02. Approved by the user
2026-10-07 ("approve Phase 3"). The Phase 2 plan is in git history.

Each task ends green (`pnpm typecheck && pnpm lint && pnpm test && pnpm build`)
and is committed separately. This is the highest-risk phase; the ROADMAP
budgets 2–3 feel iterations on cursor, plane and hand timing after T10.

**Scope boundary.** Only the **sword** blueprint exists in Phase 3. Wall and
bridge are Phase 4 data. A recognized sketch debits chalk and plays creation
VFX naming the blueprint. *Spawning* the sword into the hands is Phase 4
(Creation).

**Invariants:**
- Recognition is purely geometric; it is never ML or image recognition.
- The client sends strokes. Any `blueprintId` it attaches is a diagnostic hint
  only.
- The authority classifies, then grades, then debits. There is never a refund
  path.
- When classification is uncertain, the result is `unrecognized`, never a
  guess.

**Decisions not in the spec, chosen here and flagged ([PLACEHOLDER]):**
1. **Stroke input.** Hold RMB to raise the chalk (draw mode). While RMB is held,
   LMB down/up starts and ends a stroke. Releasing RMB submits the sketch. Esc
   or losing pointer lock cancels with no cost.
2. **No chalk, no drawing.** Draw mode needs chalk > 0. The authority ignores a
   submission from a player holding 0.
3. **Failure costs are capped.** A smudge, unrecognized or unaffordable debit
   takes `min(cost, held)`, so chalk never goes negative.
4. **Fixture corpus.** A seeded synthetic corpus with jitter, human timing and
   sloppy, ambiguous and non-sword shapes, plus a dev-only hook that saves real
   sketches as fixture JSON. Human-recorded fixtures are added by playing.
5. **Limits.** At most 8 strokes and 256 points per stroke on the wire, and at
   most one submission per 500 ms per player.
6. **Starting thresholds** (tune by playing, always toward more rejections):
   - `RECOGNITION_FLOOR` 0.5;
   - `AMBIGUITY_MARGIN` 0.15;
   - sword `minAccuracy` 0.6;
   - quality bands per SPEC §6.5: crude below 0.75, sound up to 0.90, keen
     above.
7. **Line direction.** Direction is undirected: a blade drawn top-down or
   bottom-up is the same line.
8. **Chalk plane.** 1.2 m ahead (SPEC §6.7). The drawable area is 0.8 × 0.8 m
   and the cursor is clamped to it. Cursor sensitivity is a separate setting.

## Tasks

- [x] **T1 — Drawing types and normalization (shared).**
  `PlanePoint`, `Stroke`, `Sketch`, and `shared/config/drawing.ts`.
  `normalize.ts` resamples each stroke to 32 points by arc length, then
  centres and uniformly scales the whole-drawing bounding box so the longer
  axis spans 1, preserving aspect.
  *Accept:* property tests showing the result is translation- and
  scale-invariant and rotation-*sensitive*; points are evenly spaced, the
  count is exact, and degenerate input is handled.

- [ ] **T2 — Discriminators and the constraint library (shared).**
  Discriminators: stroke count, intersection, closure, aspect, dominant angles.
  Constraints: `StrokeCount`, `Straightness`, `Direction`, `RelativeLength`,
  `Intersection` (with a position band), `EndpointProximity`, `Closure`,
  `AspectRatio`, `TemplateDistance`, `Timing`, `HumanLikeness`. Each returns a
  score, a pass flag, and a stable failure code.
  *Accept:* a table-driven test per constraint.

- [ ] **T3 — Blueprints, classifier, validator (shared).**
  - The sword `BlueprintTemplate` as data, and a registry.
  - Two-tier classification: a hard filter on discriminators, then a soft
    score, then rejection on the floor and the margin.
  - Grading, the quality bands, and the four-case `DrawingOutcome`.
  - The distinctness test over the registry.
  - The synthetic fixture corpus.

  *Accept:*
  - the confusion matrix has zero misclassifications;
  - deliberately sloppy, ambiguous and non-sword fixtures (line, circle,
    scribble, rectangle, parallel lines) return `unrecognized` or `smudged`,
    never a wrong `created`;
  - accuracy bands hold.

- [ ] **T4 — Wire format (shared).**
  - `DrawingSubmission`: int16 quantized, delta-encoded points, varint timing,
    and an advisory hint.
  - `quantizeSketch()`, so the client validates exactly what the server will
    decode.
  - `DrawingResult` downstream: outcome, blueprint, accuracy, quality, failure
    codes, and chalk debited.

  *Accept:*
  - round-trips;
  - a sword encodes to ~100–150 bytes;
  - malformed input and limits are rejected;
  - the validator gives the same outcome on the client sketch and the decoded
    bytes for every fixture.

- [ ] **T5 — Authority: drawing submissions.**
  `MatchSimulation.submitDrawing()` validates against the player's chalk and
  debits per outcome (SPEC §6.6, capped). It rate-limits, ignores players with 0
  chalk, and counts and logs hint disagreements. The host routes
  `DrawingSubmission` and replies with a reliable `DrawingResult`.
  *Accept:*
  - each outcome debits the right amount;
  - the hint never changes the outcome;
  - rate-limited and empty-handed submissions are rejected;
  - a loopback test of the full round trip.

- [ ] **T6 — Client draw mode.**
  - Holding RMB enters draw mode only with chalk > 0.
  - Camera rotation freezes, and raw deltas drive a virtual cursor (pointer
    lock is kept).
  - Movement, sprint, jump and attack are suppressed through a shared
    `stepPlayer` rule (`Draw` held), so prediction and authority agree.
  - The chalk plane fades in at 1.2 m over 150 ms, and the right hand raises.
  - `StrokeRecorder`: fixed-rate sampling, a minimum-distance filter, and
    per-point timing.
  - The stroke trail renders on the plane.
  - Cursor sensitivity is added to the pause menu.

  *Accept:*
  - unit tests for the recorder, the cursor mapping and the movement
    suppression;
  - draw mode never releases pointer lock.

- [ ] **T7 — Submission, local preview, and specific feedback.**
  - Releasing RMB quantizes, validates locally (hint plus instant feedback) and
    sends.
  - On `DrawingResult`, a creation burst names the recognized blueprint and its
    quality ("SWORD — Sound", R-11).
  - Failures read as specific messages: a smudge names the failed constraint,
    for example "The crossguard didn't cross the blade". Unrecognized says it
    couldn't be read. Unaffordable says how much is needed.

  *Accept:* tests for the failure-code-to-message mapping and the outcome-to-UI
  mapping.

- [ ] **T8 — Drawing feedback channel (D-02).**
  - A chalk scratch loop, synthesized in Web Audio with no asset files, whose
    gain and playback rate track cursor speed.
  - Chalk dust particles at the cursor.
  - Stroke glow on resolve.

  *Accept:* unit tests for the speed→gain/rate curve and the particle emission
  rate; a manual check.

- [ ] **T9 — Codex, first pass.**
  An overlay, opened by holding Tab, showing every known blueprint: its shape
  drawn from the template's reference path with numbered stroke order, its
  chalk cost, and whether you can afford it (from authoritative chalk).
  *Accept:* tests for affordability and for generating the shape diagram.

- [x] **T10 — Phase 3 exit check.**
  - A headless probe picks up chalk, draws a sword through draw mode and gets
    `created` (−20 chalk). A scribble gets `unrecognized` (−5).
  - Pointer lock holds throughout.
  - Docs are updated.

  *Accept:* ROADMAP exit criteria 2, 3, 5 and 9 verified by tests and the
  probe. Criteria 4 (a human passes ≥ 9/10) and 10 (the feel gate) are the
  user's call.
