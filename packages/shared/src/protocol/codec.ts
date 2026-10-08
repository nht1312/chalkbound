import { NETWORK } from '../config/network';
import {
  blueprintFromWireId,
  blueprintWireId,
  readDrawingResult,
  readSketch,
  writeDrawingResult,
  writeSketch,
} from '../drawing/wire';
import { dequantizeAngle, dequantizeUnit, quantizeAngle, quantizeUnit } from '../math/quantize';
import type { PlayerState } from '../sim/stepPlayer';
import { checkedInt, ProtocolError, Reader, Writer } from './bytes';
import type { ChalkBoxState, ClientMessage, InputCommand, ServerMessage } from './messages';

/** First byte of every message. Values are part of the wire format; never reuse one. */
const Tag = {
  InputBatch: 1,
  Ping: 2,
  Pong: 3,
  Snapshot: 4,
  Interact: 5,
  Drawing: 6,
  DrawingResult: 7,
} as const;

/** u32 seq, u32 tick, i8 moveX, i8 moveZ, u16 yaw, u16 pitch, u16 buttons. */
const INPUT_COMMAND_BYTES = 16;
/** f32×3 position, f32×3 velocity, u8 flags, f32 stamina, f32 regen delay. */
const PLAYER_STATE_BYTES = 33;
/** u8 tag, u32 serverTick, u32 lastProcessedSeq, player state, u8 chalk, u8 box count. */
const SNAPSHOT_FIXED_BYTES = 9 + PLAYER_STATE_BYTES + 2;
/** u16 id, u8 remaining. */
const CHALK_BOX_BYTES = 3;
const U8_MAX = 0xff;
const U16_MAX = 0xffff;

/** Bits of the player-state flags byte. */
const PlayerFlag = {
  Grounded: 1 << 0,
  Crouching: 1 << 1,
  JumpHeld: 1 << 2,
  Sprinting: 1 << 3,
} as const;

export { ProtocolError } from './bytes';

/**
 * The command exactly as the receiver will decode it. The client predicts with
 * this, not the raw command, so prediction and authority step identical inputs.
 */
export function quantizeInputCommand(command: InputCommand): InputCommand {
  return {
    ...command,
    moveX: dequantizeUnit(quantizeUnit(command.moveX)),
    moveZ: dequantizeUnit(quantizeUnit(command.moveZ)),
    yaw: dequantizeAngle(quantizeAngle(command.yaw)),
    pitch: dequantizeAngle(quantizeAngle(command.pitch)),
  };
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
    case 'interact':
      return new Writer(3).u8(Tag.Interact).u16(checkedInt(message.targetId, U16_MAX, 'targetId'))
        .bytes;
    case 'drawing': {
      const writer = new Writer(192)
        .u8(Tag.Drawing)
        .u8(message.hint === undefined ? 0 : blueprintWireId(message.hint));
      writeSketch(writer, message.sketch);
      return writer.bytes;
    }
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
    case Tag.Interact: {
      const message = { type: 'interact', targetId: reader.u16() } as const;
      reader.end();
      return message;
    }
    case Tag.Drawing: {
      const hintCode = reader.u8();
      const hint = blueprintFromWireId(hintCode);
      if (hintCode !== 0 && hint === undefined) {
        throw new ProtocolError(`Unknown blueprint hint ${hintCode}`);
      }
      const sketch = readSketch(reader);
      reader.end();
      // `exactOptionalPropertyTypes`: no hint means no key, not an undefined one.
      return hint === undefined ? { type: 'drawing', sketch } : { type: 'drawing', sketch, hint };
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
      const boxes = message.chalkBoxes;
      checkedInt(boxes.length, U8_MAX, 'chalk box count');
      const writer = new Writer(SNAPSHOT_FIXED_BYTES + boxes.length * CHALK_BOX_BYTES)
        .u8(Tag.Snapshot)
        .u32(message.serverTick)
        .u32(message.lastProcessedSeq);
      writePlayerState(writer, message.player);
      writer.u8(checkedInt(message.chalk, U8_MAX, 'chalk')).u8(boxes.length);
      for (const box of boxes) {
        writer
          .u16(checkedInt(box.id, U16_MAX, 'chalk box id'))
          .u8(checkedInt(box.remaining, U8_MAX, 'chalk box remaining'));
      }
      return writer.bytes;
    }
    case 'drawingResult': {
      const writer = new Writer(16).u8(Tag.DrawingResult);
      writeDrawingResult(writer, message.result);
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
        chalk: reader.u8(),
        chalkBoxes: readChalkBoxes(reader),
      } as const;
      reader.end();
      return message;
    }
    case Tag.DrawingResult: {
      const message = { type: 'drawingResult', result: readDrawingResult(reader) } as const;
      reader.end();
      return message;
    }
    default:
      throw new ProtocolError(`Unknown server message tag ${tag}`);
  }
}

function readChalkBoxes(reader: Reader): ChalkBoxState[] {
  const count = reader.u8();
  const boxes: ChalkBoxState[] = [];
  for (let i = 0; i < count; i++) boxes.push({ id: reader.u16(), remaining: reader.u8() });
  return boxes;
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
