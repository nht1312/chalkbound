# CHALKBOUND — Specification Audit

**Date:** 2026-10-07
**Auditor:** Claude Code (lead technical architect)
**Status:** Pre-implementation. No code has been written.

This document evaluates the CHALKBOUND specification from an engineering
perspective. It does **not** modify `SPEC.md`. Every proposed change is listed
as a recommendation awaiting approval.

---

## 0. Critical finding — the design specification is missing

The repository contains two markdown files:

| File | Size | Actual contents |
|---|---|---|
| `SPEC.md` | 7,850 bytes | **Claude Code agent instructions** (role, development loop, server authority rules, asset naming, code style) |
| `CLAUDE.md` | 0 bytes | **Empty** |

`SPEC.md` opens with the heading `# CHALKBOUND — Claude Code Instructions` and
consists of 25 numbered sections of agent operating rules. That is the content
`CLAUDE.md` is supposed to hold. The file contents appear to have been placed in
the wrong file.

**Consequence:** there is no game design specification in the repository. What
exists is a set of *engineering constraints* plus the design intent embedded in
the initialization prompt. This audit therefore treats as authoritative:

1. The rules in `SPEC.md` (binding constraints, regardless of filename).
2. The design facts stated in the initialization prompt (core loop, MVP scope,
   first map, vertical slice).

### RESOLVED — 2026-10-07

Approved and carried out:

1. The agent instructions were copied verbatim into `CLAUDE.md` (byte-identical,
   7,850 bytes). A backup of the original file was taken first.
2. `SPEC.md` was then replaced with a real game design specification, drafted
   from the decisions in this audit and the initialization brief, and marked
   **v0.1 DRAFT — AWAITING REVIEW**.

The "Missing Decisions" section below served as the table of contents for that
draft. Items now answered in `SPEC.md` are marked **RESOLVED** in place, with
the original analysis retained so the reasoning stays auditable.

---

## 1. Confirmed decisions

These are sufficiently defined to implement against without further input.

### Design pillars (locked — `CLAUDE.md` §3)

| Decision | Source |
|---|---|
| First-person perspective only; no third-person gameplay | §3, §10 |
| Chalk is the single creation resource | §3 |
| Weapons are **drawn into existence**, never picked up as pre-made items | §3 |
| Extraction-lite, not battle royale | §3 |
| PvPvE, not PvE-only | §3 |
| First map is the Abandoned School | §3 |
| Drawing validation is **geometric**, never AI image recognition | §3, §8 |
| Third-person body allowed only in inventory, lobby, death, extraction, preview | §10 |

### Server authority (locked — `CLAUDE.md` §7)

The server is authoritative for health, damage, chalk, inventory, loot, drawing
results, spawned gameplay objects, death, extraction, and match state. The
client sends **intent**; the server validates state. Four specific client claims
are named as untrustworthy: "I hit this player", "I have this much chalk",
"I extracted", "this drawing is valid".

This is an unusually clear and complete authority boundary. It is directly
implementable and is treated here as a hard architectural constraint.

### Drawing system inputs (locked — `CLAUDE.md` §8, §15)

Validation must use: stroke count, position, angle, length, direction,
intersection, bounding box, timing, tolerance. Network representation must be
compact stroke data, shaped roughly as `{ blueprintId, strokes, duration }`.
Raw mouse movement must not be synchronized.

### Drawing UX sequence (locked — `CLAUDE.md` §9)

```text
start drawing -> hand raises chalk -> chalk plane appears -> player draws
-> scratch audio -> blueprint validates -> chalk particles -> drawing glows
-> drawing becomes 3D object
```

Explicitly must **not** be replaced with a traditional menu.

### Performance target (locked — `CLAUDE.md` §14, prompt §15)

60 FPS desktop browser target, 30 FPS minimum acceptable.

### Asset rules (locked — `CLAUDE.md` §11, §12, §13)

- Map must be modular, never one mesh. Named modules: wall, floor, door,
  window, stairs, column, desk, chair, locker, blackboard.
- Blender is the asset source of truth.
- Pipeline: import -> cleanup -> scale -> origin -> materials -> UV -> LOD ->
  collision -> naming -> GLB.
- Naming convention: `CB_<CATEGORY>_<NAME>_<VARIANT>`.

