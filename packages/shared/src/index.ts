export { SIMULATION, FIXED_DT, TICKS_PER_SNAPSHOT } from './config/simulation';
export { NETWORK } from './config/network';
export { PHYSICS } from './config/physics';
export { MOVEMENT } from './config/movement';
export { STAMINA } from './config/stamina';
export { ECONOMY } from './config/economy';
export { INVENTORY } from './config/inventory';
export { INTERACTION } from './config/interaction';
export { DRAWING } from './config/drawing';
export { CREATION } from './config/creation';

export {
  advanceFixedTimestep,
  FixedStepRunner,
  SIMULATION_TIMESTEP,
  type FixedTimestepConfig,
  type FixedTimestepResult,
} from './loop/fixedTimestep';

export { vec3, type Vec3 } from './math/vec';
export * from './math/quantize';

export {
  Button,
  type DrawingSubmission,
  type InputCommand,
  type ChalkBoxState,
  type DrawnObjectState,
  type EquippedWeaponState,
  type ClientMessage,
  type ServerMessage,
} from './protocol/messages';
export {
  encodeClientMessage,
  decodeClientMessage,
  encodeServerMessage,
  decodeServerMessage,
  ProtocolError,
  quantizeInputCommand,
} from './protocol/codec';

export type { Transport, TransportStats, Reliability } from './net/transport';
export {
  createLoopbackPair,
  PERFECT_LINK,
  type LinkConditions,
  type LoopbackOptions,
  type Scheduler,
} from './net/loopbackTransport';

export {
  MatchSimulation,
  type DrawingRefusal,
  type DrawingSubmissionResult,
  type HintDisagreement,
  type InteractOutcome,
  type InteractResult,
  type PlayerId,
} from './sim/MatchSimulation';
export { eyePosition, withinInteractRange } from './sim/interaction';
export { SimulationHost } from './sim/SimulationHost';
export {
  createPlayerBody,
  initialPlayerState,
  stepPlayer,
  type PlayerBody,
  type PlayerState,
} from './sim/stepPlayer';
export {
  canJump,
  canSprint,
  FULL_STAMINA,
  updateStamina,
  type StaminaState,
  type StaminaUse,
} from './sim/stamina';
export { addChalk } from './sim/chalk';
export { applyDrawMode, isDrawing } from './sim/drawMode';
export {
  addItem,
  createInventory,
  removeItem,
  type Inventory,
  type ItemDef,
  type ItemId,
  type ItemStack,
} from './sim/inventory';

export {
  CHALK_BOX_SIZE,
  createGreyboxRoom,
  type ChalkBoxSpawn,
  type LevelData,
  type StaticBox,
  type SurfaceKind,
} from './world/greyboxRoom';
export { createStaticWorld, type PhysicsWorld, type Rapier } from './physics/staticWorld';

export type {
  NormalizedDrawing,
  NormalizedStroke,
  PlanePoint,
  Point2,
  Sketch,
  Stroke,
} from './drawing/types';
export { normalizeSketch, pathLength, resampleStroke } from './drawing/normalize';
export {
  angleDifference,
  canonicalAngle,
  dominantAngle,
  polylineCrossing,
  type Crossing,
} from './drawing/geometry';
export {
  classifyAspect,
  discriminatorDistance,
  extractDiscriminators,
  type AspectClass,
  type Discriminators,
} from './drawing/discriminators';
export {
  aspectRatio,
  bandScore,
  closure,
  direction,
  endpointProximity,
  humanLikeness,
  intersection,
  logBandScore,
  ramp,
  relativeLength,
  straightness,
  strokeCount,
  templateDistance,
  timing,
  type Constraint,
  type ConstraintFailure,
  type ConstraintResult,
  type FailureCode,
  type IntersectionOptions,
  type TimingRange,
} from './drawing/constraints';
export type {
  BlueprintId,
  BlueprintTemplate,
  DrawingOutcome,
  Quality,
  RejectionReason,
  SpawnDescriptor,
} from './drawing/blueprint';
export { BLUEPRINTS, blueprintById } from './drawing/blueprints/registry';
export { SWORD } from './drawing/blueprints/sword';
export { WALL } from './drawing/blueprints/wall';
export { BRIDGE } from './drawing/blueprints/bridge';
export {
  damage,
  isDestroyed,
  scaledStat,
  type DrawnObject,
  type DrawnObjectId,
  type DrawnStructure,
  type DrawnWeapon,
} from './drawing/drawnObject';
export {
  forwardFromYaw,
  placeStructure,
  type DrawnTransform,
  type Footprint,
} from './drawing/placement';
export { spawnDrawnObject, type SpawnGrade, type SpawnRequest } from './drawing/spawn';
export {
  addDrawnCollider,
  removeDrawnCollider,
  type CollidableStructure,
} from './physics/drawnColliders';
export { classify, type CandidateScore, type Classification } from './drawing/classify';
export {
  grade,
  qualityFor,
  validateSketch,
  type Grade,
  type ValidateOptions,
} from './drawing/validate';
export {
  chalkCostOf,
  chalkDebitFor,
  toDrawingResultOutcome,
  type DrawingResult,
  type DrawingResultOutcome,
} from './drawing/result';
export {
  blueprintFromWireId,
  blueprintWireId,
  decodeDrawingResult,
  decodeSketch,
  encodeDrawingResult,
  encodeSketch,
  quantizeSketch,
} from './drawing/wire';
