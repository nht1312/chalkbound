import { vec3 } from '../math/vec';
import type { LevelData, StaticBox, ChalkBoxSpawn } from './greyboxRoom';

export type VietnamMapId =
  | 'vietnam_quoc_hoc_hue'
  | 'vietnam_chu_van_an_hanoi'
  | 'vietnam_da_lat_lycee';

export interface VietnamMapMetadata {
  readonly id: VietnamMapId;
  readonly name: string;
  readonly vietnameseName: string;
  readonly location: string;
  readonly yearFounded: number;
  readonly description: string;
  readonly level: LevelData;
}

/**
 * Map 1: Trường THPT Chuyên Quốc Học Huế
 * Imperial colonial architecture along the Perfume River in Central Vietnam.
 */
export function createQuocHocHueLevel(): LevelData {
  const boxes: StaticBox[] = [];
  const chalkBoxes: ChalkBoxSpawn[] = [];

  const add = (id: string, kind: StaticBox['kind'], cx: number, cy: number, cz: number, hx: number, hy: number, hz: number) => {
    boxes.push({
      id,
      kind,
      center: vec3(cx, cy, cz),
      halfExtents: vec3(hx, hy, hz),
    });
  };

  // Main Courtyard Ground (60m x 48m)
  add('hue-courtyard-ground', 'floor', 0, -0.1, 0, 30, 0.1, 24);

  // Grand Imperial Red Entrance Gate (Cổng Tam Quan phía Nam)
  add('hue-gate-pillar-left', 'wall', -4, 2.5, 23.5, 0.6, 2.5, 0.6);
  add('hue-gate-pillar-mid-l', 'wall', -1.5, 3.0, 23.5, 0.6, 3.0, 0.6);
  add('hue-gate-pillar-mid-r', 'wall', 1.5, 3.0, 23.5, 0.6, 3.0, 0.6);
  add('hue-gate-pillar-right', 'wall', 4, 2.5, 23.5, 0.6, 2.5, 0.6);
  add('hue-gate-arch-roof', 'wall', 0, 5.2, 23.5, 5.0, 0.4, 1.2);

  // South Perimeter Wall
  add('hue-wall-south-left', 'wall', -17, 1.75, 23.5, 12, 1.75, 0.25);
  add('hue-wall-south-right', 'wall', 17, 1.75, 23.5, 12, 1.75, 0.25);

  // North Riverbank Wall & Extraction Jetty (Sông Hương Pier)
  add('hue-wall-north-left', 'wall', -18, 1.75, -23.5, 11, 1.75, 0.25);
  add('hue-wall-north-right', 'wall', 18, 1.75, -23.5, 11, 1.75, 0.25);
  add('hue-extraction-pier', 'floor', 0, -0.1, -29, 3, 0.15, 6);

  // West Classroom Wing (Dãy Nhà Học Tây - Red Brick 2-story building)
  add('hue-west-wing-floor', 'floor', -22, -0.05, 0, 7, 0.1, 20);
  add('hue-west-wing-wall-outer', 'wall', -28.8, 3.5, 0, 0.25, 3.5, 20);
  add('hue-west-wing-wall-inner', 'wall', -15.2, 3.5, 0, 0.25, 3.5, 20);
  add('hue-west-wing-wall-north', 'wall', -22, 3.5, -19.8, 7, 3.5, 0.25);
  add('hue-west-wing-wall-south', 'wall', -22, 3.5, 19.8, 7, 3.5, 0.25);
  add('hue-west-room-div-1', 'wall', -22, 3.5, -6, 6.6, 3.5, 0.2);
  add('hue-west-room-div-2', 'wall', -22, 3.5, 6, 6.6, 3.5, 0.2);
  add('hue-west-blackboard-1', 'blackboard', -22, 1.8, -19.5, 2.2, 0.7, 0.05);
  add('hue-west-blackboard-2', 'blackboard', -22, 1.8, -5.7, 2.2, 0.7, 0.05);
  add('hue-west-desk-row-1', 'desk', -22, 0.45, -12, 2.5, 0.45, 0.8);
  add('hue-west-desk-row-2', 'desk', -22, 0.45, 0, 2.5, 0.45, 0.8);

  // East Science Labs & Library (Dãy Phòng Thí Nghiệm & Thư Viện)
  add('hue-east-wing-floor', 'floor', 22, -0.05, 0, 7, 0.1, 20);
  add('hue-east-wing-wall-outer', 'wall', 28.8, 3.5, 0, 0.25, 3.5, 20);
  add('hue-east-wing-wall-inner', 'wall', 15.2, 3.5, 0, 0.25, 3.5, 20);
  add('hue-east-wing-wall-north', 'wall', 22, 3.5, -19.8, 7, 3.5, 0.25);
  add('hue-east-wing-wall-south', 'wall', 22, 3.5, 19.8, 7, 3.5, 0.25);
  add('hue-east-room-div-1', 'wall', 22, 3.5, 0, 6.6, 3.5, 0.2);
  add('hue-east-lab-bench-1', 'desk', 22, 0.5, -8, 3.0, 0.5, 1.0);
  add('hue-east-lab-bench-2', 'desk', 22, 0.5, 8, 3.0, 0.5, 1.0);
  add('hue-east-blackboard', 'blackboard', 22, 1.8, 19.5, 2.2, 0.7, 0.05);

  // Central Memorial Banyan Trees
  add('hue-courtyard-banyan-left', 'wall', -7, 1.2, 5, 1.5, 1.2, 1.5);
  add('hue-courtyard-banyan-right', 'wall', 7, 1.2, 5, 1.5, 1.2, 1.5);

  chalkBoxes.push(
    { id: 101, position: vec3(-22, 0.85, -12), amount: 25 },
    { id: 102, position: vec3(-22, 0.85, 0), amount: 25 },
    { id: 103, position: vec3(22, 0.9, -8), amount: 30 },
    { id: 104, position: vec3(22, 0.9, 8), amount: 30 },
    { id: 105, position: vec3(0, 0.2, 8), amount: 20 },
    { id: 106, position: vec3(0, 0.2, -26), amount: 35 }
  );

  return {
    boxes,
    spawn: vec3(0, 0.1, 20),
    chalkBoxes,
  };
}

