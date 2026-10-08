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

*Measured (Rapier 0.19.3 — see D-03 g — 2026-10-07):*

| Where | Measurement |
|---|---|
| Client chunk | `rapier` lazy chunk 2.23 MB raw / **0.84 MB gzip**, kept out of the initial bundle (main chunk 138 KB gzip). 0.21.0 was 1.67 MB gzip |
| Client load | Ready 560–740 ms after first paint (headless Chrome, local dev server; measured on 0.21.0) |
| Server (Node 24) | `init()` 23 ms, **+1.5 MB** ArrayBuffer (WASM linear memory), +4.9 MB RSS incl. module parse |
| Greybox world | 15 static colliders, ~2 MB additional RSS |

The browser does not expose Rapier's WASM heap (the compat build's `init()`
returns no memory handle), so the client overlay shows JS heap (Chrome only)
and the server log carries the WASM figure. See D-03 for the server build
change.

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

### D-03 — Phase 0 implementation deviations from ARCHITECTURE.md — **PENDING APPROVAL**

None of these touch a design pillar. They are recorded because the code now
differs from `docs/ARCHITECTURE.md` and must not drift silently (`CLAUDE.md` §17).

| # | Original design | Technical problem | Change made | Impact |
|---|---|---|---|---|
| a | Server uses `@dimforge/rapier3d` (§1.2) | That build is bundler-only: no `main`/`exports`, extensionless internal imports. It fails to load in plain Node 24, with or without `--experimental-wasm-modules`. | Server uses `@dimforge/rapier3d-compat`, same as the client | +~1 MB server install, irrelevant at runtime. **Benefit:** `packages/shared` can type against one Rapier API, which Phase 1's shared `stepPlayer()` needs |
| b | `colyseus` package (§1.3) | The meta-package pulls in `@colyseus/redis-presence` and `redis-driver` | Depend on `@colyseus/core` + `@colyseus/ws-transport` directly | Same API, no Redis dependencies |
| c | Colyseus 0.16.x (§1.3) | Followed as written; 0.18.x is now current | Pinned `~0.16.26` | Decide before Phase 8 whether to move to 0.18 |
| d | Transport implementations in `apps/client/src/net/` (§2) | `LoopbackTransport` is needed by shared tests and by both ends of the loop | `Transport` + `LoopbackTransport` in `packages/shared/src/net/`; `SimulationHost` (loopback socket layer) in `shared/sim/`. WebSocket transport will still live in the client | Layout only |
| e | Overlay shows "WASM heap" (§9) | Not observable in the browser (see R-06) | Overlay shows JS heap; WASM measured on the server | Overlay content only |
| f | TypeScript (latest) | TS 7.0 is current, but `typescript-eslint` supports < 6.1 | Pinned TypeScript `~6.0` | Revisit when typescript-eslint supports TS 7 |
| g | Rapier latest (0.21.0) | Rapier 0.20/0.21's character controller regressed. In a 1200-tick probe on a flat box floor it snagged on **462/1200** steps (horizontal movement cut to millimetres) and sank up to 14 cm below the floor even with zero vertical input. 0.14.0 and 0.19.3: **1/1200** snags, no sinking at zero vertical input | Pinned `@dimforge/rapier3d-compat` `~0.19.3` on client, server and shared. Separately, all versions sink if a grounded controller is fed gravity every tick, so `stepPlayer()` requests no downward motion while grounded (see `shared/sim/stepPlayer.ts`) | Lazy chunk halves (1.67 → 0.84 MB gzip). Re-test the probe before any upgrade |

### D-04 — Phase 1 implementation decisions — **PENDING APPROVAL**

Choices made while building Phase 1 that `docs/ARCHITECTURE.md` does not spell
out, or where the code differs from it. None changes a design pillar.

