import type { Vector3, WebGLRenderer } from 'three';
import type { LinkConditions, TransportStats } from '@chalkbound/shared';
import type { NetClient } from '../net/NetClient';
import type { PlayerPredictor } from '../player/PlayerPredictor';
import { groundDistance, type ClientPhysics } from '../physics/loadPhysics';
import type { FrameTiming } from './statsOverlay';

export interface ReadoutSources {
  readonly renderer: WebGLRenderer;
  readonly net: NetClient;
  readonly link: LinkConditions;
  readonly cameraPosition: Vector3;
  /** Undefined until physics finishes loading. */
  physics(): ClientPhysics | undefined;
  /** Undefined until physics finishes loading. */
  predictor(): PlayerPredictor | undefined;
}

const MAX_GROUND_RAY = 50;
const BYTES_PER_MB = 1024 * 1024;

function predictionLine(predictor: PlayerPredictor | undefined): string {
  if (!predictor) return 'prediction —';
  const p = predictor.state.position;
  return (
    `predicted ${p.x.toFixed(2)} ${p.y.toFixed(2)} ${p.z.toFixed(2)}` +
    `  pending ${predictor.pendingCount}  corrections ${predictor.corrections}`
  );
}

/** Chrome-only, non-standard; absent elsewhere. */
interface PerformanceMemory {
  readonly usedJSHeapSize: number;
}

/**
 * Builds the debug overlay text: frame cost, render budget, memory, physics
 * status, and network rates over the loopback link (ARCHITECTURE §9).
 */
export function createDebugReadout(sources: ReadoutSources): (timing: FrameTiming) => string[] {
  let previous: TransportStats = { ...sources.net.transport.stats };

  return (timing) => {
    const { renderer, net, link } = sources;
    const { calls, triangles } = renderer.info.render;
    const { geometries, textures } = renderer.info.memory;

    const stats = net.transport.stats;
    const upBps = (stats.bytesSent - previous.bytesSent) / timing.elapsed;
    const downBps = (stats.bytesReceived - previous.bytesReceived) / timing.elapsed;
    const upMps = (stats.messagesSent - previous.messagesSent) / timing.elapsed;
    const downMps = (stats.messagesReceived - previous.messagesReceived) / timing.elapsed;
    previous = { ...stats };

    const memory = (performance as Performance & { memory?: PerformanceMemory }).memory;
    const heap = memory ? `${(memory.usedJSHeapSize / BYTES_PER_MB).toFixed(1)} MB` : 'n/a';

    const physics = sources.physics();
    const physicsLine = physics
      ? `physics ready ${physics.loadMs.toFixed(0)} ms · ${physics.world.colliders.len()} colliders · ground ${
          groundDistance(physics, sources.cameraPosition, MAX_GROUND_RAY)?.toFixed(2) ?? '—'
        } m`
      : 'physics loading…';

    const rtt = net.rttMs === undefined ? '—' : `${net.rttMs.toFixed(1)} ms`;
    const p = net.authoritativePlayer;
    const serverPlayer = p
      ? `server pos ${p.position.x.toFixed(2)} ${p.position.y.toFixed(2)} ${p.position.z.toFixed(2)}` +
        `  ${p.grounded ? 'ground' : 'air'}${p.crouching ? ' crouch' : ''}${p.sprinting ? ' sprint' : ''}` +
        `  stamina ${p.stamina.value.toFixed(0)}`
      : 'server pos —';

    return [
      `${timing.fps.toFixed(0)} fps  ${timing.frameMs.toFixed(1)} ms`,
      `${calls} draws  ${triangles} tris  ${geometries} geo  ${textures} tex`,
      `js heap ${heap}`,
      physicsLine,
      `loopback ${link.latencyMs}±${link.jitterMs} ms  loss ${(link.lossRate * 100).toFixed(0)}%`,
      `rtt ${rtt}  server tick ${net.serverTick}  unacked ${net.unackedCount}`,
      serverPlayer,
      predictionLine(sources.predictor()),
      `up ${upBps.toFixed(0)} B/s (${upMps.toFixed(0)}/s)  down ${downBps.toFixed(0)} B/s (${downMps.toFixed(0)}/s)`,
    ];
  };
}
