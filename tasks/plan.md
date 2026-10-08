# Phase 4 — Creation: task plan

Source: `docs/ROADMAP.md` Phase 4; `SPEC.md` §6.3 (distinctness), §6.5 (quality),
§6.6 (cost), §6.8 (where the object appears), §7.1–7.4 (the MVP blueprint set);
`docs/ARCHITECTURE.md` §5.3, §5.5 and §6.6; `docs/SPEC_AUDIT.md` R-03, R-11,
RD-07. The Phase 3 plan is in git history (through commit `21380dd`).

Each task ends green (`pnpm typecheck && pnpm lint && pnpm test && pnpm build`)
and is committed separately.

**Scope boundary.** Phase 4 makes a recognized sketch *become a thing*. It does
not make that thing useful in a fight: swinging the sword, dealing damage, and
consuming durability are **Phase 5**. Phase 4 builds the durability and health
*model* and tests the arithmetic directly, through a `damageObject()` entry
point with no combat attached. The Erased (Phase 7) and other players (Phase 8)
are out of scope — drawn objects are world objects, but there is still only one
player to contest them.

**Invariants carried from Phase 3 (unchanged):**
- Recognition is purely geometric; it is never ML or image recognition.
- The client sends strokes. Any `blueprintId` it attaches is a diagnostic hint.
- The authority classifies, then grades, then debits. There is never a refund
  path — which is why placement cannot fail *after* a debit (decision 1 below).
- When classification is uncertain, the result is `unrecognized`, never a guess.

**New invariants, introduced here:**
- A drawn object is collidable on **both** sides only from its `solidFromTick`.
  Before confirmation the client shows a non-colliding ghost (R-03).
- Structures belong to the world, not the drawer (RD-07). Nothing in Phase 4
  may key a structure's behaviour off its owner.
- Accuracy never changes *what* is created, only how good it is (SPEC §6.5).

---

## Decisions not in the spec, chosen here and flagged ([PLACEHOLDER])

These are the Phase 4 judgement calls. They would be recorded as SPEC_AUDIT
**D-15 … D-20** as the tasks land, continuing Phase 3's D-06…D-14.

1. **Placement never fails.** A structure materializes at a transform resolved
   from the player's position and facing (SPEC §6.8). If that transform overlaps
   existing geometry, it is **placed anyway**. The alternative — refusing
   placement — would create a "paid and got nothing" case that the locked
   four-outcome model has no room for and the no-refund rule forbids. The only
   adjustment made is a push-out so a structure never spawns inside the drawer's
   own capsule, which would trap them. Overlapping greybox boxes are ugly and
   harmless; revisit when the real school exists at Phase 6.

2. **Snapshots carry the full drawn-object list**, exactly as they already carry
   every chalk box. This is resync-safe and costs no new reliability machinery,
   at the price of bandwidth that grows with the number of objects. Chalk bounds
   that number in practice. Revisit at Phase 8, where a reliable `objectSpawned`
   delta becomes worth its complexity.

3. **`solidFromTick` is stamped and sent, and the replay rule is an assertion
   rather than a mechanism.** Because a snapshot describes the world at
   `serverTick`, and replay always restarts from that snapshot, every object a
   client knows about is *already* solid for every tick it replays. The
   tick-indexed collider set ARCHITECTURE §5.5 describes is therefore
   unnecessary under this snapshot design — the property it guarantees already
   holds. T7 stamps the tick, sends it, and **asserts the invariant in a test**
   instead of building the mechanism. If the invariant ever fails, the mechanism
   is the fix. This is the one place this plan knowingly implements less than
   ARCHITECTURE describes, and it is flagged for that reason.

4. **The sword equips to a dedicated `equipped` slot**, not into the inventory.
   SPEC §6.8 is explicit that inserting an inventory step between the drawing
   and the holding wastes the signature moment. `sim/inventory.ts` stays as it
   is, unused by the simulation until loot arrives at Phase 9.