| # | Topic | Decision | Reason |
|---|---|---|---|
| a | Authority stepping | Each player advances by exactly one `stepPlayer()` per applied command (up to `maxInputsPerTick`); a player without a pending command does not move that tick | Makes client replay exact: the same commands give the same states on both sides |
| b | Float precision | `stepPlayer()` rounds its output state to float32, the precision snapshots carry | Without it, the client replayed from f32 snapshots while the authority continued in f64; near collisions the drift exceeded tolerance and caused repeat corrections (24 vs 11 in a test). With it, a correction puts the client on the authority's exact trajectory |
| c | Predicted command | The client predicts with `quantizeInputCommand()` (the command as the authority decodes it), never the raw input | Raw yaw/axes differ from their u16/i8 encodings; predicting raw values diverges every tick |
| d | Grounded movement | While grounded, `stepPlayer()` requests no downward motion and settles any gap to exactly the skin width with a shape cast; wall slowdown only from contacts on the capsule's side | Rapier's controller sinks when fed gravity every grounded tick, and capsule-box contacts report occasional spurious tilted normals (see D-03 g) |
| e | Player-player collision | Players are in their own collision group and movement queries ignore other players | Avoids spawn shoving and keeps prediction independent of unpredicted remote players. Body blocking needs a Phase 8 decision |
| f | Snapshot contents | The receiving player's full `PlayerState` (position, velocity, flags, stamina; 42 bytes, ~1.2 KB/s at 30 Hz) | Everything `stepPlayer()` reads must be restorable for replay |
| g | Hands rendering | A separate scene and camera rendered after the world over a cleared depth buffer, rather than a layer of the world scene (§4.1) | Same effect (own FOV and near plane, never clips) with no layer bookkeeping; viewmodel lighting is independent |
| h | Pointer lock | A pause menu shows whenever the lock is not held; the match keeps running. Mouse sensitivity is a pause-menu slider stored in `localStorage` | Multiplayer cannot pause; sensitivity is a per-player preference, not gameplay state |
| i | Spawn point | Greybox spawn moved into the aisle between desk columns | The original spawn faced a desk 0.3 m away |

**Placeholder numbers introduced** (all marked `[PLACEHOLDER]` in code, to tune
at the feel check): walk 2.8 m/s, sprint 5.2 m/s (forward only), crouch
1.4 m/s, jump apex 1.0 m (`shared/config/movement.ts`); sprint drain 12/s,
jump cost 10, sprint start minimum 15 (`shared/config/stamina.ts`). Stamina
max, regen rate and delay are from SPEC.md §17. Camera bob, FOV and hand
pose values are in `apps/client/src/config/client.ts`.

### D-05 — Phase 2 implementation decisions — **PENDING APPROVAL**

| # | Topic | Decision | Reason |
|---|---|---|---|
| a | Interact reach | 2 m from the player's **eyes** to the object's centre, checked by the authority on every intent [PLACEHOLDER] | Eye-based reach makes crouching to reach floor boxes natural. Standing and crouching eye heights moved to shared `MOVEMENT` so client and server cannot disagree |
| b | Pickup with a nearly full meter | Take what fits; the box keeps the rest and disappears only at 0 | No chalk is ever silently destroyed (pillar 2, scarcity) |
| c | Respawn | Chalk boxes do not respawn within a match | Simplest; respawn is a level-design lever to revisit with the School map |
| d | Line of sight | Not checked yet | The greybox is one room. **Must be added in Phase 6**, or boxes can be taken through walls |
| e | Box state on the wire | Every snapshot lists every box (3 bytes each) | Loss-tolerant and trivial at 3 boxes; per-client interest filtering is a Phase 8 item |
| f | Snapshot ordering | The client keeps the snapshot with the highest **server tick**, not the highest acked seq | An idle player's snapshots share one seq; ordering by seq let a late snapshot overwrite newer chalk/box state (bug found and fixed in T4) |
| g | Targeting | The client prompt targets the box nearest the screen centre within reach and a 12° cone, measured from the predicted eye; the authority re-validates | The prompt never offers what the server will refuse |
| h | Chalk boxes as colliders | Not colliders; players walk through them | Small props; avoids snagging. Revisit with real art |
| i | Crosshair | A small centre dot was added to the HUD | Aiming at objects needs a reference point; SPEC §15 lists only the meter, health, etc. |

The inventory model (6 slots, per-item stack limits) exists in `shared/sim/inventory.ts`
with no UI and no real items; the sword (Phase 4) is its first user.

---

### D-06 — Phase 3 constraint-library decisions (T2) — **PENDING APPROVAL**

