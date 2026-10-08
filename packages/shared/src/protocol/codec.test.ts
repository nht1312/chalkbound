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
import { swordSketch } from '../drawing/fixtures';
import { quantizeSketch } from '../drawing/wire';
import type { PlayerState } from '../sim/stepPlayer';
import {
  Button,
  type DrawnObjectState,
  type EquippedWeaponState,
  type InputCommand,
} from './messages';

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

  it('round-trips an interact intent exactly', () => {
    const interact = { type: 'interact', targetId: 65535 } as const;
    const encoded = encodeClientMessage(interact);
    expect(encoded.byteLength).toBe(3);
    expect(decodeClientMessage(encoded)).toEqual(interact);
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

  it('round-trips a drawing submission as the quantized sketch', () => {
    const submission = { type: 'drawing', sketch: swordSketch(102) } as const;
    const decoded = decodeClientMessage(encodeClientMessage(submission));
    expect(decoded).toEqual({ type: 'drawing', sketch: quantizeSketch(submission.sketch) });
  });

  it('carries an advisory hint, and omits the key when there is none', () => {
    const sketch = swordSketch(102);
    const withHint = decodeClientMessage(
      encodeClientMessage({ type: 'drawing', sketch, hint: 'sword' }),
    );
    const without = decodeClientMessage(encodeClientMessage({ type: 'drawing', sketch }));
    if (withHint.type !== 'drawing' || without.type !== 'drawing') throw new Error('wrong type');
    expect(withHint.hint).toBe('sword');
    expect('hint' in without).toBe(false);
  });

  it('keeps a submitted sword inside one small packet', () => {
    const bytes = encodeClientMessage({ type: 'drawing', sketch: swordSketch(102) });
    expect(bytes.byteLength).toBeLessThanOrEqual(160);
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
    const snapshot = {
      type: 'snapshot',
      serverTick: 3600,
      lastProcessedSeq: 42,
      player,
      chalk: 0,
      chalkBoxes: [],
      drawnObjects: [],
      equipped: undefined,
    } as const;
    const encoded = encodeServerMessage(snapshot);
    // Two more bytes than Phase 3: the drawn-object count, and one zero
    // standing for empty hands.
    expect(encoded.byteLength).toBe(46);

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

  it('round-trips chalk and every chalk box', () => {
    const snapshot = {
      type: 'snapshot',
      serverTick: 9,
      lastProcessedSeq: 8,
      player,
      chalk: 75,
      chalkBoxes: [
        { id: 1, remaining: 0 },
        { id: 2, remaining: 25 },
        { id: 65535, remaining: 255 },
      ],
      drawnObjects: [],
      equipped: undefined,
    } as const;
    const encoded = encodeServerMessage(snapshot);
    expect(encoded.byteLength).toBe(46 + 3 * 3);
    const decoded = decodeServerMessage(encoded);
    expect(decoded).toMatchObject({ chalk: 75, chalkBoxes: snapshot.chalkBoxes });
  });

  it('refuses to encode chalk values the wire cannot carry', () => {
    const base = {
      type: 'snapshot',
      serverTick: 1,
      lastProcessedSeq: 1,
      player,
      drawnObjects: [],
      equipped: undefined,
    } as const;
    for (const bad of [
      { chalk: 256, chalkBoxes: [] },
      { chalk: -1, chalkBoxes: [] },
      { chalk: 1.5, chalkBoxes: [] },
      { chalk: 0, chalkBoxes: [{ id: 1, remaining: 300 }] },
      { chalk: 0, chalkBoxes: [{ id: 70000, remaining: 1 }] },
      {
        chalk: 0,
        chalkBoxes: Array.from({ length: 256 }, (_, i) => ({ id: i + 1, remaining: 1 })),
      },
    ]) {
      expect(() => encodeServerMessage({ ...base, ...bad })).toThrow(ProtocolError);
    }
  });

  it('rejects a snapshot whose box count does not match its length', () => {
    const encoded = encodeServerMessage({
      type: 'snapshot',
      serverTick: 1,
      lastProcessedSeq: 1,
      player,
      chalk: 0,
      chalkBoxes: [{ id: 1, remaining: 25 }],
      drawnObjects: [],
      equipped: undefined,
    });
    expect(() => decodeServerMessage(encoded.slice(0, -1))).toThrow(ProtocolError);
    const inflated = encoded.slice();
    inflated[43] = 2; // claims two boxes, carries one
    expect(() => decodeServerMessage(inflated)).toThrow(ProtocolError);
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
        chalk: 0,
        chalkBoxes: [],
        drawnObjects: [],
        equipped: undefined,
      } as const;
      const decoded = decodeServerMessage(encodeServerMessage(snapshot));
      expect(decoded).toMatchObject({ player: flags });
    }
  });

  it('round-trips a drawing result', () => {
    const message = {
      type: 'drawingResult',
      result: {
        outcome: { kind: 'created', blueprintId: 'sword', accuracy: 0.8125, quality: 'keen' },
        chalkDebited: 20,
      },
    } as const;
    expect(decodeServerMessage(encodeServerMessage(message))).toEqual(message);
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
    ['truncated interact', new Uint8Array([5, 1])],
  ])('rejects %s', (_name, bytes) => {
    expect(() => decodeClientMessage(bytes)).toThrow(ProtocolError);
  });

  it('decodes from a subarray view with a non-zero byte offset', () => {
    const padded = new Uint8Array(valid.length + 5);
    padded.set(valid, 5);
    expect(decodeClientMessage(padded.subarray(5)).type).toBe('inputBatch');
  });
});

