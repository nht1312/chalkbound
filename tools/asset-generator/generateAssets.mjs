// @ts-check
/**
 * CHALKBOUND — Vietnam Asset Generator
 * Generates 3D GLB assets, metadata sidecars, level data, and manifest
 * for characters, environment modules, and maps based on iconic places in Vietnam:
 * 1. Trường THPT Chuyên Quốc Học Huế (Imperial High School of Hue)
 * 2. Trường THPT Chu Văn An Hà Nội (Lycée du Protectorat / West Lake School)
 * 3. Trường Lycée Yersin Đà Lạt (Grand Lycée of Dalat Highlands)
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');
const ASSETS_DIR = path.join(ROOT_DIR, 'assets');
const CLIENT_PUBLIC_DIR = path.join(ROOT_DIR, 'apps/client/public/assets');

// Polyfill FileReader for Three.js GLTFExporter in Node.js
globalThis.FileReader = class FileReader {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((buf) => {
      this.result = buf;
      if (typeof this.onload === 'function') this.onload({ target: this });
      if (typeof this.onloadend === 'function') this.onloadend({ target: this });
    });
  }
  readAsDataURL(blob) {
    blob.arrayBuffer().then((buf) => {
      const base64 = Buffer.from(buf).toString('base64');
      this.result = `data:${blob.type};base64,${base64}`;
      if (typeof this.onload === 'function') this.onload({ target: this });
      if (typeof this.onloadend === 'function') this.onloadend({ target: this });
    });
  }
};

const THREE = await import('../../apps/client/node_modules/three/build/three.module.js');
const { GLTFExporter } = await import(
  '../../apps/client/node_modules/three/examples/jsm/exporters/GLTFExporter.js'
);

// Ensure output directories exist
const DIRS = [
  path.join(ASSETS_DIR, 'source'),
  path.join(ASSETS_DIR, 'generated'),
  path.join(ASSETS_DIR, 'textures'),
  path.join(ASSETS_DIR, 'levels'),
  path.join(ASSETS_DIR, 'exported/char'),
  path.join(ASSETS_DIR, 'exported/pve'),
  path.join(ASSETS_DIR, 'exported/env'),
  path.join(ASSETS_DIR, 'exported/prop'),
  path.join(ASSETS_DIR, 'exported/game'),
  path.join(ASSETS_DIR, 'exported/weapon'),
];

for (const dir of DIRS) {
  fs.mkdirSync(dir, { recursive: true });
}

/**
 * Counts total triangles in a Three.js hierarchy
 */
function countTriangles(object) {
  let count = 0;
  object.traverse((child) => {
    if (child.isMesh && child.geometry) {
      const geom = child.geometry;
      if (geom.index) {
        count += geom.index.count / 3;
      } else if (geom.attributes.position) {
        count += geom.attributes.position.count / 3;
      }
    }
  });
  return Math.round(count);
}

/**
 * Computes bounding box dimensions [width, height, depth]
 */
function computeBounds(object) {
  const box = new THREE.Box3().setFromObject(object);
  const size = new THREE.Vector3();
  box.getSize(size);
  return [
    Math.round(size.x * 100) / 100,
    Math.round(size.y * 100) / 100,
    Math.round(size.z * 100) / 100,
  ];
}

/**
 * Exports a Three.js Scene/Group to a GLB file and creates the metadata sidecar
 */
async function exportAsset(assetId, category, group, metaExtra = {}) {
  const subDir = category.toLowerCase();
  const outDir = path.join(ASSETS_DIR, 'exported', subDir);
  const glbPath = path.join(outDir, `${assetId}.glb`);
  const metaPath = path.join(outDir, `${assetId}.meta.json`);

  const triCount = countTriangles(group);
  const bounds = computeBounds(group);

  const exporter = new GLTFExporter();
  const glbBuffer = await new Promise((resolve, reject) => {
    exporter.parse(
      group,
      (result) => resolve(Buffer.from(result)),
      (error) => reject(error),
      { binary: true }
    );
  });

  fs.writeFileSync(glbPath, glbBuffer);

  const meta = {
    id: assetId,
    category,
    version: 1,
    source: {
      origin: 'procedural-generator',
      tool: 'ChalkBound Vietnam Asset Pipeline v1.0',
      prompt: metaExtra.description || `Authentic Vietnamese asset for ChalkBound (${assetId})`,
      licence: 'Proprietary / ChalkBound Game Project',
      processedAt: new Date().toISOString(),
      processedBy: 'tools/asset-generator/generateAssets.mjs',
    },
    geometry: {
      lod0Triangles: triCount,
      lodCount: 2,
      lodDistances: [0, 15, 35],
      boundsMetres: bounds,
    },
    collision: metaExtra.collision || {
      type: 'box',
      dimensions: bounds,
    },
    materials: metaExtra.materials || ['CB_MAT_Default'],
    vietnamContext: metaExtra.vietnamContext || {},
    grid: metaExtra.grid || { snap: 1.0, occupies: [1, 1, 1] },
  };

  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));

  return {
    id: assetId,
    category,
    path: `assets/exported/${subDir}/${assetId}.glb`,
    metaPath: `assets/exported/${subDir}/${assetId}.meta.json`,
    byteSize: glbBuffer.byteLength,
    triangles: triCount,
    bounds,
    description: metaExtra.description || assetId,
    tags: metaExtra.tags || [],
  };
}

// ----------------------------------------------------------------------------
// Color Palette for Vietnam Architectural & Cultural Assets
// ----------------------------------------------------------------------------
const PALETTE = {
  // French Indochinese yellow ochre plaster (Hà Nội, Hội An, Sài Gòn)
  yellowStucco: 0xdeb841,
  yellowStuccoDark: 0xc49e2b,
  yellowStuccoWeathered: 0x9e884b,

  // French colonial dark green louvered shutters and doors
  frenchGreen: 0x2b4a36,
  frenchGreenDark: 0x1d3626,

  // Imperial Hue crimson red brick & ceremonial lacquer
  hueCrimson: 0x932626,
  hueRedBrick: 0xa8413b,
  hueRedBrickDark: 0x7c2c27,

  // Traditional terracotta clay roof tile (ngói âm dương / ngói hài)
  clayRoofRed: 0xc4543b,
  clayRoofDark: 0x9c3f2b,

  // Indochinese encaustic cement tiles (Gạch bông Đông Dương)
  tilePatternTeal: 0x3d7068,
  tilePatternCream: 0xf2edd9,
  tileBorderDark: 0x243b35,

  // Natural tropical timber (Gỗ lim, gỗ sao, gỗ gụ)
  teakDark: 0x4a2e1b,
  teakMedium: 0x694328,
  teakLight: 0x8a5b36,

  // Vietnamese student uniform
  uniformWhite: 0xf5f7fa,
  uniformNavy: 0x1e2d42,
  uniformSneakerBlack: 0x22252a,
  uniformScarfRed: 0xd62828,
  studentSatchelBrown: 0x7a4b27,
  beltLeather: 0x3d2314,
  skinTone: 0xdfad87,
  hairBlack: 0x1a1a1c,

  // Chalk & Erased supernatural colors
  chalkWhite: 0xf8f9fa,
  chalkGlowCyan: 0xa8e6cf,
  erasedDarkSmoke: 0x16181b,
  erasedAshGrey: 0x393e46,
  erasedGlowRune: 0x64dfdf,
  erasedSpectacleRed: 0xff0055,

  // Vietnamese school items
  blackboardGreen: 0x1e3f20,
  blackboardWoodFrame: 0x5a3d28,
  ceilingFanGreen: 0x336b4a,
  schoolDrumRed: 0xba181b,
  schoolDrumGold: 0xdfa028,
  bonsaiPotCeramic: 0x274c77,
  bonsaiFoliageGreen: 0x2d6a4f,
};

// ============================================================================
// 1. CHARACTERS
// ============================================================================

/**
 * CB_CHAR_Player_A: Vietnamese High School Student Survivor ("Minh")
 * Authentic attire: White school uniform shirt with folded collar and breast pocket,
 * red student scarf, navy trousers, canvas shoes, brown leather chalk holster,
 * and crossbody canvas satchel carrying spare chalk sticks.
 */