### MVP scope (locked — prompt §1)

FPP controller, camera, hands; chalk; drawing; blueprints; sword, wall, bridge;
sword combat; inventory; extraction; Abandoned School; The Erased; multiplayer;
basic UI, audio, VFX.

### Code quality constraints (locked — `CLAUDE.md` §6, §20, prompt §12)

Modular, typed, testable, small focused modules, one responsibility per system.
No global mutable state, no duplicated game logic, no client-authoritative
gameplay, no magic numbers without configuration, no mixing of rendering /
networking / game rules / UI in one class.

---

## 2. Missing decisions

Required for implementation, not currently specified. Ordered by how early they
block work. **Blocking** means the vertical slice cannot be finished without an
answer; **Deferrable** means a documented placeholder will do for now.

### MD-01 — Blueprint selection vs. blueprint inference — **RESOLVED: inference**

> **Decision (2026-10-07):** **inference.** The player draws a sketch and the
> sketch itself determines what is created. There is no pre-selection. Specified
> in `SPEC.md` §6.2. This is the opposite of the recommendation originally made
> in RD-01 below, which has been rewritten to describe the approved design and
> its consequences.

Does the player **select** which blueprint they intend to draw before drawing
(e.g. a radial quick-select), or does the system **infer** the intended
blueprint from the strokes?

This is the single largest architectural fork in the project:

- **Selection** → the validator is a *grader*. It answers "how well does this
  drawing match the sword template?" on a 0..1 scale. One template per
  validation call. Cheap, explainable, gives precise UX feedback.
- **Inference** → the validator is a *classifier plus grader*. It scores the
  drawing against every known template, picks a winner, then grades it. Needs
  rejection handling for ambiguous and unrecognized input, and misclassification
  becomes a frustration source (you drew a sword, you got a wall, you lost the
  chalk).

Everything downstream — UI, chalk-cost deduction timing, failure feedback,
server validation message shape — differs between these.

**Recommendation:** selection for MVP, inference as a later opt-in mechanic.
See RD-01.

### MD-02 — Chalk economy numbers — **BLOCKING**

Not specified: chalk per pickup, chalk cost per blueprint (sword, wall, bridge),
maximum carried chalk, whether chalk is a stack or a continuous meter, whether
failed drawings consume chalk (fully, partially, or not at all).

The last one has large feel consequences: consuming chalk on failure makes
drawing tense and scarce; not consuming it makes drawing free to practice and
removes the risk pillar.

### MD-03 — Does a failed drawing cost chalk? — **BLOCKING**

Called out separately from MD-02 because it determines whether chalk is debited
*before* validation (optimistic, refund on failure) or *after* (pessimistic).
That ordering is a server-protocol decision, not a tuning value.

### MD-04 — Combat numbers — **BLOCKING for Phase 5**

Not specified: player max health, sword damage, swing duration, swing cooldown,
sword reach, whether swings have windup/active/recovery frames, blocking or
parrying, stamina cost per swing, stamina regeneration, sword durability (does a
drawn sword break or last the match?).

Sword durability matters structurally: a breakable sword reinforces the
create-consume-recreate loop; a permanent sword turns chalk into a one-time
purchase.

### MD-05 — Match structure — **BLOCKING for Phase 9**

Not specified: match duration, player count per match (prompt says 2-4 initially,
8-16 eventually), whether there is a shrinking play area or timer pressure,
spawn placement rules, extraction zone count and placement, whether extraction
zones open on a timer, extraction channel/hold duration, whether death is
permanent for the match (presumed yes — extraction-lite implies no respawn, but
this is not stated).

### MD-06 — Persistence and the stakes of extraction — **BLOCKING for Phase 9**

Not specified whether anything carries between matches. This is a design
question disguised as an infrastructure question.

Extraction-lite genres derive their tension from a persistent stash: extracting
*keeps* your loot, dying *loses* it. With no persistence, extracting and dying
have identical outcomes (you return to the lobby) and the central risk pillar
collapses — the player has no reason to extract rather than fight to the death.

The prompt says "only introduce a database if the MVP actually requires
persistent data." Read strictly, the MVP's core loop *does* require it — but it
can be the last thing built. See RD-06.

