import { describe, expect, it } from 'vitest';
import { ManualScheduler, seededRandom as seeded } from '../testing/ManualScheduler';
import { createLoopbackPair, type LinkConditions } from './loopbackTransport';

function setup(conditions: LinkConditions, seed = 1) {
  const scheduler = new ManualScheduler();
  const [client, server] = createLoopbackPair({ conditions, scheduler, random: seeded(seed) });
  const received: number[] = [];
  server.onMessage((data) => received.push(data[0] ?? -1));
  return { scheduler, client, server, received };
}

describe('LoopbackTransport', () => {
  it('delivers after the configured one-way latency, not before', () => {
    const { scheduler, client, received } = setup({ latencyMs: 50, jitterMs: 0, lossRate: 0 });
    client.send(new Uint8Array([7]), 'reliable');
    scheduler.advance(49);
    expect(received).toEqual([]);
    scheduler.advance(1);
    expect(received).toEqual([7]);
  });

  it('is asynchronous even with zero latency', () => {
    const { scheduler, client, received } = setup({ latencyMs: 0, jitterMs: 0, lossRate: 0 });
    client.send(new Uint8Array([1]), 'unreliable');
    expect(received).toEqual([]);
    scheduler.advance(0);
    expect(received).toEqual([1]);
  });

  it('keeps jittered latency within latency ± jitter', () => {
    const scheduler = new ManualScheduler();
    const [client, server] = createLoopbackPair({
      conditions: { latencyMs: 100, jitterMs: 20, lossRate: 0 },
      scheduler,
      random: seeded(3),
    });
    const arrivals: number[] = [];
    server.onMessage(() => arrivals.push(scheduler.now()));
    for (let i = 0; i < 200; i++) client.send(new Uint8Array([i]), 'unreliable');
    scheduler.advance(1000);
    expect(arrivals).toHaveLength(200);
    for (const t of arrivals) {
      expect(t).toBeGreaterThanOrEqual(80);
      expect(t).toBeLessThanOrEqual(120);
    }
  });

  it('never drops or reorders reliable messages, even under jitter and loss', () => {
    const { scheduler, client, received } = setup({ latencyMs: 60, jitterMs: 40, lossRate: 0.5 });
    for (let i = 0; i < 100; i++) {
      client.send(new Uint8Array([i]), 'reliable');
      scheduler.advance(1);
    }
    scheduler.advance(500);
    expect(received).toEqual(Array.from({ length: 100 }, (_, i) => i));
  });

  it('drops roughly lossRate of unreliable messages and counts them', () => {
    const { scheduler, client, server, received } = setup({
      latencyMs: 0,
      jitterMs: 0,
      lossRate: 0.25,
    });
    for (let i = 0; i < 2000; i++) client.send(new Uint8Array([1]), 'unreliable');
    scheduler.advance(0);
    const lossFraction = client.stats.messagesDropped / 2000;
    expect(lossFraction).toBeGreaterThan(0.2);
    expect(lossFraction).toBeLessThan(0.3);
    expect(received.length + client.stats.messagesDropped).toBe(2000);
    expect(server.stats.messagesReceived).toBe(received.length);
  });

  it('copies payloads so the sender can reuse its buffer', () => {
    const { scheduler, client, received } = setup({ latencyMs: 10, jitterMs: 0, lossRate: 0 });
    const buffer = new Uint8Array([5]);
    client.send(buffer, 'reliable');
    buffer[0] = 9;
    scheduler.advance(10);
    expect(received).toEqual([5]);
  });

  it('counts bytes in both directions and stops delivering after close', () => {
    const { scheduler, client, server, received } = setup({
      latencyMs: 5,
      jitterMs: 0,
      lossRate: 0,
    });
    client.send(new Uint8Array([1, 2, 3]), 'reliable');
    scheduler.advance(5);
    expect(client.stats.bytesSent).toBe(3);
    expect(server.stats.bytesReceived).toBe(3);

    client.send(new Uint8Array([4]), 'reliable');
    server.close();
    scheduler.advance(5);
    expect(received).toEqual([1]);
  });
});
