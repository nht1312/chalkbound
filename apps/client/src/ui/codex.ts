import type { BlueprintId, BlueprintTemplate, Point2 } from '@chalkbound/shared';
import { blueprintName } from '../drawing/blueprintNames';

/**
 * The Codex (SPEC §6.4, plan T9).
 *
 * Under inference the player must already know a shape to draw it, so the
 * shapes are taught rather than guessed at. The diagram is generated from the
 * blueprint's own `reference` path — the same data the classifier measures
 * against — so what the Codex teaches and what the game accepts cannot drift
 * apart.
 */
export interface CodexDiagramOptions {
  /** Side of the square diagram box, in diagram units. */
  readonly size: number;
  /** Border kept clear inside the box, for the stroke numbers. */
  readonly padding: number;
  /** How far a stroke's number sits from where the stroke begins. */
  readonly labelOffset: number;
}

export interface CodexStroke {
  /** Polyline in diagram space: origin top-left, +y **down**, as SVG wants. */
  readonly points: readonly Point2[];
  /** Where this stroke's number is drawn. */
  readonly label: Point2;
  /** 1-based, in the order the Codex teaches. */
  readonly order: number;
}

export interface CodexEntry {
  readonly id: BlueprintId;
  readonly name: string;
  readonly cost: number;
  /** From authoritative chalk only; unknown chalk is never "yes". */
  readonly affordable: boolean;
  readonly strokes: readonly CodexStroke[];
}

/**
 * Fits a blueprint's reference path into the diagram box, preserving aspect
 * and flipping y into screen space. A stretched diagram would teach a shape
 * the validator rejects, since aspect is one of the things it measures.
 */
export function blueprintDiagram(
  blueprint: BlueprintTemplate,
  options: CodexDiagramOptions,
): CodexStroke[] {
  const { size, padding, labelOffset } = options;
  const strokes = blueprint.reference.filter((stroke) => stroke.length > 0);
  const points = strokes.flat();
  if (points.length === 0) return [];

  const minX = Math.min(...points.map((p) => p.x));
  const maxX = Math.max(...points.map((p) => p.x));
  const minY = Math.min(...points.map((p) => p.y));
  const maxY = Math.max(...points.map((p) => p.y));
  const span = Math.max(maxX - minX, maxY - minY);
  const inner = size - padding * 2;
  // A shape with no extent (a single point) has no scale to speak of; drop it
  // in the middle rather than dividing by zero.
  const scale = span > 0 ? inner / span : 0;
  const centre = size / 2;

  const place = (point: Point2): Point2 => ({
    x: centre + (point.x - (minX + maxX) / 2) * scale,
    // Reference space has +y up; screen space has it down.
    y: centre - (point.y - (minY + maxY) / 2) * scale,
  });

  return strokes.map((stroke, index) => {
    const placed = stroke.map(place);
    const start = placed[0] ?? { x: centre, y: centre };
    return { points: placed, label: labelPosition(start, centre, labelOffset), order: index + 1 };
  });
}

/**
 * Pushes the number away from the middle of the diagram, so it sits outside
 * the shape rather than on top of the line it is numbering.
 */
function labelPosition(start: Point2, centre: number, offset: number): Point2 {
  const dx = start.x - centre;
  const dy = start.y - centre;
  const length = Math.hypot(dx, dy);
  // A stroke starting dead centre has no "outward": send it up.
  if (length === 0) return { x: start.x, y: start.y - offset };
  return { x: start.x + (dx / length) * offset, y: start.y + (dy / length) * offset };
}

/**
 * Every blueprint with its cost and whether the player can pay for it right
 * now. `chalk` is the authoritative meter; undefined means no snapshot has
 * arrived, which reads as unaffordable — unknown is not permission.
 */
export function codexEntries(
  chalk: number | undefined,
  blueprints: readonly BlueprintTemplate[],
  options: CodexDiagramOptions,
): CodexEntry[] {
  return blueprints.map((blueprint) => ({
    id: blueprint.id,
    name: blueprintName(blueprint.id),
    cost: blueprint.chalkCost,
    affordable: chalk !== undefined && chalk >= blueprint.chalkCost,
    strokes: blueprintDiagram(blueprint, options),
  }));
}

export interface Codex {
  /** Shows or hides the overlay and refreshes affordability. */
  update(visible: boolean, chalk: number | undefined): void;
  dispose(): void;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Held-Tab overlay listing every blueprint, its shape and its cost. */
export function createCodex(
  parent: HTMLElement,
  blueprints: readonly BlueprintTemplate[],
  options: CodexDiagramOptions,
): Codex {
  const doc = parent.ownerDocument;
  const root = doc.createElement('div');
  root.className = 'codex';
  root.hidden = true;

  const heading = doc.createElement('h2');
  heading.className = 'codex__heading';
  heading.textContent = 'Codex';
  root.appendChild(heading);

  const list = doc.createElement('div');
  list.className = 'codex__list';
  root.appendChild(list);
  parent.appendChild(root);

  // The shapes never change, so they are built once; only affordability is
  // refreshed per frame.
  const cards = codexEntries(undefined, blueprints, options).map((entry) => {
    const card = doc.createElement('div');
    card.className = 'codex__entry';

    const svg = doc.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${options.size} ${options.size}`);
    svg.setAttribute('class', 'codex__shape');
    for (const stroke of entry.strokes) {
      const line = doc.createElementNS(SVG_NS, 'polyline');
      line.setAttribute('points', stroke.points.map((p) => `${p.x},${p.y}`).join(' '));
      line.setAttribute('class', 'codex__stroke');
      svg.appendChild(line);

      const number = doc.createElementNS(SVG_NS, 'text');
      number.setAttribute('x', String(stroke.label.x));
      number.setAttribute('y', String(stroke.label.y));
      number.setAttribute('class', 'codex__order');
      number.textContent = String(stroke.order);
      svg.appendChild(number);
    }

    const name = doc.createElement('div');
    name.className = 'codex__name';
    name.textContent = entry.name;
    const cost = doc.createElement('div');
    cost.className = 'codex__cost';
    cost.textContent = `${entry.cost} chalk`;

    card.append(svg, name, cost);
    list.appendChild(card);
    return { id: entry.id, cost: entry.cost, card };
  });

  let shownAffordable: string | undefined;
  return {
    update(visible, chalk) {
      root.hidden = !visible;
      if (!visible) return;
      // Cheap change detection: the overlay is open for whole seconds at a
      // time and nothing else about it moves.
      const key = cards.map((c) => (chalk !== undefined && chalk >= c.cost ? '1' : '0')).join('');
      if (key === shownAffordable) return;
      shownAffordable = key;
      cards.forEach((card, index) => {
        card.card.dataset['affordable'] = key[index] === '1' ? 'yes' : 'no';
      });
    },
    dispose() {
      root.remove();
    },
  };
}