### MD-07 — Lifetime and ownership of drawn objects — **BLOCKING for Phase 4**

Not specified: when a player draws a wall or bridge, does it persist after the
drawer dies or extracts? Can other players walk on a bridge you drew, or be
blocked by your wall? Can drawn objects be destroyed, and by what?

This is the source of most of the emergent PvPvE potential in the design (block
a corridor, bridge a gap and let an enemy follow you across) and it has direct
networking consequences — drawn geometry mutates the shared collision world
mid-match, which is risk R-03.

### MD-08 — Drawing input model under pointer lock — **BLOCKING**

FPP gameplay requires pointer lock. Drawing requires 2D cursor input. Not
specified how these coexist. Options: exit pointer lock while drawing (browser
may require a fresh user gesture to re-enter, and the OS cursor jumps); or keep
pointer lock and drive a virtual 2D cursor from raw mouse deltas while freezing
camera rotation.

**Recommendation:** see RD-08. This is the highest-risk *feel* question in the
project and the main reason the vertical slice exists.

### MD-09 — The Erased behaviour — **Deferrable to Phase 7**

Only the name is specified. Not specified: health, damage, movement speed,
detection model (sight, sound, chalk proximity?), aggression toward players vs.
toward each other, spawn rules, whether they drop chalk, whether they interact
with drawn objects, and what "erased" means visually and mechanically. The asset
name `CB_PVE_ErasedSword_A` in §13 hints they wield drawn weapons.

### MD-10 — Target browser matrix — **Deferrable, needed before Phase 10**

Not specified. Affects renderer choice (WebGL2 vs WebGPU), texture format
(KTX2/Basis support), and audio API assumptions.

### MD-11 — Inventory model — **Deferrable to Phase 2**

Not specified: slot count, whether it is grid-based or slot-based, what occupies
slots (chalk, drawn weapons, loot), weight limits, whether inventory access
pauses the game (it must not in a PvPvE game), and what the third-person body in
the inventory view is for.

### MD-12 — Audio and art sourcing — **Deferrable**

`CLAUDE.md` §18 describes an asset generation agent but not the provenance or
licensing of generated audio and texture inputs. Needs a decision before any
asset ships.

### MD-13 — Hosting and deployment target — **Deferrable to Phase 8**

Not specified. Affects server topology, TLS termination, and whether WebRTC
(which needs STUN/TURN) is viable later.

### MD-14 — Anti-cheat tolerance — **Deferrable**

Server re-validation stops *invalid* drawings but not *automated valid* ones. A
script can submit geometrically perfect strokes. How much this matters is a
product decision. See R-07.

---

## 3. Technical risks

Scored by likelihood × impact on the MVP.

| ID | Risk | Likelihood | Impact | Phase |
|---|---|---|---|---|
| R-01 | Drawing-under-pointer-lock feels bad | High | Critical | 3 |
| R-11 | Blueprint misclassification erodes trust | Medium | Critical | 3 |
| R-02 | Server-authoritative melee feels unresponsive | High | Critical | 5/8 |
| R-03 | Player-drawn geometry desyncs client prediction | High | High | 4/8 |
| R-04 | Asset pipeline consumes effort before the loop is proven fun | High | High | 6 |
| R-05 | Draw-call and texture budget blown by modular environment | Medium | High | 6 |
| R-06 | Rapier WASM payload and dual-world memory cost | Medium | Medium | 0 |
| R-07 | Drawing automation / macro cheating | Medium | Low (MVP) | 8 |
| R-08 | Physics non-determinism breaks naive netcode | Medium | High | 8 |
| R-09 | Browser tab memory ceiling | Low | High | 6 |
| R-10 | WebGL2 vs WebGPU divergence | Low | Medium | 10 |

### R-01 — Drawing under pointer lock

The core mechanic requires precise 2D input inside a mode that has captured the
mouse for camera control. If the transition is jarring, or the virtual cursor
feels disconnected from the hand, the game's single most important interaction
fails — and no amount of later content fixes it.

*Mitigation:* make this the first thing the vertical slice proves. Build the
chalk plane and cursor before building any blueprint beyond the sword. Budget
time for 2–3 full iterations on cursor sensitivity, acceleration, plane
distance, and hand animation. Treat "does this feel good" as an explicit
acceptance gate, not a polish task.

