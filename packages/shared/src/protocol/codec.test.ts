import { describe, expect, it } from 'vitest';
import { NETWORK } from '../config/network';
import { ANGLE_QUANTIZATION_ERROR, UNIT_QUANTIZATION_ERROR } from '../math/quantize';
import {
  decodeClientMessage,
  decodeServerMessage,
  encodeClientMessage,
  encodeServerMessage,
  ProtocolError,
} from './codec';
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
  it('round-trips pong and snapshot exactly', () => {
    const pong = { type: 'pong', id: 7, clientTime: 99.5, serverTick: 3600 } as const;
    const snapshot = { type: 'snapshot', serverTick: 3600, lastProcessedSeq: 42 } as const;
    expect(decodeServerMessage(encodeServerMessage(pong))).toEqual(pong);
    expect(decodeServerMessage(encodeServerMessage(snapshot))).toEqual(snapshot);
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
