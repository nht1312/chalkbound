import {
  BoxGeometry,
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  Scene,
} from 'three';
import type { LevelData, SurfaceKind } from '@chalkbound/shared';

/** Flat greybox colours (ROADMAP: no textures before Phase 6). */
const SURFACE_COLORS: Record<SurfaceKind, number> = {
  floor: 0x6b5d4f,
  wall: 0xa8b0a4,
  blackboard: 0x24352b,
  desk: 0x8a6a48,
};

const BACKGROUND = 0x1d2320;
const FOG = { near: 15, far: 60 } as const;

/**
 * Builds the visible scene from shared level data, so what the player sees
 * always matches what the physics worlds collide with. No shadows: the budget
 * allows one realtime caster, reserved for players and The Erased.
 */
export function createTestScene(level: LevelData): Scene {
  const scene = new Scene();
  scene.background = new Color(BACKGROUND);
  scene.fog = new Fog(BACKGROUND, FOG.near, FOG.far);

  scene.add(new HemisphereLight(0xdfe8e0, 0x2a2622, 1.2));
  const sun = new DirectionalLight(0xfff1dc, 2);
  sun.position.set(6, 10, 4);
  scene.add(sun);

  const materials = new Map<SurfaceKind, MeshStandardMaterial>();
  const materialFor = (kind: SurfaceKind): MeshStandardMaterial => {
    let material = materials.get(kind);
    if (!material) {
      material = new MeshStandardMaterial({ color: SURFACE_COLORS[kind], roughness: 0.9 });
      materials.set(kind, material);
    }
    return material;
  };

  for (const box of level.boxes) {
    const { center: c, halfExtents: h } = box;
    const mesh = new Mesh(new BoxGeometry(h.x * 2, h.y * 2, h.z * 2), materialFor(box.kind));
    mesh.position.set(c.x, c.y, c.z);
    mesh.name = box.id;
    scene.add(mesh);
  }

  return scene;
}
