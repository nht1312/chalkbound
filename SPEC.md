# CHALKBOUND — Game Design Specification

**Version:** 0.1 — **DRAFT, AWAITING REVIEW**
**Date:** 2026-10-07
**Status:** This document was drafted by Claude Code from approved decisions and
the project initialization brief. It has not yet been reviewed. Nothing in it is
implemented.

---

## 0. How to read this document

This is the **design** source of truth: what the game is and how it plays.
Engineering concerns live separately:

| Topic | Document |
|---|---|
| Agent operating rules | `CLAUDE.md` |
| Spec gaps, risks, recommendations | `docs/SPEC_AUDIT.md` |
| Technical architecture | `docs/ARCHITECTURE.md` |
| Phases and vertical slice | `docs/ROADMAP.md` |
| Asset pipeline | `docs/ASSET_PIPELINE.md` |

Where this document and an engineering document disagree, **this document
wins**, and the engineering document is wrong and must be corrected.

Two notations are used throughout:

- **[LOCKED]** — a decision that must not change without explicit approval.
- **[PLACEHOLDER]** — a value chosen so implementation can proceed. Expected to
  be tuned. Not yet approved. All of them are listed together in §17.

---

## 1. Concept

CHALKBOUND is a first-person PvPvE extraction-lite survival game played in the
desktop browser.

The player explores an abandoned school, scavenging **Chalk**. Chalk is not a
currency and not ammunition — it is raw creative potential. To arm themselves,
the player raises a piece of chalk and **sketches a weapon in the air**. If the
sketch holds together, it becomes real in their hands.

> The player does not pick up weapons. The player draws them into existence.

Everything flows from that sentence. Weapons are not found, bought, or
crafted from components. They are *drawn*, which means the player's own skill at
drawing — under pressure, with limited chalk, while something is hunting them —
is the game's central competence.

---

## 2. Core loop [LOCKED]

```text
Find Chalk
    ↓
Draw Sketch
    ↓
Create Object
    ↓
Explore
    ↓
Fight / Avoid
    ↓
Loot
    ↓
Gain More Chalk
    ↓
Extract or Risk More
    ↓
Die / Extract
```

The loop's tension is a single repeated question: **do I spend this chalk now, or
carry it out?** Chalk in your pocket is worth nothing in a fight and everything
at extraction. Chalk on the wall is a weapon you might die holding.

If this loop is not fun, no amount of content fixes it. Improving the loop always
takes priority over adding to it.

---

## 3. Design pillars [LOCKED]

These may not be changed without explicit approval.

| # | Pillar | Meaning |
|---|---|---|
| 1 | **Creation** | The player makes their own tools. Drawing is the primary verb, not a menu. |
| 2 | **Scarcity** | Chalk is always insufficient. Every sketch is a choice not to make a different sketch. |
| 3 | **Risk** | Staying longer means more chalk and a greater chance of losing all of it. |
| 4 | **Creativity** | Skill at drawing is real skill, and it is visible. A better sketch makes a better object. |
| 5 | **Loss** | Dying costs you what you were carrying. Extraction is the only way to keep it. |

Before any feature is added, it must improve at least one pillar. If it improves
none, it is deferred.

### Explicitly protected design decisions [LOCKED]

Not to be changed independently under any circumstances:

- First-person perspective. Never third-person gameplay.
- Chalk as the single creation resource. Never replaced by another resource.
- Weapons drawn into existence. Never traditional weapon pickup.
- Extraction-lite. Never battle royale.
- PvPvE. Never PvE-only.
- The Abandoned School as the first map.
- **Geometric** drawing validation. Never AI image recognition.

---

## 4. Perspective and camera [LOCKED]

Gameplay is always first person. The player sees their own hands, the chalk, and
whatever they are holding.

The character's full body may be shown **only** in: inventory, lobby, death,
extraction, and character preview. These are deliberate, non-gameplay moments.

Drawing never leaves first person. The chalk plane appears in front of the
player's face, in the world — it is not an overlay, a menu, or a separate screen.

---

## 5. Chalk

Chalk is a single continuous resource, displayed as a meter rather than a stack
of items.

