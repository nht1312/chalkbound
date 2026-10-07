import type RAPIER from '@dimforge/rapier3d-compat';
import { MOVEMENT } from '../config/movement';
import { PHYSICS } from '../config/physics';
import { vec3, type Vec3 } from '../math/vec';
import { PLAYER_GROUPS, PLAYER_MOVEMENT_QUERY } from '../physics/collisionGroups';
import type { PhysicsWorld, Rapier } from '../physics/staticWorld';
import { Button, type InputCommand } from '../protocol/messages';
import { canJump, canSprint, FULL_STAMINA, updateStamina, type StaminaState } from './stamina';

/**
 * Everything that determines a player's next movement step. Plain data, so it
 * can be stored per input seq and rewound for reconciliation (ARCHITECTURE §4.4).
 */
export interface PlayerState {
  /** Feet position: bottom of the capsule. */
  readonly position: Vec3;
  readonly velocity: Vec3;
  readonly grounded: boolean;
  readonly crouching: boolean;
  /** Jump was held last step; jumping is edge-triggered. */
  readonly jumpHeld: boolean;
  readonly sprinting: boolean;
  readonly stamina: StaminaState;
}

/** A player's Rapier objects. Holds no state: `stepPlayer` re-poses it every step. */
export interface PlayerBody {
  readonly collider: RAPIER.Collider;
  readonly controller: RAPIER.KinematicCharacterController;
  /** Standing capsule used to test whether there is room to stand up. */
  readonly standingShape: RAPIER.Capsule;
}

const { capsule, controller: kcc } = MOVEMENT;
const GRAVITY = -PHYSICS.gravity.y;
const JUMP_VELOCITY = Math.sqrt(2 * GRAVITY * MOVEMENT.jumpHeight);
const DEG_TO_RAD = Math.PI / 180;
const IDENTITY_ROTATION = { x: 0, y: 0, z: 0, w: 1 };
const DOWN = { x: 0, y: -1, z: 0 };
/** Contact normals at least this upright are walkable ground (cos of the max slope). */
const WALKABLE_NORMAL_Y = Math.cos(kcc.maxSlopeDegrees * DEG_TO_RAD);
/** Contact normals at least this downward are ceilings. */
const CEILING_NORMAL_Y = -WALKABLE_NORMAL_Y;
/**
 * Height above the feet where the steepest walkable slope touches the bottom
 * cap, plus the skin. Contacts at or below it are ground, not walls.
 */
const WALL_CONTACT_MIN_HEIGHT = capsule.radius * (1 - WALKABLE_NORMAL_Y) + kcc.skinWidth;

/** Rapier capsules are sized by the half-height of the cylinder between the caps. */
const capsuleHalfHeight = (totalHeight: number): number => totalHeight / 2 - capsule.radius;

/**
 * A standing player whose feet rest on the surface point `feet`.
 *
 * The feet are lifted by the controller's skin width: a capsule that starts
 * inside the skin (e.g. exactly touching the floor) is never pushed back out
 * by Rapier's controller while standing still, and slowly sinks.
 */
export function initialPlayerState(feet: Vec3): PlayerState {
  return {
    position: vec3(feet.x, feet.y + kcc.skinWidth, feet.z),
    velocity: vec3(0, 0, 0),
    grounded: false,
    crouching: false,
    jumpHeld: false,
    sprinting: false,
    stamina: FULL_STAMINA,
  };
}

export function createPlayerBody(rapier: Rapier, world: PhysicsWorld): PlayerBody {
  const standingHalfHeight = capsuleHalfHeight(capsule.standingHeight);
  const collider = world.createCollider(
    rapier.ColliderDesc.capsule(standingHalfHeight, capsule.radius).setCollisionGroups(
      PLAYER_GROUPS,
    ),
  );

  const controller = world.createCharacterController(kcc.skinWidth);
  controller.setUp({ x: 0, y: 1, z: 0 });
  controller.setMaxSlopeClimbAngle(kcc.maxSlopeDegrees * DEG_TO_RAD);
  controller.setMinSlopeSlideAngle(kcc.maxSlopeDegrees * DEG_TO_RAD);
  controller.enableAutostep(kcc.stepHeight, kcc.stepMinWidth, false);
  controller.enableSnapToGround(kcc.snapToGround);
  controller.setApplyImpulsesToDynamicBodies(false);

  return {
    collider,
    controller,
    standingShape: new rapier.Capsule(standingHalfHeight, capsule.radius),
  };
}

/**
 * Advances one player by one fixed step. The single movement implementation:
 * the client runs it to predict, the authority runs it to decide.
 */