5. **Drawing a second sword replaces the first.** One pair of hands, one sword.
   The replaced sword is destroyed, not dropped — dropping needs a world-item
   representation that nothing else in the MVP needs yet.

6. **Quality scales durability and health, not size.** `scaleFromAccuracy` on
   the sword's `SpawnDescriptor` is honoured as a *stat* multiplier, not a mesh
   scale: a keen sword lasts longer and hits slightly harder (SPEC §6.5), but a
   2.2 m reach that varies with handwriting would be a hidden competitive
   variable. Visible quality is carried by material, not dimensions.

7. **Starting values** (all [PLACEHOLDER], tune by playing):
   - wall 60 HP, 2 m × 2.5 m; bridge 40 HP, 4 m span × 1.5 m wide (SPEC §7.2–7.3);
   - sword 20 hits base durability; crude ×0.7, sound ×1.0, keen ×1.3;
   - structures spawn 2.5 m ahead of the drawer, floor-aligned.

---

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| **R-11** — three blueprints are now confusable with each other; this is the first real test of inference | Critical | T1 is first, deliberately. If the confusion matrix cannot reach zero misreads, the blueprint *shapes* change, not the thresholds. Fail fast, before anything is built on top. |
| **R-03** — predicted movement against player-made geometry | High | T7, with an explicit invariant test and a probe under injected latency. Decision 3 above narrows what has to be built. |
| Adding a blueprint quietly requires validator changes | High | T1's acceptance includes a diff check over `classify.ts`, `validate.ts`, `constraints.ts` and `normalize.ts`. The prompt §7 requirement is "verified by actually doing it twice" — wall and bridge *are* the two. |
| The greybox room has no gap, so a bridge cannot be shown to work | Medium | T6 adds one, and accepts the churn in existing floor tests. |

---

## Tasks

- [x] **T1a — Cyclic matching for closed template strokes (shared).**
  Added after T1 was found to be blocked: `meanTemplateDistance` matched points
  index to index, so a rectangle begun at a different corner fell out of phase
  with the template. Two of eight traversals classified at 0.978 and the other
  six were refused at 0.393, under the 0.50 floor. Rotation is keyed off the
  *template*, so open strokes are unaffected, and the period is one fewer than
  the sample count because a loop's last sample is its first.
  **Approved as the exception to the exit criterion below**, on the grounds
  that it is a gap any closed blueprint would hit rather than wall-specific
  code. Landed in `drawing/geometry.ts`. Decision to record as D-15.

- [x] **T1 — Wall and bridge blueprints, and the full confusion matrix (shared).**
  The riskiest task, placed first. Wall and bridge as pure data files beside
  `sword.ts`; `BlueprintId` widens to three; the registry lists them. Fixture
  corpus gains sloppy, ambiguous and negative cases for both, plus the
  near-misses the new set creates — a sword whose guard misses the blade (now
  closer to a bridge), a wall drawn with a visible gap (now closer to nothing),
  two lines that are nearly but not quite parallel.
  *Accept:*
  - the distinctness test passes over all three pairs, each pair differing on
    **at least two** discriminators per SPEC §6.3;
  - the confusion matrix over the whole corpus has **zero** misclassifications,
    and the rejection rate is reported as a number in the test output;
  - **no file in `drawing/` outside `blueprints/`, `fixtures.ts` and
    `blueprint.ts`'s `BlueprintId` changed** — asserted by reading the commit's
    own diff, which is the prompt §7 requirement made checkable.

  *Depends on:* T1a. *Files:* `drawing/blueprints/{wall,bridge,registry}.ts`,
  `drawing/blueprint.ts`, `drawing/fixtures.ts`, `drawing/corpus.test.ts`,
  `drawing/blueprints/registry.test.ts`. *Scope:* M.

  **Landed.** Zero validator-logic files changed — `classify`, `validate`,
  `constraints`, `discriminators`, `normalize`, `geometry` and `result` are
  all untouched by this commit. Three *typed registration tables* each needed
  one new entry, and the compiler named all three without being asked: the
  wire codes, and the client's blueprint names and parts. That is a better
  demonstration of the prompt §7 requirement than an empty diff would have
  been, because it shows exactly what a new blueprint must declare.
  Rejection rate: **0.0%** of sketches that meant something, **92.9%** of
  those that meant nothing (the rest graded down, never built). Decisions to
  record as D-16 (the taught bridge rail gap) and D-17 (a non-blueprint may
  smudge). Three further findings, all flagged below.