function createPlayerCharacterA() {
  const root = new THREE.Group();
  root.name = 'CB_CHAR_Player_A';

  const matSkin = new THREE.MeshStandardMaterial({ color: PALETTE.skinTone, roughness: 0.7 });
  const matHair = new THREE.MeshStandardMaterial({ color: PALETTE.hairBlack, roughness: 0.9 });
  const matShirt = new THREE.MeshStandardMaterial({ color: PALETTE.uniformWhite, roughness: 0.6 });
  const matScarf = new THREE.MeshStandardMaterial({ color: PALETTE.uniformScarfRed, roughness: 0.8 });
  const matPants = new THREE.MeshStandardMaterial({ color: PALETTE.uniformNavy, roughness: 0.7 });
  const matShoes = new THREE.MeshStandardMaterial({ color: PALETTE.uniformSneakerBlack, roughness: 0.8 });
  const matSatchel = new THREE.MeshStandardMaterial({ color: PALETTE.studentSatchelBrown, roughness: 0.8 });
  const matChalk = new THREE.MeshStandardMaterial({ color: PALETTE.chalkWhite, roughness: 0.9 });
  const matChalkGlow = new THREE.MeshStandardMaterial({
    color: PALETTE.chalkWhite,
    emissive: PALETTE.chalkGlowCyan,
    emissiveIntensity: 0.6,
  });

  // Pelvis / Hips (y = 0.95m)
  const hips = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.18, 0.22), matPants);
  hips.position.y = 0.96;
  root.add(hips);

  // Torso / White shirt (y = 1.25m)
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.42, 0.24), matShirt);
  torso.position.y = 1.24;
  root.add(torso);

  // Red Scarf / Khăn quàng đỏ
  const scarfCollar = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.08, 0.26), matScarf);
  scarfCollar.position.set(0, 1.44, 0.01);
  const scarfTie = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.25, 4), matScarf);
  scarfTie.rotation.z = Math.PI;
  scarfTie.position.set(0, 1.32, 0.13);
  root.add(scarfCollar, scarfTie);

  // Belt & Chalk Holster
  const belt = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.05, 0.23), matSatchel);
  belt.position.y = 1.05;
  const chalkHolster = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.08), matSatchel);
  chalkHolster.position.set(0.18, 1.02, 0.05);
  // 2 chalk pieces in holster
  const chalkStick1 = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.09, 8), matChalk);
  chalkStick1.position.set(0.17, 1.07, 0.04);
  const chalkStick2 = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.09, 8), matChalk);
  chalkStick2.position.set(0.19, 1.07, 0.06);
  root.add(belt, chalkHolster, chalkStick1, chalkStick2);

  // Crossbody Satchel (Cặp sách học sinh)
  const satchelBag = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.26, 0.28), matSatchel);
  satchelBag.position.set(-0.21, 0.95, -0.05);
  satchelBag.rotation.z = -0.15;
  // Satchel strap across torso
  const strap = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.62, 0.26), matSatchel);
  strap.position.set(-0.06, 1.25, 0.01);
  strap.rotation.z = 0.55;
  root.add(satchelBag, strap);

  // Neck & Head
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.1, 8), matSkin);
  neck.position.y = 1.48;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.22, 0.2), matSkin);
  head.position.y = 1.62;
  const hair = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.22), matHair);
  hair.position.y = 1.72;
  root.add(neck, head, hair);

  // Left Arm (relaxed at side)
  const leftArm = new THREE.Group();
  leftArm.position.set(-0.24, 1.4, 0);
  const leftUpper = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.28, 0.11), matShirt);
  leftUpper.position.y = -0.14;
  const leftForearm = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.26, 0.09), matSkin);
  leftForearm.position.y = -0.38;
  const leftHand = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.09, 0.08), matSkin);
  leftHand.position.y = -0.54;
  leftArm.add(leftUpper, leftForearm, leftHand);
  root.add(leftArm);

  // Right Arm (drawing stance, raised forward holding glowing chalk)
  const rightArm = new THREE.Group();
  rightArm.position.set(0.24, 1.4, 0);
  rightArm.rotation.x = -Math.PI / 3; // forward
  const rightUpper = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.28, 0.11), matShirt);
  rightUpper.position.y = -0.14;
  const rightForearm = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.26, 0.09), matSkin);
  rightForearm.position.y = -0.38;
  const rightHand = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.09, 0.08), matSkin);
  rightHand.position.y = -0.54;
  // Glowing chalk stick gripped in fingers
  const activeChalk = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.12, 8), matChalkGlow);
  activeChalk.rotation.x = Math.PI / 2;
  activeChalk.position.set(0, -0.54, 0.06);
  rightArm.add(rightUpper, rightForearm, rightHand, activeChalk);
  root.add(rightArm);

  // Left Leg
  const leftLeg = new THREE.Group();
  leftLeg.position.set(-0.1, 0.88, 0);
  const leftThigh = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.44, 0.15), matPants);
  leftThigh.position.y = -0.22;
  const leftShin = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.42, 0.14), matPants);
  leftShin.position.y = -0.62;
  const leftFoot = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.09, 0.25), matShoes);
  leftFoot.position.set(0, -0.84, 0.04);
  leftLeg.add(leftThigh, leftShin, leftFoot);
  root.add(leftLeg);

  // Right Leg
  const rightLeg = new THREE.Group();
  rightLeg.position.set(0.1, 0.88, 0);
  const rightThigh = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.44, 0.15), matPants);
  rightThigh.position.y = -0.22;
  const rightShin = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.42, 0.14), matPants);
  rightShin.position.y = -0.62;
  const rightFoot = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.09, 0.25), matShoes);
  rightFoot.position.set(0, -0.84, 0.04);
  rightLeg.add(rightThigh, rightShin, rightFoot);
  root.add(rightLeg);

  return root;
}

/**
 * CB_CHAR_Player_B: Vietnamese Female Student Explorer ("Linh")
 * Attire: Traditional/Modern high school uniform, dark hair in ponytail,
 * crossbody leather chalk pouch, alert exploration stance.
 */
function createPlayerCharacterB() {
  const root = new THREE.Group();
  root.name = 'CB_CHAR_Player_B';

  const matSkin = new THREE.MeshStandardMaterial({ color: PALETTE.skinTone, roughness: 0.7 });
  const matHair = new THREE.MeshStandardMaterial({ color: PALETTE.hairBlack, roughness: 0.9 });
  const matWhite = new THREE.MeshStandardMaterial({ color: PALETTE.uniformWhite, roughness: 0.5 });
  const matSkirt = new THREE.MeshStandardMaterial({ color: PALETTE.uniformNavy, roughness: 0.7 });
  const matScarf = new THREE.MeshStandardMaterial({ color: PALETTE.uniformScarfRed, roughness: 0.8 });
  const matShoes = new THREE.MeshStandardMaterial({ color: PALETTE.uniformSneakerBlack, roughness: 0.8 });
  const matBag = new THREE.MeshStandardMaterial({ color: PALETTE.studentSatchelBrown, roughness: 0.7 });
  const matChalkGlow = new THREE.MeshStandardMaterial({
    color: PALETTE.chalkWhite,
    emissive: PALETTE.chalkGlowCyan,
    emissiveIntensity: 0.8,
  });

  // Hips & Skirt/Trousers
  const hips = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.24, 0.2), matSkirt);
  hips.position.y = 0.94;
  root.add(hips);

  // Torso / White blouse
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.4, 0.22), matWhite);
  torso.position.y = 1.22;
  root.add(torso);

  // Red Scarf tie
  const scarfTie = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.22, 4), matScarf);
  scarfTie.rotation.z = Math.PI;
  scarfTie.position.set(0, 1.3, 0.12);
  root.add(scarfTie);

  // Crossbody pouch
  const pouch = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.18, 0.22), matBag);
  pouch.position.set(0.19, 0.95, 0);
  root.add(pouch);

  // Neck, Head & Ponytail
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.09, 8), matSkin);
  neck.position.y = 1.46;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.2, 0.18), matSkin);
  head.position.y = 1.58;
  const hair = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.2), matHair);
  hair.position.y = 1.68;
  const ponytail = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.02, 0.26, 8), matHair);
  ponytail.rotation.x = 0.35;
  ponytail.position.set(0, 1.62, -0.15);
  root.add(neck, head, hair, ponytail);

  // Arms
  const leftArm = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.55, 0.09), matSkin);
  leftArm.position.set(-0.21, 1.15, 0);
  root.add(leftArm);

  const rightArm = new THREE.Group();
  rightArm.position.set(0.21, 1.38, 0);
  rightArm.rotation.x = -Math.PI / 4;
  const rightLimb = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.52, 0.09), matSkin);
  rightLimb.position.y = -0.26;
  const chalkPiece = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.1, 8), matChalkGlow);
  chalkPiece.rotation.x = Math.PI / 2;
  chalkPiece.position.set(0, -0.5, 0.05);
  rightArm.add(rightLimb, chalkPiece);
  root.add(rightArm);

  // Legs
  const leftLeg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.78, 0.13), matSkirt);
  leftLeg.position.set(-0.09, 0.44, 0);
  const leftFoot = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.08, 0.22), matShoes);
  leftFoot.position.set(-0.09, 0.04, 0.03);

  const rightLeg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.78, 0.13), matSkirt);
  rightLeg.position.set(0.09, 0.44, 0);
  const rightFoot = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.08, 0.22), matShoes);
  rightFoot.position.set(0.09, 0.04, 0.03);

  root.add(leftLeg, leftFoot, rightLeg, rightFoot);
  return root;
}

/**
 * CB_PVE_ErasedSword_A: "The Erased" (Kẻ Bị Xóa)
 * Corrupted entity made of blackboard shadow, eraser dust, and chalk scars.
 * Right arm is fused with a jagged, menacing chalk blade.
 */
