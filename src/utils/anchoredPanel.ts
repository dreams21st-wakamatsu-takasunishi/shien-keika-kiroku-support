export interface PanelBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max));

/** Position a floating editor beside its trigger without covering the trigger or leaving the viewport. */
export function placeAnchoredPanel(anchor: PanelBounds, viewport: PanelBounds, contentHeight: number) {
  const edge = 10;
  const gap = 12;
  const leftEdge = viewport.left + edge;
  const topEdge = viewport.top + edge;
  const rightEdge = viewport.left + viewport.width - edge;
  const bottomEdge = viewport.top + viewport.height - edge;
  const availableWidth = Math.max(1, rightEdge - leftEdge);
  const availableHeight = Math.max(1, bottomEdge - topEdge);
  let width = Math.min(384, availableWidth);
  const desiredHeight = Math.min(Math.max(1, contentHeight), 560, availableHeight);
  const above = Math.max(0, anchor.top - gap - topEdge);
  const below = Math.max(0, bottomEdge - anchor.top - anchor.height - gap);
  const left = Math.max(0, anchor.left - gap - leftEdge);
  const right = Math.max(0, rightEdge - anchor.left - anchor.width - gap);
  const preferAbove = anchor.top + anchor.height / 2 > viewport.top + viewport.height / 2;
  const sideRoom = Math.max(left, right);
  let top: number;
  let x: number;
  let maxHeight: number;

  if (above >= desiredHeight || below >= desiredHeight || sideRoom < Math.min(280, width)) {
    const useAbove = above >= desiredHeight && (preferAbove || below < desiredHeight)
      || (above < desiredHeight && below < desiredHeight && above > below);
    maxHeight = Math.max(1, Math.min(560, useAbove ? above : below));
    top = useAbove ? anchor.top - gap - Math.min(desiredHeight, maxHeight) : anchor.top + anchor.height + gap;
    // Align the editor's nearest edge to the icon, including when the icon is moved across the screen.
    x = anchor.left + anchor.width / 2 > viewport.left + viewport.width / 2
      ? anchor.left + anchor.width - width : anchor.left;
  } else {
    const useLeft = left >= right;
    width = Math.min(width, sideRoom);
    maxHeight = Math.min(560, availableHeight);
    x = useLeft ? anchor.left - gap - width : anchor.left + anchor.width + gap;
    top = anchor.top + anchor.height / 2 - desiredHeight / 2;
  }

  x = clamp(x, leftEdge, rightEdge - width);
  top = clamp(top, topEdge, bottomEdge - Math.min(desiredHeight, maxHeight));
  return {
    left: x,
    top,
    width,
    maxHeight,
    transformOrigin: `${anchor.left + anchor.width / 2 - x}px ${anchor.top + anchor.height / 2 - top}px`,
  };
}
