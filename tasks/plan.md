# Phase 5 — Combat: task plan

Source: `docs/ROADMAP.md` Phase 5 and the vertical slice criteria; `SPEC.md`
§7.1 (the sword), §7.4 (structures are breakable), §8 (combat), §14 (feedback),
§15 (HUD); `docs/ARCHITECTURE.md` §5.4 and §7; `docs/SPEC_AUDIT.md` R-02,
RD-04, MD-04. The Phase 4 plan is in git history (through commit `06e8942`).

Each task ends green (`pnpm typecheck && pnpm lint && pnpm test && pnpm build`)
and is committed separately.

**Scope boundary.** Phase 5 makes the drawn sword *do something*: swing it,
hit with it, spend it, and lose it. It closes the vertical slice. It does not
bring opponents — the Erased are Phase 7 and other players are Phase 8 — so
the only things in the room to hit are a training dummy and the structures
players drew themselves. Player-versus-player damage is nevertheless built and
tested here, because lag compensation cannot be bolted on later (R-02) and two
players in one `MatchSimulation` is a thing the suite can already build.

**Invariants carried forward (unchanged):**

- The client sends intent. It plays the swing immediately and applies **no**
  damage, health change, durability spend or death locally (R-02).
- Structures belong to the world (RD-07). Nothing may key a hit's effect off
  who drew the thing being hit.
- Recognition stays geometric, and nothing in this phase touches it.
- A drawn object is collidable on both sides only from its `solidFromTick`.

**New invariants, introduced here:**

- Health, stamina and durability change in exactly one place: the authority,
  inside `MatchSimulation`. No wire message grants any of them.
- A swing resolves **once**, and hits **at most one thing**.
- The hit test runs against the world as the *attacker saw it*, bounded by a
  rewind clamp the client cannot talk its way past.

---

## Decisions not in the spec, chosen here and flagged ([PLACEHOLDER])

Continuing Phase 4's D-15…D-19; these would be recorded as **D-20 … D-27**.

1. **An attack is its own reliable message, not a button bit.** `Button.Attack`
   already exists and already means something else while the chalk is up: it is
   the pen going down. More importantly, a swing needs to carry the server tick
   the attacker had acknowledged when they swung, which an input command has no
   room for. This follows ARCHITECTURE §7, which lists `AttackIntent` as a
   reliable message carrying a client tick.

2. **The swing resolves at the moment the active window opens, as one
   shape-cast.** The state machine runs on both sides; the authority starts it
   when the intent arrives and tests the arc `windupMs` later. A cast per tick
   through the 80 ms active window would hit the same target five times and
   need its own de-duplication, for a fidelity nobody can see at 2.2 m.

3. **Latency for the rewind is measured when the swing lands, not when it was
   asked for.** The attacker's acknowledged tick travels in the intent; the
   authority subtracts it from the tick the swing becomes active and clamps the
   result to 200 ms. Because the windup elapses on both sides at once, this is
   the attacker's one-way latency and not their latency plus a windup.

4. **History is stored every tick, so a rewind is a lookup rather than an
   interpolation.** ARCHITECTURE §5.4 says "interpolated transforms at that
   tick"; a buffer sampled at the full 60 Hz tick rate already has that tick.
   One second is 60 entries of three floats per player, which is cheaper than
   the interpolation it replaces.

5. **A swing hits the nearest candidate and stops.** Players, structures and
   dummies are all candidates, and the closest one takes the blow. The
   alternative — damaging everything in the arc — lets one swing break three
   walls, makes durability nearly free, and is unreadable to the player.

6. **A miss costs stamina but not durability.** SPEC §7.1 prices the sword in
   *hits*, not swings. Stamina is what punishes flailing.

7. **The dummy comes back.** It stands up again at full health a few seconds
   after it falls, because the slice must be re-runnable without restarting the
   match. It is a training dummy; nothing about it is a design statement.

8. **Death:** the player respawns at the level spawn with full health after a
   short delay, keeps their chalk, and loses the weapon in their hands. Whether
   dying costs anything that outlives the match is MD-06, which is still open —
   this chooses the smallest thing that does not pre-empt it. The weapon is
   lost because it is *carried*, and carrying stopped.

9. **Damage you receive is read from snapshots; only your own swing is an
   event.** Health rides in the snapshot beside chalk, so a player whose health
   fell since the last one takes the hit feedback from that. The attacker gets
   a reliable `attackResult`, because a hit on something that then disappears —
   a dummy that falls, a wall that shatters — leaves nothing in the snapshot to
   read it from.

10. **Health is not part of `PlayerState`.** `PlayerState` is the movement
    state the client replays during reconciliation; health in it would make the
    client predict its own health, which is the one thing R-02 forbids. It
    rides in the snapshot, exactly as chalk does.

