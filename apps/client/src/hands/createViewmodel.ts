import {
  BoxGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
} from 'three';
import type { HandTransform } from './handRig';

export interface ViewmodelLens {
  readonly fov: number;
  readonly near: number;
  readonly far: number;
}

export interface Viewmodel {
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  readonly leftHand: Group;
  readonly rightHand: Group;
  apply(transforms: { left: HandTransform; right: HandTransform }): void;
}

/** Greybox arm dimensions, metres (ROADMAP: primitives until Phase 6). */
const FOREARM = { width: 0.07, height: 0.07, length: 0.32 } as const;
const HAND = { width: 0.09, height: 0.05, length: 0.1 } as const;
const SKIN = 0xc9a58a;

/**
 * First-person hands in their own scene and camera (ARCHITECTURE §4.1). The
 * game renders them after clearing depth, so they always draw over the world
 * and cannot clip into walls; their narrow FOV and near plane are independent
 * of the world camera's sprint FOV.
 */
export function createViewmodel(lens: ViewmodelLens): Viewmodel {
  const scene = new Scene();
  const camera = new PerspectiveCamera(lens.fov, 1, lens.near, lens.far);

  // Lit like the world so the hands sit in the same light.
  scene.add(new HemisphereLight(0xdfe8e0, 0x2a2622, 1.2));
  const key = new DirectionalLight(0xfff1dc, 1.5);
  key.position.set(1, 2, 1);
  scene.add(key);

  const material = new MeshStandardMaterial({ color: SKIN, roughness: 0.8 });
  const forearmGeometry = new BoxGeometry(FOREARM.width, FOREARM.height, FOREARM.length);
  const handGeometry = new BoxGeometry(HAND.width, HAND.height, HAND.length);

  const makeArm = (name: string): Group => {
    const arm = new Group();
    arm.name = name;
    // The group origin is the hand; the forearm extends back toward the camera.
    const hand = new Mesh(handGeometry, material);
    const forearm = new Mesh(forearmGeometry, material);
    forearm.position.z = HAND.length / 2 + FOREARM.length / 2;
    arm.add(hand, forearm);
    scene.add(arm);
    return arm;
  };
  const leftHand = makeArm('left-hand');
  const rightHand = makeArm('right-hand');

  return {
    scene,
    camera,
    leftHand,
    rightHand,
    apply({ left, right }) {
      leftHand.position.set(left.x, left.y, left.z);
      leftHand.rotation.x = left.pitch;
      rightHand.position.set(right.x, right.y, right.z);
      rightHand.rotation.x = right.pitch;
    },
  };
}