function createErasedSwordCreature() {
  const root = new THREE.Group();
  root.name = 'CB_PVE_ErasedSword_A';

  const matBody = new THREE.MeshStandardMaterial({
    color: PALETTE.erasedDarkSmoke,
    roughness: 0.95,
  });
  const matAsh = new THREE.MeshStandardMaterial({
    color: PALETTE.erasedAshGrey,
    roughness: 0.9,
  });
  const matChalkBlade = new THREE.MeshStandardMaterial({
    color: PALETTE.chalkWhite,
    emissive: PALETTE.erasedGlowRune,
    emissiveIntensity: 0.8,
    roughness: 0.4,
  });
  const matGlowRunes = new THREE.MeshStandardMaterial({
    color: PALETTE.chalkWhite,
    emissive: PALETTE.erasedGlowRune,
    emissiveIntensity: 1.0,
  });

  // Distorted Hips & Torso (Height 1.9m)
  const hips = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.22, 0.24), matBody);
  hips.position.y = 1.02;
  root.add(hips);

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.5, 0.26), matBody);
  torso.position.y = 1.34;
  root.add(torso);

  // Glowing chalk fracture lines running across chest
  const rune1 = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.35, 0.27), matGlowRunes);
  rune1.rotation.z = 0.4;
  rune1.position.set(-0.05, 1.35, 0.01);
  const rune2 = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.03, 0.27), matGlowRunes);
  rune2.position.set(0.05, 1.42, 0.01);
  root.add(rune1, rune2);

  // Distorted Void Head with glowing blank chalk eyes
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.26, 0.22), matBody);
  head.position.y = 1.74;
  const leftEye = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.02), matGlowRunes);
  leftEye.position.set(-0.06, 1.76, 0.12);
  const rightEye = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.02), matGlowRunes);
  rightEye.position.set(0.06, 1.76, 0.12);
  root.add(head, leftEye, rightEye);

  // Left Claw / Arm (Wisping eraser residue)
  const leftArm = new THREE.Group();
  leftArm.position.set(-0.28, 1.5, 0);
  const leftUpper = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.32, 0.12), matBody);
  leftUpper.position.y = -0.16;
  const leftClaw = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.45, 4), matAsh);
  leftClaw.rotation.z = Math.PI;
  leftClaw.position.set(0, -0.48, 0);
  leftArm.add(leftUpper, leftClaw);
  root.add(leftArm);

  // Right Arm: Fused Chalk Sword Arm
  const rightArm = new THREE.Group();
  rightArm.position.set(0.28, 1.5, 0);
  const rightUpper = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.3, 0.14), matBody);
  rightUpper.position.y = -0.15;

  // Giant jagged chalk sword extending from the forearm
  const swordBlade = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.1, 0.04), matChalkBlade);
  swordBlade.position.set(0.05, -0.75, 0.15);
  swordBlade.rotation.x = 0.25;

  const swordTip = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.25, 4), matChalkBlade);
  swordTip.rotation.z = Math.PI;
  swordTip.position.set(0.05, -1.35, 0.28);
  swordTip.rotation.x = 0.25;

  rightArm.add(rightUpper, swordBlade, swordTip);
  root.add(rightArm);

  // Legs (stalking, angular stance)
  const leftLeg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.94, 0.16), matBody);
  leftLeg.position.set(-0.12, 0.47, 0);
  const rightLeg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.94, 0.16), matBody);
  rightLeg.position.set(0.12, 0.47, 0);
  root.add(leftLeg, rightLeg);

  return root;
}

/**
 * CB_PVE_ErasedStalker_A: "The Hall Monitor" (Giám Thị Bóng Ma)
 * Tall spectral disciplinary official patrolling school halls with red chalk spectacles.
 */
function createErasedStalkerCreature() {
  const root = new THREE.Group();
  root.name = 'CB_PVE_ErasedStalker_A';

  const matCoat = new THREE.MeshStandardMaterial({ color: 0x121517, roughness: 0.9 });
  const matShadow = new THREE.MeshStandardMaterial({ color: 0x23272a, roughness: 0.8 });
  const matGlasses = new THREE.MeshStandardMaterial({
    color: 0xff1e56,
    emissive: PALETTE.erasedSpectacleRed,
    emissiveIntensity: 1.2,
  });
  const matRuler = new THREE.MeshStandardMaterial({
    color: PALETTE.teakMedium,
    roughness: 0.6,
  });

  // Long Duster Coat / Torso (Height 2.15m)
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.38, 1.3, 8), matCoat);
  body.position.y = 1.15;
  root.add(body);

  // High Collar & Head
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.18, 8), matCoat);
  collar.position.y = 1.84;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.24, 0.2), matShadow);
  head.position.y = 2.0;

  // Piercing Red Spectacles
  const glasses = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.04, 0.04), matGlasses);
  glasses.position.set(0, 2.02, 0.11);
  root.add(collar, head, glasses);

  // Long disciplinary ruler weapon in hand (1.2m heavy wooden wooden meter stick)
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.7, 0.1), matCoat);
  arm.position.set(0.35, 1.45, 0.1);
  arm.rotation.x = -0.3;
  const ruler = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.2, 0.02), matRuler);
  ruler.position.set(0.35, 1.05, 0.3);
  ruler.rotation.x = 0.5;
  root.add(arm, ruler);

  // Ghostly floating lower hem
  const hem = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.5, 8), matCoat);
  hem.rotation.z = Math.PI;
  hem.position.y = 0.35;
  root.add(hem);

  return root;
}

/**
 * CB_CHAR_Hands_A: First-person viewmodel hands holding chalk stick
 */
function createViewmodelHands() {
  const root = new THREE.Group();
  root.name = 'CB_CHAR_Hands_A';

  const matSkin = new THREE.MeshStandardMaterial({ color: PALETTE.skinTone, roughness: 0.7 });
  const matSleeve = new THREE.MeshStandardMaterial({ color: PALETTE.uniformWhite, roughness: 0.6 });
  const matChalkGlow = new THREE.MeshStandardMaterial({
    color: PALETTE.chalkWhite,
    emissive: PALETTE.chalkGlowCyan,
    emissiveIntensity: 0.9,
  });

  // Left Hand & Forearm (steadying pose)
  const leftForearm = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, 0.35), matSleeve);
  leftForearm.position.set(-0.25, -0.15, 0.15);
  const leftHand = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.07, 0.12), matSkin);
  leftHand.position.set(-0.25, -0.14, -0.08);
  root.add(leftForearm, leftHand);

  // Right Hand & Forearm (poised to sketch)
  const rightForearm = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, 0.35), matSleeve);
  rightForearm.position.set(0.22, -0.12, 0.12);
  const rightHand = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.07, 0.12), matSkin);
  rightHand.position.set(0.22, -0.1, -0.1);

  // Gripped Chalk Stick ready to draw
  const chalkStick = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.1, 8), matChalkGlow);
  chalkStick.rotation.x = Math.PI / 2;
  chalkStick.position.set(0.22, -0.07, -0.18);
  root.add(rightForearm, rightHand, chalkStick);

  return root;
}

// ============================================================================
// 2. MODULAR ENVIRONMENT (VIETNAMESE ARCHITECTURE)
// ============================================================================

/**
 * CB_ENV_VN_Wall_YellowStucco_A: Classic French-Indochinese yellow stucco wall (4m x 3m x 0.2m)
 * Distinctive colonial yellow with bottom concrete plinth, upper crown molding, and subtle weathering.
 */
function createWallYellowStucco() {
  const root = new THREE.Group();
  root.name = 'CB_ENV_VN_Wall_YellowStucco_A';

  const matStucco = new THREE.MeshStandardMaterial({ color: PALETTE.yellowStucco, roughness: 0.85 });
  const matPlinth = new THREE.MeshStandardMaterial({ color: 0x5a5e59, roughness: 0.9 });
  const matMolding = new THREE.MeshStandardMaterial({ color: PALETTE.yellowStuccoDark, roughness: 0.75 });

  // Main Wall Panel (4m wide, 2.7m high, 0.2m thick, origin at bottom-center)
  const wall = new THREE.Mesh(new THREE.BoxGeometry(4.0, 2.7, 0.2), matStucco);
  wall.position.set(0, 1.45, 0);

  // Bottom Plinth / Skirting (4m x 0.3m x 0.24m)
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(4.0, 0.3, 0.24), matPlinth);
  plinth.position.set(0, 0.15, 0);

  // Upper Architectural Cornice Molding (4m x 0.15m x 0.26m)
  const molding = new THREE.Mesh(new THREE.BoxGeometry(4.0, 0.15, 0.26), matMolding);
  molding.position.set(0, 2.925, 0);

  root.add(wall, plinth, molding);
  return root;
}

/**
 * CB_ENV_VN_Wall_RedBrick_A: Imperial Hue & Dalat colonial red brick arch wall (4m x 3m x 0.3m)
 * Features an elegant recessed colonial Roman archway.
 */
function createWallRedBrickArch() {
  const root = new THREE.Group();
  root.name = 'CB_ENV_VN_Wall_RedBrick_A';

  const matBrick = new THREE.MeshStandardMaterial({ color: PALETTE.hueRedBrick, roughness: 0.9 });
  const matArchTrim = new THREE.MeshStandardMaterial({ color: PALETTE.hueCrimson, roughness: 0.8 });
  const matPlinth = new THREE.MeshStandardMaterial({ color: PALETTE.hueRedBrickDark, roughness: 0.95 });

  // Left Pier (0.8m x 3.0m x 0.3m)
  const leftPier = new THREE.Mesh(new THREE.BoxGeometry(0.8, 3.0, 0.3), matBrick);
  leftPier.position.set(-1.6, 1.5, 0);

  // Right Pier (0.8m x 3.0m x 0.3m)
  const rightPier = new THREE.Mesh(new THREE.BoxGeometry(0.8, 3.0, 0.3), matBrick);
  rightPier.position.set(1.6, 1.5, 0);

  // Top Spandrel (2.4m x 0.8m x 0.3m)
  const topSpandrel = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.8, 0.3), matBrick);
  topSpandrel.position.set(0, 2.6, 0);

  // Ornamental Arch Keystones & Voussoirs
  const keystone = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.35, 0.36), matArchTrim);
  keystone.position.set(0, 2.25, 0);

  // Base stone plinths
  const baseL = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.35, 0.36), matPlinth);
  baseL.position.set(-1.6, 0.175, 0);
  const baseR = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.35, 0.36), matPlinth);
  baseR.position.set(1.6, 0.175, 0);

  root.add(leftPier, rightPier, topSpandrel, keystone, baseL, baseR);
  return root;
}

/**
 * CB_ENV_VN_Floor_Tile_A: Indochinese encaustic cement floor tile (Gạch bông Đông Dương) (4m x 4m x 0.15m)
 */
function createFloorTile() {
  const root = new THREE.Group();
  root.name = 'CB_ENV_VN_Floor_Tile_A';

  const matBase = new THREE.MeshStandardMaterial({ color: PALETTE.tilePatternCream, roughness: 0.5 });
  const matBorder = new THREE.MeshStandardMaterial({ color: PALETTE.tileBorderDark, roughness: 0.6 });
  const matCenter = new THREE.MeshStandardMaterial({ color: PALETTE.tilePatternTeal, roughness: 0.55 });

  // Main Slab (4m x 0.15m x 4m)
  const slab = new THREE.Mesh(new THREE.BoxGeometry(4.0, 0.15, 4.0), matBase);
  slab.position.y = -0.075;

  // Decorative border inlay
  const border = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.01, 3.8), matBorder);
  border.position.y = 0.005;

  // Center motif rosette
  const centerMotif = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.015, 8), matCenter);
  centerMotif.position.y = 0.01;

  root.add(slab, border, centerMotif);
  return root;
}