/**
 * Map 2: Trường THPT Chu Văn An Hà Nội (Trường Bưởi / Lycée du Protectorat)
 * Historic 1908 French colonial yellow ochre school overlooking West Lake.
 */
export function createChuVanAnLevel(): LevelData {
  const boxes: StaticBox[] = [];
  const chalkBoxes: ChalkBoxSpawn[] = [];

  const add = (id: string, kind: StaticBox['kind'], cx: number, cy: number, cz: number, hx: number, hy: number, hz: number) => {
    boxes.push({
      id,
      kind,
      center: vec3(cx, cy, cz),
      halfExtents: vec3(hx, hy, hz),
    });
  };

  // Main Campus Ground (Thụy Khuê, Tây Hồ)
  add('cva-ground', 'floor', 0, -0.1, 0, 28, 0.1, 28);

  // Historic Octagonal Villa / Nhà Bát Giác (Centerpiece Library)
  add('cva-batgiac-core', 'floor', 0, 0.2, -5, 5.5, 0.2, 5.5);
  add('cva-batgiac-wall-n', 'wall', 0, 2.5, -10.5, 4.5, 2.5, 0.3);
  add('cva-batgiac-wall-s', 'wall', 0, 2.5, 0.5, 4.5, 2.5, 0.3);
  add('cva-batgiac-wall-w', 'wall', -5.5, 2.5, -5, 0.3, 2.5, 4.5);
  add('cva-batgiac-wall-e', 'wall', 5.5, 2.5, -5, 0.3, 2.5, 4.5);
  add('cva-batgiac-table-1', 'desk', -2.5, 0.5, -5, 1.5, 0.5, 1.2);
  add('cva-batgiac-table-2', 'desk', 2.5, 0.5, -5, 1.5, 0.5, 1.2);
  add('cva-batgiac-blackboard', 'blackboard', 0, 2.0, -10.1, 3.0, 0.8, 0.05);

  // Main Colonial Classroom Wing (Dãy Nhà Cổ Vàng Pháp 1908)
  add('cva-wing-floor', 'floor', 0, -0.05, 16, 22, 0.1, 6);
  add('cva-wing-wall-back', 'wall', 0, 3.2, 21.8, 22, 3.2, 0.25);
  add('cva-wing-wall-front', 'wall', 0, 3.2, 10.2, 22, 3.2, 0.25);
  add('cva-wing-wall-left', 'wall', -21.8, 3.2, 16, 0.25, 3.2, 6);
  add('cva-wing-wall-right', 'wall', 21.8, 3.2, 16, 0.25, 3.2, 6);
  add('cva-class-1-blackboard', 'blackboard', -14, 1.8, 21.5, 2.4, 0.7, 0.05);
  add('cva-class-1-desk', 'desk', -14, 0.45, 15, 2.5, 0.45, 0.9);
  add('cva-class-2-blackboard', 'blackboard', 14, 1.8, 21.5, 2.4, 0.7, 0.05);
  add('cva-class-2-desk', 'desk', 14, 0.45, 15, 2.5, 0.45, 0.9);

  // West Lake Shore & Pier (Bờ Hồ Tây lộng gió - Extraction Point)
  add('cva-lake-embankment', 'wall', 0, 0.6, -26, 26, 0.6, 0.5);
  add('cva-lake-pier', 'floor', 0, -0.1, -30, 2.5, 0.15, 4.5);

  // Ancient Flamboyant & Banyan trees
  add('cva-tree-1', 'wall', -12, 1.5, 0, 1.2, 1.5, 1.2);
  add('cva-tree-2', 'wall', 12, 1.5, 0, 1.2, 1.5, 1.2);

  chalkBoxes.push(
    { id: 201, position: vec3(-14, 0.9, 15), amount: 25 },
    { id: 202, position: vec3(14, 0.9, 15), amount: 25 },
    { id: 203, position: vec3(-2.5, 0.9, -5), amount: 30 },
    { id: 204, position: vec3(2.5, 0.9, -5), amount: 30 },
    { id: 205, position: vec3(0, 0.2, 5), amount: 20 },
    { id: 206, position: vec3(0, 0.2, -28), amount: 40 }
  );

  return {
    boxes,
    spawn: vec3(0, 0.1, 8),
    chalkBoxes,
  };
}