| Property | Value |
|---|---|
| Carried range | 0–100 **[PLACEHOLDER]** |
| Starting chalk | 0 — the player begins a match unarmed **[PLACEHOLDER]** |
| Per pickup | 25 **[PLACEHOLDER]** |
| Dropped by an Erased | 15 **[PLACEHOLDER]** |

Chalk is found in the world: chalk boxes in classrooms, trays beneath
blackboards, scattered fragments. It is also carried by other players, which is
the primary reason to fight them.

**On death, carried chalk is lost.** On extraction, it is kept (see §13).

Chalk is spent only by drawing. There is no shop, no crafting bench, and no
other sink. This is deliberate: chalk has exactly one use, so every chalk
decision is a drawing decision.

---

## 6. Drawing and Blueprints — the core system

### 6.1 The interaction [LOCKED sequence]

```text
Player holds the draw input
    ↓
FPP hand raises the chalk
    ↓
Chalk Plane appears in front of the player
    ↓
Player draws
    ↓
Scratch audio plays, chalk dust falls
    ↓
Sketch is recognized and graded
    ↓
Chalk particles
    ↓
Drawing glows
    ↓
Drawing becomes a 3D object
```

This sequence must not be replaced with a menu, a crafting grid, or an item
list. The physicality is the feature.

### 6.2 How recognition works — inference, not selection **[APPROVED]**

The player does **not** choose what to draw beforehand. They draw a sketch, and
the sketch itself determines what is created. A sword-shaped sketch becomes a
sword; a rectangle becomes a wall.

Recognition is **purely geometric** [LOCKED] — no image recognition, no machine
learning, no neural inference of any kind. The system analyses only:

```text
Stroke count       Direction        Bounding box
Point sequence     Angle            Intersection
Stroke length      Position         Closure
Timing             Tolerance        Accuracy
```

The pipeline has three stages:

**1. Classification — "what did they draw?"**
The sketch is compared against every known blueprint using cheap discriminating
features (stroke count, intersection presence, closure, bounding-box aspect,
dominant stroke directions). The best match wins.

**2. Ambiguity rejection — "are we sure?"**
If the best match scores below a recognition floor, or if the top two matches
score too closely together, the sketch is rejected as **unrecognized** rather
than guessed at.

This stage is a design requirement, not an optimization. Handing a player the
wrong weapon is far worse than handing them nothing: a failed sketch is the
player's fault and teaches them something, while a *misread* sketch is the
game's fault and teaches them that the game is unreliable. **When in doubt, the
system refuses.**

**3. Grading — "how well did they draw it?"**
The winning blueprint's full constraint set runs, producing an accuracy score
from 0 to 1. Accuracy must clear the blueprint's threshold for creation to
succeed, and it then determines the created object's quality (§6.5).

### 6.3 Blueprint shapes must be mutually distinct [LOCKED]

Because recognition is inferred rather than selected, **the blueprint set is
itself a design constraint.** Two blueprints that look similar will be confused,
and that confusion lands on the player.

Therefore: every blueprint must differ from every other blueprint on at least
two of these discriminators —

- stroke count
- presence of a stroke intersection
- presence of closure (a stroke returning to its own start)
- bounding-box aspect (tall, square, wide)
- dominant stroke orientation

**Adding a blueprint requires verifying it against every existing blueprint.**
This check is part of the definition of done for any new blueprint, forever. It
is the price of inference, and it is worth paying for the feeling of drawing
freely.

### 6.4 Learning the shapes

Since the player must know a shape to draw it, shapes are taught rather than
guessed:

- A **Codex** shows every known blueprint: its shape, stroke order, and chalk
  cost. Opened from the lobby, and glanceable in-match.
- Blueprint shapes are **drawn on blackboards in the school itself** —
  diegetic tutorials placed in the world. A player who explores learns more
  shapes.
- The Codex marks which blueprints the player can currently afford.

Shapes must be simple enough to memorize after seeing them once or twice. A
blueprint that needs study is too complex for a game played under threat.

### 6.5 Accuracy affects outcome [LOCKED pillar 4]

