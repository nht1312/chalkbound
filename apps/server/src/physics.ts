import RAPIER from '@dimforge/rapier3d-compat';
import type { Rapier } from '@chalkbound/shared';

export interface RapierLoadReport {
  readonly loadMs: number;
  /** Resident set growth during init, in bytes (includes module parse). */
  readonly rssDelta: number;
  /** ArrayBuffer growth during init, in bytes (the WASM linear memory). */
  readonly arrayBuffersDelta: number;
}

let loading: Promise<{ rapier: Rapier; report: RapierLoadReport }> | undefined;

/**
 * Initialises Rapier once per process and measures its cost (SPEC_AUDIT R-06).
 *
 * The server uses the `-compat` build, the same as the client. The plain
 * `@dimforge/rapier3d` build is bundler-only (extensionless internal imports,
 * no `main`), so it does not load in plain Node — see ARCHITECTURE §1.2.
 */
export function loadRapier(): Promise<{ rapier: Rapier; report: RapierLoadReport }> {
  loading ??= (async () => {
    const before = process.memoryUsage();
    const start = performance.now();
    await RAPIER.init();
    const after = process.memoryUsage();
    return {
      rapier: RAPIER,
      report: {
        loadMs: performance.now() - start,
        rssDelta: after.rss - before.rss,
        arrayBuffersDelta: after.arrayBuffers - before.arrayBuffers,
      },
    };
  })();
  return loading;
}