/**
 * CB_ENV_VN_Floor_Wood_A: Dark Teak Timber Flooring (4m x 4m x 0.15m)
 */
function createFloorWood() {
  const root = new THREE.Group();
  root.name = 'CB_ENV_VN_Floor_Wood_A';

  const matTeak = new THREE.MeshStandardMaterial({ color: PALETTE.teakMedium, roughness: 0.7 });
  const matTeakDark = new THREE.MeshStandardMaterial({ color: PALETTE.teakDark, roughness: 0.75 });

  const slab = new THREE.Mesh(new THREE.BoxGeometry(4.0, 0.15, 4.0), matTeak);
  slab.position.y = -0.075;
  root.add(slab);

  // 8 longitudinal floor planks
  for (let i = -3.5; i <= 3.5; i += 1.0) {
    const plankDivider = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.01, 4.0), matTeakDark);
    plankDivider.position.set(i * 0.5, 0.005, 0);
    root.add(plankDivider);
  }

  return root;
}

/**
 * CB_ENV_VN_Window_Louver_A: French Colonial Louvered Window (Cửa lá sách xanh)
 */
function createFrenchWindow() {
  const root = new THREE.Group();
  root.name = 'CB_ENV_VN_Window_Louver_A';

  const matFrame = new THREE.MeshStandardMaterial({ color: PALETTE.yellowStucco, roughness: 0.8 });
  const matShutter = new THREE.MeshStandardMaterial({ color: PALETTE.frenchGreen, roughness: 0.65 });
  const matGlass = new THREE.MeshStandardMaterial({
    color: 0x88aabb,
    roughness: 0.1,
    metalness: 0.2,
  });

  // Masonry wall frame (2.0m x 2.4m x 0.25m)
  const top = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.3, 0.25), matFrame);
  top.position.set(0, 2.25, 0);
  const sill = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.2, 0.32), matFrame);
  sill.position.set(0, 0.1, 0);
  const leftJamb = new THREE.Mesh(new THREE.BoxGeometry(0.25, 2.0, 0.25), matFrame);
  leftJamb.position.set(-0.875, 1.2, 0);
  const rightJamb = new THREE.Mesh(new THREE.BoxGeometry(0.25, 2.0, 0.25), matFrame);
  rightJamb.position.set(0.875, 1.2, 0);

  // Glass Pane
  const glass = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.9, 0.04), matGlass);
  glass.position.set(0, 1.2, 0);

  // Left & Right Green Louver Shutters (partially ajar)
  const leftShutter = new THREE.Mesh(new THREE.BoxGeometry(0.72, 1.85, 0.06), matShutter);
  leftShutter.position.set(-0.6, 1.2, 0.12);
  leftShutter.rotation.y = 0.3;

  const rightShutter = new THREE.Mesh(new THREE.BoxGeometry(0.72, 1.85, 0.06), matShutter);
  rightShutter.position.set(0.6, 1.2, 0.12);
  rightShutter.rotation.y = -0.3;

  root.add(top, sill, leftJamb, rightJamb, glass, leftShutter, rightShutter);
  return root;
}

/**
 * CB_ENV_VN_Door_Colonial_A: Arched French-Indochinese Double Door (2m x 2.8m x 0.25m)
 */
function createColonialDoor() {
  const root = new THREE.Group();
  root.name = 'CB_ENV_VN_Door_Colonial_A';

  const matFrame = new THREE.MeshStandardMaterial({ color: PALETTE.yellowStucco, roughness: 0.85 });
  const matWood = new THREE.MeshStandardMaterial({ color: PALETTE.teakDark, roughness: 0.7 });
  const matBrass = new THREE.MeshStandardMaterial({
    color: 0xd4af37,
    roughness: 0.3,
    metalness: 0.8,
  });

  // Door Frame
  const frameL = new THREE.Mesh(new THREE.BoxGeometry(0.25, 2.8, 0.25), matFrame);
  frameL.position.set(-0.95, 1.4, 0);
  const frameR = new THREE.Mesh(new THREE.BoxGeometry(0.25, 2.8, 0.25), matFrame);
  frameR.position.set(0.95, 1.4, 0);
  const frameTop = new THREE.Mesh(new THREE.BoxGeometry(2.15, 0.3, 0.25), matFrame);
  frameTop.position.set(0, 2.65, 0);

  // Double wooden door leaves
  const leafL = new THREE.Mesh(new THREE.BoxGeometry(0.78, 2.45, 0.08), matWood);
  leafL.position.set(-0.41, 1.25, 0);
  const leafR = new THREE.Mesh(new THREE.BoxGeometry(0.78, 2.45, 0.08), matWood);
  leafR.position.set(0.41, 1.25, 0);

  // Brass handles
  const handleL = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.18, 8), matBrass);
  handleL.position.set(-0.06, 1.15, 0.06);
  const handleR = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.18, 8), matBrass);
  handleR.position.set(0.06, 1.15, 0.06);

  root.add(frameL, frameR, frameTop, leafL, leafR, handleL, handleR);
  return root;
}

/**
 * CB_ENV_VN_Gate_TamQuan_A: Traditional Ceremonial Gate (Cổng Tam Quan Quốc Học Huế)
 * Iconic triple-arched imperial red pavilion gate structure.
 */
function createTamQuanGate() {
  const root = new THREE.Group();
  root.name = 'CB_ENV_VN_Gate_TamQuan_A';

  const matRedPillar = new THREE.MeshStandardMaterial({ color: PALETTE.hueCrimson, roughness: 0.7 });
  const matRoof = new THREE.MeshStandardMaterial({ color: PALETTE.clayRoofRed, roughness: 0.8 });
  const matGoldTrim = new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.4, metalness: 0.6 });

  // 4 Main Pillars (Width 6m, Height 4.5m)
  const p1 = new THREE.Mesh(new THREE.BoxGeometry(0.6, 4.0, 0.6), matRedPillar);
  p1.position.set(-2.5, 2.0, 0);
  const p2 = new THREE.Mesh(new THREE.BoxGeometry(0.6, 4.5, 0.6), matRedPillar);
  p2.position.set(-1.0, 2.25, 0);
  const p3 = new THREE.Mesh(new THREE.BoxGeometry(0.6, 4.5, 0.6), matRedPillar);
  p3.position.set(1.0, 2.25, 0);
  const p4 = new THREE.Mesh(new THREE.BoxGeometry(0.6, 4.0, 0.6), matRedPillar);
  p4.position.set(2.5, 2.0, 0);

  // Central Archway Lintels
  const centralLintel = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.5, 0.7), matRedPillar);
  centralLintel.position.set(0, 4.2, 0);
  const plaque = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.35, 0.75), matGoldTrim);
  plaque.position.set(0, 4.2, 0);

  // Curved Multi-tiered Roof Eaves
  const centerRoof = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.45, 1.4), matRoof);
  centerRoof.position.set(0, 4.7, 0);

  const leftRoof = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.35, 1.2), matRoof);
  leftRoof.position.set(-2.2, 4.15, 0);

  const rightRoof = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.35, 1.2), matRoof);
  rightRoof.position.set(2.2, 4.15, 0);

  root.add(p1, p2, p3, p4, centralLintel, plaque, centerRoof, leftRoof, rightRoof);
  return root;
}

// ============================================================================
// 3. PROPS & GAMEPLAY PICKUPS
// ============================================================================

/**
 * CB_PROP_VN_Desk_A: Vietnamese Wooden School Desk with Bench (Bàn học gỗ học sinh Việt Nam)
 * Standard double-student wooden desk with integrated bench, pencil groove, and book shelf.
 */
function createVietnameseSchoolDesk() {
  const root = new THREE.Group();
  root.name = 'CB_PROP_VN_Desk_A';

  const matWood = new THREE.MeshStandardMaterial({ color: PALETTE.teakMedium, roughness: 0.75 });
  const matIronLegs = new THREE.MeshStandardMaterial({ color: 0x222426, roughness: 0.6, metalness: 0.5 });

  // Desktop (1.2m wide, 0.45m deep, 0.75m high)
  const desktop = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.04, 0.45), matWood);
  desktop.position.set(0, 0.73, -0.15);

  // Pencil groove along top front
  const groove = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.01, 0.03), matIronLegs);
  groove.position.set(0, 0.751, -0.05);

  // Book shelf under desk
  const shelf = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.03, 0.38), matWood);
  shelf.position.set(0, 0.58, -0.15);

  // Integrated Bench Seat (1.2m wide, 0.28m deep, 0.45m high)
  const seat = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.04, 0.28), matWood);
  seat.position.set(0, 0.43, 0.35);

  // Steel / Iron tubular frame connecting desk and bench
  const legLeft = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.75, 0.8), matIronLegs);
  legLeft.position.set(-0.52, 0.375, 0.1);
  const legRight = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.75, 0.8), matIronLegs);
  legRight.position.set(0.52, 0.375, 0.1);

  root.add(desktop, groove, shelf, seat, legLeft, legRight);
  return root;
}

/**
 * CB_PROP_VN_Blackboard_A: Anti-glare Grid Blackboard (Bảng xanh chống lóa kẻ ô ly)
 * Classic Vietnamese school chalkboard (3.6m wide x 1.2m high) with wooden frame and chalk dust tray.
 */
