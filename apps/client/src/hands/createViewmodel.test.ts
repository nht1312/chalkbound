import { describe, expect, it } from 'vitest';
import { createViewmodel } from './createViewmodel';

const lens = { fov: 60, near: 0.01, far: 10 };

describe('createViewmodel', () => {
  it('has its own camera with a narrow FOV and a near plane close enough for hands', () => {
    const vm = createViewmodel(lens);
    expect(vm.camera.fov).toBe(lens.fov);
    expect(vm.camera.near).toBe(lens.near);
    expect(vm.camera.far).toBe(lens.far);
  });

  it('keeps the hands in their own scene, separate from the world', () => {
    const vm = createViewmodel(lens);
    expect(vm.scene.children).toContain(vm.leftHand);
    expect(vm.scene.children).toContain(vm.rightHand);
  });

  it('places both hands inside the camera frustum depth range', () => {
    const vm = createViewmodel(lens);
    vm.apply({
      left: { x: -0.22, y: -0.24, z: -0.45, pitch: 0 },
      right: { x: 0.22, y: -0.24, z: -0.45, pitch: -0.3 },
    });
    expect(vm.leftHand.position.toArray()).toEqual([-0.22, -0.24, -0.45]);
    expect(vm.rightHand.position.toArray()).toEqual([0.22, -0.24, -0.45]);
    expect(vm.rightHand.rotation.x).toBeCloseTo(-0.3);
    expect(-vm.rightHand.position.z).toBeGreaterThan(lens.near);
  });
});
