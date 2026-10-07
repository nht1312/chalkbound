import { NETWORK } from '../config/network';
import { dequantizeAngle, dequantizeUnit, quantizeAngle, quantizeUnit } from '../math/quantize';
import type { PlayerState } from '../sim/stepPlayer';
import type { ClientMessage, InputCommand, ServerMessage } from './messages';

/** First byte of every message. Values are part of the wire format; never reuse one. */
const Tag = {
  InputBatch: 1,
  Ping: 2,
  Pong: 3,
  Snapshot: 4,
} as const;

/** u32 seq, u32 tick, i8 moveX, i8 moveZ, u16 yaw, u16 pitch, u16 buttons. */
const INPUT_COMMAND_BYTES = 16;
/** f32×3 position, f32×3 velocity, u8 flags, f32 stamina, f32 regen delay. */
const PLAYER_STATE_BYTES = 33;
/** u8 tag, u32 serverTick, u32 lastProcessedSeq, player state. */
const SNAPSHOT_BYTES = 9 + PLAYER_STATE_BYTES;

/** Bits of the player-state flags byte. */
const PlayerFlag = {
  Grounded: 1 << 0,
  Crouching: 1 << 1,
  JumpHeld: 1 << 2,
  Sprinting: 1 << 3,
} as const;
const LITTLE_ENDIAN = true;

/** Thrown for malformed or unknown messages. Receivers drop the message. */
export class ProtocolError extends Error {
  override name = 'ProtocolError';
}

export function encodeClientMessage(message: ClientMessage): Uint8Array {
  switch (message.type) {
    case 'inputBatch': {
      const { commands } = message;
      if (commands.length === 0 || commands.length > NETWORK.maxInputBatch) {
        throw new ProtocolError(`Input batch size ${commands.length} out of range`);
      }
      const writer = new Writer(2 + commands.length * INPUT_COMMAND_BYTES);
      writer.u8(Tag.InputBatch).u8(commands.length);
      for (const c of commands) {
        writer
          .u32(c.seq)
          .u32(c.tick)
          .i8(quantizeUnit(c.moveX))
          .i8(quantizeUnit(c.moveZ))
          .u16(quantizeAngle(c.yaw))
          .u16(quantizeAngle(c.pitch))
          .u16(c.buttons);
      }
      return writer.bytes;
    }
    case 'ping':
      return new Writer(11).u8(Tag.Ping).u16(message.id).f64(message.clientTime).bytes;
  }
}

export function decodeClientMessage(data: Uint8Array): ClientMessage {
  const reader = new Reader(data);
  const tag = reader.u8();
  switch (tag) {
    case Tag.InputBatch: {
      const count = reader.u8();
      if (count === 0 || count > NETWORK.maxInputBatch) {
        throw new ProtocolError(`Input batch size ${count} out of range`);
      }
      const commands: InputCommand[] = [];
      for (let i = 0; i < count; i++) {
        commands.push({
          seq: reader.u32(),
          tick: reader.u32(),
          moveX: dequantizeUnit(reader.i8()),
          moveZ: dequantizeUnit(reader.i8()),
          yaw: dequantizeAngle(reader.u16()),
          pitch: dequantizeAngle(reader.u16()),
          buttons: reader.u16(),
        });
      }
      reader.end();
      return { type: 'inputBatch', commands };
    }
    case Tag.Ping: {
      const message = { type: 'ping', id: reader.u16(), clientTime: reader.f64() } as const;
      reader.end();
      return message;
    }
    default:
      throw new ProtocolError(`Unknown client message tag ${tag}`);
  }
}

export function encodeServerMessage(message: ServerMessage): Uint8Array {
  switch (message.type) {
    case 'pong':
      return new Writer(15)
        .u8(Tag.Pong)
        .u16(message.id)
        .f64(message.clientTime)
        .u32(message.serverTick).bytes;
    case 'snapshot': {
      const writer = new Writer(SNAPSHOT_BYTES)
        .u8(Tag.Snapshot)
        .u32(message.serverTick)
        .u32(message.lastProcessedSeq);
      writePlayerState(writer, message.player);
      return writer.bytes;
    }
  }
}