function createVietnameseBlackboard() {
  const root = new THREE.Group();
  root.name = 'CB_PROP_VN_Blackboard_A';

  const matBoard = new THREE.MeshStandardMaterial({ color: PALETTE.blackboardGreen, roughness: 0.95 });
  const matFrame = new THREE.MeshStandardMaterial({ color: PALETTE.blackboardWoodFrame, roughness: 0.7 });
  const matTray = new THREE.MeshStandardMaterial({ color: 0x999999, roughness: 0.5, metalness: 0.6 });
  const matDust = new THREE.MeshStandardMaterial({ color: PALETTE.chalkWhite, roughness: 0.98 });

  // Main Green Chalkboard Surface (3.6m x 1.2m x 0.03m, center at y = 1.6m)
  const board = new THREE.Mesh(new THREE.BoxGeometry(3.6, 1.2, 0.03), matBoard);
  board.position.set(0, 1.6, 0);

  // Outer Timber Frame
  const frameTop = new THREE.Mesh(new THREE.BoxGeometry(3.7, 0.06, 0.05), matFrame);
  frameTop.position.set(0, 2.23, 0);
  const frameBottom = new THREE.Mesh(new THREE.BoxGeometry(3.7, 0.06, 0.05), matFrame);
  frameBottom.position.set(0, 0.97, 0);
  const frameLeft = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.32, 0.05), matFrame);
  frameLeft.position.set(-1.83, 1.6, 0);
  const frameRight = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.32, 0.05), matFrame);
  frameRight.position.set(1.83, 1.6, 0);

  // Chalk & Eraser Tray (extends 0.1m forward)
  const tray = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.03, 0.1), matTray);
  tray.position.set(0, 0.94, 0.05);

  // Scattered white chalk sticks and eraser residue on tray
  const chalk1 = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.08, 8), matDust);
  chalk1.rotation.z = Math.PI / 2;
  chalk1.position.set(-0.5, 0.965, 0.05);

  const chalk2 = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.06, 8), matDust);
  chalk2.rotation.y = 0.4;
  chalk2.rotation.z = Math.PI / 2;
  chalk2.position.set(0.6, 0.965, 0.05);

  const eraser = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.04, 0.06), matFrame);
  eraser.position.set(0, 0.97, 0.05);

  root.add(board, frameTop, frameBottom, frameLeft, frameRight, tray, chalk1, chalk2, eraser);
  return root;
}

/**
 * CB_PROP_VN_CeilingFan_A: Vinawind 3-Blade Green Ceiling Fan (Quạt trần Vinawind)
 * Ubiquitous Vietnamese classroom electric ceiling fan.
 */
function createCeilingFan() {
  const root = new THREE.Group();
  root.name = 'CB_PROP_VN_CeilingFan_A';

  const matFan = new THREE.MeshStandardMaterial({ color: PALETTE.ceilingFanGreen, roughness: 0.5 });
  const matMotor = new THREE.MeshStandardMaterial({ color: PALETTE.frenchGreenDark, roughness: 0.4 });

  // Ceiling Mounting Downrod (origin at top attachment point y = 0)
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.6, 8), matFan);
  rod.position.y = -0.3;

  // Central Motor Housing
  const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.15, 12), matMotor);
  motor.position.y = -0.65;

  // 3 Aerodynamic Fan Blades (1.4m diameter span)
  const blades = new THREE.Group();
  blades.position.y = -0.65;

  for (let i = 0; i < 3; i++) {
    const angle = (i * 2 * Math.PI) / 3;
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.01, 0.65), matFan);
    blade.position.set(Math.sin(angle) * 0.38, 0, Math.cos(angle) * 0.38);
    blade.rotation.y = angle;
    blade.rotation.x = 0.12; // tilt pitch
    blades.add(blade);
  }

  root.add(rod, motor, blades);
  return root;
}

/**
 * CB_PROP_VN_Drum_A: Traditional School Drum (Trống trường học)
 * Large red barrel drum made of jackfruit wood and buffalo hide, on a decorative stand.
 */
function createSchoolDrum() {
  const root = new THREE.Group();
  root.name = 'CB_PROP_VN_Drum_A';

  const matBarrel = new THREE.MeshStandardMaterial({ color: PALETTE.schoolDrumRed, roughness: 0.6 });
  const matHead = new THREE.MeshStandardMaterial({ color: 0xdfcfb0, roughness: 0.85 });
  const matGoldTacks = new THREE.MeshStandardMaterial({ color: PALETTE.schoolDrumGold, roughness: 0.4, metalness: 0.6 });
  const matStand = new THREE.MeshStandardMaterial({ color: PALETTE.teakDark, roughness: 0.7 });

  // Drum Body (Cylinder bulging horizontally, radius 0.5m, length 0.9m)
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 0.9, 16), matBarrel);
  body.rotation.z = Math.PI / 2;
  body.position.y = 1.1;

  // Left & Right Drum Heads (Mặt da trâu)
  const headL = new THREE.Mesh(new THREE.CircleGeometry(0.46, 16), matHead);
  headL.rotation.y = -Math.PI / 2;
  headL.position.set(-0.455, 1.1, 0);

  const headR = new THREE.Mesh(new THREE.CircleGeometry(0.46, 16), matHead);
  headR.rotation.y = Math.PI / 2;
  headR.position.set(0.455, 1.1, 0);

  // Decorative gold rivet bands
  const goldRing1 = new THREE.Mesh(new THREE.CylinderGeometry(0.49, 0.49, 0.04, 16), matGoldTacks);
  goldRing1.rotation.z = Math.PI / 2;
  goldRing1.position.set(-0.25, 1.1, 0);
  const goldRing2 = new THREE.Mesh(new THREE.CylinderGeometry(0.49, 0.49, 0.04, 16), matGoldTacks);
  goldRing2.rotation.z = Math.PI / 2;
  goldRing2.position.set(0.25, 1.1, 0);

  // Decorative wooden cradle stand
  const leg1 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.9, 0.08), matStand);
  leg1.position.set(-0.35, 0.45, -0.35);
  const leg2 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.9, 0.08), matStand);
  leg2.position.set(-0.35, 0.45, 0.35);
  const leg3 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.9, 0.08), matStand);
  leg3.position.set(0.35, 0.45, -0.35);
  const leg4 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.9, 0.08), matStand);
  leg4.position.set(0.35, 0.45, 0.35);

  root.add(body, headL, headR, goldRing1, goldRing2, leg1, leg2, leg3, leg4);
  return root;
}

/**
 * CB_PROP_VN_BonsaiPot_A: Ceramic Dragon Planter & Ornamental Bonsai Tree
 * Ubiquitous in Hue and Hanoi school courtyards.
 */
function createCourtyardBonsai() {
  const root = new THREE.Group();
  root.name = 'CB_PROP_VN_BonsaiPot_A';

  const matCeramic = new THREE.MeshStandardMaterial({ color: PALETTE.bonsaiPotCeramic, roughness: 0.3 });
  const matTrunk = new THREE.MeshStandardMaterial({ color: PALETTE.teakDark, roughness: 0.9 });
  const matFoliage = new THREE.MeshStandardMaterial({ color: PALETTE.bonsaiFoliageGreen, roughness: 0.85 });

  // Hexagonal glazed ceramic planter pot (y = 0 to 0.65m)
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.4, 0.65, 6), matCeramic);
  pot.position.y = 0.325;

  // Gnarled miniature Banyan/Ficus tree trunk
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 0.8, 8), matTrunk);
  trunk.position.set(0, 0.95, 0);
  trunk.rotation.z = 0.15;

  // Tiered canopy cloud foliage (Tán cây kiểng)
  const canopy1 = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 6), matFoliage);
  canopy1.scale.set(1.2, 0.5, 1.2);
  canopy1.position.set(-0.15, 1.35, 0);

  const canopy2 = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 6), matFoliage);
  canopy2.scale.set(1.1, 0.45, 1.1);
  canopy2.position.set(0.25, 1.5, 0.1);

  root.add(pot, trunk, canopy1, canopy2);
  return root;
}

/**
 * CB_GAME_ChalkBox_VN_A: Authentic Vietnamese Chalk Box Pickup (Hộp Phấn Viết Bảng Bến Nghé / Mic)
 * Crucial gameplay pickup: Walking into or interacting with this grants chalk resource.
 */
function createVietnameseChalkBox() {
  const root = new THREE.Group();
  root.name = 'CB_GAME_ChalkBox_VN_A';

  const matCardboard = new THREE.MeshStandardMaterial({
    color: 0x2d55aa, // vibrant blue packaging
    roughness: 0.6,
  });
  const matSticks = new THREE.MeshStandardMaterial({
    color: PALETTE.chalkWhite,
    emissive: PALETTE.chalkGlowCyan,
    emissiveIntensity: 0.7,
    roughness: 0.9,
  });

  // Box dimensions (0.28m x 0.12m x 0.18m)
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.1, 0.18), matCardboard);
  box.position.y = 0.05;

  // Open box top displaying cylindrical white chalk sticks neatly packed
  for (let x = -0.1; x <= 0.1; x += 0.04) {
    for (let z = -0.06; z <= 0.06; z += 0.04) {
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.08, 8), matSticks);
      stick.position.set(x, 0.11, z);
      root.add(stick);
    }
  }

  root.add(box);
  return root;
}

// ============================================================================
// 4. MAPS / LEVELS BASED ON PLACES IN VIETNAM
// ============================================================================

/**
 * Level 1: Quốc Học Huế (Trường THPT Chuyên Quốc Học Huế)
 * Imperial neoclassical campus along the Perfume River in Central Vietnam.
 */