| # | Topic | Decision | Reason |
|---|---|---|---|
| a | Crossing position | `Intersection`'s `at` band is measured from a stroke's **low end** — smaller y, ties broken by smaller x — not from the point the player drew first | Draw order is not part of a shape (plan decision 7), but orientation is. The hilt end of a vertical blade is at 0 whichever way it was drawn, so `[0.1, 0.4]` means "crosses low on the blade" and an upside-down sword still fails. ARCHITECTURE §6.6's example band was written under the opposite assumption and has been corrected |
| b | Undirected everywhere | Angles fold into `[-pi/2, pi/2)`; `EndpointProximity` takes the closest of all four endpoint pairings; `TemplateDistance` matches each stroke in whichever direction fits better | One rule, applied consistently: a stroke drawn backwards is the same stroke |
| c | Dominant angle | Principal axis from second moments, not the endpoint chord | A wobbly stroke still reports the orientation a player would read off it. **Caveat for T3:** the axis of an isotropic shape (a circle) is numerically arbitrary, so soft scoring must not weight angle agreement for round blueprints |
| d | Pass flag | A constraint passes exactly when its score is above zero; the score's zero point *is* the structural limit | Keeps ARCHITECTURE §6.4's two gates meaningful without a second threshold per constraint: the flag is structural, `minAccuracy` is quality |
| e | Band shape | A value scores 1 across the inner 50% of its tolerance band and ramps to 0 at the edges, which are exclusive [PLACEHOLDER] | A drawing well inside tolerance should not lose accuracy for being off-centre |
| f | Ratio bands | `RelativeLength` and `AspectRatio` score in log space | A band like `[0.25, 0.55]` is symmetric about its geometric centre, so being half as long is penalised like being twice as long |
| g | Closure | Measured as endpoint gap over the stroke's own path length, not an absolute distance | Scale-free: a small circle and a large one read the same, and a short stroke is not called closed just for being short |
| h | `HumanLikeness` | Scored 1 or 0, never graded, and deliberately lenient: fails only on non-advancing time, a cursor above 15 m/s, or inter-sample speed variation under 0.08 | A steady hand is not a defect. Wrongly calling a real player a machine is far worse than letting a script through in a game with no competitive economy. It uses timing irregularity rather than path wobble precisely so it cannot punish accurate drawing |
| i | Degenerate input | Every constraint returns a `missing-stroke` failure rather than throwing when a referenced stroke is absent | The authority runs these on attacker-controlled input (T5); a throw would be a denial of service |

---

### D-07 — Phase 3 classifier and validator decisions (T3) — **PENDING APPROVAL**

| # | Topic | Decision | Reason |
|---|---|---|---|
| a | Gates do not grade | `Timing` and `HumanLikeness` are marked `gate`: they must pass, but they are excluded from the accuracy mean. `Timing` was also changed from a graded band to a flat pass/fail | Found by probing the corpus: with two always-1 checks in an eight-term mean, **every** clean sketch graded `keen` and SPEC §6.5's bands were dead. With gates removed from the mean the corpus now spans crude, sound and keen. Taking care over a sketch is care, not inaccuracy |
| b | Blueprints carry a `reference` shape | New `BlueprintTemplate.reference` field: the ideal shape, stroke by stroke, in Codex order | One source for three users — the classifier's template distance, the `TemplateDistance` constraint, and the Codex diagram (T9) — so the taught shape and the graded shape cannot drift apart |
| c | Stroke order is part of the shape | Constraints and the soft score compare stroke *k* to stroke *k*; no permutation matching | SPEC §6.4 already has the Codex teach stroke order, so it is something the player knows. Matching permutations would cost more and recognise shapes the Codex never taught |
| d | Soft score | `0.6 ×` template agreement `+ 0.15 ×` aspect class `+ 0.25 ×` orientation [PLACEHOLDER] | Template agreement dominates because it is the only one of the three that sees the whole shape; aspect and orientation are cheap tie-breakers that the hard filter does not already cover |
| e | Affordability is checked last | A badly drawn sword from a player with no chalk is `smudged`, not `unaffordable` | Being told the drawing was bad teaches the shape; being told only "you are broke" hides the real problem. Both cost the same (SPEC §6.6), so nothing is lost |
| f | A smudge without a named failure | A sketch can pass every constraint and still miss `minAccuracy`, producing `smudged` with an empty `failures` list | Correct per ARCHITECTURE §6.4's two gates, but **T7 must have a fallback message** for it — "it didn't hold together" rather than naming a part |
| g | An upside-down sword is a smudge, not a refusal | A guard crossing high on the blade clears the hard filter and the floor, then fails the intersection band | It *is* a sword, drawn wrong, and SPEC §15 wants the specific message. Refusing it would teach the player nothing |
| h | Corpus | Synthetic and seeded, with a hand model whose wobble is low-frequency and whose **timing** is noisy | A real hand drifts, it does not vibrate. Modelling it the other way round produces sketches that fail `Straightness` and pass `HumanLikeness` for exactly the wrong reasons |

