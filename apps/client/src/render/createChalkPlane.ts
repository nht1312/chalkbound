import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  DynamicDrawUsage,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Points,
  PointsMaterial,
  type Scene,
} from 'three';
import type { Point2, Stroke as ChalkStroke } from '@chalkbound/shared';
import type { DustParticle } from '../drawing/DustField';

export interface ChalkPlaneConfig {
  /** Distance ahead of the viewmodel camera, metres. */
  readonly distance: number;
  /** Half-width of the drawable square, metres. */
  readonly halfExtent: number;
  /** Extra border drawn around the drawable area. */
  readonly margin: number;
  /** Width of a chalk line, metres. */
  readonly trailWidth: number;
  /** Size of one dust mote, metres. */
  readonly dustSize: number;
  /** Most dust motes drawn at once. */
  readonly maxDust: number;
}

/** Everything the plane draws in one frame. */
export interface ChalkPlaneFrame {
  /** Plane fade, 0..1. */
  readonly opacity: number;
  readonly strokes: readonly ChalkStroke[];
  readonly cursor: Point2;
  readonly dust: readonly DustParticle[];
  readonly dustCount: number;
  /** Resolve glow, 0..1 (see `drawing/glow.ts`). */
  readonly glow: number;
}

export interface ChalkPlane {
  update(frame: ChalkPlaneFrame): void;
  dispose(): void;
}

const SURFACE = 0x1d2b2a;
const CHALK = 0xf2efe6;
/** What the chalk brightens to as a sketch resolves. */
const GLOW = 0xbff4ff;
/** Vertices per trail segment: each is a quad of two triangles. */
const VERTS_PER_SEGMENT = 6;

/**
 * The chalk plane, drawn in the viewmodel scene (plan T6).
 *
 * It lives with the hands rather than in the world so it can never clip
 * through a wall the player is standing against — the plane is conjured, not
 * built, and a sketch half-eaten by a doorframe would read as a bug.
 *
 * The trail is a ribbon of quads rather than a line: WebGL ignores line
 * width, and a one-pixel sketch is unreadable at the exact moment the player
 * most needs to see what they drew.
 */
export function createChalkPlane(
  scene: Scene,
  config: ChalkPlaneConfig,
  maxPoints: number,
): ChalkPlane {
  const group = new Group();
  group.name = 'chalk-plane';
  group.position.z = -config.distance;
  group.visible = false;
  scene.add(group);

  const side = (config.halfExtent + config.margin) * 2;
  const surfaceMaterial = new MeshBasicMaterial({
    color: SURFACE,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
  });
  const surface = new Mesh(new PlaneGeometry(side, side), surfaceMaterial);
  group.add(surface);

  // One buffer, resized never: the recorder's own caps bound the point count.
  const positions = new Float32Array(maxPoints * VERTS_PER_SEGMENT * 3);
  const trailGeometry = new BufferGeometry();
  const positionAttribute = new BufferAttribute(positions, 3);
  positionAttribute.setUsage(DynamicDrawUsage);
  trailGeometry.setAttribute('position', positionAttribute);
  const trailMaterial = new MeshBasicMaterial({
    color: CHALK,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
  });
  const trail = new Mesh(trailGeometry, trailMaterial);
  // In front of the surface, so the chalk is never z-fighting with the board.
  trail.position.z = 0.001;
  trail.frustumCulled = false;
  group.add(trail);

  // Falling chalk dust. Vertex colours carry each mote's fade, so one draw
  // call covers the whole field.
  const dustPositions = new Float32Array(config.maxDust * 3);
  const dustColors = new Float32Array(config.maxDust * 3);
  const dustGeometry = new BufferGeometry();
  const dustPositionAttribute = new BufferAttribute(dustPositions, 3);
  const dustColorAttribute = new BufferAttribute(dustColors, 3);
  dustPositionAttribute.setUsage(DynamicDrawUsage);
  dustColorAttribute.setUsage(DynamicDrawUsage);
  dustGeometry.setAttribute('position', dustPositionAttribute);
  dustGeometry.setAttribute('color', dustColorAttribute);
  const dustMaterial = new PointsMaterial({
    size: config.dustSize,
    sizeAttenuation: true,
    transparent: true,
    depthWrite: false,
    vertexColors: true,
  });
  const dustPoints = new Points(dustGeometry, dustMaterial);
  dustPoints.position.z = 0.003;
  dustPoints.frustumCulled = false;
  group.add(dustPoints);

  const cursorMaterial = new MeshBasicMaterial({ color: CHALK, transparent: true });
  const cursorDot = new Mesh(
    new PlaneGeometry(config.trailWidth * 1.6, config.trailWidth * 1.6),
    cursorMaterial,
  );
  cursorDot.position.z = 0.002;
  group.add(cursorDot);

  const chalkColor = new Color(CHALK);
  const glowColor = new Color(GLOW);
  const trailColor = new Color();

  return {
    update(frame) {
      const { opacity, glow } = frame;
      // The glow outlives the plane's own fade: the sketch keeps burning for a
      // moment after the board has gone.
      group.visible = opacity > 0 || glow > 0;
      if (!group.visible) return;

      surfaceMaterial.opacity = opacity * 0.55;
      cursorMaterial.opacity = opacity;
      cursorDot.position.x = frame.cursor.x;
      cursorDot.position.y = frame.cursor.y;

      trailMaterial.opacity = Math.min(1, Math.max(opacity, glow));
      trailMaterial.color.copy(trailColor.copy(chalkColor).lerp(glowColor, glow));

      const written = writeTrail(positions, frame.strokes, config.trailWidth / 2, maxPoints);
      positionAttribute.needsUpdate = true;
      trailGeometry.setDrawRange(0, written);

      const motes = writeDust(
        dustPositions,
        dustColors,
        frame.dust,
        Math.min(frame.dustCount, config.maxDust),
      );
      dustPositionAttribute.needsUpdate = true;
      dustColorAttribute.needsUpdate = true;
      dustMaterial.opacity = opacity;
      dustGeometry.setDrawRange(0, motes);
    },
    dispose() {
      group.removeFromParent();
      surface.geometry.dispose();
      surfaceMaterial.dispose();
      trailGeometry.dispose();
      trailMaterial.dispose();
      dustGeometry.dispose();
      dustMaterial.dispose();
      cursorDot.geometry.dispose();
      cursorMaterial.dispose();
    },
  };
}