A better sketch makes a better object. Accuracy maps to quality:

| Accuracy | Result |
|---|---|
| Below recognition floor | **Unrecognized** — nothing is created |
| Recognized, below threshold | **Smudged** — the sketch collapses, nothing is created |
| Threshold to 0.75 | **Crude** — functional, reduced durability **[PLACEHOLDER]** |
| 0.75 to 0.90 | **Sound** — standard stats **[PLACEHOLDER]** |
| Above 0.90 | **Keen** — increased durability, slight damage bonus **[PLACEHOLDER]** |

Quality is visible on the object: a crude sword looks roughly drawn, a keen one
looks crisp and glows faintly. The player can see what their skill produced.

Accuracy never affects *what* is created — only how good it is. A barely-passing
sword is still a sword.

### 6.6 Chalk cost and failure

Because the blueprint is not known until the sketch is classified, **cost is
determined after recognition, not before.**

| Outcome | Chalk cost |
|---|---|
| Created successfully | Full blueprint cost |
| Recognized but smudged | 25% of that blueprint's cost, rounded up **[PLACEHOLDER]** |
| Unrecognized | Flat 5 chalk **[PLACEHOLDER]** |
| Recognized but unaffordable | Flat 5 chalk, nothing created **[PLACEHOLDER]** |

The reasoning behind each:

- **Full cost on success** is the obvious case.
- **A partial cost on a smudge** keeps failure stinging without making the
  game's central verb something players avoid practising. Zero cost would make
  drawing a free practice range and dissolve pillar 2; full cost would punish
  learning.
- **A small flat cost when unrecognized** is important for fairness. The player
  drew *something*; the game could not read it. Charging a full blueprint cost
  for the system's uncertainty would feel like theft. A smudge of wasted chalk is
  honest.
- **The unaffordable case** is a consequence of inference: a player can start a
  sketch they cannot pay for. The Codex's affordability markers exist to prevent
  this, and the penalty is kept to the smudge cost because the mistake is
  partly the game's for allowing it.

Chalk is debited **after** recognition and grading, never before. There is no
"charge then refund" path.

### 6.7 The Chalk Plane

Drawing happens on a plane that appears 1.2 m in front of the player's face
**[PLACEHOLDER]**, fading in over roughly 150 ms as the hand raises.

While drawing:

- The mouse draws instead of turning the camera. The camera holds still.
- The player cannot move, sprint, or attack.
- **The player remains fully vulnerable.** Drawing never pauses the world.

That last point is the heart of the risk pillar. Drawing is a commitment: for a
second or two, you are a stationary target holding a piece of chalk. Choosing
*where* and *when* to draw is as much a skill as the drawing itself. A player
who sketches a sword in an open corridor deserves what happens next.

### 6.8 Where the object appears

| Blueprint kind | Behaviour on creation |
|---|---|
| **Weapon** | Resolves directly into the player's hands, equipped and ready |
| **Structure** | Materializes in the world ahead of the player, oriented to their facing |

Weapons being held immediately matters — the sketch becoming a weapon *in your
hands* is the game's signature moment, and inserting an inventory step between
the drawing and the holding would waste it.

---

## 7. Blueprints — MVP set

Three blueprints, chosen to be maximally distinct under §6.3.

### 7.1 Sword — `CB_WEAPON_Sword_A`

**Shape:** two strokes. A long near-vertical line (the blade), then a short
near-horizontal line crossing it in the lower third (the crossguard).

**Discriminators:** 2 strokes · has intersection · open · tall aspect.

| Property | Value |
|---|---|
| Chalk cost | 20 **[PLACEHOLDER]** |
| Kind | Weapon — equips to hands |
| Damage | 35 **[PLACEHOLDER]** |
| Reach | 2.2 m **[PLACEHOLDER]** |
| Durability | 20 hits, then shatters **[PLACEHOLDER]** |

**Durability is deliberate.** A permanent sword turns chalk into a one-time
purchase and stalls the loop. A sword that shatters keeps chalk flowing and
gives the create-risk-lose cycle a heartbeat. The shatter is loud and visible —
losing your weapon mid-fight is a real event.