**Known gap.** Every fixture is synthetic. The corpus proves the system refuses
what it cannot read and never misreads, but it cannot prove the floor and the
margin are set where a *person* would want them. Vertical-slice criterion 4 (a
human passes 9 of 10) stays open until there is a client to draw on, and the
human-recorded fixtures land with it in T6–T7.

---

### D-08 — Phase 3 wire-format decisions (T4) — **PENDING APPROVAL**

| # | Topic | Decision | Reason |
|---|---|---|---|
| a | Byte I/O extracted | `Writer`/`Reader`/`ProtocolError` moved out of `protocol/codec.ts` into `protocol/bytes.ts`, and `Writer` now grows on demand | The sketch format is variable-length, so it cannot be measured before it is written. `codec.ts` re-exports `ProtocolError`, so no caller changed |
| b | Coordinate precision | int16 multiples of 0.5 mm, clamped to ±0.5 m [PLACEHOLDER] | Half a step is 0.25 mm on a plane 800 mm across — far below any constraint's tolerance, and coarse enough that consecutive samples fit in one delta byte. A sword is 140 bytes for 44 samples |
| c | Durations are derived, never sent | `quantizeSketch()` and the decoder both recompute `Stroke.durationMs` and `Sketch.durationMs` from the points | The two fields can contradict the points they summarize. Deriving them costs nothing and removes a field a hostile client could lie in |
| d | `quantizeSketch()` clamps but does not enforce limits | Out-of-plane coordinates are clamped; too many strokes or points is an *encode* error | It is a projection the client grades against, so it must always produce something. Over-limit sketches are the recorder's bug (T6) and fail loudly at the boundary |
| e | Timing is per-stroke and monotonic | Each stroke's first timestamp is an absolute varint; later samples are varint deltas, and a delta that runs backwards is rejected | Works whether the recorder timestamps relative to the stroke or to the sketch, and the round trip is exact either way |
| f | Only failure **codes** travel | `DrawingResult` carries `FailureCode[]`, not `ConstraintFailure[]`: the constraint's instance `kind` and English `detail` stay server-side | Player-facing wording is T7's job. Shipping copy from the authority would put the same sentence in two places and let them drift |
| g | Accuracy travels as float32 | Not quantized to a byte | ~7 significant digits for a message sent at most once per drawing. A byte would make accuracy near a quality boundary read inconsistently while tuning |
| h | Enum tables are keyed by their union | `Record<BlueprintId, number>`, `Record<FailureCode, number>`, and so on | Adding a blueprint or a failure code is a type error until it has a wire value, so a new case cannot silently fail to encode |
| i | `ServerMessage` is no longer uniformly tick-stamped | `NetClient` now advances its clock only from messages that carry `serverTick` | A drawing result answers a request; it does not report the clock. Found by the compiler when the variant was added |

**Known gap.** The ~100–150 byte target assumes roughly 40–50 samples. The T6
recorder's sampling rate and minimum-distance filter decide the real number;
the corpus already spans 88–352 bytes, and the limits in `DRAWING.wire` cap
the worst case rather than the typical one.

---

### D-09 — Phase 3 authority decisions (T5) — **PENDING APPROVAL**