- [x] **T2 — The Codex teaches three, and `unaffordable` becomes reachable.**
  Costs now differ (wall 15, sword 20, bridge 25), so a player can recognizably
  draw something they cannot pay for — the outcome written in Phase 3 but
  unreachable until now. The Codex overlay and the failure messages pick up the
  two new blueprints from the registry without new per-blueprint code.
  *Accept:*
  - a player holding 18 chalk who draws a bridge gets `unaffordable`, is charged
    the flat 5, and is told how much is needed;
  - the Codex lists three entries, each with its own diagram, cost and
    affordability marker, generated from the blueprint's own `reference`;
  - `blueprintNames.ts` names all three.

  *Depends on:* T1. *Files:* `client/ui/codex.ts`, `client/drawing/blueprintNames.ts`,
  `client/ui/drawingBanner.ts` and their tests, `sim/MatchSimulation.test.ts`.
  *Scope:* S.

  **Landed, and it needed no production code at all.** The Codex already read
  the registry, and the failure messages already read the blueprint's own id
  and name, so putting two blueprints in the registry was the whole feature.
  T2 is therefore acceptance coverage rather than construction. Because every
  new test passed on first run, each was mutation-checked by removing the
  bridge from the registry: all four fail without it, so none is vacuous.

- [x] **T3 — The drawn-object model and placement (shared, no wiring).**
  `DrawnObject` — id, blueprint, kind, transform, quality, accuracy, health or
  durability, `solidFromTick`, and the drawer's id for attribution only.
  `SpawnRegistry` resolves a `SpawnDescriptor` plus an outcome into one, and is
  the single place a new blueprint registers construction. `placement.ts`
  resolves a structure's transform from player position and yaw, floor-aligned,
  with the push-out of decision 1.
  *Accept:* table-driven tests for the quality→stat multipliers; placement is
  correct for the four cardinal facings and never overlaps the drawer's capsule;
  registering an unknown descriptor kind is a typed error, not a silent default.

  *Depends on:* T1. *Files:* `drawing/drawnObject.ts`, `drawing/spawn.ts`,
  `drawing/placement.ts`, `config/creation.ts` + tests. *Scope:* M.

  **Landed.** Weapons and structures are separate types rather than one type
  with optional fields, so the compiler refuses giving a wall durability or
  asking a sword where it stands. `placement.ts` takes a position and an angle
  rather than a `PlayerState`, which keeps `drawing/` free of any dependency
  on `sim/`. Distance is measured to the object's *near face*, so a four-metre
  bridge deck and a hand's-width wall both begin the same step ahead instead
  of the deck swallowing the drawer.

  Phase 3's `scaleFromAccuracy` flag on `SpawnDescriptor` was **removed**
  rather than wired up. It was declared, set three times and read nowhere, and
  its own comment deferred it to this registry. Phase 4 resolves it: quality
  scales stats uniformly for every blueprint, never dimensions (decision 6),
  so the flag was both unused and misnamed. Decision to record as D-18.

- [ ] **T4 — The authority spawns on `created`.**
  `MatchSimulation` gains the drawn-object store. A `created` outcome now debits
  **and** spawns: structures into the world, a weapon into the player's
  `equipped` slot (decision 4), each stamped with the current tick. Weapons
  leave with their owner; structures survive `removePlayer` (RD-07).
  *Accept:*
  - each outcome still debits exactly what Phase 3's tests assert — spawning
    changes no cost;
  - a structure outlives the player who drew it; a weapon does not;
  - a second sword replaces the first (decision 5);
  - `solidFromTick` equals the tick of the submission that created it.

  *Depends on:* T3. *Files:* `sim/MatchSimulation.ts` + test. *Scope:* M.