function generateMapQuocHocHue() {
  const boxes = [];
  const chalkBoxes = [];

  // Helper to add static box collider
  const addBox = (id, kind, center, halfExtents) => {
    boxes.push({ id, kind, center, halfExtents });
  };

  // Main Courtyard Stone / Tile Ground (60m x 48m)
  addBox('hue-courtyard-ground', 'floor', [0, -0.1, 0], [30, 0.1, 24]);

  // Grand Imperial Red Entrance Gate (Cổng Tam Quan phía Nam)
  addBox('hue-gate-pillar-left', 'wall', [-4, 2.5, 23.5], [0.6, 2.5, 0.6]);
  addBox('hue-gate-pillar-mid-l', 'wall', [-1.5, 3.0, 23.5], [0.6, 3.0, 0.6]);
  addBox('hue-gate-pillar-mid-r', 'wall', [1.5, 3.0, 23.5], [0.6, 3.0, 0.6]);
  addBox('hue-gate-pillar-right', 'wall', [4, 2.5, 23.5], [0.6, 2.5, 0.6]);
  addBox('hue-gate-arch-roof', 'wall', [0, 5.2, 23.5], [5.0, 0.4, 1.2]);

  // South Perimeter Wall
  addBox('hue-wall-south-left', 'wall', [-17, 1.75, 23.5], [12, 1.75, 0.25]);
  addBox('hue-wall-south-right', 'wall', [17, 1.75, 23.5], [12, 1.75, 0.25]);

  // North Riverbank Wall & Extraction Jetty (Sông Hương Pier)
  addBox('hue-wall-north-left', 'wall', [-18, 1.75, -23.5], [11, 1.75, 0.25]);
  addBox('hue-wall-north-right', 'wall', [18, 1.75, -23.5], [11, 1.75, 0.25]);
  // Extraction Pier extending North towards Perfume River
  addBox('hue-extraction-pier', 'floor', [0, -0.1, -29], [3, 0.15, 6]);

  // West Classroom Wing (Dãy Nhà Học Tây - Red Brick 2-story building)
  addBox('hue-west-wing-floor', 'floor', [-22, -0.05, 0], [7, 0.1, 20]);
  addBox('hue-west-wing-wall-outer', 'wall', [-28.8, 3.5, 0], [0.25, 3.5, 20]);
  addBox('hue-west-wing-wall-inner', 'wall', [-15.2, 3.5, 0], [0.25, 3.5, 20]);
  addBox('hue-west-wing-wall-north', 'wall', [-22, 3.5, -19.8], [7, 3.5, 0.25]);
  addBox('hue-west-wing-wall-south', 'wall', [-22, 3.5, 19.8], [7, 3.5, 0.25]);
  // Partition Classrooms
  addBox('hue-west-room-div-1', 'wall', [-22, 3.5, -6], [6.6, 3.5, 0.2]);
  addBox('hue-west-room-div-2', 'wall', [-22, 3.5, 6], [6.6, 3.5, 0.2]);
  // Desks & Blackboards in West Classrooms
  addBox('hue-west-blackboard-1', 'blackboard', [-22, 1.8, -19.5], [2.2, 0.7, 0.05]);
  addBox('hue-west-blackboard-2', 'blackboard', [-22, 1.8, -5.7], [2.2, 0.7, 0.05]);
  addBox('hue-west-desk-row-1', 'desk', [-22, 0.45, -12], [2.5, 0.45, 0.8]);
  addBox('hue-west-desk-row-2', 'desk', [-22, 0.45, 0], [2.5, 0.45, 0.8]);

  // East Science Labs & Library (Dãy Phòng Thí Nghiệm & Thư Viện)
  addBox('hue-east-wing-floor', 'floor', [22, -0.05, 0], [7, 0.1, 20]);
  addBox('hue-east-wing-wall-outer', 'wall', [28.8, 3.5, 0], [0.25, 3.5, 20]);
  addBox('hue-east-wing-wall-inner', 'wall', [15.2, 3.5, 0], [0.25, 3.5, 20]);
  addBox('hue-east-wing-wall-north', 'wall', [22, 3.5, -19.8], [7, 3.5, 0.25]);
  addBox('hue-east-wing-wall-south', 'wall', [22, 3.5, 19.8], [7, 3.5, 0.25]);
  addBox('hue-east-room-div-1', 'wall', [22, 3.5, 0], [6.6, 3.5, 0.2]);
  addBox('hue-east-lab-bench-1', 'desk', [22, 0.5, -8], [3.0, 0.5, 1.0]);
  addBox('hue-east-lab-bench-2', 'desk', [22, 0.5, 8], [3.0, 0.5, 1.0]);
  addBox('hue-east-blackboard', 'blackboard', [22, 1.8, 19.5], [2.2, 0.7, 0.05]);

  // Central Memorial Pavilions & Ancient Banyan Trees
  addBox('hue-courtyard-banyan-left', 'wall', [-7, 1.2, 5], [1.5, 1.2, 1.5]);
  addBox('hue-courtyard-banyan-right', 'wall', [7, 1.2, 5], [1.5, 1.2, 1.5]);

  // Chalk Box Pickups (Hộp phấn rải rác trong trường)
  chalkBoxes.push(
    { id: 101, position: [-22, 0.85, -12], amount: 25 }, // West Classroom 1
    { id: 102, position: [-22, 0.85, 0], amount: 25 },   // West Classroom 2
    { id: 103, position: [22, 0.9, -8], amount: 30 },    // Science Lab
    { id: 104, position: [22, 0.9, 8], amount: 30 },     // Library Archive
    { id: 105, position: [0, 0.2, 8], amount: 20 },      // Central Courtyard
    { id: 106, position: [0, 0.2, -26], amount: 35 }     // Extraction Jetty (High Risk)
  );

  return {
    mapId: 'vietnam_quoc_hoc_hue',
    name: 'Trường THPT Chuyên Quốc Học Huế',
    location: 'Huế, Thừa Thiên Huế, Việt Nam (Bờ Sông Hương)',
    yearFounded: 1896,
    description: 'Ngôi trường cổ kính rực rỡ sắc đỏ hoàng gia bên dòng sông Hương thơ mộng, với các dãy hành lang gạch vòm thuộc địa, sân trường rợp bóng cây cổ thụ và điểm rút lui tại bến thuyền sông Hương.',
    spawn: [0, 0.1, 20], // Spawns near front gate
    extractionZones: [
      { id: 'extract-song-huong', center: [0, 0, -29], radius: 3.5, label: 'Bến Thuyền Sông Hương' },
    ],
    boxes,
    chalkBoxes,
  };
}

/**
 * Level 2: Chu Văn An Hà Nội (Trường Bưởi / Lycée du Protectorat)
 * Famous French colonial high school in Hanoi overlooking misty West Lake.
 */
function generateMapChuVanAnHanoi() {
  const boxes = [];
  const chalkBoxes = [];

  const addBox = (id, kind, center, halfExtents) => {
    boxes.push({ id, kind, center, halfExtents });
  };

  // Main Campus Grounds (Thụy Khuê, Tây Hồ)
  addBox('cva-ground', 'floor', [0, -0.1, 0], [28, 0.1, 28]);

  // Historic Octagonal Villa / Nhà Bát Giác (Centerpiece Library)
  // Formed with octagonal perimeter boxes
  addBox('cva-batgiac-core', 'floor', [0, 0.2, -5], [5.5, 0.2, 5.5]);
  addBox('cva-batgiac-wall-n', 'wall', [0, 2.5, -10.5], [4.5, 2.5, 0.3]);
  addBox('cva-batgiac-wall-s', 'wall', [0, 2.5, 0.5], [4.5, 2.5, 0.3]);
  addBox('cva-batgiac-wall-w', 'wall', [-5.5, 2.5, -5], [0.3, 2.5, 4.5]);
  addBox('cva-batgiac-wall-e', 'wall', [5.5, 2.5, -5], [0.3, 2.5, 4.5]);
  // Octagonal library reading tables
  addBox('cva-batgiac-table-1', 'desk', [-2.5, 0.5, -5], [1.5, 0.5, 1.2]);
  addBox('cva-batgiac-table-2', 'desk', [2.5, 0.5, -5], [1.5, 0.5, 1.2]);
  addBox('cva-batgiac-blackboard', 'blackboard', [0, 2.0, -10.1], [3.0, 0.8, 0.05]);

  // Main Colonial Classroom Wing (Dãy Nhà Cổ Vàng Pháp 1908)
  addBox('cva-wing-floor', 'floor', [0, -0.05, 16], [22, 0.1, 6]);
  addBox('cva-wing-wall-back', 'wall', [0, 3.2, 21.8], [22, 3.2, 0.25]);
  addBox('cva-wing-wall-front', 'wall', [0, 3.2, 10.2], [22, 3.2, 0.25]);
  addBox('cva-wing-wall-left', 'wall', [-21.8, 3.2, 16], [0.25, 3.2, 6]);
  addBox('cva-wing-wall-right', 'wall', [21.8, 3.2, 16], [0.25, 3.2, 6]);
  // Classrooms along the corridor
  addBox('cva-class-1-blackboard', 'blackboard', [-14, 1.8, 21.5], [2.4, 0.7, 0.05]);
  addBox('cva-class-1-desk', 'desk', [-14, 0.45, 15], [2.5, 0.45, 0.9]);
  addBox('cva-class-2-blackboard', 'blackboard', [14, 1.8, 21.5], [2.4, 0.7, 0.05]);
  addBox('cva-class-2-desk', 'desk', [14, 0.45, 15], [2.5, 0.45, 0.9]);

  // West Lake Shore & Pier (Bờ Hồ Tây lộng gió - Extraction Point)
  addBox('cva-lake-embankment', 'wall', [0, 0.6, -26], [26, 0.6, 0.5]);
  addBox('cva-lake-pier', 'floor', [0, -0.1, -30], [2.5, 0.15, 4.5]);

  // Ancient Flamboyant & Banyan trees (Cây xà cừ, phượng vĩ sân trường Bưởi)
  addBox('cva-tree-1', 'wall', [-12, 1.5, 0], [1.2, 1.5, 1.2]);
  addBox('cva-tree-2', 'wall', [12, 1.5, 0], [1.2, 1.5, 1.2]);

  chalkBoxes.push(
    { id: 201, position: [-14, 0.9, 15], amount: 25 },
    { id: 202, position: [14, 0.9, 15], amount: 25 },
    { id: 203, position: [-2.5, 0.9, -5], amount: 30 }, // Inside Bat Giac
    { id: 204, position: [2.5, 0.9, -5], amount: 30 },  // Inside Bat Giac
    { id: 205, position: [0, 0.2, 5], amount: 20 },
    { id: 206, position: [0, 0.2, -28], amount: 40 }    // West Lake Shore extraction cache
  );

  return {
    mapId: 'vietnam_chu_van_an_hanoi',
    name: 'Trường THPT Chu Văn An Hà Nội (Trường Bưởi)',
    location: 'Tây Hồ, Hà Nội, Việt Nam (Bờ Hồ Tây lộng gió)',
    yearFounded: 1908,
    description: 'Trường Bưởi lịch sử với kiến trúc Đông Dương tường vàng mái ngói đỏ, Nhà Bát Giác tráng lệ, hàng xà cừ trăm tuổi và con đường dẫn thẳng ra mặt nước mờ sương Hồ Tây.',
    spawn: [0, 0.1, 8],
    extractionZones: [
      { id: 'extract-ho-tay', center: [0, 0, -30], radius: 3.5, label: 'Bến Thuyền Hồ Tây' },
    ],
    boxes,
    chalkBoxes,
  };
}

