/**
 * Byte-level reading and writing shared by every wire format in the project.
 *
 * Extracted from `codec.ts` when the drawing wire format (plan T4) needed the
 * same primitives plus varints. Nothing here knows what a message is.
 */

const LITTLE_ENDIAN = true;
/** A 32-bit unsigned value needs at most ceil(32 / 7) continuation bytes. */
const MAX_VARINT_BYTES = 5;
const U32_MAX = 0xffff_ffff;

/** Thrown for malformed or unknown messages. Receivers drop the message. */
export class ProtocolError extends Error {
  override name = 'ProtocolError';
}

/** Throws unless `value` is an integer in [0, max], i.e. fits its wire field. */
export function checkedInt(value: number, max: number, field: string): number {
  if (!Number.isInteger(value) || value < 0 || value > max) {
    throw new ProtocolError(`${field} ${value} does not fit the wire format (0..${max})`);
  }
  return value;
}

/** Maps a signed integer onto an unsigned one, small magnitudes to small codes. */
export function zigzag(value: number): number {
  return value < 0 ? -2 * value - 1 : 2 * value;
}

export function unzigzag(value: number): number {
  return value % 2 === 0 ? value / 2 : -(value + 1) / 2;
}

/**
 * Grows on demand, so a variable-length format does not have to be measured
 * before it is written. `bytes` returns only what was actually written.
 */
export class Writer {
  private buffer: Uint8Array;
  private view: DataView;
  private offset = 0;

  constructor(initialCapacity = 64) {
    this.buffer = new Uint8Array(Math.max(1, initialCapacity));
    this.view = new DataView(this.buffer.buffer);
  }

  get bytes(): Uint8Array {
    return this.buffer.subarray(0, this.offset);
  }

  get length(): number {
    return this.offset;
  }

  u8(v: number): this {
    this.room(1);
    this.view.setUint8(this.offset, v);
    this.offset += 1;
    return this;
  }
  i8(v: number): this {
    this.room(1);
    this.view.setInt8(this.offset, v);
    this.offset += 1;
    return this;
  }
  u16(v: number): this {
    this.room(2);
    this.view.setUint16(this.offset, v, LITTLE_ENDIAN);
    this.offset += 2;
    return this;
  }
  i16(v: number): this {
    this.room(2);
    this.view.setInt16(this.offset, v, LITTLE_ENDIAN);
    this.offset += 2;
    return this;
  }
  u32(v: number): this {
    this.room(4);
    this.view.setUint32(this.offset, v, LITTLE_ENDIAN);
    this.offset += 4;
    return this;
  }
  f32(v: number): this {
    this.room(4);
    this.view.setFloat32(this.offset, v, LITTLE_ENDIAN);
    this.offset += 4;
    return this;
  }
  f64(v: number): this {
    this.room(8);
    this.view.setFloat64(this.offset, v, LITTLE_ENDIAN);
    this.offset += 8;
    return this;
  }

  /** LEB128. One byte per 7 bits, so the common small value costs one byte. */
  varint(v: number): this {
    checkedInt(v, U32_MAX, 'varint');
    let rest = v;
    do {
      const byte = rest & 0x7f;
      rest = Math.floor(rest / 128);
      this.u8(rest > 0 ? byte | 0x80 : byte);
    } while (rest > 0);
    return this;
  }

  /** A varint over {@link zigzag}, for deltas that run either way. */
  svarint(v: number): this {
    return this.varint(zigzag(v));
  }

  private room(n: number): void {
    if (this.offset + n <= this.buffer.byteLength) return;
    let capacity = this.buffer.byteLength * 2;
    while (capacity < this.offset + n) capacity *= 2;
    const grown = new Uint8Array(capacity);
    grown.set(this.buffer);
    this.buffer = grown;
    this.view = new DataView(grown.buffer);
  }
}

export class Reader {
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
  i16(): number {
    this.need(2);
    const v = this.view.getInt16(this.offset, LITTLE_ENDIAN);
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

  varint(): number {
    let result = 0;
    let scale = 1;
    for (let i = 0; i < MAX_VARINT_BYTES; i++) {
      const byte = this.u8();
      result += (byte & 0x7f) * scale;
      if ((byte & 0x80) === 0) {
        if (result > U32_MAX) throw new ProtocolError('Varint out of 32-bit range');
        return result;
      }
      scale *= 128;
    }
    throw new ProtocolError('Varint longer than 5 bytes');
  }

  svarint(): number {
    return unzigzag(this.varint());
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
