export { SIMULATION, FIXED_DT, TICKS_PER_SNAPSHOT } from './config/simulation';
export { NETWORK } from './config/network';
export { PHYSICS } from './config/physics';

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
} from './protocol/codec';

export type { Transport, TransportStats, Reliability } from './net/transport';
export {
  createLoopbackPair,
  PERFECT_LINK,
  type LinkConditions,
  type LoopbackOptions,
  type Scheduler,
} from './net/loopbackTransport';

export { MatchSimulation, type PlayerId } from './sim/MatchSimulation';
export { SimulationHost } from './sim/SimulationHost';

export {
  createGreyboxRoom,
  type LevelData,
  type StaticBox,
  type SurfaceKind,
} from './world/greyboxRoom';
export { createStaticWorld, type PhysicsWorld, type Rapier } from './physics/staticWorld';