- [ ] **T5 — Structures bear collision.**
  A `Drawn` collision group, and colliders created and removed on the Rapier
  world alongside the static ones. Wall blocks movement; bridge is a walkable
  surface.
  *Accept:* a player walking into a spawned wall is stopped by it and is not
  stopped where it is absent; the collider is gone from the world after the
  object is removed; player movement queries see drawn geometry exactly as they
  see static geometry.

  *Depends on:* T4. *Files:* `physics/collisionGroups.ts`,
  `physics/drawnColliders.ts`, `sim/MatchSimulation.ts` + tests. *Scope:* M.

- [ ] **T6 — A gap in the greybox room, and a bridge across it.**
  The room's single floor slab becomes two with a void between them, wide enough
  to fall through and short enough for a 4 m bridge to span. Existing floor
  tests move with it.
  *Accept:* a player walking into the gap falls; the same player, after a bridge
  is spawned across it, crosses without falling through at 60 Hz for the whole
  crossing — the exit criterion, tested rather than asserted.

  *Depends on:* T5. *Files:* `world/greyboxRoom.ts` + tests,
  `client/render/createTestScene.ts`. *Scope:* M.

- [ ] **T7 — Drawn objects on the wire, the ghost, and the solid transition (R-03).**
  Snapshots carry the drawn-object list (decision 2) and the codec encodes it.
  The client renders a translucent, non-colliding ghost from the moment it
  submits, swaps it for the confirmed object when the snapshot names it, and only
  then adds the collider to its own prediction world.
  *Accept:*
  - the **R-03 invariant test**: for every object in a snapshot,
    `solidFromTick <= serverTick`, so every replayed tick sees a consistent
    world (decision 3);
  - round-trip tests for the new snapshot fields;
  - under 150 ms injected latency the ghost covers the whole window and the
    player is never corrected *through* a confirmed wall;
  - the ghost never collides.

  *Depends on:* T6. *Files:* `protocol/messages.ts`, `protocol/codec.ts`,
  `sim/MatchSimulation.ts`, `sim/SimulationHost.ts`, `client/net/NetClient.ts`,
  `client/drawing/DrawnObjects.ts` + tests. *Scope:* L — **split if it grows past
  five files.**

- [ ] **T8 — The sword reaches the hands, graded.**
  The equipped sword is visible in the viewmodel and carries its quality:
  durability multiplied per decision 6, and a material that reads crude, sound
  or keen. No swinging — that is Phase 5.
  *Accept:* the quality→durability table; the viewmodel shows a sword only while
  one is equipped; a replaced sword's durability does not carry over.

  *Depends on:* T4. *Files:* `client/hands/handRig.ts`,
  `client/hands/createViewmodel.ts`, `drawing/drawnObject.ts` + tests. *Scope:* S.

- [ ] **T9 — Drawn-object health and destruction (RD-07).**
  `damageObject()` on the authority: structures take damage, reach zero, and are
  removed — collider and all. Tested directly, with no combat attached.
  *Accept:* damage arithmetic and the destruction threshold; a destroyed wall
  stops blocking within the same tick; damage from any player works, since
  structures are the world's (RD-07); destroying an already-destroyed object is
  a no-op, not an error.

  *Depends on:* T5. *Files:* `sim/MatchSimulation.ts`, `drawing/drawnObject.ts`
  + tests. *Scope:* S.

