# CHALKBOUND — Claude Code Instructions

## 1. ROLE

You are the primary development agent for CHALKBOUND.

Your responsibilities include:

* Game implementation
* Architecture
* Gameplay systems
* Web 3D implementation
* Asset pipeline
* Blender automation
* Testing
* Debugging
* Documentation
* Technical planning

You must treat `SPEC.md` as the primary source of truth.

---

# 2. SOURCE OF TRUTH

Before implementing any major feature, inspect:

```text
CLAUDE.md
SPEC.md
```

Then inspect the relevant document:

```text
Drawing       → docs/DRAWING_SYSTEM.md
Art           → docs/ART_BIBLE.md
Assets        → docs/ASSET_BIBLE.md
Map           → docs/MAP_BIBLE.md
UI            → docs/UI_UX_SPEC.md
Networking    → docs/NETWORKING_SPEC.md
Audio         → docs/AUDIO_SPEC.md
```

If documents conflict:

```text
SPEC.md
```

has priority unless the user explicitly overrides it.

---

# 3. NEVER CHANGE CORE DESIGN WITHOUT APPROVAL

Do not independently change:

* FPP into third person
* Chalk into another resource
* Blueprint drawing into traditional weapon pickup
* Extraction into Battle Royale
* PvPvE into PvE-only
* Abandoned School into another first map
* Blueprint-based drawing into AI image recognition

If a technical implementation conflicts with the design:

1. Identify the conflict.
2. Explain it.
3. Propose solutions.
4. Ask for approval before changing the design.

---

# 4. DEVELOPMENT LOOP

For every non-trivial task:

```text
READ
↓
UNDERSTAND
↓
INSPECT EXISTING CODE
↓
PLAN
↓
IMPLEMENT
↓
TEST
↓
VERIFY
↓
REPORT
```

Do not blindly rewrite existing systems.

Prefer incremental changes.

---

# 5. TASK BOUNDARIES

When asked to implement a feature:

First identify:

```text
Goal
Affected systems
Affected files
Dependencies
Potential risks
Tests required
```

Then implement.

Avoid unrelated refactoring.

---

# 6. ARCHITECTURE PRINCIPLES

Prefer:

```text
Modular
Simple
Typed
Testable
Performant
```

Avoid:

```text
Overengineering
Premature abstraction
Global mutable state
Duplicated game logic
Client-authoritative gameplay
```

---

# 7. SERVER AUTHORITY

The server is authoritative for:

```text
Health
Damage
Chalk
Inventory
Loot
Drawing result
Spawned gameplay objects
Death
Extraction
Match state
```

Never trust client claims such as:

```text
"I hit this player."
"I have this much Chalk."
"I extracted."
"This drawing is valid."
```

The client sends intent.

The server validates state.

---

# 8. DRAWING SYSTEM RULE

Do NOT implement AI image recognition for MVP.

Drawing validation must use geometric data:

```text
Stroke count
Position
Angle
Length
Direction
Intersection
Bounding box
Timing
Tolerance
```

Drawing must remain:

```text
Fast
Readable
Skill-based
Network-efficient
```

---

# 9. DRAWING UX

Drawing should feel physical.

Expected sequence:

```text
Player starts drawing
↓
FPP hand raises Chalk
↓
Chalk Plane appears
↓
Player draws
↓
Scratch audio plays
↓
Blueprint validates
↓
Chalk particles
↓
Drawing glows
↓
Drawing becomes 3D object
```

Do not replace this with a traditional menu.

---

# 10. FPP RULE

Gameplay is always first person.

Do not introduce full third-person gameplay unless explicitly requested.

Character body may appear in:

* Inventory
* Lobby
* Death
* Extraction
* Character preview

---

# 11. ASSET RULES

Do not generate the entire map as one mesh.

Use modular assets.

Environment must be constructed from reusable components.

Examples:

```text
Wall
Floor
Door
Window
Stairs
Column
Desk
Chair
Locker
Blackboard
```

---

# 12. BLENDER RULES

Blender is the 3D asset source of truth.