---

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| **R-02** — melee that feels broken under latency | Critical | T3 and T4 are built and tested apart from each other and from the wire, then joined in T6. The suite tests rewind against synthetic histories *and* two real players in one simulation at injected latency. |
| A client that lies about its acknowledged tick reaches into the past | High | The clamp is applied to the *measured* difference, and the tick is also clamped forward: a client claiming a tick in the future gets no rewind at all. Tested in T6. |
| The slice's 2.2 m reach produces false positives (criterion 8) | High | T4's tests are written at the boundary: just inside, just outside, behind, above, and through a wall. |
| Nothing in the room can hit the player back, so damage-taking goes untested | Medium | Two players in one simulation, which the suite can build today. The *rendering* of another player is Phase 8; the simulation has never been single-player. |
| Swing animation drifts from the authority's state machine | Medium | One state machine in `shared/`, run by both sides from the same config. The client never invents its own timing. |

---

## Tasks

- [x] **T1 — `config/combat.ts` and the swing state machine (shared).**
  The RD-04 numbers in one file, and a pure state machine beside them: idle →
  windup → active → recovery → idle, advanced by `dt`, with a predicate for
  whether a new swing may start. No physics, no world, no player.
  *Accept:* a swing becomes active after exactly `windupMs`, is active for
  `activeMs`, is not re-startable until `recoveryMs` after that, and reports
  the tick its active window opens. Timing tests at 60 Hz and at a ragged dt.
  *Depends on:* nothing. *Files:* `shared/config/combat.ts`,
  `shared/sim/swingState.ts` (+ test). *Scope:* S.

- [x] **T2 — Player health, death and respawn (shared, no combat attached).**
  The arithmetic alone, as Phase 4 did for structures: a `damagePlayer()`
  entry point with nothing swinging at it. Death at zero, a respawn countdown,
  full health on return, chalk kept, hands emptied (decision 8).
  *Accept:* damage clamps at zero and never goes negative; a dead player
  stops moving and takes no further damage; respawn restores health and
  position and drops the weapon; nonsense amounts (negative, NaN) are ignored
  exactly as `damage()` ignores them for structures.
  *Depends on:* T1 (config only). *Files:* `shared/sim/health.ts` (+ test),
  `shared/sim/MatchSimulation.ts` (+ test). *Scope:* M.

- [x] **T3 — The transform history ring buffer and bounded rewind (shared).**
  One second of every player's capsule transform, per tick, with a lookup that
  clamps to the buffer and to `maxRewindMs` (decision 4). Pure data, tested
  against synthetic histories as the roadmap asks.
  *Accept:* a lookup at the current tick returns the current transform; one
  beyond the clamp returns the clamped one, never an older one; one past the
  end of the buffer returns the oldest entry; a tick in the future returns the
  present. The buffer never grows beyond its second.
  *Depends on:* T1. *Files:* `shared/sim/transformHistory.ts` (+ test).
  *Scope:* S.

- [x] **T4 — The swing arc, shape-cast against the world (shared).**
  Given an attacker's eye, facing and reach, cast the arc and return the
  nearest candidate: a player capsule, a structure, a dummy, or nothing. The
  cast runs against rewound capsules, so it takes transforms as arguments
  rather than reading anyone's current state.
  *Accept:* criterion 8 — a hit just inside 2.2 m, no hit just outside it, no
  hit behind the attacker, no hit through a wall standing between them, and
  the nearest of two candidates is the one returned (decision 5).
  *Depends on:* T1, T3. *Files:* `shared/sim/swingCast.ts` (+ test),
  `shared/physics/collisionGroups.ts`. *Scope:* L. **The riskiest task.**

- [x] **T5 — A training dummy in the greybox room.**
  **Landed, and it found the phase's worst bug.** The dummy was first given a
  collider, as anything standing in a room would be. The prediction suite went
  red within minutes: the authority's walk and the client's parted company by
  half a millimetre at tick 103. Filtering the dummy out of movement queries
  did not fix it, and a probe found why — it is **`world.step()` itself**, not
  the collider, that shifts the character controller's next result, because
  stepping re-syncs the player's own collider into the broad phase. The client
  never steps for a dummy it does not have.
  That condemned T4's design too: it posed a stand-in collider per rewound
  target and stepped the world to register it, on the authority only. It would
  have desynced every client within seconds of the first swing, and nothing in
  Phase 5's own tests would have caught it — it takes a thousand ticks of
  walking to show.
  **The hit test now never mutates the world.** Structures and level geometry
  are found with a read-only `castShape`; players and dummies are tested in
  arithmetic (`math/sweep`, ray against capsule, with its own suite). The
  dummy has no collider at all, which also makes it walk-through-able — a
  training target, not an obstacle. A test now asserts the authority's walk is
  **bit-identical** with and without a dummy in the room. Decisions to record
  as D-20 (no mutation in hit tests) and D-21 (the dummy is not solid).
  A static, hittable thing with health, authored into the level and owned by
  the simulation. It falls at zero health and stands back up (decision 7).
  *Accept:* the dummy has a collider a swing can find, takes authoritative
  damage, falls, and returns; the greybox room's existing tests survive its
  arrival.
  *Depends on:* T2, T4. *Files:* `shared/world/greyboxRoom.ts`,
  `shared/sim/dummy.ts` (+ tests), `shared/config/combat.ts`. *Scope:* M.

