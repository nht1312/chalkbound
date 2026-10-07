import { Room } from '@colyseus/core';
import {
  createGreyboxRoom,
  FixedStepRunner,
  MatchSimulation,
  SIMULATION,
  SIMULATION_TIMESTEP,
} from '@chalkbound/shared';
import { SERVER_CONFIG } from '../config';
import { loadRapier } from '../physics';

const MS_PER_SECOND = 1000;

/**
 * One match. The room is a scheduler and socket owner only (ARCHITECTURE
 * §5.1): gameplay lives in the shared simulation it ticks, which owns the
 * world of record. Clients connect in Phase 8.
 */
export class MatchRoom extends Room {
  private sim: MatchSimulation | undefined;

  override async onCreate(): Promise<void> {
    // Phase 0 has no clients; keep the room alive so its tick can be observed.
    this.autoDispose = false;
    const { rapier } = await loadRapier();
    const level = createGreyboxRoom();
    const sim = new MatchSimulation(rapier, level);
    this.sim = sim;

    const runner = new FixedStepRunner(SIMULATION_TIMESTEP, () => sim.step());
    this.setSimulationInterval(
      (deltaMs) => runner.advance(deltaMs / MS_PER_SECOND),
      MS_PER_SECOND / SIMULATION.tickRate,
    );

    this.reportTickRate(sim);
    console.log(`[match ${this.roomId}] created, ${level.boxes.length} static colliders`);
  }

  override onDispose(): void {
    this.sim?.dispose();
    this.sim = undefined;
  }

  /** Logs the measured simulation rate so tick stability is observable. */
  private reportTickRate(sim: MatchSimulation): void {
    let lastTick = sim.tick;
    let lastTime = performance.now();
    this.clock.setInterval(() => {
      const now = performance.now();
      const rate = ((sim.tick - lastTick) * MS_PER_SECOND) / (now - lastTime);
      console.log(`[match ${this.roomId}] tick ${sim.tick}  ${rate.toFixed(2)} Hz`);
      lastTick = sim.tick;
      lastTime = now;
    }, SERVER_CONFIG.tickReportIntervalMs);
  }
}
