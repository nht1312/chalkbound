import { matchMaker, Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { SERVER_CONFIG } from './config';
import { loadRapier } from './physics';
import { MatchRoom } from './rooms/MatchRoom';

const BYTES_PER_MB = 1024 * 1024;

async function main(): Promise<void> {
  const { rapier, report } = await loadRapier();
  console.log(
    `[physics] rapier ${rapier.version()} ready in ${report.loadMs.toFixed(0)} ms ` +
      `(rss +${(report.rssDelta / BYTES_PER_MB).toFixed(1)} MB, ` +
      `wasm/arrayBuffers +${(report.arrayBuffersDelta / BYTES_PER_MB).toFixed(1)} MB)`,
  );

  const server = new Server({ transport: new WebSocketTransport() });
  server.define(SERVER_CONFIG.matchRoomName, MatchRoom);
  await server.listen(SERVER_CONFIG.port);
  console.log(`[server] listening on ws://localhost:${SERVER_CONFIG.port}`);

  // Phase 0 has no clients yet; create one room up front so its tick can be observed.
  await matchMaker.createRoom(SERVER_CONFIG.matchRoomName, {});
}

main().catch((error: unknown) => {
  console.error('[server] failed to start', error);
  process.exit(1);
});