/**
 * Map 3: Trường Lycée Yersin Đà Lạt (Trường CĐ Sư Phạm Đà Lạt)
 * Misty highland campus with red-brick crescent arc building and bell tower.
 */
export function createDaLatLyceeLevel(): LevelData {
  const boxes: StaticBox[] = [];
  const chalkBoxes: ChalkBoxSpawn[] = [];

  const add = (id: string, kind: StaticBox['kind'], cx: number, cy: number, cz: number, hx: number, hy: number, hz: number) => {
    boxes.push({
      id,
      kind,
      center: vec3(cx, cy, cz),
      halfExtents: vec3(hx, hy, hz),
    });
  };

  // Highland Mountain Ground
  add('dalat-ground', 'floor', 0, -0.1, 0, 25, 0.1, 25);

  // Iconic Bell Tower (Tháp Chuông Đà Lạt)
  add('dalat-belltower-base', 'wall', -18, 5.0, -8, 2.2, 5.0, 2.2);
  add('dalat-belltower-spire', 'wall', -18, 11.5, -8, 1.4, 2.5, 1.4);

  // Grand Crescent Classroom Wing
  const arcSegments = [
    { x: -12, z: -8 },
    { x: -6, z: -5 },
    { x: 0, z: -3.5 },
    { x: 6, z: -5 },
    { x: 12, z: -8 },
  ];

  arcSegments.forEach((seg, idx) => {
    add(`dalat-arc-wing-${idx}`, 'wall', seg.x, 3.5, seg.z, 3.2, 3.5, 2.2);
    add(`dalat-arc-floor-${idx}`, 'floor', seg.x, 0.05, seg.z + 3.5, 3.0, 0.1, 2.0);
  });

  add('dalat-blackboard-center', 'blackboard', 0, 1.8, -1.2, 2.8, 0.8, 0.05);
  add('dalat-studio-desk-1', 'desk', -5, 0.45, 0, 2.2, 0.45, 0.9);
  add('dalat-studio-desk-2', 'desk', 5, 0.45, 0, 2.2, 0.45, 0.9);

  // Terraced Amphitheater
  add('dalat-terrace-1', 'floor', 0, 0.3, 14, 16, 0.15, 2.5);
  add('dalat-terrace-2', 'floor', 0, 0.6, 17, 16, 0.15, 2.5);
  add('dalat-terrace-3', 'floor', 0, 0.9, 20, 16, 0.15, 2.5);

  // Pine Trees
  add('dalat-pine-tree-1', 'wall', -15, 2.5, 10, 0.8, 2.5, 0.8);
  add('dalat-pine-tree-2', 'wall', 15, 2.5, 10, 0.8, 2.5, 0.8);
  add('dalat-pine-tree-3', 'wall', -16, 2.5, 18, 0.8, 2.5, 0.8);

  // Extraction Ridge (Đỉnh Đồi Thông)
  add('dalat-extraction-ridge', 'floor', 0, 1.2, 24, 4.0, 0.2, 3.5);

  chalkBoxes.push(
    { id: 301, position: vec3(-18, 0.3, -5), amount: 35 },
    { id: 302, position: vec3(0, 0.3, 0), amount: 25 },
    { id: 303, position: vec3(-5, 0.9, 0), amount: 25 },
    { id: 304, position: vec3(5, 0.9, 0), amount: 25 },
    { id: 305, position: vec3(0, 0.7, 17), amount: 20 },
    { id: 306, position: vec3(0, 1.4, 24), amount: 45 }
  );

  return {
    boxes,
    spawn: vec3(0, 0.1, 8),
    chalkBoxes,
  };
}

