import type { Quality } from '@chalkbound/shared';
import { BoxGeometry, Mesh, MeshStandardMaterial, type Scene } from 'three';
import type { GhostObject, SolidObject } from '../drawing/DrawnObjects';

/**
 * Greybox rendering for player-made geometry (ROADMAP: primitives only until
 * Phase 6).
 *
 * Unlike the level, which is built once and kept, these appear and vanish
 * while the match runs — so the lifecycle is the whole job: a mesh per
 * structure, built once, freed once, and never left behind.
 *
 * The ghost is drawn see-through. A pending structure that looked solid would
 * be worse than none at all: the player would walk into a wall that is not
 * there yet (SPEC_AUDIT R-03).
 *
 * A structure that goes away leaves a brief collapsing shell behind it. The
 * loop the whole game is built on ends in *loss* (CLAUDE.md §25), and a wall
 * that simply blinked out of existence would spend that moment on nothing.
 * A greybox stand-in for the real effect at Phase 6.
 */

export interface DrawnObjectsView {
  /** Shows exactly these structures and this ghost, and nothing else. */
  update(solid: readonly SolidObject[], ghosts: readonly GhostObject[]): void;
  /** Ages the collapse effects; call once per rendered frame. */
  advance(frameDelta: number): void;
  /** Collapses still playing. */
  readonly collapsing: number;
  dispose(): void;
}

/** Chalk on a dark floor, dulled or sharpened by how well it was drawn. */
const QUALITY_COLOURS: Record<Quality, number> = {
  crude: 0x7c7667,
  sound: 0xb9b3a2,
  keen: 0xe4dfcd,
};

const GHOST_COLOUR = 0xdcd8c8;
const GHOST_OPACITY = 0.28;

/** How long a destroyed structure takes to fade away, seconds. [PLACEHOLDER] */
const COLLAPSE_SECONDS = 0.45;

type Managed = Mesh<BoxGeometry, MeshStandardMaterial>;

function free(scene: Scene, mesh: Managed): void {
  scene.remove(mesh);
  mesh.geometry.dispose();
  mesh.material.dispose();
}

export function createDrawnObjectsView(scene: Scene): DrawnObjectsView {
  const solids = new Map<number, { mesh: Managed; key: string }>();
  let ghostMesh: Managed | undefined;
  /** Structures mid-collapse, with the time each has left. */
  const collapses: { mesh: Managed; remaining: number }[] = [];

  const build = (
    half: { x: number; y: number; z: number },
    material: MeshStandardMaterial,
    name: string,
  ): Managed => {
    const mesh = new Mesh(new BoxGeometry(half.x * 2, half.y * 2, half.z * 2), material);
    mesh.name = name;
    scene.add(mesh);
    return mesh;
  };

  return {
    update(solid, ghosts) {
      const seen = new Set<number>();
      for (const object of solid) {
        seen.add(object.id);
        // Grade is in the key: a structure whose quality changed is a
        // different-looking object and deserves a rebuild, but a structure
        // that merely took damage does not.
        const key = `${object.blueprintId}:${object.quality}`;
        const existing = solids.get(object.id);
        if (existing && existing.key === key) {
          const { position, yaw } = object.transform;
          existing.mesh.position.set(position.x, position.y, position.z);
          existing.mesh.rotation.y = yaw;
          continue;
        }
        if (existing) free(scene, existing.mesh);

        const mesh = build(
          object.halfExtents,
          new MeshStandardMaterial({
            color: QUALITY_COLOURS[object.quality],
            roughness: object.quality === 'keen' ? 0.45 : 0.9,
          }),
          `drawn-solid-${object.id}`,
        );
        const { position, yaw } = object.transform;
        mesh.position.set(position.x, position.y, position.z);
        mesh.rotation.y = yaw;
        solids.set(object.id, { mesh, key });
      }

      for (const [id, held] of solids) {
        if (seen.has(id)) continue;
        // Hand the mesh to the collapse rather than freeing it: it is about
        // to be the effect.
        held.mesh.name = `drawn-collapse-${id}`;
        held.mesh.material.transparent = true;
        collapses.push({ mesh: held.mesh, remaining: COLLAPSE_SECONDS });
        solids.delete(id);
      }

      // At most one ghost: a player draws one sketch at a time.
      const ghost = ghosts[0];
      if (ghostMesh) {
        free(scene, ghostMesh);
        ghostMesh = undefined;
      }
      if (ghost) {
        ghostMesh = build(
          ghost.halfExtents,
          new MeshStandardMaterial({
            color: GHOST_COLOUR,
            transparent: true,
            opacity: GHOST_OPACITY,
            roughness: 1,
          }),
          'drawn-ghost',
        );
        ghostMesh.position.set(ghost.position.x, ghost.position.y, ghost.position.z);
        ghostMesh.rotation.y = ghost.yaw;
      }
    },
    advance(frameDelta) {
      for (let i = collapses.length - 1; i >= 0; i--) {
        const collapse = collapses[i];
        if (!collapse) continue;
        collapse.remaining -= frameDelta;
        if (collapse.remaining <= 0) {
          free(scene, collapse.mesh);
          collapses.splice(i, 1);
          continue;
        }
        const left = collapse.remaining / COLLAPSE_SECONDS;
        collapse.mesh.material.opacity = left;
        // Settles rather than bursts: a wall falls, it does not explode.
        collapse.mesh.scale.set(1, Math.max(0.05, left), 1);
      }
    },
    get collapsing() {
      return collapses.length;
    },
    dispose() {
      for (const held of solids.values()) free(scene, held.mesh);
      solids.clear();
      for (const collapse of collapses) free(scene, collapse.mesh);
      collapses.length = 0;
      if (ghostMesh) free(scene, ghostMesh);
      ghostMesh = undefined;
    },
  };
}