/**
 * Level 3: Lycée Yersin Đà Lạt (Trường CĐ Sư Phạm Đà Lạt)
 * Misty mountain plateau architecture with curved crescent classroom wing and bell tower.
 */
function generateMapDaLatLycee() {
  const boxes = [];
  const chalkBoxes = [];

  const addBox = (id, kind, center, halfExtents) => {
    boxes.push({ id, kind, center, halfExtents });
  };

  // Highland Mountain Ground (Cold pine plateau, 50m x 50m)
  addBox('dalat-ground', 'floor', [0, -0.1, 0], [25, 0.1, 25]);

  // Iconic 54m Bell Tower (Tháp Chuông Đà Lạt)
  addBox('dalat-belltower-base', 'wall', [-18, 5.0, -8], [2.2, 5.0, 2.2]);
  addBox('dalat-belltower-spire', 'wall', [-18, 11.5, -8], [1.4, 2.5, 1.4]);

  // Grand Crescent Classroom Wing (Dãy Nhà Hình Cánh Cung Gạch Đỏ)
  // Approximated through 5 segmented sweeping curved halls
  const arcSegments = [
    { x: -12, z: -8, rot: 0.15 },
    { x: -6, z: -5, rot: 0.35 },
    { x: 0, z: -3.5, rot: 0.0 },
    { x: 6, z: -5, rot: -0.35 },
    { x: 12, z: -8, rot: -0.15 },
  ];

  arcSegments.forEach((seg, idx) => {
    addBox(`dalat-arc-wing-${idx}`, 'wall', [seg.x, 3.5, seg.z], [3.2, 3.5, 2.2]);
    addBox(`dalat-arc-floor-${idx}`, 'floor', [seg.x, 0.05, seg.z + 3.5], [3.0, 0.1, 2.0]);
  });

  // Blackboards and Art Studio Desks along the Arc
  addBox('dalat-blackboard-center', 'blackboard', [0, 1.8, -1.2], [2.8, 0.8, 0.05]);
  addBox('dalat-studio-desk-1', 'desk', [-5, 0.45, 0], [2.2, 0.45, 0.9]);
  addBox('dalat-studio-desk-2', 'desk', [5, 0.45, 0], [2.2, 0.45, 0.9]);

  // Terraced Amphitheater / Sân Vận Động Bậc Thang
  addBox('dalat-terrace-1', 'floor', [0, 0.3, 14], [16, 0.15, 2.5]);
  addBox('dalat-terrace-2', 'floor', [0, 0.6, 17], [16, 0.15, 2.5]);
  addBox('dalat-terrace-3', 'floor', [0, 0.9, 20], [16, 0.15, 2.5]);

  // Pine Forest Grove (Rừng thông cao nguyên sương mù)
  addBox('dalat-pine-tree-1', 'wall', [-15, 2.5, 10], [0.8, 2.5, 0.8]);
  addBox('dalat-pine-tree-2', 'wall', [15, 2.5, 10], [0.8, 2.5, 0.8]);
  addBox('dalat-pine-tree-3', 'wall', [-16, 2.5, 18], [0.8, 2.5, 0.8]);

  // Extraction Ridge (Đỉnh Đồi Thông Sương Mù)
  addBox('dalat-extraction-ridge', 'floor', [0, 1.2, 24], [4.0, 0.2, 3.5]);

  chalkBoxes.push(
    { id: 301, position: [-18, 0.3, -5], amount: 35 }, // Under Bell Tower
    { id: 302, position: [0, 0.3, 0], amount: 25 },    // Center Arc
    { id: 303, position: [-5, 0.9, 0], amount: 25 },   // Studio Desk 1
    { id: 304, position: [5, 0.9, 0], amount: 25 },    // Studio Desk 2
    { id: 305, position: [0, 0.7, 17], amount: 20 },   // Terrace
    { id: 306, position: [0, 1.4, 24], amount: 45 }    // Mountain Ridge Extraction
  );

  return {
    mapId: 'vietnam_da_lat_lycee',
    name: 'Trường Lycée Yersin Đà Lạt (CĐ Sư Phạm Đà Lạt)',
    location: 'Đà Lạt, Lâm Đồng, Tây Nguyên, Việt Nam',
    yearFounded: 1927,
    description: 'Kiến trúc đỉnh cao trên cao nguyên sương mù với dãy nhà hình vòng cung gạch ép đỏ mềm mại, tháp chuông vươn cao giữa ngút ngàn thông reo và điểm rút lui trên đỉnh sườn đồi.',
    spawn: [0, 0.1, 8],
    extractionZones: [
      { id: 'extract-doi-thong', center: [0, 1.2, 24], radius: 4.0, label: 'Đỉnh Đồi Thông Sương Mù' },
    ],
    boxes,
    chalkBoxes,
  };
}

