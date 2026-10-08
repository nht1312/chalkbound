import type { EquippedWeaponState, Quality } from '@chalkbound/shared';
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, type Object3D } from 'three';

/**
 * The weapon in the player's hand (SPEC §6.8). A greybox blade until Phase 6
 * brings real art, built from the authority's equipped state and nothing
 * else: what is in the hand is never something this client decided.
 *
 * Quality is visible on it, as SPEC §6.5 requires — "a crude sword looks
 * roughly drawn, a keen one looks crisp and glows faintly". Dimensions do not
 * vary, because a reach that changed with handwriting would be a competitive
 * variable the player cannot see (plan decision 6).
 */

export interface QualityTint {
  readonly color: number;
  readonly roughness: number;
  /** Only the keen blade glows; the spec singles it out. */
  readonly emissive: number;
}

const TINTS: Record<Quality, QualityTint> = {
  crude: { color: 0x8d8574, roughness: 0.95, emissive: 0 },
  sound: { color: 0xc8c3b4, roughness: 0.6, emissive: 0.08 },
  keen: { color: 0xeae6d8, roughness: 0.25, emissive: 0.35 },
};

export function qualityTint(quality: Quality): QualityTint {
  return TINTS[quality];
}

/** Greybox blade dimensions, metres. */
const BLADE = { width: 0.045, height: 0.5, length: 0.012 } as const;
const GUARD = { width: 0.17, height: 0.03, length: 0.02 } as const;

export interface HeldWeapon {
  /** Shows `equipped`, or empties the hand when it is undefined. */
  update(equipped: EquippedWeaponState | undefined): void;
  dispose(): void;
}

export function createHeldWeapon(hand: Group): HeldWeapon {
  let current: Object3D | undefined;
  /** What `current` was built for, so an unchanged weapon is left alone. */
  let builtFor: string | undefined;

  const clear = (): void => {
    if (!current) return;
    hand.remove(current);
    current.traverse((node) => {
      if (node instanceof Mesh) {
        node.geometry.dispose();
        const material = node.material;
        if (Array.isArray(material)) material.forEach((m) => m.dispose());
        else material.dispose();
      }
    });
    current = undefined;
    builtFor = undefined;
  };

  return {
    update(equipped) {
      if (!equipped) {
        clear();
        return;
      }
      // Rebuilding every frame would churn geometry thirty times a second for
      // a sword that has not changed.
      const key = `${equipped.blueprintId}:${equipped.quality}`;
      if (key === builtFor) return;

      clear();
      const tint = qualityTint(equipped.quality);
      const material = new MeshStandardMaterial({
        color: tint.color,
        roughness: tint.roughness,
        emissive: tint.color,
        emissiveIntensity: tint.emissive,
      });

      const group = new Group();
      group.name = 'held-weapon';
      const blade = new Mesh(new BoxGeometry(BLADE.width, BLADE.height, BLADE.length), material);
      blade.position.y = BLADE.height / 2;
      const guard = new Mesh(new BoxGeometry(GUARD.width, GUARD.height, GUARD.length), material);
      guard.position.y = BLADE.height * 0.18;
      group.add(blade, guard);

      hand.add(group);
      current = group;
      builtFor = key;
    },
    dispose: clear,
  };
}