- [ ] **T10 — Drawn objects render.**
  Greybox meshes for wall and bridge, the ghost material, quality tinting, and a
  destruction burst. Greybox primitives only — Phases 0–5 import no art.
  *Accept:* mesh lifecycle tests (spawned, ghosted, confirmed, destroyed, with
  no leaked meshes); a manual check for how the three qualities read apart.

  *Depends on:* T7, T9. *Files:* `client/render/createDrawnObjects.ts`,
  `client/drawing/DrawnObjects.ts` + tests. *Scope:* M.

- [ ] **T11 — Phase 4 exit check.**
  A headless probe draws all three blueprints end to end: the sword equips, the
  wall blocks, the bridge is crossed — under injected latency and loss, as the
  Phase 2 and 3 probes do. Docs updated: ROADMAP exit criteria marked with what
  was actually verified, SPEC_AUDIT D-15…D-20 recorded, ARCHITECTURE §5.5
  annotated with decision 3.
  *Accept:* ROADMAP Phase 4 exit criteria 1–4 verified by the probe and the
  suite; `pnpm probe:drawing` still passes; a new `pnpm probe:creation` passes at
  150 ms / 5% loss.

  *Depends on:* all. *Files:* `tools/probe/creation.mjs`, `package.json`,
  `docs/{ROADMAP,SPEC_AUDIT,ARCHITECTURE}.md`. *Scope:* M.

---

## Checkpoints

- **After T2** — inference still works with three blueprints. If the confusion
  matrix is not clean here, stop: the shapes are wrong, and nothing downstream
  is worth building until they are right.
- **After T6** — a drawn structure is real: it exists, it collides, it can be
  stood on. The riskiest half of the phase is done.
- **After T11** — the full phase. Report, and hand the feel gate to the user.

## Carried forward from Phase 3 — still owed, still the user's call

Not Phase 4 work, and not closable by me:
- the feel pass on cursor speed, sample rate, plane fade and hand timing (T6);
- the manual check of scratch audio and dust particles (T8);
- ROADMAP criterion 4 (a human passes ≥ 9/10 sword draws) and criterion 10 (the
  feel gate).

Phase 4 proceeds without them because the roadmap's hard gate sits before
**Phase 6**, not Phase 4 — but every task below is built on drawing feel that
has not yet been signed off.

## Findings from T1, carried forward

1. **A circle is now read as a badly drawn wall, not as nothing.** It shares
   the wall's topology exactly — one stroke, no crossing, closed — so the hard
   filter cannot separate them, and what refuses it is its proportions, which
   are graded rather than filtered. Phase 3's plan allowed exactly this
   ("unrecognized or smudged, never a wrong `created`"); only the sword existed
   to test it then. The absolute guarantee is intact and asserted: **nothing
   that is not a blueprint is ever created.** The corpus assertions were
   widened to match, in two separately named tests rather than one loosened one.
2. **The bridge's rails are interchangeable**, which no other blueprint's
   strokes are — the sword's guard is told from its blade by length. "Upper
   first" is therefore a convention, not a shape. The taught gap was narrowed
   from 0.15 to 0.1 so the two orderings stay close under template matching:
   drawing the lower rail first still reads as a bridge rather than falling off
   a cliff, and a test asserts it never grades *higher* than the taught order.
3. **Fixtures must fit the 0.8 m chalk plane.** The first wall and bridge
   fixtures were authored a metre across and quantized out of range, which the
   wire suite caught. Blueprint *references* are unitless and normalized before
   use, so they stay at 1.0; only fixtures are bound by the plane.

## Open questions

1. Does drawing a second sword **replacing** the first feel right, or should the
   submission be refused while one is held? Decision 5 picks replacement because
   it never blocks the player's own verb; it is cheap to invert if it feels
   wasteful in the hand.
2. Should a structure placed into a wall be nudged to the nearest free spot
   rather than simply overlapping it (decision 1)? Deferred to Phase 6, when the
   real geometry makes the answer obvious.
3. Wall and bridge sizes are [PLACEHOLDER]. A 2 m wall in a 3 m room may read as
   either cover or an obstruction; the play check at T11 is the first chance to
   judge it.
