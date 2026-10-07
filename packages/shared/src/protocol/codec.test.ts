import { describe, expect, it } from 'vitest';
import { NETWORK } from '../config/network';
import { ANGLE_QUANTIZATION_ERROR, UNIT_QUANTIZATION_ERROR } from '../math/quantize';
import {
  decodeClientMessage,
  decodeServerMessage,
  encodeClientMessage,
  encodeServerMessage,
  ProtocolError,
  quantizeInputCommand,
} from './codec';
import type { PlayerState } from '../sim/stepPlayer';
import { Button, type InputCommand } from './messages';

const command: InputCommand = {
  seq: 4_000_000_000,
  tick: 123_456,
  moveX: -0.7071,
  moveZ: 0.7071,
  yaw: -2.5,
  pitch: 1.2,
  buttons: Button.Sprint | Button.Draw,
};

describe('client messages', () => {
  it('round-trips an input batch within quantization bounds', () => {
    const encoded = encodeClientMessage({ type: 'inputBatch', commands: [command, command] });
    expect(encoded.byteLength).toBe(2 + 2 * 16);

    const decoded = decodeClientMessage(encoded);
    if (decoded.type !== 'inputBatch') throw new Error('wrong type');
    expect(decoded.commands).toHaveLength(2);
    const [c] = decoded.commands;
    expect(c?.seq).toBe(command.seq);
    expect(c?.tick).toBe(command.tick);
    expect(c?.buttons).toBe(command.buttons);
    expect(Math.abs((c?.moveX ?? 0) - command.moveX)).toBeLessThanOrEqual(UNIT_QUANTIZATION_ERROR);
    expect(Math.abs((c?.moveZ ?? 0) - command.moveZ)).toBeLessThanOrEqual(UNIT_QUANTIZATION_ERROR);
    expect(Math.abs((c?.yaw ?? 0) - command.yaw)).toBeLessThanOrEqual(ANGLE_QUANTIZATION_ERROR);
    expect(Math.abs((c?.pitch ?? 0) - command.pitch)).toBeLessThanOrEqual(ANGLE_QUANTIZATION_ERROR);
  });

  it('is stable: re-encoding decoded values yields identical bytes', () => {
    const once = encodeClientMessage({ type: 'inputBatch', commands: [command] });
    const twice = encodeClientMessage(
      decodeClientMessage(once) as Parameters<typeof encodeClientMessage>[0],
    );
    expect(twice).toEqual(once);
  });

  it('quantizeInputCommand yields exactly what the receiver decodes', () => {
    const raw: InputCommand = { ...command, yaw: 0.123456789, pitch: -0.98765, moveX: 0.333 };
    const decoded = decodeClientMessage(
      encodeClientMessage({ type: 'inputBatch', commands: [raw] }),
    );
    if (decoded.type !== 'inputBatch') throw new Error('wrong type');
    expect(decoded.commands[0]).toEqual(quantizeInputCommand(raw));
    expect(quantizeInputCommand(raw).yaw).not.toBe(raw.yaw);
  });

  it('round-trips a ping exactly', () => {
    const ping = { type: 'ping', id: 65535, clientTime: 12345.678 } as const;
    expect(decodeClientMessage(encodeClientMessage(ping))).toEqual(ping);
  });

  it('rejects empty and oversized batches', () => {
    expect(() => encodeClientMessage({ type: 'inputBatch', commands: [] })).toThrow(ProtocolError);
    const tooMany = Array.from({ length: NETWORK.maxInputBatch + 1 }, () => command);
    expect(() => encodeClientMessage({ type: 'inputBatch', commands: tooMany })).toThrow(
      ProtocolError,
    );
  });
});

describe('server messages', () => {
  it('round-trips pong exactly', () => {
    const pong = { type: 'pong', id: 7, clientTime: 99.5, serverTick: 3600 } as const;
    expect(decodeServerMessage(encodeServerMessage(pong))).toEqual(pong);
  });

  const player: PlayerState = {
    position: { x: 1.234567891, y: 0.02, z: -3.75 },
    velocity: { x: 2.8, y: -4.2, z: 0.1 },
    grounded: true,
    crouching: false,
    jumpHeld: true,
    sprinting: true,
    stamina: { value: 63.333333333, regenDelay: 0.4166666 },
  };

  it('round-trips a snapshot with the player state at float32 precision', () => {
    const snapshot = { type: 'snapshot', serverTick: 3600, lastProcessedSeq: 42, player } as const;
    const encoded = encodeServerMessage(snapshot);
    expect(encoded.byteLength).toBe(42);

    const decoded = decodeServerMessage(encoded);
    if (decoded.type !== 'snapshot') throw new Error('wrong type');
    expect(decoded.serverTick).toBe(3600);
    expect(decoded.lastProcessedSeq).toBe(42);
    const f = Math.fround;
    expect(decoded.player).toEqual({
      position: { x: f(1.234567891), y: f(0.02), z: f(-3.75) },
      velocity: { x: f(2.8), y: f(-4.2), z: f(0.1) },
      grounded: true,
      crouching: false,
      jumpHeld: true,
      sprinting: true,
      stamina: { value: f(63.333333333), regenDelay: f(0.4166666) },
    });
  });

  it('round-trips every flag combination', () => {
    for (let bits = 0; bits < 16; bits++) {
      const flags = {
        grounded: (bits & 1) !== 0,
        crouching: (bits & 2) !== 0,
        jumpHeld: (bits & 4) !== 0,
        sprinting: (bits & 8) !== 0,
      };
      const snapshot = {
        type: 'snapshot',
        serverTick: 1,
        lastProcessedSeq: 1,
        player: { ...player, ...flags },
      } as const;
      const decoded = decodeServerMessage(encodeServerMessage(snapshot));
      expect(decoded).toMatchObject({ player: flags });
    }
  });
});

describe('malformed input', () => {
  const valid = encodeClientMessage({ type: 'inputBatch', commands: [command] });

  it.each([
    ['empty', new Uint8Array(0)],
    ['unknown tag', new Uint8Array([250])],
    ['truncated', valid.slice(0, valid.length - 1)],
    ['trailing bytes', new Uint8Array([...valid, 0])],
    ['batch count 0', new Uint8Array([1, 0])],
  ])('rejects %s', (_name, bytes) => {
    expect(() => decodeClientMessage(bytes)).toThrow(ProtocolError);
  });

  it('decodes from a subarray view with a non-zero byte offset', () => {
    const padded = new Uint8Array(valid.length + 5);
    padded.set(valid, 5);
    expect(decodeClientMessage(padded.subarray(5)).type).toBe('inputBatch');
  });
});