export const VIETNAM_MAPS: Record<VietnamMapId, VietnamMapMetadata> = {
  vietnam_quoc_hoc_hue: {
    id: 'vietnam_quoc_hoc_hue',
    name: 'Quốc Học Huế High School',
    vietnameseName: 'Trường THPT Chuyên Quốc Học Huế',
    location: 'Huế, Thừa Thiên Huế, Việt Nam',
    yearFounded: 1896,
    description: 'Imperial red-brick school along the Perfume River with shaded courtyards and riverbank extraction.',
    level: createQuocHocHueLevel(),
  },
  vietnam_chu_van_an_hanoi: {
    id: 'vietnam_chu_van_an_hanoi',
    name: 'Chu Van An Hanoi High School (Trường Bưởi)',
    vietnameseName: 'Trường THPT Chu Văn An Hà Nội',
    location: 'Tây Hồ, Hà Nội, Việt Nam',
    yearFounded: 1908,
    description: 'French colonial yellow ochre campus with Octagonal Library Villa and misty West Lake pier.',
    level: createChuVanAnLevel(),
  },
  vietnam_da_lat_lycee: {
    id: 'vietnam_da_lat_lycee',
    name: 'Lycée Yersin Dalat (CĐ Sư Phạm Đà Lạt)',
    vietnameseName: 'Trường Lycée Yersin Đà Lạt',
    location: 'Đà Lạt, Lâm Đồng, Việt Nam',
    yearFounded: 1927,
    description: 'Grand crescent curved red-brick building with bell tower on a foggy pine plateau.',
    level: createDaLatLyceeLevel(),
  },
};

export function getVietnamLevel(id: VietnamMapId): LevelData {
  const mapData = VIETNAM_MAPS[id];
  if (!mapData) {
    throw new Error(`Unknown Vietnam map id: ${id}`);
  }
  return mapData.level;
}
