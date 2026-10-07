const TWO_PI = Math.PI * 2;
const INT8_MAX = 127;
const UINT16_RANGE = 65536;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Maps [-1, 1] to an int8 in [-127, 127]. Out-of-range input is clamped. */
export function quantizeUnit(value: number): number {
  return Math.round(clamp(value, -1, 1) * INT8_MAX);
}

export function dequantizeUnit(quantized: number): number {
  return quantized / INT8_MAX;
}

/** Maps any angle in radians to a uint16 covering one full turn. */
export function quantizeAngle(radians: number): number {
  const turns = (((radians / TWO_PI) % 1) + 1) % 1;
  return Math.round(turns * UINT16_RANGE) % UINT16_RANGE;
}

/** Inverse of {@link quantizeAngle}, returned in [-PI, PI). */
export function dequantizeAngle(quantized: number): number {
  const radians = (quantized / UINT16_RANGE) * TWO_PI;
  return radians >= Math.PI ? radians - TWO_PI : radians;
}

/** Worst-case absolute error of an angle round-trip, in radians. */
export const ANGLE_QUANTIZATION_ERROR = Math.PI / UINT16_RANGE;
/** Worst-case absolute error of a unit round-trip. */
export const UNIT_QUANTIZATION_ERROR = 0.5 / INT8_MAX;