// ============================================================================
// MAIN GENERATOR PIPELINE
// ============================================================================
async function main() {
  console.log('====================================================');
  console.log('   CHALKBOUND — VIETNAM ASSET GENERATION PIPELINE   ');
  console.log('====================================================\n');

  const manifestAssets = [];

  // 1. Generate Characters
  console.log('[1/4] Generating Character Assets...');

  console.log(' -> Generating CB_CHAR_Player_A (Minh - High School Student Survivor)...');
  const playerA = createPlayerCharacterA();
  manifestAssets.push(
    await exportAsset('CB_CHAR_Player_A', 'CHAR', playerA, {
      description: 'Vietnamese male high school student survivor ("Minh") in classic white uniform, red student scarf, canvas satchel and chalk holster.',
      collision: { type: 'capsule', radius: 0.3, height: 1.8 },
      materials: ['CB_MAT_StudentUniform', 'CB_MAT_Skin', 'CB_MAT_Chalk'],
      tags: ['player', 'character', 'survivor', 'vietnam'],
      vietnamContext: { school: 'Chu Văn An / Quốc Học', role: 'Student Survivor' },
    })
  );

  console.log(' -> Generating CB_CHAR_Player_B (Linh - Explorer Student)...');
  const playerB = createPlayerCharacterB();
  manifestAssets.push(
    await exportAsset('CB_CHAR_Player_B', 'CHAR', playerB, {
      description: 'Vietnamese female student explorer ("Linh") with school attire, ponytail, and crossbody chalk kit.',
      collision: { type: 'capsule', radius: 0.3, height: 1.75 },
      materials: ['CB_MAT_StudentUniform', 'CB_MAT_Skin', 'CB_MAT_Chalk'],
      tags: ['player', 'character', 'explorer', 'vietnam'],
      vietnamContext: { role: 'Student Explorer' },
    })
  );

  console.log(' -> Generating CB_PVE_ErasedSword_A (Kẻ Bị Xóa - The Erased Blade Fiend)...');
  const erasedA = createErasedSwordCreature();
  manifestAssets.push(
    await exportAsset('CB_PVE_ErasedSword_A', 'PVE', erasedA, {
      description: 'The Erased ("Kẻ Bị Xóa"): Corrupted blackboard entity with glowing chalk runes and a razor-sharp erased chalk blade arm.',
      collision: { type: 'capsule', radius: 0.35, height: 1.9 },
      materials: ['CB_MAT_ErasedShadow', 'CB_MAT_ChalkRuneGlow'],
      tags: ['enemy', 'pve', 'erased', 'monster'],
      vietnamContext: { lore: 'Linh hồn kẻ bị xóa nhòa trong bảng đen' },
    })
  );

  console.log(' -> Generating CB_PVE_ErasedStalker_A (Giám Thị Bóng Ma - The Hall Monitor)...');
  const erasedB = createErasedStalkerCreature();
  manifestAssets.push(
    await exportAsset('CB_PVE_ErasedStalker_A', 'PVE', erasedB, {
      description: 'The Hall Monitor ("Giám Thị"): Tall shadowy disciplinary specter with piercing red chalk spectacles and heavy ruler.',
      collision: { type: 'capsule', radius: 0.4, height: 2.15 },
      materials: ['CB_MAT_ErasedCoat', 'CB_MAT_SpectacleGlow'],
      tags: ['enemy', 'pve', 'stalker', 'boss'],
      vietnamContext: { lore: 'Giám thị hắc ám tuần tra hành lang' },
    })
  );

  console.log(' -> Generating CB_CHAR_Hands_A (First-person Viewmodel Hands)...');
  const hands = createViewmodelHands();
  manifestAssets.push(
    await exportAsset('CB_CHAR_Hands_A', 'CHAR', hands, {
      description: 'First-person viewmodel hands holding chalk stick, ready to draw weapons in air.',
      collision: { type: 'none' },
      materials: ['CB_MAT_ViewmodelSkin', 'CB_MAT_Chalk'],
      tags: ['viewmodel', 'hands', 'fpp'],
    })
  );

  // 2. Generate Modular Environment Pieces
  console.log('\n[2/4] Generating Modular Vietnamese Environment Assets...');

  console.log(' -> Generating CB_ENV_VN_Wall_YellowStucco_A...');
  manifestAssets.push(
    await exportAsset('CB_ENV_VN_Wall_YellowStucco_A', 'ENV', createWallYellowStucco(), {
      description: 'Indochinese French colonial yellow ochre plaster wall (4m x 3m x 0.2m) with plinth and crown molding.',
      collision: { type: 'box', dimensions: [4.0, 3.0, 0.2] },
      tags: ['env', 'wall', 'colonial', 'yellow_stucco', 'hanoi', 'vietnam'],
      grid: { snap: 4.0, occupies: [1, 1, 1] },
    })
  );

  console.log(' -> Generating CB_ENV_VN_Wall_RedBrick_A...');
  manifestAssets.push(
    await exportAsset('CB_ENV_VN_Wall_RedBrick_A', 'ENV', createWallRedBrickArch(), {
      description: 'Imperial Hue and Dalat style colonial red brick arch wall (4m x 3m x 0.3m).',
      collision: { type: 'box', dimensions: [4.0, 3.0, 0.3] },
      tags: ['env', 'wall', 'red_brick', 'arch', 'hue', 'dalat', 'vietnam'],
      grid: { snap: 4.0, occupies: [1, 1, 1] },
    })
  );

  console.log(' -> Generating CB_ENV_VN_Floor_Tile_A...');
  manifestAssets.push(
    await exportAsset('CB_ENV_VN_Floor_Tile_A', 'ENV', createFloorTile(), {
      description: 'Indochinese encaustic cement tile floor (4m x 4m) with decorative geometric motifs.',
      collision: { type: 'box', dimensions: [4.0, 0.15, 4.0] },
      tags: ['env', 'floor', 'tile', 'gach_bong', 'indochine', 'vietnam'],
      grid: { snap: 4.0, occupies: [1, 1, 1] },
    })
  );

  console.log(' -> Generating CB_ENV_VN_Floor_Wood_A...');
  manifestAssets.push(
    await exportAsset('CB_ENV_VN_Floor_Wood_A', 'ENV', createFloorWood(), {
      description: 'Aged dark teak plank hardwood floor (4m x 4m).',
      collision: { type: 'box', dimensions: [4.0, 0.15, 4.0] },
      tags: ['env', 'floor', 'wood', 'teak', 'vietnam'],
      grid: { snap: 4.0, occupies: [1, 1, 1] },
    })
  );

  console.log(' -> Generating CB_ENV_VN_Window_Louver_A...');
  manifestAssets.push(
    await exportAsset('CB_ENV_VN_Window_Louver_A', 'ENV', createFrenchWindow(), {
      description: 'French colonial green wooden louvered shutter window with stone frame (Cửa lá sách xanh).',
      collision: { type: 'box', dimensions: [2.0, 2.4, 0.25] },
      tags: ['env', 'window', 'louver', 'green_shutter', 'vietnam'],
    })
  );

  console.log(' -> Generating CB_ENV_VN_Door_Colonial_A...');
  manifestAssets.push(
    await exportAsset('CB_ENV_VN_Door_Colonial_A', 'ENV', createColonialDoor(), {
      description: 'Double arched colonial teak doors with brass fixtures.',
      collision: { type: 'box', dimensions: [2.15, 2.8, 0.25] },
      tags: ['env', 'door', 'colonial', 'wood', 'vietnam'],
    })
  );

  console.log(' -> Generating CB_ENV_VN_Gate_TamQuan_A...');
  manifestAssets.push(
    await exportAsset('CB_ENV_VN_Gate_TamQuan_A', 'ENV', createTamQuanGate(), {
      description: 'Traditional Vietnamese ceremonial gate (Cổng Tam Quan Quốc Học Huế) with imperial red pillars and terracotta roof eaves.',
      collision: { type: 'box', dimensions: [6.0, 4.5, 1.4] },
      tags: ['env', 'gate', 'tam_quan', 'imperial', 'hue', 'vietnam'],
    })
  );

  // 3. Generate Authentic Vietnamese Classroom & Campus Props
  console.log('\n[3/4] Generating Vietnamese Classroom & Campus Props...');

  console.log(' -> Generating CB_PROP_VN_Desk_A...');
  manifestAssets.push(
    await exportAsset('CB_PROP_VN_Desk_A', 'PROP', createVietnameseSchoolDesk(), {
      description: 'Authentic wooden double school desk with attached bench, pencil groove, and book compartment.',
      collision: { type: 'box', dimensions: [1.2, 0.75, 0.8] },
      tags: ['prop', 'desk', 'classroom', 'school', 'vietnam'],
    })
  );

  console.log(' -> Generating CB_PROP_VN_Blackboard_A...');
  manifestAssets.push(
    await exportAsset('CB_PROP_VN_Blackboard_A', 'PROP', createVietnameseBlackboard(), {
      description: 'Anti-glare green grid chalkboard (Bảng chống lóa ô ly) with wooden frame and chalk tray.',
      collision: { type: 'box', dimensions: [3.7, 1.3, 0.15] },
      tags: ['prop', 'blackboard', 'chalkboard', 'school', 'vietnam'],
    })
  );

  console.log(' -> Generating CB_PROP_VN_CeilingFan_A...');
  manifestAssets.push(
    await exportAsset('CB_PROP_VN_CeilingFan_A', 'PROP', createCeilingFan(), {
      description: 'Classic green 3-blade electric ceiling fan (Quạt trần Vinawind).',
      collision: { type: 'box', dimensions: [1.4, 0.7, 1.4] },
      tags: ['prop', 'fan', 'ceiling', 'vinawind', 'vietnam'],
    })
  );

  console.log(' -> Generating CB_PROP_VN_Drum_A...');
  manifestAssets.push(
    await exportAsset('CB_PROP_VN_Drum_A', 'PROP', createSchoolDrum(), {
      description: 'Traditional red lacquer school drum (Trống trường) on ornamental wooden cradle stand.',
      collision: { type: 'box', dimensions: [0.9, 1.5, 0.8] },
      tags: ['prop', 'drum', 'trong_truong', 'traditional', 'vietnam'],
    })
  );

  console.log(' -> Generating CB_PROP_VN_BonsaiPot_A...');
  manifestAssets.push(
    await exportAsset('CB_PROP_VN_BonsaiPot_A', 'PROP', createCourtyardBonsai(), {
      description: 'Ceramic dragon planter pot with miniature banyan / ficus bonsai tree (Chậu cây cảnh sân trường).',
      collision: { type: 'box', dimensions: [1.1, 1.7, 1.1] },
      tags: ['prop', 'bonsai', 'tree', 'courtyard', 'vietnam'],
    })
  );

  console.log(' -> Generating CB_GAME_ChalkBox_VN_A...');
  manifestAssets.push(
    await exportAsset('CB_GAME_ChalkBox_VN_A', 'GAME', createVietnameseChalkBox(), {
      description: 'Vietnamese cardboard chalk box pickup with white and glowing chalk sticks (Hộp phấn Mic / Bến Nghé).',
      collision: { type: 'box', dimensions: [0.28, 0.12, 0.18] },
      tags: ['gameplay', 'pickup', 'chalk', 'economy', 'vietnam'],
    })
  );

  // 4. Generate Maps for Places in Vietnam
  console.log('\n[4/4] Generating Vietnam Maps & Levels...');

  const levels = [
    generateMapQuocHocHue(),
    generateMapChuVanAnHanoi(),
    generateMapDaLatLycee(),
  ];

  for (const level of levels) {
    const levelPath = path.join(ASSETS_DIR, 'levels', `${level.mapId}.json`);
    fs.writeFileSync(levelPath, JSON.stringify(level, null, 2));
    console.log(` -> Exported Map: ${level.name} (${levelPath})`);
  }

  // 5. Generate Master Manifest
  const manifest = {
    generatedAt: new Date().toISOString(),
    version: '1.0.0',
    totalAssets: manifestAssets.length,
    totalLevels: levels.length,
    assets: manifestAssets,
    levels: levels.map((l) => ({
      mapId: l.mapId,
      name: l.name,
      location: l.location,
      yearFounded: l.yearFounded,
      path: `assets/levels/${l.mapId}.json`,
      boxCount: l.boxes.length,
      chalkBoxCount: l.chalkBoxes.length,
      extractionZones: l.extractionZones,
    })),
  };

  const manifestPath = path.join(ASSETS_DIR, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`\n -> Master Manifest created at ${manifestPath}`);

  // 6. Copy / Mirror to client public folder so Vite serves it
  fs.mkdirSync(CLIENT_PUBLIC_DIR, { recursive: true });
  fs.cpSync(ASSETS_DIR, CLIENT_PUBLIC_DIR, { recursive: true });
  console.log(` -> Synced assets to Vite public directory: ${CLIENT_PUBLIC_DIR}`);

  console.log('\n====================================================');
  console.log('   ALL VIETNAM ASSETS & MAPS GENERATED SUCCESSFULLY! ');
  console.log('====================================================\n');
}

main().catch((err) => {
  console.error('Fatal error during asset generation:', err);
  process.exit(1);
});