### R-11 — Blueprint misclassification (new, introduced by the inference decision)

Added 2026-10-07 after MD-01 was resolved in favour of inference.

With no pre-selection, the system guesses the player's intent. A wrong guess
spends the player's chalk on an object they did not want, at a moment they chose
to be vulnerable. The failure is silent and total: there is no point at which
the player confirmed anything, so there is nobody to blame but the game.

Likelihood is only Medium because the MVP has three deliberately distinct
shapes (RD-01), but impact is Critical because trust in the core mechanic does
not recover easily. It also *grows* with every blueprint added, which makes it
the main long-term constraint on content.

*Mitigation, in priority order:*

1. **Ambiguity rejection** — refuse rather than guess when the top candidate is
   below the recognition floor or too close to the runner-up. Returning "the
   sketch smudged" costs the player 5 chalk; returning the wrong weapon costs
   them the fight.
2. **Mandatory shape distinctness** (`SPEC.md` §6.3) — enforced as a test, not a
   convention: a unit test asserts every blueprint pair differs on at least two
   discriminators, so adding a confusable blueprint fails CI.
3. **A confusion-matrix test** over the recorded stroke fixture corpus. Every
   fixture carries its intended blueprint; the suite asserts zero
   misclassifications and tracks the rejection rate. This is the single most
   valuable test in the project under the inference design.
4. **Show the player what was read.** The creation VFX names the recognized
   blueprint as it resolves, so a misread is visible immediately rather than
   discovered in a fight.
5. **Tune the floor conservatively.** Prefer a higher rejection rate over any
   misclassification rate. Honest failures are recoverable; misreads are not.

### R-02 — Server-authoritative melee latency

`CLAUDE.md` §7 forbids trusting "I hit this player". Correct, but melee is the
hardest case: at 60–150 ms RTT, a player who sees their blade pass through an
enemy and gets no hit will call the game broken.

*Mitigation:* server-side lag compensation with bounded rewind. The server keeps
~1 second of per-player transform history; on an attack intent it rewinds other
players to the attacker's acknowledged server tick (clamped to a maximum rewind,
e.g. 200 ms) and performs the hit test there. The client plays the swing
animation and impact VFX immediately but applies **no** damage, health change,
or death locally. This is the standard solution and it is well understood, but
it must be designed in from the start — it cannot be bolted on.

### R-03 — Player-drawn geometry versus client prediction

This risk is specific to CHALKBOUND and is the most under-appreciated one in the
design.

Walls and bridges are *collision-bearing geometry created by players at
runtime*. Client-side movement prediction requires client and server to simulate
against the same collision world. If a client predicts movement against a wall
the server has not yet spawned (or the reverse), the player rubber-bands through
solid geometry — or worse, falls through a bridge mid-crossing.

*Mitigation:* drawn objects become collidable **only on server confirmation**.
Between submission and confirmation the client renders a translucent,
non-colliding "pending" ghost. The server stamps each spawned object with the
tick it became solid; clients replaying predicted input across that tick include
it. Accept a one-round-trip delay (~50–100 ms) between releasing the stroke and
the object becoming solid, and hide it behind the glow/particle VFX from §9 —
which conveniently occupies exactly that window. The spec's own UX sequence
gives us the latency mask for free.

### R-04 — Asset pipeline as a time sink

No art assets exist. The modular school is the largest content cost in the MVP,
and the AI-generation → Blender → GLB pipeline is unproven. There is a real risk
of spending weeks on asset tooling before knowing whether drawing a sword is
fun.

*Mitigation:* Phases 0–5 use primitive greybox geometry only (boxes, planes,
capsules) with no imported assets. Establish the *architecture* of the pipeline
now (directory layout, naming, metadata schema, export contract) and build the
*tooling* only at Phase 6. `CLAUDE.md` §21–22 already mandates this priority; this
records the specific trap.

### R-05 — Draw-call and texture budget

A modular environment built from many small meshes is the classic way to produce
2,000+ draw calls and miss 60 FPS.