- [ ] **T6 — The authority resolves an attack.**
  `MatchSimulation.attack()`: refuse while drawing, dead, mid-swing or out of
  stamina; debit stamina at the start; resolve at the active tick against
  rewound targets; apply damage to a player, structure or dummy; spend one
  durability on a landed hit; shatter the sword at zero.
  *Accept:* unarmed deals 5 and armed 35 (three hits kill); stamina is spent
  on a miss and durability is not (decision 6); the twentieth hit shatters the
  sword and the twenty-first is unarmed; a two-player test lands a hit that
  only lag compensation could land, and a clamped one that it must not; a
  client claiming a future tick gets no rewind.
  *Depends on:* T1–T5. *Files:* `shared/sim/MatchSimulation.ts` (+ test).
  *Scope:* L.

- [ ] **T7 — Combat on the wire.**
  `attack` upstream (reliable, carrying the acknowledged tick), `attackResult`
  downstream (reliable), health and the dummies in the snapshot. Codec
  round-trip tests, and the host routing the intent.
  *Accept:* every new message round-trips byte-identically; a malformed attack
  is a `ProtocolError` and not a crash; the snapshot still fits its budget;
  `SimulationHost` sends a result to the attacker and nobody else.
  *Depends on:* T6. *Files:* `shared/protocol/{messages,codec}.ts` (+ test),
  `shared/sim/SimulationHost.ts` (+ test). *Scope:* M.

- [ ] **T8 — The client swings.**
  LMB outside draw mode sends the intent and starts the *same* state machine
  locally, which drives the hand rig: the blade winds up, cuts, and recovers.
  No damage, no durability, no health is touched client-side.
  *Accept:* a swing animation plays on press and cannot be restarted mid-swing;
  pressing while the chalk is up draws and never swings; the predicted swing
  and the authority's agree on timing; nothing in the client writes health.
  *Depends on:* T7. *Files:* `client/combat/SwingController.ts` (+ test),
  `client/hands/handRig.ts`, `client/main.ts`. *Scope:* M.

- [ ] **T9 — Hit feedback (SPEC §14, §15).**
  Hitmarker, a chalk-dust burst at the impact point, camera kick, an impact
  sound, and the sword's shatter — which §14 names as information, not
  decoration: everyone nearby should know a weapon just broke.
  *Accept:* the hitmarker appears only on an authoritative hit; the kick decays
  to zero and never fights the look input; the shatter fires once per sword.
  *Depends on:* T8. *Files:* `client/ui/hitmarker.ts`, `client/combat/impact.ts`,
  `client/camera/cameraFeel.ts`, `client/audio/*` (+ tests). *Scope:* M.

- [ ] **T10 — The HUD tells the truth about health, stamina and durability.**
  SPEC §15 asks for health, stamina and the equipped item's durability. Chalk
  is already there; the other three are not.
  *Accept:* all three read from the authority's numbers only; the durability
  readout disappears with the sword; low health and low stamina are legible at
  a glance without a number being read.
  *Depends on:* T7. *Files:* `client/ui/statusBars.ts` (+ test),
  `client/main.ts`. *Scope:* S.

- [ ] **T11 — Phase 5 exit check and the vertical slice.**
  A headless probe that draws a sword, swings it at the dummy, kills it, and
  breaks a wall it drew — under injected latency and loss. Then the ten slice
  criteria, each marked with what was actually verified and what was handed to
  the user.
  *Accept:* `pnpm probe:combat` passes at 150 ms / 5% loss; the three earlier
  probes still pass; ROADMAP Phase 5 and the slice table are updated;
  SPEC_AUDIT records D-20…D-27 and closes MD-04's placeholder status.
  *Depends on:* all. *Files:* `tools/probe/combat.mjs`, `package.json`,
  `docs/{ROADMAP,SPEC_AUDIT,ARCHITECTURE}.md`. *Scope:* M.

---

## Checkpoints

- **After T4** — the hardest piece is standing on its own and tested at the
  reach boundary. If the shape-cast cannot be made to agree with what the
  player sees, stop: everything after it is wiring.
- **After T6** — the authority can resolve a swing under latency. The slice is
  functionally complete and only lacks its feedback.
- **After T11** — the vertical slice. Report, and hand the feel gate to the
  user, where it has been waiting since Phase 3.

## Carried forward — still owed, still the user's call

- The Phase 3 feel pass on cursor speed, sample rate, plane fade and hand
  timing, the manual check of scratch audio and dust, and slice criterion 4
  (a human passes ≥ 9/10 sword draws).
- **Criterion 10, the feel gate.** It is judged at the end of this phase, and
  the roadmap treats it as a hard gate before Phase 6.
- The `PlayerPredictor` divergence found at Phase 4 T11: prediction and
  authority part company by 28 m during a long fall under loss. Out of scope
  here — nothing in Phase 5 makes a player fall — but it is a real finding and
  it is still open.
