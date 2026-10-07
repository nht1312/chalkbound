import { Mesh, MeshStandardMaterial, Scene } from 'three';
import { describe, expect, it } from 'vitest';
import { createChalkBoxes } from './createChalkBoxes';

const spawns = [
  { id: 1, position: { x: 0, y: 0.8, z: -1 } },
  { id: 2, position: { x: 2, y: 0.05, z: 3 } },
];

const meshNamed = (scene: Scene, name: string): Mesh => {
  const mesh = scene.getObjectByName(name);
  if (!(mesh instanceof Mesh)) throw new Error(`no mesh ${name}`);
  return mesh;
};
const emissive = (mesh: Mesh): number => (mesh.material as MeshStandardMaterial).emissive.getHex();

describe('createChalkBoxes', () => {
  it('adds one mesh per chalk box at its position', () => {
    const scene = new Scene();
    createChalkBoxes(scene, spawns);
    expect(meshNamed(scene, 'chalk-box-1').position.toArray()).toEqual([0, 0.8, -1]);
    expect(meshNamed(scene, 'chalk-box-2').position.toArray()).toEqual([2, 0.05, 3]);
  });

  it('hides empty boxes and shows boxes with chalk or not yet reported', () => {
    const scene = new Scene();
    const view = createChalkBoxes(scene, spawns);
    view.update(new Map([[1, 0]]));
    expect(meshNamed(scene, 'chalk-box-1').visible).toBe(false);
    expect(meshNamed(scene, 'chalk-box-2').visible).toBe(true);
  });

  it('highlights only the targeted box', () => {
    const scene = new Scene();
    const view = createChalkBoxes(scene, spawns);
    view.setTargeted(2);
    expect(emissive(meshNamed(scene, 'chalk-box-2'))).not.toBe(0);
    expect(emissive(meshNamed(scene, 'chalk-box-1'))).toBe(0);
    view.setTargeted(undefined);
    expect(emissive(meshNamed(scene, 'chalk-box-2'))).toBe(0);
  });
});
