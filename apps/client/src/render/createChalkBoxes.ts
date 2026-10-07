import { BoxGeometry, Mesh, MeshStandardMaterial, type Scene } from 'three';
import { CHALK_BOX_SIZE, type ChalkBoxSpawn } from '@chalkbound/shared';

export interface ChalkBoxView {
  /** Applies authoritative remaining amounts: empty boxes disappear. */
  update(remaining: ReadonlyMap<number, number>): void;
  /** Highlights the box the player is aiming at, or none. */
  setTargeted(id: number | undefined): void;
}

const CHALK_WHITE = 0xe8e6df;
const HIGHLIGHT = 0x3a3a32;
const NO_GLOW = 0x000000;

/** Greybox chalk boxes: one small white box per spawn (Phase 6 swaps in CB_GAME_ChalkBox_A). */
export function createChalkBoxes(scene: Scene, spawns: readonly ChalkBoxSpawn[]): ChalkBoxView {
  const geometry = new BoxGeometry(
    CHALK_BOX_SIZE.width,
    CHALK_BOX_SIZE.height,
    CHALK_BOX_SIZE.depth,
  );
  const meshes = new Map<number, Mesh<BoxGeometry, MeshStandardMaterial>>();
  for (const spawn of spawns) {
    // A material per box so one can glow without the others: three boxes, three materials.
    const mesh = new Mesh(geometry, new MeshStandardMaterial({ color: CHALK_WHITE, roughness: 1 }));
    mesh.name = `chalk-box-${spawn.id}`;
    mesh.position.set(spawn.position.x, spawn.position.y, spawn.position.z);
    scene.add(mesh);
    meshes.set(spawn.id, mesh);
  }

  let targeted: number | undefined;
  return {
    update(remaining) {
      for (const [id, mesh] of meshes) mesh.visible = remaining.get(id) !== 0;
    },
    setTargeted(id) {
      if (id === targeted) return;
      if (targeted !== undefined) meshes.get(targeted)?.material.emissive.setHex(NO_GLOW);
      if (id !== undefined) meshes.get(id)?.material.emissive.setHex(HIGHLIGHT);
      targeted = id;
    },
  };
}