### 7.2 Wall — `CB_DRAWN_Wall_A`

**Shape:** one closed stroke forming a rough rectangle, returning to its start.

**Discriminators:** 1 stroke · no intersection · closed · wide aspect.

| Property | Value |
|---|---|
| Chalk cost | 15 **[PLACEHOLDER]** |
| Kind | Structure — materializes ahead of the player |
| Health | 60 **[PLACEHOLDER]** |
| Size | 2 m wide, 2.5 m tall **[PLACEHOLDER]** |

Blocks movement and line of sight. Used to seal a corridor, cut off a chase, or
deny an angle.

### 7.3 Bridge — `CB_DRAWN_Bridge_A`

**Shape:** two strokes. Two roughly parallel horizontal lines, one above the
other, which do not touch.

**Discriminators:** 2 strokes · no intersection · open · wide aspect.

| Property | Value |
|---|---|
| Chalk cost | 25 **[PLACEHOLDER]** |
| Kind | Structure — materializes ahead of the player |
| Health | 40 **[PLACEHOLDER]** |
| Size | 4 m span, 1.5 m wide **[PLACEHOLDER]** |

Creates a walkable surface across a gap — a collapsed floor, a stairwell void, a
broken landing. Opens routes that are otherwise closed, which means the school's
layout is designed around the assumption that some players will have a bridge
and some will not.

Note that sword and bridge share a stroke count, so they are separated by
intersection and aspect: the sword's strokes cross and its box is tall; the
bridge's strokes never meet and its box is wide. Wall is separated from both by
stroke count and closure.

### 7.4 Drawn objects belong to the world **[APPROVED]**

| Rule | Detail |
|---|---|
| Ownership | Structures belong to the **world**, not the drawer |
| Persistence | They remain after the drawer dies or extracts, until match end |
| Use by others | Any player may cross any bridge; any player is blocked by any wall |
| Destruction | Structures have health and can be destroyed by weapon hits |
| Weapons | Weapons are carried, and leave with their owner |

This is where the emergent PvPvE play lives. Your bridge is also your pursuer's
bridge. Your wall can be broken down. Locking structures to their creator would
remove most of the interesting interactions and save nothing.

---

## 8. Combat

Melee only in the MVP. Deliberate, readable, and committal rather than fast.

| Property | Value |
|---|---|
| Player health | 100 **[PLACEHOLDER]** |
| Health regeneration | None **[PLACEHOLDER]** |
| Swing timing | 120 ms windup / 80 ms active / 250 ms recovery **[PLACEHOLDER]** |
| Stamina | 100, 20 per swing, 15/s regen after 1 s delay **[PLACEHOLDER]** |
| Blocking | Not in MVP |
| Unarmed | Possible but very weak — 5 damage **[PLACEHOLDER]** |

Three sword hits kill a player at full health. Fights are short and decisive,
which keeps them readable and makes the decision to start one meaningful.

The windup is visible to the target, so swings can be read and avoided. Combat
skill is positioning and timing, not click speed.

An unarmed player is nearly helpless. This is the point: without chalk you have
nothing, and the first thing you do in a match is look for chalk.

---

## 9. Inventory

| Property | Value |
|---|---|
| Slots | 6 **[PLACEHOLDER]** |
| Chalk | A separate meter, not a slot |
| Weight | None |
| Pauses the game | **No** |

Opening the inventory does not pause, slow, or shield the player. The
third-person body shown there (permitted by §4) is a deliberate vulnerability
cue — you are looking at yourself instead of at the room.

Chalk occupying no slot is deliberate: chalk is not loot, it is potential.

---

## 10. The Erased

The school's only inhabitants. The MVP has one archetype.

**Concept.** The Erased are what is left of people who were drawn out of
existence — smeared, partial figures in the shape of students and staff, with
chalk-dust edges that never quite resolve. Some still carry the weapons someone
drew for them.