export function stepPlayer(
  state: PlayerState,
  command: InputCommand,
  body: PlayerBody,
  world: PhysicsWorld,
  dt: number,
): PlayerState {
  const held = (button: number): boolean => (command.buttons & button) !== 0;

  // Crouch: pressing always crouches; releasing stands only if there is room.
  const crouching =
    held(Button.Crouch) || (state.crouching && !hasRoomToStand(state.position, body, world));
  const height = crouching ? capsule.crouchingHeight : capsule.standingHeight;
  body.collider.setHalfHeight(capsuleHalfHeight(height));
  const center = {
    x: state.position.x,
    y: state.position.y + height / 2,
    z: state.position.z,
  };
  body.collider.setTranslation(center);

  // Horizontal: accelerate toward the wished velocity (strong on ground, weak in air).
  const sin = Math.sin(command.yaw);
  const cos = Math.cos(command.yaw);
  let wishX = cos * command.moveX - sin * command.moveZ;
  let wishZ = -sin * command.moveX - cos * command.moveZ;
  const wishLength = Math.hypot(wishX, wishZ);
  if (wishLength > 1) {
    wishX /= wishLength;
    wishZ /= wishLength;
  }
  const wantsSprint = held(Button.Sprint) && command.moveZ > 0 && !crouching;
  const sprinting = wantsSprint && canSprint(state.stamina, state.sprinting);
  const speed = crouching
    ? MOVEMENT.crouchSpeed
    : sprinting
      ? MOVEMENT.sprintSpeed
      : MOVEMENT.walkSpeed;
  const acceleration = state.grounded ? MOVEMENT.groundAcceleration : MOVEMENT.airAcceleration;
  let [vx, vz] = approach(
    state.velocity.x,
    state.velocity.z,
    wishX * speed,
    wishZ * speed,
    acceleration * dt,
  );

  // Vertical. While grounded, request no downward motion: snap-to-ground follows
  // slopes and steps down, and feeding gravity into a grounded controller makes
  // Rapier sink slowly into the floor. Airborne, integrate gravity using the
  // step's average velocity, which is exact for constant gravity, so the jump
  // apex matches `jumpHeight` independent of tick rate.
  const jumped = state.grounded && held(Button.Jump) && !state.jumpHeld && canJump(state.stamina);
  const airborne = !state.grounded || jumped;
  const startVy = jumped ? JUMP_VELOCITY : state.grounded ? 0 : state.velocity.y;
  let vy = airborne ? startVy - GRAVITY * dt : 0;

  // Grounded: close any gap to exactly the skin width, never past it.
  const settle = airborne ? 0 : Math.max(0, (groundGap(center, body, world) ?? 0) - kcc.skinWidth);
  const dy = airborne ? ((startVy + vy) / 2) * dt : -settle;

  const desired = { x: vx * dt, y: dy, z: vz * dt };
  body.controller.computeColliderMovement(body.collider, desired, undefined, PLAYER_MOVEMENT_QUERY);
  const moved = body.controller.computedMovement();
  const grounded = body.controller.computedGrounded();

  // Obstacles absorb velocity along their normals: walls the horizontal part,
  // ceilings the upward part. Ground contacts never slow horizontal movement.
  // A wall must touch the capsule's side: contacts low on the bottom cap are
  // ground, whatever their normal says (capsule-box contacts on flat floors
  // occasionally report spurious tilted normals).
  const wallContactMinY = state.position.y + WALL_CONTACT_MIN_HEIGHT;
  for (let i = 0; i < body.controller.numComputedCollisions(); i++) {
    const collision = body.controller.computedCollision(i);
    if (!collision) continue;
    const normal = collision.normal1;
    if (normal.y <= CEILING_NORMAL_Y) {
      if (vy > 0) vy = 0;
    } else if (normal.y < WALKABLE_NORMAL_Y && collision.witness1.y > wallContactMinY) {
      [vx, vz] = removeInto(vx, vz, normal.x, normal.z);
    }
  }
  if (grounded && vy < 0) vy = 0;

  return {
    position: vec3(center.x + moved.x, center.y + moved.y - height / 2, center.z + moved.z),
    velocity: vec3(vx, vy, vz),
    grounded,
    crouching,
    jumpHeld: held(Button.Jump),
    sprinting,
    stamina: updateStamina(state.stamina, { sprinting, jumped }, dt),
  };
}

/** Distance from the capsule's current pose straight down to ground, within snap range. */
function groundGap(
  center: { x: number; y: number; z: number },
  body: PlayerBody,
  world: PhysicsWorld,
): number | undefined {
  return world.castShape(
    center,
    IDENTITY_ROTATION,
    DOWN,
    body.collider.shape,
    0,
    kcc.snapToGround + kcc.skinWidth,
    true,
    undefined,
    PLAYER_MOVEMENT_QUERY,
    body.collider,
  )?.time_of_impact;
}

/** True if a standing capsule at `feet` overlaps nothing but the player itself. */
function hasRoomToStand(feet: Vec3, body: PlayerBody, world: PhysicsWorld): boolean {
  // Lift by the skin width so resting on the floor does not count as an overlap.
  const center = {
    x: feet.x,
    y: feet.y + capsule.standingHeight / 2 + kcc.skinWidth,
    z: feet.z,
  };
  let blocked = false;
  world.intersectionsWithShape(
    center,
    IDENTITY_ROTATION,
    body.standingShape,
    () => {
      blocked = true;
      return false; // stop at the first hit
    },
    undefined,
    PLAYER_MOVEMENT_QUERY,
    body.collider,
  );
  return !blocked;
}

/** Removes the part of horizontal velocity (vx, vz) heading into a surface with normal (nx, nz). */
function removeInto(vx: number, vz: number, nx: number, nz: number): [number, number] {
  const length = Math.hypot(nx, nz);
  if (length === 0) return [vx, vz];
  const ux = nx / length;
  const uz = nz / length;
  const into = vx * ux + vz * uz;
  return into < 0 ? [vx - into * ux, vz - into * uz] : [vx, vz];
}

/** Moves (x, z) toward (tx, tz) by at most `maxDelta`. */
function approach(
  x: number,
  z: number,
  tx: number,
  tz: number,
  maxDelta: number,
): [number, number] {
  const dx = tx - x;
  const dz = tz - z;
  const distance = Math.hypot(dx, dz);
  if (distance <= maxDelta) return [tx, tz];
  return [x + (dx / distance) * maxDelta, z + (dz / distance) * maxDelta];
}