*Mitigation:* a hard budget, measured from Phase 6 onward — under 600 draw
calls, under 400 MB texture memory, under 1.5 M triangles visible. Enforced by
instancing repeated modules (`InstancedMesh`), merging static geometry per room,
baking static lighting to lightmaps in Blender, limiting realtime lights to 2–3,
and room-based occlusion culling. The school's room-and-corridor layout is
naturally suited to a hand-authored cell-and-portal scheme.

### R-06 — Rapier WASM cost

The bundler-friendly `-compat` Rapier build base64-embeds its WASM, roughly
doubling that module's transfer size (order 1–2 MB). Two physics worlds exist in
development (client prediction and server authority), and in a local
single-process test both run in the same machine's memory.

*Mitigation:* lazy-load physics after first paint behind a loading screen; use
the non-compat build on the server where bundler constraints do not apply;
measure WASM memory explicitly at Phase 0 and record the number.

### R-07 — Drawing automation

Server re-validation guarantees submitted strokes are geometrically valid. It
cannot prove a human drew them.

*Mitigation for MVP:* timing constraints (minimum total duration, maximum
point-to-point velocity), a jitter/entropy floor (human strokes carry micro-noise
that replayed splines do not), and per-player rate limits. Accept residual risk:
CHALKBOUND is a PvPvE survival game, not a ranked competitive title. Document
and revisit if it becomes a real problem.

### R-08 — Physics determinism

Rapier's standard builds are locally deterministic but explicitly **not**
cross-platform deterministic. A `-deterministic` build exists but is less
optimized. Any netcode design that assumes client and server physics produce
bit-identical results will drift.

*Mitigation:* do not build netcode on physics determinism. Use a kinematic
character controller with server authority and client prediction on the
*character only*, shape-cast melee rather than rigid-body collision resolution,
and server-owned-with-interpolation for everything else. Determinism then stops
being load-bearing, which also means the fast Rapier build is usable.

### R-09 — Browser memory ceiling

A browser tab has a practical working set of roughly 2–4 GB, and WASM heap,
GPU-side textures, geometry, and audio buffers all compete.

*Mitigation:* the Phase 6 asset budget above; KTX2 supercompressed textures that
stay compressed in GPU memory; stream nothing until it is proven necessary.

### R-10 — WebGL2 vs WebGPU

WebGPU is widely available but its Three.js backend still changes faster than
the WebGL2 one, and support is not universal.

*Mitigation:* target WebGL2 for the MVP. A low-poly, lightmapped school interior
reaches 60 FPS comfortably on WebGL2. Keep WebGPU behind a feature flag and
revisit at Phase 10.

---

## 4. Recommended decisions

One proposal per missing decision. Simplest reasonable solution in each case.
**None of these are implemented. All await approval.**

### RD-01 (MD-01) — **SUPERSEDED BY APPROVED DECISION: inference**

The original recommendation here was pre-selection via radial quick-select. The
approved design is **inference**: the player draws freely and the sketch
determines the object. This section now records what inference requires.

Three consequences follow, and all three are now specified in `SPEC.md`:

**1. A three-stage validator — classify, reject, grade.**
Selection needed only a grader. Inference needs classification first, then an
explicit ambiguity check, then grading of the winner. See ARCHITECTURE §6.

**2. Ambiguity rejection is mandatory, not optional.**
If the best-matching blueprint scores below a recognition floor, or the top two
candidates score within a margin of each other, the system must return
**unrecognized** rather than pick one.

This is the single most important design rule that inference introduces.
Handing a player the wrong object is much worse than handing them nothing: a
failed sketch is the player's fault and teaches them the shape, whereas a
*misread* sketch is the game's fault and teaches them the game is unreliable.
One misread sword-into-wall at a critical moment does more damage to trust than
ten honest failures. **When in doubt, refuse.**

**3. Blueprint shapes become a design constraint, permanently.**
With no pre-selection, two similar shapes will be confused, and the confusion
lands on the player rather than on the developer. `SPEC.md` §6.3 therefore
requires every blueprint to differ from every other on at least two
discriminators (stroke count, intersection, closure, aspect, orientation), and
makes that check part of the definition of done for every new blueprint.

The MVP set was chosen to satisfy this with room to spare:

| Blueprint | Strokes | Intersects | Closed | Aspect |
|---|---|---|---|---|
| Sword | 2 | **yes** | no | tall |
| Wall | **1** | no | **yes** | wide |
| Bridge | 2 | no | no | wide |

