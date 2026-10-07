import {
  FixedStepRunner,
  MatchSimulation,
  SIMULATION,
  SIMULATION_TIMESTEP,
  SimulationHost,
  type LevelData,
  type Rapier,
  type Transport,
} from '@chalkbound/shared';

export interface LocalAuthority {
  readonly host: SimulationHost;
  dispose(): void;
}

/**
 * Runs the authoritative simulation in-process, behind a loopback transport
 * (ARCHITECTURE D-01). The client never touches it directly: it only sees
 * the server end of the transport. Phase 8 replaces this with a real server.
 */
export function startLocalAuthority(
  serverEnd: Transport,
  rapier: Rapier,
  level: LevelData,
): LocalAuthority {
  const sim = new MatchSimulation(rapier, level);
  const host = new SimulationHost(sim);
  host.connect(serverEnd);

  const runner = new FixedStepRunner(SIMULATION_TIMESTEP, () => host.step());
  let last = performance.now();
  // Its own timer, independent of rendering, like a separate server process.
  const interval = window.setInterval(() => {
    const now = performance.now();
    runner.advance((now - last) / 1000);
    last = now;
  }, 1000 / SIMULATION.tickRate);

  return {
    host,
    dispose() {
      window.clearInterval(interval);
      serverEnd.close();
      sim.dispose();
    },
  };
}
