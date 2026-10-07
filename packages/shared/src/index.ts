export { SIMULATION, FIXED_DT, TICKS_PER_SNAPSHOT } from './config/simulation';
export { NETWORK } from './config/network';
export { PHYSICS } from './config/physics';
export { MOVEMENT } from './config/movement';
export { STAMINA } from './config/stamina';
export { ECONOMY } from './config/economy';
export { INVENTORY } from './config/inventory';
export { INTERACTION } from './config/interaction';

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
  type InputCommand,
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