Sword and bridge share a stroke count but differ on intersection *and* aspect.
Wall differs from both on stroke count *and* closure. Classification among these
three is near-deterministic on those discriminators alone, before template
distance is even consulted.

**Residual cost of the decision.** Chalk cost cannot be known until the sketch
is classified, which means a player can begin a sketch they cannot afford. See
RD-02/RD-03 for how that is handled, and R-11 for the new risk inference adds.
These are real costs, and they are worth paying: drawing freely and watching the
sketch become a weapon is the game's signature moment, and a menu in front of it
would spend that moment on administration.

### RD-02 / RD-03 (MD-02, MD-03) — Placeholder economy, pessimistic debit

Starting values to be tuned, all defined in one `shared/config/economy.ts`:

| Value | Proposal |
|---|---|
| Chalk is | a continuous integer meter, 0–100 |
| Chalk per pickup | 25 |
| Sword cost | 20 |
| Wall cost | 15 |
| Bridge cost | 25 |
| Recognized but smudged | 25% of that blueprint's cost, rounded up |
| **Unrecognized** | **flat 5** |
| **Recognized but unaffordable** | **flat 5, nothing created** |
| Max carried | 100 |

*Debit ordering, revised for inference:* the server **classifies first, then
grades, then debits.** Cost is a property of the blueprint that was recognized,
so it cannot be known before classification. This keeps the server the sole
arithmetic authority with no optimistic-debit-then-refund race.

*Why 25% on a smudge:* zero makes drawing a free practice range and removes
risk; full cost makes learning the mechanic punishing enough that players avoid
the game's central verb. A partial penalty keeps tension while letting players
learn.

*Why only a flat 5 when unrecognized:* the player drew something; the system
could not read it. Charging a full blueprint cost for the *system's* uncertainty
would read as theft, and it would also punish players for the ambiguity-rejection
behaviour that exists to protect them. A smudge of wasted chalk is honest. This
row exists only because of the inference decision.

*The unaffordable case* is likewise a consequence of inference — cost is unknown
until classification, so a player can start a sketch they cannot pay for. The
Codex's affordability markers (`SPEC.md` §6.4) exist to prevent it, and the
penalty is held at the smudge cost because the mistake is partly the game's for
allowing it.

### RD-04 (MD-04) — Placeholder combat numbers

Player health 100. Sword damage 35 (three hits to kill). Swing 120 ms windup /
80 ms active / 250 ms recovery. Reach 2.2 m. Stamina 100, 20 per swing,
15/second regeneration after a 1 s delay. No blocking in MVP. Sword has 20 hits
of durability, then shatters.

*Why durability:* it keeps chalk flowing through the loop rather than making a
sword a one-time purchase, and it gives the create-risk-lose cycle a heartbeat.

### RD-05 (MD-05) — Placeholder match structure

12-minute match. 4 players. No respawn — death ends your match. Two extraction
zones, both known from match start, both active from the 4-minute mark. 8-second
hold to extract, interrupted by taking damage. No shrinking play area for MVP;
the match timer is the only pressure.

*Why both zones known and no shrink:* the simplest structure that still produces
extraction-lite tension (a known contested destination), with the fewest systems
to build.

### RD-06 (MD-06) — Persistence: yes, but last

Build the MVP with **no database** through Phase 9. The server holds match state
in memory; extraction reports a result summary and discards it.

At Phase 9 completion, add the smallest possible persistent stash: **SQLite via
`better-sqlite3`**, one process, one file, two tables (`player`, `stash_item`).
No ORM, and no migrations framework until a second schema change actually
arrives.

*Why:* the prompt is right that infrastructure should not be added
speculatively, but extraction without stakes is not the game described in the
design. The resolution is ordering, not omission — build the loop first, then add
the smallest thing that makes extraction *mean* something at the end of Phase 9.
SQLite is a single file dependency, not infrastructure.

*If the answer is "no persistence at all for MVP":* extraction must be given
in-match stakes instead (e.g. extracting converts carried chalk into a match
score with a leaderboard). Flagged because shipping extraction with no
consequence either way would make the pillar read as broken.

### RD-07 (MD-07) — Drawn objects are world objects

