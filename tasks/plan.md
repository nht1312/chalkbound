# Phase 1 — Player: task plan

Source: `docs/ROADMAP.md` Phase 1, `docs/ARCHITECTURE.md` §4.3–4.4 and §5.2.
Approved by the user 2026-10-07 ("approve phase 1"). Tasks run in order; each
ends green (`pnpm typecheck && pnpm lint && pnpm test && pnpm build`) and is
committed separately.

**Placeholder numbers.** `SPEC.md` does not specify walk/sprint/crouch speed,
jump height, or sprint/jump stamina cost. The only constraint is The Erased at
3.2 m/s being "faster than a walk, slower than a sprint". Tasks 1–2 use values
marked **[PLACEHOLDER]** in `shared/config/movement.ts`, to be tuned at the
Phase 1 feel check.

## Tasks

- [ ] **T1 — `stepPlayer()` core movement (shared).**
  Rapier `KinematicCharacterController`, capsule collider, walk/sprint/crouch,
  gravity, jump (edge-triggered), ground detection, air control, crouch with
  blocked-uncrouch. Constants in `shared/config/movement.ts`.
  *Accept:* tests show it settles on the floor, respects speed caps, normalises
  diagonals, reaches jump apex ≈ configured height, is blocked by walls, can't
  stand up under a low ceiling, and replays identical command sequences to
  identical positions, both on a second world and when rewound on the same body.

- [ ] **T2 — Stamina (shared).**
  Drain on sprint (per second) and jump (per jump), regen 15/s after a 1 s
  delay (`SPEC.md` §17), sprint and jump gated on stamina.
  *Accept:* arithmetic tests for drain, delay, regen cap, and gating.

- [ ] **T3 — Authoritative player on the authority.**
  `MatchSimulation` owns a Rapier world plus per-player bodies and applies one
  command per tick via `stepPlayer()`. Snapshot carries the receiving player's
  authoritative state (position, velocity, grounded, crouch, stamina) and
  `lastProcessedSeq`. Protocol and codec extended. The local authority and
  `MatchRoom` load Rapier before creating the simulation.
  *Accept:* codec round-trip and quantisation bounds for the new fields; the
  simulation moves a player from submitted commands only.

- [ ] **T4 — Client prediction and reconciliation.**
  The client runs `stepPlayer()` on its own world, records the predicted state
  per seq, and on each snapshot compares, rewinds, and replays the unacked
  commands. Visual correction is smoothed over ~100 ms. Replaces `DebugMover`.
  *Accept:* a loopback test at 150 ms latency + 5% loss shows prediction and
  authority converge, with zero corrections when inputs are deterministic.

- [ ] **T5 — FPP camera feel and pointer-lock handling.**
  View bob tied to the movement cycle, crouch eye-height lerp, sprint FOV,
  configurable sensitivity, pause overlay on pointer-lock loss.
  *Accept:* unit tests for the bob, lerp, and FOV curves; manual feel check.

- [ ] **T6 — FPP hands.**
  Greybox arms on a separate camera layer (own FOV and near plane) with idle,
  walk, and sprint poses.
  *Accept:* no clipping into walls; the pose follows movement state.

- [ ] **T7 — Phase 1 exit check.**
  Headless probe plus manual check at `?latency=150&loss=0.05`; docs updated.
  *Accept:* the ROADMAP Phase 1 exit criteria hold.