| # | Topic | Decision | Reason |
|---|---|---|---|
| a | A refusal is not an outcome | `submitDrawing()` returns `{kind:'resolved', result}` or `{kind:'refused', reason}`, and the host sends nothing on a refusal | `unknown-player`, `no-chalk` and `rate-limited` are the authority declining to answer, not verdicts on the sketch. Keeping them in a separate branch means a caller cannot send one to the client by mistake |
| b | Rate limiting counts ticks, not wall-clock | 500 ms becomes 30 ticks at 60 Hz; the stamp is the simulation tick | The simulation holds no wall-clock and must stay deterministic and replayable. `Date.now()` in the authority would break both |
| c | Only an accepted submission moves the window | A refused submission leaves `lastDrawingTick` alone | Otherwise a client flooding the authority would keep extending its own lockout past the honest 500 ms, turning a fairness limit into a punishment |
| d | The authority quantizes before grading | `submitDrawing()` runs `quantizeSketch()` even though a submission off the wire is already quantized | Idempotent, so it costs nothing on the wire path, and it means a direct caller (a probe, a test, a future local authority) is graded on the same numbers as a remote one |
| e | An absent hint is a claim | A sketch the authority recognized and the client sent no hint for counts as a disagreement | Per plan T7 the client always runs its own validator, so no hint means "I could not read it either". Treating absence as "no opinion" would hide exactly the drift the counter exists to catch |
| f | Hint disagreements are counted, not logged | `hintDisagreements` and `lastHintDisagreement` on the simulation; no `console` call | `shared` runs in the client bundle and has no logger. The counter carries what a log line would, and surfacing it belongs to whichever app holds the authority |
| g | The result is sent reliably | `drawingResult` is the first reliable server message; `SimulationHost.send()` gained a reliability parameter, still defaulting to unreliable | A lost verdict leaves the player's chalk spent with nothing on screen to explain it. Snapshots stay unreliable because the next one supersedes them; a verdict has no successor |
| h | Cost lives beside the result, not in the simulation | `chalkCostOf()` / `chalkDebitFor()` in `drawing/result.ts`, reading `BlueprintTemplate.chalkCost` | T7's client previews the same number, and the blueprint is the one place a cost should be written down |

---

### D-10 — Phase 3 client draw-mode decisions (T6) — **PENDING APPROVAL**

| # | Topic | Decision | Reason |
|---|---|---|---|
| a | Suppression is one shared function | `applyDrawMode(command)` zeroes movement and masks Jump, Sprint and Attack; `stepPlayer` calls it first, so client prediction and the authority read the identical command | Two copies that disagreed would rubber-band the player every time anyone drew. It also means combat (Phase 5) gets the rule for free by reading the masked buttons |
| b | Crouch and Interact survive | Only Jump, Sprint and Attack are masked | Drawing occupies the hands, not the knees, and letting a player crouch behind cover while sketching is the kind of choice the risk pillar wants |
| c | `jumpHeld` tracks the **raw** button | The returned state records the unmasked Jump bit | Otherwise a jump held through a drawing re-arms the edge trigger, and lowering the chalk fires a jump nobody asked for |
| d | Look is never suppressed | Yaw and pitch pass through the authority untouched; the *client* stops feeding the camera instead | The authority has no business overriding where a player is looking, and freezing the camera is a view concern |
| e | Entry is edge-triggered | Draw mode starts only on a fresh press, never by holding the button through a refusal | Holding RMB with an empty meter and having the plane appear the instant a pickup lands is a surprise, and a surprise that costs chalk |
| f | `DrawMode` owns no DOM handle | It takes a frame of booleans and numbers (`pointerLocked`, `chalk`, mouse deltas) and returns an event | It is then *structurally* incapable of releasing pointer lock (RD-08), which is the guarantee the vertical slice names. A test can only show a negative; a type can prevent it |
| g | LMB is both Attack and the stroke button | `Attack` draws while the chalk is up, and the shared rule masks the attack itself | One button, two unambiguous meanings — the chalk is either up or down — and no new binding to teach or rebind |
| h | Unknown chalk blocks drawing | Before the first snapshot `net.chalk` is undefined and draw mode treats it as 0 | Unknown must not mean allowed: raising a plane the player may not be able to pay for teaches the wrong thing |
| i | The plane lives in the viewmodel scene | Rendered with the hands over a cleared depth buffer, not in the world | A conjured plane half-eaten by a doorframe reads as a bug. It also cannot clip when a player draws facing a wall |
| j | The trail is a quad ribbon | Not `THREE.Line` | WebGL ignores line width, and a one-pixel sketch is unreadable at the moment the player most needs to see it |
| k | Cursor speed is its own setting | A second pause-menu slider, stored beside mouse sensitivity, with per-key fallback on load | The speed that aims well is not the speed that draws well. Per-key fallback means one corrupt value does not reset the other |

**Open to the feel pass.** `cursorSensitivity` 0.0012 m/px, `sampleRate` 90 Hz,
`minDistance` 3 mm, `fadeSeconds` 0.15 and the draw hand pose are all
[PLACEHOLDER] first guesses. The ROADMAP budgets 2–3 iterations here and no
test can settle any of them.

---

### D-11 — Phase 3 feedback decisions (T7) — **PENDING APPROVAL**