Drawn objects belong to the **world**, not the player. They persist after the
drawer dies or extracts, until match end. Any player can walk on any bridge and
is blocked by any wall. Walls and bridges have health and can be destroyed by
sword hits (wall 60 HP, bridge 40 HP). Swords are inventory items and leave with
their owner.

*Why:* this is where the emergent PvPvE play lives — contesting, reusing, and
destroying each other's constructions. Ownership-locked objects would remove
most of the interesting interactions for no implementation saving.

### RD-08 (MD-08) — Stay in pointer lock, use a virtual cursor

Entering draw mode keeps pointer lock engaged. Camera rotation freezes. Raw
mouse deltas drive a virtual 2D cursor on the chalk plane, which sits at a fixed
1.2 m in front of the camera. The chalk plane fades in over ~150 ms while the
FPP hand raises the chalk. Releasing the draw input returns deltas to camera
control.

*Why:* exiting pointer lock mid-combat is unacceptable — the OS cursor warps to
screen centre, the camera jumps, and browsers may require a fresh user gesture
to re-acquire lock, which can strand the player. Keeping lock also keeps the
interaction *physical* as §9 demands, rather than feeling like a mouse-driven
overlay. Cursor sensitivity must be independently configurable from camera
sensitivity.

### RD-09 (MD-09) — The Erased, minimum viable

One archetype. 70 HP, damage 25, movement 3.2 m/s (slower than a sprinting
player, faster than a walking one). Detection by line of sight within 18 m plus
a sound radius triggered by sprinting and by drawing. Hostile to players only,
never to each other. Spawns at fixed points, 6 per match. Drops 15 chalk on
death. Does not interact with drawn objects in MVP, and is blocked by walls like
a player.

*Why so plain:* The Erased exists in the MVP to make the world dangerous and to
be a chalk source, not to carry the game. A single readable threat is worth more
than a roster of half-built ones.

### RD-10 (MD-10) — Browser matrix

Target the current and previous major versions of Chrome, Edge, and Firefox on
desktop. Safari best-effort, not a release gate for MVP. Hard requirements:
WebGL2, WebAssembly, Pointer Lock API, Web Audio API, and KTX2/Basis support via
transcoder.

*Why Safari is not a gate:* desktop Safari's share of a desktop web game
audience is small, and its historical WebGL2 and Web Audio quirks would consume
disproportionate effort during MVP.

### RD-11 (MD-11) — Inventory: six slots, non-pausing

Six equipment slots. Chalk is a separate meter, not a slot. Drawn weapons and
loot occupy slots. No weight system. Opening inventory does **not** pause and
does not stop the world — the player is vulnerable while it is open, and the
third-person body shown there is a deliberate vulnerability cue, consistent with
§10's allowance.

### RD-12 (MD-12) — Asset provenance recorded per asset

Every asset carries a sidecar metadata file naming its source, generation tool
and prompt (if generated), licence, and processing date. Enforced by the export
script rather than by convention. Specified in `docs/ASSET_PIPELINE.md`.

### RD-13 (MD-13) — Single Node process, containerized

One Node process hosting both the game server and the static client build,
behind a reverse proxy terminating TLS. One container, one region for MVP. This
supports the 2–4 player target with substantial headroom and defers all
distributed-systems questions until the 8–16 player goal is real.

### RD-14 (MD-14) — Timing and entropy checks, accept residual risk

Implement the minimum-duration, maximum-velocity, and jitter-floor checks
described in R-07 as ordinary validator constraints. Do not build a
cheat-detection system for MVP.

---

## 5. Proposed deviations from the initialization prompt

Per `CLAUDE.md` §17 and prompt §16, any difference from the stated design is
recorded in full rather than applied silently.

### D-01 — Introduce the authoritative loop structure at Phase 0, not Phase 8 — **APPROVED 2026-10-07**

**Original design.** The prompt's phase list places multiplayer at Phase 8,
after player movement, chalk, drawing, creation, combat, environment, and PvE
are complete.

