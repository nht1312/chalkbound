import { vec3, type Vec3 } from '../math/vec';

/** Visual category of a static box; the client maps it to a flat-colour material. */
export type SurfaceKind = 'floor' | 'wall' | 'blackboard' | 'desk';

/** Axis-aligned static box. Both the renderer and both physics worlds build from this. */
export interface StaticBox {
  readonly id: string;
  readonly kind: SurfaceKind;
  readonly center: Vec3;
  readonly halfExtents: Vec3;
}

/** An authored chalk box. Boxes are pickups, not colliders: players walk through them. */
export interface ChalkBoxSpawn {
  /** Stable id, sent on the wire as a u16. */
  readonly id: number;
  /** Centre of the box. */
  readonly position: Vec3;
  /** Chalk it holds; defaults to ECONOMY.chalk.perBox. */
  readonly amount?: number;
}

export interface LevelData {
  readonly boxes: readonly StaticBox[];
  /** Player feet position at spawn. */
  readonly spawn: Vec3;
  readonly chalkBoxes: readonly ChalkBoxSpawn[];
}

/** Visual size of a chalk box, m (greybox). */
export const CHALK_BOX_SIZE = { width: 0.25, height: 0.1, depth: 0.15 } as const;

/** Room dimensions in metres — roughly one classroom. */
const ROOM = { width: 10, depth: 8, height: 3.2, wallThickness: 0.2, floorThickness: 0.2 } as const;
const DESK = {
  width: 1.2,
  depth: 0.6,
  height: 0.75,
  rows: 3,
  columns: 3,
  spacingX: 2,
  spacingZ: 1.6,
  offsetZ: 0.5,
} as const;
const BLACKBOARD = { width: 4, height: 1.2, thickness: 0.05, centerY: 1.6 } as const;

/**
 * A trench across the full width of the room, between the desks and the
 * blackboard. It exists so a bridge has a job: without somewhere to fall, a
 * walkable surface cannot be shown to work (ROADMAP Phase 4).
 *
 * `[PLACEHOLDER]`. It is sized to be comfortably spanned by the 4 m bridge
 * and to leave the far strip wide enough to stand on, which matters more than
 * it sounds — a ledge narrower than the player capsule cannot be landed on at
 * all. Whether it is also *too narrow to jump* is a level-design question that
 * belongs to the real school at Phase 6, not to the greybox.
 */
export const FLOOR_GAP = { fromZ: -3.2, toZ: -1.6 } as const;

/**
 * Phase 0 grey-box: one classroom-sized room with desk blocks, used to check
 * scale, lighting, camera feel and colliders. Defined once here so rendering
 * and physics can never disagree. Replaced by the Abandoned School in Phase 6.
 */
export function createGreyboxRoom(): LevelData {
  const boxes: StaticBox[] = [];
  const halfW = ROOM.width / 2;
  const halfD = ROOM.depth / 2;
  const halfH = ROOM.height / 2;
  const halfT = ROOM.wallThickness / 2;

  // Floor top surface sits at y = 0, in two slabs either side of the trench.
  const floorY = -ROOM.floorThickness / 2;
  const halfT_floor = ROOM.floorThickness / 2;
  const slab = (id: string, fromZ: number, toZ: number): void => {
    boxes.push({
      id,
      kind: 'floor',
      center: vec3(0, floorY, (fromZ + toZ) / 2),
      halfExtents: vec3(halfW, halfT_floor, (toZ - fromZ) / 2),
    });
  };
  slab('floor-far', -halfD, FLOOR_GAP.fromZ);
  slab('floor-near', FLOOR_GAP.toZ, halfD);

  // Walls sit just outside the floor footprint so the interior is exactly width × depth.
  boxes.push(
    {
      id: 'wall-north',
      kind: 'wall',
      center: vec3(0, halfH, -halfD - halfT),
      halfExtents: vec3(halfW + ROOM.wallThickness, halfH, halfT),
    },
    {
      id: 'wall-south',
      kind: 'wall',
      center: vec3(0, halfH, halfD + halfT),
      halfExtents: vec3(halfW + ROOM.wallThickness, halfH, halfT),
    },
    {
      id: 'wall-west',
      kind: 'wall',
      center: vec3(-halfW - halfT, halfH, 0),
      halfExtents: vec3(halfT, halfH, halfD),
    },
    {
      id: 'wall-east',
      kind: 'wall',
      center: vec3(halfW + halfT, halfH, 0),
      halfExtents: vec3(halfT, halfH, halfD),
    },
  );

  boxes.push({
    id: 'blackboard',
    kind: 'blackboard',
    center: vec3(0, BLACKBOARD.centerY, -halfD + BLACKBOARD.thickness / 2),
    halfExtents: vec3(BLACKBOARD.width / 2, BLACKBOARD.height / 2, BLACKBOARD.thickness / 2),
  });

  for (let row = 0; row < DESK.rows; row++) {
    for (let col = 0; col < DESK.columns; col++) {
      boxes.push({
        id: `desk-${row}-${col}`,
        kind: 'desk',
        center: vec3(
          (col - (DESK.columns - 1) / 2) * DESK.spacingX,
          DESK.height / 2,
          (row - (DESK.rows - 1) / 2) * DESK.spacingZ + DESK.offsetZ,
        ),
        halfExtents: vec3(DESK.width / 2, DESK.height / 2, DESK.depth / 2),
      });
    }
  }

  // Chalk: on the front-left desk, in the back-left corner, and on the floor
  // below the blackboard (the chalk tray of SPEC §5).
  const onFloor = CHALK_BOX_SIZE.height / 2;
  const chalkBoxes: ChalkBoxSpawn[] = [
    {
      id: 1,
      position: vec3(-DESK.spacingX, DESK.height + onFloor, -DESK.spacingZ + DESK.offsetZ),
    },
    { id: 2, position: vec3(-halfW + 0.5, onFloor, halfD - 0.5) },
    // On the far side of the trench: the chalk tray is bridge-gated.
    { id: 3, position: vec3(1.5, onFloor, -halfD + 0.4) },
  ];

  // Spawn in the aisle between the first two desk columns, facing the blackboard (-Z).
  return { boxes, spawn: vec3(DESK.spacingX / 2, 0, halfD - 1), chalkBoxes };
}
