import { describe, expect, it } from 'vitest';
import {
  ANGLE_QUANTIZATION_ERROR,
  dequantizeAngle,
  dequantizeUnit,
  quantizeAngle,
  quantizeUnit,
  UNIT_QUANTIZATION_ERROR,
} from './quantize';

/** Smallest signed difference between two angles. */
function angleDiff(a: number, b: number): number {
  const d = (a - b) % (Math.PI * 2);
  return Math.abs(d > Math.PI ? d - Math.PI * 2 : d < -Math.PI ? d + Math.PI * 2 : d);
}

describe('unit quantization', () => {
  it('round-trips within the error bound', () => {
    for (let v = -1; v <= 1; v += 0.013) {
      expect(Math.abs(dequantizeUnit(quantizeUnit(v)) - v)).toBeLessThanOrEqual(
        UNIT_QUANTIZATION_ERROR + 1e-12,
      );
    }
  });

  it('clamps out-of-range input and keeps the extremes exact', () => {
    expect(quantizeUnit(5)).toBe(127);
    expect(quantizeUnit(-5)).toBe(-127);
    expect(dequantizeUnit(quantizeUnit(1))).toBe(1);
    expect(dequantizeUnit(quantizeUnit(0))).toBe(0);
  });
});

describe('angle quantization', () => {
  it('round-trips within the error bound, including negative angles', () => {
    for (let a = -7; a <= 7; a += 0.0371) {
      const q = quantizeAngle(a);
      expect(q).toBeGreaterThanOrEqual(0);
      expect(q).toBeLessThan(65536);
      expect(angleDiff(dequantizeAngle(q), a)).toBeLessThanOrEqual(ANGLE_QUANTIZATION_ERROR + 1e-9);
    }
  });

  it('returns angles in [-PI, PI)', () => {
    expect(dequantizeAngle(quantizeAngle(-0.3))).toBeCloseTo(-0.3, 4);
    expect(dequantizeAngle(32768)).toBeCloseTo(-Math.PI);
  });
});