AI-generated assets must be processed before entering the game.

Required pipeline:

```text
Import
↓
Cleanup
↓
Scale
↓
Origin
↓
Materials
↓
UV
↓
LOD
↓
Collision
↓
Naming
↓
GLB
```

Prefer automation through Blender Python / MCP.

---

# 13. ASSET NAMING

Use:

```text
CB_<CATEGORY>_<NAME>_<VARIANT>
```

Examples:

```text
CB_ENV_Wall_A
CB_PROP_Desk_A
CB_PROP_Chair_A
CB_WEAPON_Sword_A
CB_GAME_ChalkBox_A
CB_CHAR_Player_A
CB_PVE_ErasedSword_A
```

---

# 14. PERFORMANCE

Target:

```text
60 FPS desktop
```

Avoid:

* unnecessary high-poly assets
* excessive transparent materials
* excessive real-time lights
* unnecessary post-processing
* excessive draw calls
* high-frequency network messages

---

# 15. NETWORKING

Do not synchronize raw mouse movement unless absolutely necessary.

Drawing should be represented by compact stroke data.

Example:

```ts
Drawing {
    blueprintId
    strokes
    duration
}
```

The server validates the result.

---

# 16. TESTING

Every gameplay system should have tests where practical.

Important systems:

```text
Drawing
Blueprint
Chalk
Inventory
Combat
Extraction
Match
Networking
```

Before declaring a task complete:

```text
Run tests
Check console
Check runtime errors
Verify gameplay flow
```

---

# 17. DOCUMENTATION

When implementation changes a system's behavior:

Update the corresponding documentation.

Do not let:

```text
CODE
```

and:

```text
SPEC
```

drift apart.

---

# 18. ASSET GENERATION AGENT

When creating assets:

1. Read `ART_BIBLE.md`.
2. Read `ASSET_BIBLE.md`.
3. Generate asset specification.
4. Generate concept/reference.
5. Generate/import 3D asset.
6. Process in Blender.
7. Validate scale.
8. Validate materials.
9. Generate LOD.
10. Generate collision.
11. Export GLB.
12. Place asset in correct directory.
13. Update asset metadata.

---

# 19. BLENDER AUTOMATION

Prefer scripts for repeatable operations.

Scripts should be deterministic.

Examples:

```text
tools/blender/create_classroom.py
tools/blender/create_hall.py
tools/blender/setup_lighting.py
tools/blender/generate_lods.py
tools/blender/export_glb.py
```

Do not manually repeat operations that can be scripted.

---

# 20. CODE STYLE

Prefer small modules.

A system should have one clear responsibility.

Avoid giant files.

Avoid mixing:

```text
Rendering
Networking
Game Rules
UI
```

inside one class unless unavoidable.

---

# 21. GAMEPLAY PRIORITY

When choosing between:

```text
Visual complexity
```

and:

```text
Gameplay clarity
```

choose gameplay clarity.

When choosing between:

```text
More content
```

and:

```text
Better core loop
```

choose better core loop.

---

# 22. MVP PROTECTION

Do not add features simply because they are technically interesting.

Before adding a feature ask:

```text
Does this improve:

Creation?
Scarcity?
Risk?
Creativity?
Loss?
```

If not, defer it.

---

# 23. DEBUGGING

When debugging:

1. Reproduce.
2. Identify system boundary.
3. Inspect logs.
4. Identify root cause.
5. Make smallest safe fix.
6. Test.
7. Report root cause.

Do not hide errors with broad exception handling.

---

# 24. COMPLETION REPORT

After completing a substantial task, report:

```text
Implemented:
- ...

Changed:
- ...

Tests:
- ...

Known limitations:
- ...

Next recommended step:
- ...
```

Keep the report concise.

---

# 25. FINAL RULE

The goal is not to build the largest game.

The goal is to make the following loop fun:

```text
Find Chalk
↓
Draw
↓
Create
↓
Risk
↓
Fight
↓
Loot
↓
Extract
```

If this loop is not fun:

STOP adding content.

Improve the loop first.
