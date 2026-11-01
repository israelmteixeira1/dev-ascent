import { Position } from '@xyflow/react';
import type { Rect, XY } from './placement';

// Floating edges: they leave each node through the side that faces the other node, so the
// canonical graph never has to store which handle was used (that is layout, not architecture).

const centerOf = (r: Rect): XY => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });

/** Where the line from the rectangle's centre towards a point crosses its border. */
export function borderPoint(rect: Rect, towards: XY): XY & { side: Position } {
  const c = centerOf(rect);
  const dx = towards.x - c.x;
  const dy = towards.y - c.y;
  if (dx === 0 && dy === 0) return { x: c.x, y: rect.y + rect.height, side: Position.Bottom };

  const scaleX = dx === 0 ? Infinity : rect.width / 2 / Math.abs(dx);
  const scaleY = dy === 0 ? Infinity : rect.height / 2 / Math.abs(dy);
  if (scaleX < scaleY) {
    return {
      x: dx > 0 ? rect.x + rect.width : rect.x,
      y: c.y + dy * scaleX,
      side: dx > 0 ? Position.Right : Position.Left,
    };
  }
  return {
    x: c.x + dx * scaleY,
    y: dy > 0 ? rect.y + rect.height : rect.y,
    side: dy > 0 ? Position.Bottom : Position.Top,
  };
}

export function floatingEdgeParams(source: Rect, target: Rect) {
  const from = borderPoint(source, centerOf(target));
  const to = borderPoint(target, centerOf(source));
  return {
    sourceX: from.x,
    sourceY: from.y,
    sourcePosition: from.side,
    targetX: to.x,
    targetY: to.y,
    targetPosition: to.side,
  };
}
