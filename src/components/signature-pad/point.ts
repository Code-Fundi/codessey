import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  TouchEvent as ReactTouchEvent,
} from "react";

export type PointLike = {
  x: number;
  y: number;
  timestamp: number;
};

const isTouchEvent = (
  event:
    | ReactMouseEvent
    | ReactPointerEvent
    | ReactTouchEvent
    | MouseEvent
    | PointerEvent
    | TouchEvent,
): event is TouchEvent | ReactTouchEvent => {
  return "touches" in event;
};

export class Point implements PointLike {
  public x: number;
  public y: number;
  public timestamp: number;

  constructor(x: number, y: number, timestamp?: number) {
    this.x = x;
    this.y = y;
    this.timestamp = timestamp ?? Date.now();
  }

  public distanceTo(point: PointLike): number {
    return Math.sqrt((point.x - this.x) ** 2 + (point.y - this.y) ** 2);
  }

  public static fromEvent(
    event:
      | ReactMouseEvent
      | ReactPointerEvent
      | ReactTouchEvent
      | MouseEvent
      | PointerEvent
      | TouchEvent,
    dpi = 1,
    el?: HTMLElement | null,
  ): Point {
    const target = el ?? event.target;
    if (!(target instanceof HTMLElement)) {
      throw new Error("Event target is not an HTMLElement.");
    }

    const { top, bottom, left, right } = target.getBoundingClientRect();
    let clientX: number;
    let clientY: number;

    if (isTouchEvent(event)) {
      clientX = event.touches[0].clientX;
      clientY = event.touches[0].clientY;
    } else {
      clientX = event.clientX;
      clientY = event.clientY;
    }

    let x = Math.min(Math.max(left, clientX), right) - left;
    let y = Math.min(Math.max(top, clientY), bottom) - top;
    x *= dpi;
    y *= dpi;
    return new Point(x, y);
  }
}