/**
 * Structures ride along with every snapshot (plan decision 2), the same way
 * chalk boxes do: resync-safe, at the price of bandwidth that grows with the
 * number of objects. Chalk bounds that number in practice, and Phase 8 can
 * revisit it when a reliable delta starts to earn its complexity.
 */
describe('drawn objects on the wire', () => {
  const PLAYER: PlayerState = {
    position: { x: 0, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    grounded: true,
    crouching: false,
    jumpHeld: false,
    sprinting: false,
    stamina: { value: 100, regenDelay: 0 },
  };

  const object = (over: Partial<DrawnObjectState> = {}): DrawnObjectState => ({
    id: 7,
    blueprintId: 'wall',
    quality: 'sound',
    position: { x: 1.5, y: 1.25, z: -3.25 },
    yaw: 1.25,
    solidFromTick: 640,
    health: 60,
    ...over,
  });

  const roundTrip = (objects: readonly DrawnObjectState[]): readonly DrawnObjectState[] => {
    const decoded = decodeServerMessage(
      encodeServerMessage({
        type: 'snapshot',
        serverTick: 900,
        lastProcessedSeq: 12,
        player: PLAYER,
        chalk: 40,
        chalkBoxes: [],
        drawnObjects: objects,
        equipped: undefined,
      }),
    );
    if (decoded.type !== 'snapshot') throw new Error('expected a snapshot');
    return decoded.drawnObjects;
  };

  it('carries an empty world without complaint', () => {
    expect(roundTrip([])).toEqual([]);
  });

  it('round-trips one structure', () => {
    const [back] = roundTrip([object()]);
    expect(back?.id).toBe(7);
    expect(back?.blueprintId).toBe('wall');
    expect(back?.quality).toBe('sound');
    expect(back?.solidFromTick).toBe(640);
    expect(back?.health).toBe(60);
  });

  it('keeps a structure where it was put, closely enough to collide with', () => {
    const [back] = roundTrip([object()]);
    expect(back?.position.x).toBeCloseTo(1.5, 3);
    expect(back?.position.y).toBeCloseTo(1.25, 3);
    expect(back?.position.z).toBeCloseTo(-3.25, 3);
    expect(back?.yaw).toBeCloseTo(1.25, 3);
  });

  it('keeps several apart, in order', () => {
    const back = roundTrip([
      object({ id: 1, blueprintId: 'wall' }),
      object({ id: 2, blueprintId: 'bridge', quality: 'keen' }),
      object({ id: 3, blueprintId: 'wall', quality: 'crude', health: 12 }),
    ]);
    expect(back.map((o) => o.id)).toEqual([1, 2, 3]);
    expect(back.map((o) => o.blueprintId)).toEqual(['wall', 'bridge', 'wall']);
    expect(back.map((o) => o.quality)).toEqual(['sound', 'keen', 'crude']);
    expect(back[2]?.health).toBe(12);
  });

  it('round-trips yaw at the compass points, where sign errors hide', () => {
    for (const yaw of [0, Math.PI / 2, -Math.PI / 2, 3.14159, -3.14159]) {
      const [back] = roundTrip([object({ yaw })]);
      expect(back?.yaw).toBeCloseTo(yaw, 3);
    }
  });

  it('refuses to encode more structures than the count field can hold', () => {
    const tooMany = Array.from({ length: 256 }, (_, i) => object({ id: i + 1 }));
    expect(() =>
      encodeServerMessage({
        type: 'snapshot',
        serverTick: 1,
        lastProcessedSeq: 1,
        player: PLAYER,
        chalk: 0,
        chalkBoxes: [],
        drawnObjects: tooMany,
        equipped: undefined,
      }),
    ).toThrow();
  });
});


/** What the player is holding rides with their own snapshot (SPEC §6.8). */
describe('the equipped weapon on the wire', () => {
  const PLAYER: PlayerState = {
    position: { x: 0, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    grounded: true,
    crouching: false,
    jumpHeld: false,
    sprinting: false,
    stamina: { value: 100, regenDelay: 0 },
  };

  const roundTrip = (equipped: EquippedWeaponState | undefined) => {
    const decoded = decodeServerMessage(
      encodeServerMessage({
        type: 'snapshot',
        serverTick: 1,
        lastProcessedSeq: 1,
        player: PLAYER,
        chalk: 0,
        chalkBoxes: [],
        drawnObjects: [],
        equipped,
      }),
    );
    if (decoded.type !== 'snapshot') throw new Error('expected a snapshot');
    return decoded.equipped;
  };

  it('carries empty hands in a single byte', () => {
    expect(roundTrip(undefined)).toBeUndefined();
  });

  it('round-trips a held sword with its grade and wear', () => {
    const sword = {
      blueprintId: 'sword',
      quality: 'keen',
      durability: 17,
      maxDurability: 26,
    } as const;
    expect(roundTrip(sword)).toEqual(sword);
  });

  it('round-trips every quality band', () => {
    for (const quality of ['crude', 'sound', 'keen'] as const) {
      expect(
        roundTrip({ blueprintId: 'sword', quality, durability: 1, maxDurability: 1 })?.quality,
      ).toBe(quality);
    }
  });

  it('carries a sword worn down to its last hit', () => {
    expect(
      roundTrip({ blueprintId: 'sword', quality: 'crude', durability: 0, maxDurability: 14 }),
    ).toMatchObject({ durability: 0 });
  });
});
