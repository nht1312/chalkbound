import { Box3, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { createViewmodel } from './createViewmodel';

const lens = { fov: 60, near: 0.01, far: 10 };
const arm = {
  forearm: { width: 0.05, height: 0.05, length: 0.24 },
  hand: { width: 0.065, height: 0.035, length: 0.07 },
};

describe('createViewmodel', () => {
  it('has its own camera with a narrow FOV and a near plane close enough for hands', () => {
    const vm = createViewmodel(lens, arm);
    expect(vm.camera.fov).toBe(lens.fov);
    expect(vm.camera.near).toBe(lens.near);
    expect(vm.camera.far).toBe(lens.far);
  });

  it('keeps the hands in their own scene, separate from the world', () => {
    const vm = createViewmodel(lens, arm);
    expect(vm.scene.children).toContain(vm.leftHand);
    expect(vm.scene.children).toContain(vm.rightHand);
  });

  it('builds each arm from the configured dimensions', () => {
    const vm = createViewmodel(lens, arm);
    const size = new Box3().setFromObject(vm.rightHand).getSize(new Vector3());
    expect(size.x).toBeCloseTo(Math.max(arm.hand.width, arm.forearm.width), 6);
    expect(size.y).toBeCloseTo(Math.max(arm.hand.height, arm.forearm.height), 6);
    expect(size.z).toBeCloseTo(arm.hand.length + arm.forearm.length, 6);
  });

  it('places both hands inside the camera frustum depth range', () => {
    const vm = createViewmodel(lens, arm);
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