export function decodeServerMessage(data: Uint8Array): ServerMessage {
  const reader = new Reader(data);
  const tag = reader.u8();
  switch (tag) {
    case Tag.Pong: {
      const message = {
        type: 'pong',
        id: reader.u16(),
        clientTime: reader.f64(),
        serverTick: reader.u32(),
      } as const;
      reader.end();
      return message;
    }
    case Tag.Snapshot: {
      const message = {
        type: 'snapshot',
        serverTick: reader.u32(),
        lastProcessedSeq: reader.u32(),
        player: readPlayerState(reader),
      } as const;
      reader.end();
      return message;
    }
    default:
      throw new ProtocolError(`Unknown server message tag ${tag}`);
  }
}

/**
 * Player state at float32 precision: ~0.1 mm at 1 km, far below any
 * reconciliation threshold, at half the size of float64.
 */
function writePlayerState(writer: Writer, p: PlayerState): void {
  const flags =
    (p.grounded ? PlayerFlag.Grounded : 0) |
    (p.crouching ? PlayerFlag.Crouching : 0) |
    (p.jumpHeld ? PlayerFlag.JumpHeld : 0) |
    (p.sprinting ? PlayerFlag.Sprinting : 0);
  writer
    .f32(p.position.x)
    .f32(p.position.y)
    .f32(p.position.z)
    .f32(p.velocity.x)
    .f32(p.velocity.y)
    .f32(p.velocity.z)
    .u8(flags)
    .f32(p.stamina.value)
    .f32(p.stamina.regenDelay);
}

function readPlayerState(reader: Reader): PlayerState {
  const position = { x: reader.f32(), y: reader.f32(), z: reader.f32() };
  const velocity = { x: reader.f32(), y: reader.f32(), z: reader.f32() };
  const flags = reader.u8();
  return {
    position,
    velocity,
    grounded: (flags & PlayerFlag.Grounded) !== 0,
    crouching: (flags & PlayerFlag.Crouching) !== 0,
    jumpHeld: (flags & PlayerFlag.JumpHeld) !== 0,
    sprinting: (flags & PlayerFlag.Sprinting) !== 0,
    stamina: { value: reader.f32(), regenDelay: reader.f32() },
  };
}

class Writer {
  readonly bytes: Uint8Array;
  private readonly view: DataView;
  private offset = 0;

  constructor(size: number) {
    this.bytes = new Uint8Array(size);
    this.view = new DataView(this.bytes.buffer);
  }

  u8(v: number): this {
    this.view.setUint8(this.offset, v);
    this.offset += 1;
    return this;
  }
  i8(v: number): this {
    this.view.setInt8(this.offset, v);
    this.offset += 1;
    return this;
  }
  u16(v: number): this {
    this.view.setUint16(this.offset, v, LITTLE_ENDIAN);
    this.offset += 2;
    return this;
  }
  u32(v: number): this {
    this.view.setUint32(this.offset, v, LITTLE_ENDIAN);
    this.offset += 4;
    return this;
  }
  f32(v: number): this {
    this.view.setFloat32(this.offset, v, LITTLE_ENDIAN);
    this.offset += 4;
    return this;
  }
  f64(v: number): this {
    this.view.setFloat64(this.offset, v, LITTLE_ENDIAN);
    this.offset += 8;
    return this;
  }
}

class Reader {
  private readonly view: DataView;
  private offset = 0;

  constructor(data: Uint8Array) {
    this.view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  }

  u8(): number {
    this.need(1);
    const v = this.view.getUint8(this.offset);
    this.offset += 1;
    return v;
  }
  i8(): number {
    this.need(1);
    const v = this.view.getInt8(this.offset);
    this.offset += 1;
    return v;
  }
  u16(): number {
    this.need(2);
    const v = this.view.getUint16(this.offset, LITTLE_ENDIAN);
    this.offset += 2;
    return v;
  }
  u32(): number {
    this.need(4);
    const v = this.view.getUint32(this.offset, LITTLE_ENDIAN);
    this.offset += 4;
    return v;
  }
  f32(): number {
    this.need(4);
    const v = this.view.getFloat32(this.offset, LITTLE_ENDIAN);
    this.offset += 4;
    return v;
  }
  f64(): number {
    this.need(8);
    const v = this.view.getFloat64(this.offset, LITTLE_ENDIAN);
    this.offset += 8;
    return v;
  }

  /** Rejects trailing bytes so every message has exactly one valid encoding. */
  end(): void {
    if (this.offset !== this.view.byteLength) {
      throw new ProtocolError(`${this.view.byteLength - this.offset} unexpected trailing bytes`);
    }
  }

  private need(n: number): void {
    if (this.offset + n > this.view.byteLength) {
      throw new ProtocolError('Message truncated');
    }
  }
}