**Technical problem.** Phases 1–7 built as single-player code are built as
client-authoritative code: the client owns health, chalk, inventory, hit
detection, and object spawning, because there is nothing else to own them. Phase
8 would then require rewriting every one of those systems to move state
ownership to the server, re-deriving the client half as prediction, and
retrofitting lag compensation into combat written assuming instant local hits.
This is the most common way projects of this shape fail, and it directly
contradicts `CLAUDE.md` §6 and §7, which forbid client-authoritative gameplay as a
standing rule rather than an eventual goal.

**Proposed change.** Keep the phase *order* and *deliverables* exactly as
specified. Change only the structure underneath: from Phase 0, the authoritative
simulation lives in `packages/shared` as a fixed-step module, and the client
talks to it through a `Transport` interface. Phases 1–7 run against a
`LoopbackTransport` that calls the simulation in-process with zero latency —
single-player in practice, correctly structured in fact. Phase 8 then replaces
`LoopbackTransport` with `WebSocketTransport` and adds interpolation,
reconciliation, and lag compensation.

**Reason.** The cost is a modest amount of indirection in Phase 0, paid once.
The benefit is that no gameplay system is ever written client-authoritative, so
Phase 8 becomes an integration task instead of a rewrite. A loopback transport
also gives a latency simulator for free, so artificial lag can be tested from
Phase 1.

**Impact.** Phase 0 grows by roughly one to two days. Phases 1–7 are marginally
more disciplined to write (intent in, state out). Phase 8 shrinks substantially
and becomes far lower risk. No change to any design pillar, and no change to
what the player sees at the end of any phase.

### D-02 — Pull a thin slice of audio and VFX forward from Phase 10 — **APPROVED 2026-10-07**

**Original design.** Audio and VFX are Phase 10 (Polish).

**Technical problem.** `CLAUDE.md` §9 defines the drawing experience as a sequence
in which scratch audio, chalk particles, and the drawing's glow are
load-bearing: they are the feedback that tells the player the stroke registered,
and — per R-03 — the glow window is exactly what hides the server confirmation
round-trip. Evaluating whether drawing feels good at Phase 3 is not possible in
silence with no particles.

**Proposed change.** Move three specific items into Phase 3: chalk scratch loop
audio, a chalk dust particle emitter at the cursor, and the stroke glow shader.
Phase 10 keeps everything else.

**Reason.** These are not polish for this mechanic; they are the mechanic's
feedback channel. Without them the Phase 3 "does this feel good" gate cannot be
judged, and a wrong answer there invalidates later phases.

**Impact.** Phase 3 grows by roughly two days. Phase 10 shrinks accordingly. No
change to design or scope.

---

## 6. Open questions requiring a decision before implementation

### Resolved — 2026-10-07

| # | Question | Decision |
|---|---|---|
| 1 | Swapped `SPEC.md` / `CLAUDE.md` contents; no design spec | **Yes.** Instructions copied to `CLAUDE.md`; `SPEC.md` replaced with a v0.1 draft design spec awaiting review. |
| 2 | Pre-selected or inferred blueprints | **Inferred.** Players draw a sketch and it becomes the object. See the rewritten RD-01, new risk R-11, and `SPEC.md` §6.2–6.3. |
| 5 | Deviations D-01 and D-02 | **Approved.** Both now reflected in `docs/ROADMAP.md`. |

### Still open

| # | Question | Needed by |
|---|---|---|
| 3 | **MD-06 / RD-06** — is there a persistent stash between matches? If not, what gives extraction its stakes? Options A and B are laid out in `SPEC.md` §13. | Before Phase 9 completes |
| 4 | **Approve, replace, or confirm as provisional** the placeholder numbers in RD-02 through RD-05, collected in one table at `SPEC.md` §17. | During Phase 0 |

Neither blocks Phase 0. Question 4 is best answered by reading the `SPEC.md`
§17 table; question 3 is a design decision about stakes, not an infrastructure
one, and the MVP is built so that either answer remains available.

### New question raised by the inference decision

| # | Question | Needed by |
|---|---|---|
| 6 | **Rejection-rate tolerance.** Ambiguity rejection trades misclassifications for honest failures. What rejection rate is acceptable for a competent player — 1 in 20 sketches? 1 in 50? This sets the recognition floor and the ambiguity margin. A number is not needed to start Phase 3, but one is needed to finish it, and it is best answered by playing the slice rather than in the abstract. | End of Phase 3 |