| Property | Value |
|---|---|
| Health | 70 **[PLACEHOLDER]** |
| Damage | 25 **[PLACEHOLDER]** |
| Movement | 3.2 m/s — faster than a walk, slower than a sprint **[PLACEHOLDER]** |
| Sight | 18 m within a forward cone **[PLACEHOLDER]** |
| Hearing | Triggered by sprinting and by **drawing** **[PLACEHOLDER]** |
| Hostility | Players only. Never each other. |
| Count per match | 6, at fixed spawn points **[PLACEHOLDER]** |
| Drops | 15 chalk **[PLACEHOLDER]** |
| Structures | Blocked by walls, as a player is |

That drawing makes noise is the important rule: it ties the creation pillar
directly to the risk pillar. Arming yourself is itself dangerous. You can always
hear the scratch of someone else's chalk, and so can they.

The Erased exist to make the world hostile and to be a chalk source. They are
not the focus of the game, and one readable threat is worth more than several
half-built ones.

---

## 11. The Abandoned School [LOCKED as first map]

**Tone.** Daylight through dusty windows. Empty, not haunted. Quiet enough that
sound carries. Chalk dust in the air. Blackboards everywhere, some still bearing
blueprint shapes — the diegetic tutorials of §6.4.

**Structure.** Two floors, built entirely from modular components (§12 of
`CLAUDE.md`): classrooms, corridors, a hall, stairwells, a library, a gymnasium.
Never a single mesh.

**Design requirements:**

| Requirement | Reason |
|---|---|
| Rooms connected by multiple routes | No single chokepoint dominates |
| Gaps that require a bridge | Makes the bridge blueprint meaningful |
| Corridors worth walling off | Makes the wall blueprint meaningful |
| Chalk distributed toward the dangerous interior | Pillar 3 — reward for depth |
| Sightlines short enough that melee works | Long halls make a melee game miserable |
| Sound-carrying layout | Hearing another player's chalk is a core signal |

The map is designed around the blueprints, not decorated and then checked. A gap
exists because the bridge exists.

---

## 12. Match structure and extraction

| Property | Value |
|---|---|
| Players | 4 **[PLACEHOLDER]** (2–4 initially, 8–16 eventually) |
| Duration | 12 minutes **[PLACEHOLDER]** |
| Respawn | None — death ends your match |
| Starting state | Unarmed, no chalk |
| Shrinking play area | None — the timer is the only pressure |
| Extraction zones | 2, both known from the start **[PLACEHOLDER]** |
| Zones active from | The 4-minute mark **[PLACEHOLDER]** |
| Extraction hold | 8 seconds, reset by taking damage **[PLACEHOLDER]** |

Match phases: `Lobby → Warmup → Active → Resolving → Complete`.

**Why extraction zones are known from the start:** the tension of extraction-lite
comes from a known, contested destination. Everyone knows where everyone else
must eventually go. Hidden or random zones would replace that tension with a
search.

**Why no shrinking area:** the timer is sufficient pressure, and a closing
circle is a battle-royale mechanic that would pull against the extraction
pillar.

Holding an extraction for eight seconds while vulnerable is the loop's final
decision point: the last moment where greed can cost you everything you gathered.

---

## 13. Persistence and the stakes of extraction — **OPEN**

**This is the one unresolved design question that the loop depends on, and it is
flagged rather than assumed.**

Extraction-lite genres get their meaning from a persistent stash: extracting
*keeps* what you carried, dying *loses* it. Without persistence, extracting and
dying have the same outcome — you return to the lobby — and there is no reason
to extract rather than fight until the timer ends. Pillars 3 and 5 both depend
on the answer.

Two viable resolutions:

**Option A — Persistent stash (recommended).** Chalk and items carried out are
banked to a stash that survives between matches. Dying loses everything carried.
Requires minimal storage (one SQLite file, two tables) added at the *end* of
development, not the start.

**Option B — In-match score only.** Extraction converts carried chalk into a
match result with a leaderboard. No storage at all. Weaker — the stakes are
pride rather than property — but genuinely zero infrastructure.

Until this is decided, the MVP is built with **no persistence**, and the
extraction system reports a result summary that either option can consume. The
decision is needed before Phase 9 completes, not before Phase 0 begins.

