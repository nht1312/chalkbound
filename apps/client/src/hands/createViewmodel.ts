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

interface BoxSize {
  readonly width: number;
  readonly height: number;
  readonly length: number;
}

/** Greybox arm dimensions, metres (ROADMAP: primitives until Phase 6). */
export interface ArmDimensions {
  readonly forearm: BoxSize;
  readonly hand: BoxSize;
}

export interface Viewmodel {
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  readonly leftHand: Group;
  readonly rightHand: Group;
  apply(transforms: { left: HandTransform; right: HandTransform }): void;
}

const SKIN = 0xc9a58a;

/**
 * First-person hands in their own scene and camera (ARCHITECTURE §4.1). The
 * game renders them after clearing depth, so they always draw over the world
 * and cannot clip into walls; their narrow FOV and near plane are independent
 * of the world camera's sprint FOV.
 */
export function createViewmodel(lens: ViewmodelLens, arm: ArmDimensions): Viewmodel {
  const scene = new Scene();
  const camera = new PerspectiveCamera(lens.fov, 1, lens.near, lens.far);

  // Lit like the world so the hands sit in the same light.
  scene.add(new HemisphereLight(0xdfe8e0, 0x2a2622, 1.2));
  const key = new DirectionalLight(0xfff1dc, 1.5);
  key.position.set(1, 2, 1);
  scene.add(key);

  const material = new MeshStandardMaterial({ color: SKIN, roughness: 0.8 });
  const { forearm: f, hand: h } = arm;
  const forearmGeometry = new BoxGeometry(f.width, f.height, f.length);
  const handGeometry = new BoxGeometry(h.width, h.height, h.length);

  const makeArm = (name: string): Group => {
    const group = new Group();
    group.name = name;
    // The group origin is the hand; the forearm extends back toward the camera.
    const hand = new Mesh(handGeometry, material);
    const forearm = new Mesh(forearmGeometry, material);
    forearm.position.z = h.length / 2 + f.length / 2;
    group.add(hand, forearm);
    scene.add(group);
    return group;
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