| # | Topic | Decision | Reason |
|---|---|---|---|
| a | One failure, not a list | A smudge that broke four rules gets one sentence, chosen by a priority order over failure codes | A list reads as the game piling on, and the player can only fix one thing at a time. Structural faults ("the crossguard didn't cross the blade") rank above advice they already have ("keep the line straight") |
| b | Copy is keyed by blueprint *and* code | `failureDetail(blueprintId, code)` names parts from a per-blueprint table — blade, crossguard | This is what makes the message teach the shape instead of describing a constraint. It also confirms D-08 (f): the wire needs no stroke indices, because the code plus the blueprint is enough |
| c | A refusal never names its runner-up | `unrecognized` says "that could have been two different things", never "that was almost a sword", even when `bestCandidate` is set | Naming it invites the player to argue with a refusal that already cost them chalk. The candidate is a diagnostic for us, not a judgement for them |
| d | The local preview reuses the authority's own code | The client runs `validateSketch` on the *quantized* sketch and prices it with `chalkDebitFor` | Both sides then compute from identical numbers, so the instant feedback and the verdict that replaces it agree. The preview removes a round trip from *seeing* the answer, not from the decision |
| e | Verdicts are counted, not diffed | `drawingResultCount` alongside `drawingResult` | Drawing the same shape twice produces two identical results, and the second still deserves to be shown |
| f | Fixtures reach tests by a subpath | `@chalkbound/shared/testing/drawing`, not the package index | Keeps the corpus out of the client bundle (its original reason for being off the index) while letting client tests use the same sketches the authority is tested with |

**Known gap.** The banner is DOM, and this project has no DOM test
environment: the mapping from verdict to words is covered, the rendering of
it is not. Nothing in T7 has been seen on screen.

---

### D-12 — Phase 3 feedback-channel decisions (T8) — **PENDING APPROVAL**

| # | Topic | Decision | Reason |
|---|---|---|---|
| a | The scratch is synthesized | Filtered white noise through a bandpass and a lowpass, built in Web Audio with no asset file | That is physically what a scratch is: broad noise with a resonant peak. It also keeps the first audible phase free of an asset pipeline that does not exist yet |
| b | Silence needs no AudioContext | The node graph is built on the first audible frame, not at load | Browsers refuse to start a context before a user gesture, and building one at load earns a console warning on every page open. A browser that refuses outright degrades to silence rather than throwing into the frame loop |
| c | Gain follows `setTargetAtTime` | Not a per-frame assignment, and the pure curve is smoothed before it reaches the node | Stepping gain once per frame turns a scratch into a buzz |
| d | The scratch needs contact, not motion | `scratchFromSpeed(speed, touching, …)`: a cursor flying across the plane with the chalk lifted is silent | Nothing is scraping. Making it an explicit argument rather than a caller convention means the rule is testable |
| e | Pitch tracks the full speed range, gain only the audible part | Rate interpolates over `0..fullSpeed` while gain starts at `minSpeed` | The chalk already sounds like it is moving by the time it becomes audible, so the sound fades in rather than snapping on at a pitch floor |
| f | Dust emission is rate-based with a carried fraction | `emitRate × (speed / fullSpeed) × dt`, accumulating the remainder across frames, and the remainder is dropped when the chalk lifts | Flooring per frame would silently drop most of the emission at 60 Hz. Dropping the remainder on lift stops a new stroke emitting before it has moved |
| g | Dust lives in a fixed pool, compacted by swap | Dead motes are swapped with the last live one, keeping the live range contiguous | The renderer then uploads one range per frame instead of walking a free list, and order means nothing to dust |
| h | Each mote's fade rides in its vertex colour | Rather than a per-mote material or opacity | Keeps the whole field to one draw call, which matters under the 60 FPS target (CLAUDE.md §14) |
| i | The glow envelope starts at **submission** | Not when the verdict arrives, and its attack plus hold (300 ms) exceeds a realistic 150 ms round trip | This is the mitigation R-03 names: the player sees their sketch light up at once and the confirmation lands inside the glow instead of after a pause. A test asserts the window covers 150 ms |
| j | The glow outlives the plane | The trail's opacity is `max(planeFade, glow)`, and the group stays visible while either is above zero | The sketch should keep burning for a moment after the board has gone, which is what makes the resolve read as the drawing becoming real |

**Not verified.** Audio and particles cannot be tested headlessly: the curves,
the emission rate, the envelope and the buffer writers are covered, and the
node graph, the point cloud and the glow material have never been heard or
seen. T8's own acceptance criteria ask for a manual check, and it is
outstanding — together with the T6 feel pass.

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
