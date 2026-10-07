# Phase 2 — Chalk: task plan

Source: `docs/ROADMAP.md` Phase 2, `SPEC.md` §5 (Chalk) and §9 (Inventory),
`docs/SPEC_AUDIT.md` RD-02. Approved by the user 2026-10-07 ("approve
Phase 2"). The Phase 1 plan (T1–T7, complete) is in git history.

Each task ends green (`pnpm typecheck && pnpm lint && pnpm test && pnpm build`)
and is committed separately.

**Invariants (ARCHITECTURE §10):** chalk is authoritative state. The client
never predicts or stores it, except to display the newest snapshot. The only
upstream message is an `InteractIntent` naming a target. The authority
validates it and decides the outcome.

**Numbers from the spec ([PLACEHOLDER] there):** meter 0–100, starting chalk 0,
25 per box. Inventory: 6 slots.

**Not in the spec, chosen here and flagged ([PLACEHOLDER]):**
- Interact range: 2 m from the player's eyes to the box.
- A box holds 25. Pickup takes what fits under the cap, and the box keeps the
  remainder. A box is hidden only when it reaches 0, so no chalk is wasted.
- Boxes do not respawn within a match.
- Stack limits per item type. No items exist yet, so the model is tested with
  fixture items.

## Tasks

- [x] **T1 — Economy config and chalk meter rules (shared).**
  `shared/config/economy.ts` with the RD-02 values. A pure function to add
  chalk that clamps at the max and reports how much was actually taken.
  *Accept:* tests for adding within range, clamping at max, a full meter taking
  nothing, and rejecting negative or non-integer amounts.

- [x] **T2 — Inventory model (shared, model only).**
  Six slots and per-item stack limits, with pure add and remove functions:
  - add fills existing stacks first, then empty slots, and reports leftovers;
  - remove takes from a slot.
  *Accept:* tests for add, remove, stack limits, a full inventory, and invalid
  slots.

- [x] **T3 — Authoritative chalk boxes and pickup.**
  Level data gets chalk box spawn points in the greybox room. `MatchSimulation`
  tracks each player's chalk and each box's remaining amount. `interact(player,
  boxId)` is validated by proximity and box state.
  *Accept:* tests show:
  - pickup works in range and is rejected out of range;
  - clamping leaves the remainder in the box;
  - an empty box gives nothing;
  - unknown boxes and players are ignored;
  - no other code path changes chalk.

- [ ] **T4 — Protocol: `InteractIntent` up, chalk and box state down.**
  A reliable `interact { targetId }` message goes upstream. The snapshot carries
  the receiving player's chalk and each box's remaining amount. The host routes
  interact messages, and `NetClient` exposes the authoritative values.
  *Accept:* codec round-trip and malformed-input tests, plus a loopback test
  where interact raises chalk.

- [ ] **T5 — Client: chalk boxes, interact prompt, HUD meter.**
  - Greybox chalk boxes render, and empty ones are hidden.
  - A pure function picks the targeted box (in range, near the view centre).
  - A "Press E" prompt shows, and an E press sends one intent.
  - A HUD chalk meter shows the authoritative value only.

  *Accept:* unit tests for target selection; the HUD updates only from
  snapshots.

- [ ] **T6 — Phase 2 exit check.**
  Extend the headless probe:
  - walk to a box, press E, and chalk rises on the server and in the HUD;
  - a forged interact for a far box and a tampered client value change nothing.

  Then update the docs.
  *Accept:* the ROADMAP Phase 2 exit criteria hold.