/**
 * Lays each stroke down as a ribbon of quads, one per segment, and returns
 * how many vertices were written. Exported for its own test: getting the
 * winding or the normal wrong makes the trail vanish, which is invisible in
 * a type checker and obvious on screen.
 */
export function writeTrail(
  out: Float32Array,
  strokes: readonly ChalkStroke[],
  halfWidth: number,
  maxPoints: number,
): number {
  let v = 0;
  const limit = maxPoints * VERTS_PER_SEGMENT;

  for (const stroke of strokes) {
    const points = stroke.points;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1];
      const b = points[i];
      if (!a || !b || v + VERTS_PER_SEGMENT > limit) break;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const length = Math.hypot(dx, dy);
      if (length === 0) continue;
      // Unit normal to the segment, scaled to half the line width.
      const nx = (-dy / length) * halfWidth;
      const ny = (dx / length) * halfWidth;

      v = quad(
        out,
        v,
        a.x + nx,
        a.y + ny,
        a.x - nx,
        a.y - ny,
        b.x - nx,
        b.y - ny,
        b.x + nx,
        b.y + ny,
      );
    }
  }
  return v;
}

/** Two triangles over four corners, returning the new vertex count. */
function quad(
  out: Float32Array,
  start: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x3: number,
  y3: number,
): number {
  const corners = [x0, y0, x1, y1, x2, y2, x0, y0, x2, y2, x3, y3];
  let offset = start * 3;
  for (let i = 0; i < corners.length; i += 2) {
    out[offset++] = corners[i] ?? 0;
    out[offset++] = corners[i + 1] ?? 0;
    out[offset++] = 0;
  }
  return start + VERTS_PER_SEGMENT;
}

/**
 * Lays the live dust into the point buffers, returning how many were written.
 * Each mote's fade rides in its vertex colour, which keeps the whole field to
 * one draw call.
 */
export function writeDust(
  positions: Float32Array,
  colors: Float32Array,
  dust: readonly DustParticle[],
  count: number,
): number {
  let written = 0;
  for (let i = 0; i < count; i++) {
    const particle = dust[i];
    if (!particle) break;
    const o = written * 3;
    positions[o] = particle.x;
    positions[o + 1] = particle.y;
    positions[o + 2] = 0;
    const fade = Math.min(1, Math.max(0, particle.alpha));
    colors[o] = fade;
    colors[o + 1] = fade;
    colors[o + 2] = fade;
    written++;
  }
  return written;
}
