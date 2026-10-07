import { Room } from '@colyseus/core';
import {
  createGreyboxRoom,
  createStaticWorld,
  FixedStepRunner,
  MatchSimulation,
  SIMULATION,
  SIMULATION_TIMESTEP,
  type PhysicsWorld,
} from '@chalkbound/shared';
import { SERVER_CONFIG } from '../config';
import { loadRapier } from '../physics';

const MS_PER_SECOND = 1000;

/**
 * One match. The room is a scheduler and socket owner only (ARCHITECTURE
 * §5.1): gameplay lives in the shared simulation it ticks. Phase 0 has no
 * players or messages yet — it proves the 60 Hz authoritative tick.
 */
export class MatchRoom extends Room {
  private sim = new MatchSimulation();
  private world: PhysicsWorld | undefined;

  override async onCreate(): Promise<void> {
    // Phase 0 has no clients; keep the room alive so its tick can be observed.
    this.autoDispose = false;
    const { rapier } = await loadRapier();
    this.world = createStaticWorld(rapier, createGreyboxRoom().boxes);
    const world = this.world;

    const runner = new FixedStepRunner(SIMULATION_TIMESTEP, () => {
      this.sim.step();
      world.step();
    });
    this.setSimulationInterval(
      (deltaMs) => runner.advance(deltaMs / MS_PER_SECOND),
      MS_PER_SECOND / SIMULATION.tickRate,
    );

    this.reportTickRate();
    console.log(`[match ${this.roomId}] created, ${world.colliders.len()} static colliders`);
  }

  override onDispose(): void {
    this.world?.free();
    this.world = undefined;
  }

  /** Logs the measured simulation rate so tick stability is observable. */
  private reportTickRate(): void {
    let lastTick = this.sim.tick;
    let lastTime = performance.now();
    this.clock.setInterval(() => {
      const now = performance.now();
      const rate = ((this.sim.tick - lastTick) * MS_PER_SECOND) / (now - lastTime);
      console.log(`[match ${this.roomId}] tick ${this.sim.tick}  ${rate.toFixed(2)} Hz`);
      lastTick = this.sim.tick;
      lastTime = now;
    }, SERVER_CONFIG.tickReportIntervalMs);
  }
}