See `docs/SPEC_AUDIT.md` MD-06 / RD-06.

---

## 14. Audio and VFX

Audio is a gameplay system, not decoration. The map is quiet so that sound
carries information.

**Audio that carries information:**

| Sound | Tells the listener |
|---|---|
| Chalk scratch | Someone is drawing nearby — stationary and vulnerable |
| Footsteps | Someone is moving, and roughly how fast |
| Sword shatter | Someone just lost their weapon |
| Erased vocalizations | A threat's position |
| Extraction hold | Someone is leaving with their haul |

The chalk scratch deserves emphasis: it is simultaneously the drawer's feedback
that their stroke registered and a broadcast of their position and
vulnerability. One sound serving both the creation pillar and the risk pillar.

**VFX tied to drawing** — required, not polish:

- Chalk dust falling from the cursor as the stroke is laid down.
- The completed sketch glowing as it resolves.
- A chalk particle burst at the moment of creation.
- Visible quality differences between crude, sound, and keen objects.
- A chalk-dust shatter when a weapon breaks.

---

## 15. UI

Minimal and diegetic where possible. The HUD shows: the chalk meter, health,
stamina, equipped item with durability, and the match timer. Nothing else during
normal play.

The **Codex** (§6.4) shows known blueprint shapes, stroke order, chalk cost, and
current affordability.

Drawing feedback must be **specific**. "That didn't work" teaches nothing.
"The crossguard didn't cross the blade" teaches the player to draw better next
time — and because recognition is geometric, the system always knows exactly
which constraint failed. Specific feedback is not a nicety here; it is the only
way players learn the shapes.

---

## 16. Performance [LOCKED]

| Target | Value |
|---|---|
| Desktop browser | 60 FPS |
| Minimum acceptable | 30 FPS |

When visual complexity and gameplay clarity conflict, clarity wins. Detailed
budgets are in `docs/ARCHITECTURE.md` §9.

---

## 17. Open decisions

### Blocking

1. **§13 — persistence.** Option A or Option B. Needed before Phase 9 completes.
2. **All [PLACEHOLDER] values below.** Approve, replace, or confirm as
   provisional. They can be retuned cheaply, but the code needs numbers.

### Placeholder value summary

| Area | Values |
|---|---|
| Chalk | Range 0–100, start 0, pickup 25, Erased drop 15 |
| Costs | Sword 20, wall 15, bridge 25 |
| Failure costs | Smudge 25% of cost, unrecognized flat 5 |
| Quality bands | Crude below 0.75, sound 0.75–0.90, keen above 0.90 |
| Combat | Health 100, sword damage 35, reach 2.2 m, durability 20 hits, unarmed 5 |
| Swing | 120/80/250 ms |
| Stamina | 100, 20 per swing, 15/s after 1 s |
| Structures | Wall 60 HP, bridge 40 HP |
| Erased | 70 HP, 25 damage, 3.2 m/s, 18 m sight, 6 per match |
| Match | 4 players, 12 min, 2 zones, active at 4 min, 8 s hold |
| Inventory | 6 slots |
| Chalk plane | 1.2 m from the camera |

### Deferred

3. The Erased's visual design and animation set — needed by Phase 7.
4. The school's room-by-room layout — needed by Phase 6.
5. Audio and art asset provenance and licensing — needed before anything ships.
6. Target browser matrix — recommendation in `docs/SPEC_AUDIT.md` RD-10.

---

## 18. Out of scope for the MVP

Recorded so that they stay out:

Additional maps · additional blueprints beyond sword, wall, and bridge · ranged
weapons · additional Erased archetypes · crafting beyond drawing · progression
trees · cosmetics · mobile or controller support · 8–16 player scaling ·
matchmaking beyond a single room · anti-cheat beyond validator constraints ·
localization · voice chat.

A feature outside this list is added only after it is shown to improve creation,
scarcity, risk, creativity, or loss.

---

## 19. The point

The goal is not the largest game. The goal is to make this loop fun:

```text
Find Chalk → Draw → Create → Risk → Fight → Loot → Extract
```

If the loop is not fun, stop adding content and improve the loop.
