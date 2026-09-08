"use client";

import type { HTMLAttributes, MouseEvent, PointerEvent, TouchEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { StrokeOptions } from "perfect-freehand";
import { getStroke } from "perfect-freehand";
import { cn } from "@/lib/utils";
import { getSvgPathFromStroke } from "./helper";
import { Point } from "./point";

const DPI = 2;

export type SignaturePadProps = Omit<HTMLAttributes<HTMLCanvasElement>, "onChange"> & {
  onChange?: (_signatureDataUrl: string | null) => void;
  containerClassName?: string;
  disabled?: boolean;
};

export function SignaturePad({
  className,
  containerClassName,
  defaultValue,
  onChange,
  disabled = false,
  ...props
}: SignaturePadProps) {
  const $el = useRef<HTMLCanvasElement>(null);
  const $imageData = useRef<ImageData | null>(null);
  const [isPressed, setIsPressed] = useState(false);
  const [lines, setLines] = useState<Point[][]>([]);
  const [currentLine, setCurrentLine] = useState<Point[]>([]);

  const perfectFreehandOptions = useMemo(() => {
    const size = $el.current ? Math.min($el.current.height, $el.current.width) * 0.03 : 10;
    return {
      size,
      thinning: 0.25,
      streamline: 0.5,
      smoothing: 0.5,
      end: { taper: size * 2 },
    } satisfies StrokeOptions;
  }, []);

  const paint = (ctx: CanvasRenderingContext2D, nextLines: Point[][]) => {
    ctx.save();
    ctx.fillStyle = "#111827";
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    nextLines.forEach((line) => {
      const pathData = new Path2D(getSvgPathFromStroke(getStroke(line, perfectFreehandOptions)));
      ctx.fill(pathData);
    });
    ctx.restore();
  };

  const onMouseDown = (event: MouseEvent | PointerEvent | TouchEvent) => {
    if (event.cancelable) event.preventDefault();
    setIsPressed(true);
    const point = Point.fromEvent(event, DPI, $el.current);
    setCurrentLine([point]);
  };

  const onMouseMove = (event: MouseEvent | PointerEvent | TouchEvent) => {
    if (event.cancelable) event.preventDefault();
    if (!isPressed) return;
    const point = Point.fromEvent(event, DPI, $el.current);
    if (point.distanceTo(currentLine[currentLine.length - 1]) > 5) {
      setCurrentLine([...currentLine, point]);
      if ($el.current) {
        const ctx = $el.current.getContext("2d");
        if (ctx) {
          ctx.clearRect(0, 0, $el.current.width, $el.current.height);
          if ($imageData.current) ctx.putImageData($imageData.current, 0, 0);
          paint(ctx, [...lines, [...currentLine, point]]);
        }
      }
    }
  };

  const onMouseUp = (event: MouseEvent | PointerEvent | TouchEvent, addLine = true) => {
    if (event.cancelable) event.preventDefault();
    setIsPressed(false);
    const point = Point.fromEvent(event, DPI, $el.current);
    const newLines = [...lines];
    if (addLine && currentLine.length > 0) {
      newLines.push([...currentLine, point]);
      setCurrentLine([]);
    }
    setLines(newLines);
    if ($el.current && newLines.length > 0) {
      const ctx = $el.current.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, $el.current.width, $el.current.height);
        if ($imageData.current) ctx.putImageData($imageData.current, 0, 0);
        paint(ctx, newLines);
        onChange?.($el.current.toDataURL("image/webp", 0.72));
      }
    }
  };

  const onMouseEnter = (event: MouseEvent | PointerEvent | TouchEvent) => {
    if (event.cancelable) event.preventDefault();
    if ("buttons" in event && event.buttons === 1) onMouseDown(event);
  };

  const onMouseLeave = (event: MouseEvent | PointerEvent | TouchEvent) => {
    if (event.cancelable) event.preventDefault();
    onMouseUp(event, false);
  };

  const onClearClick = () => {
    if ($el.current) {
      const ctx = $el.current.getContext("2d");
      ctx?.clearRect(0, 0, $el.current.width, $el.current.height);
      $imageData.current = null;
    }
    onChange?.(null);
    setLines([]);
    setCurrentLine([]);
  };

  const onUndoClick = () => {
    if (lines.length === 0) return;
    const newLines = lines.slice(0, -1);
    setLines(newLines);
    if ($el.current) {
      const ctx = $el.current.getContext("2d");
      const { width, height } = $el.current;
      ctx?.clearRect(0, 0, width, height);
      if (typeof defaultValue === "string" && $imageData.current) {
        ctx?.putImageData($imageData.current, 0, 0);
      }
      if (ctx) paint(ctx, newLines);
      onChange?.(newLines.length ? $el.current.toDataURL("image/webp", 0.72) : null);
    }
  };

  useEffect(() => {
    if ($el.current) {
      $el.current.width = $el.current.clientWidth * DPI;
      $el.current.height = $el.current.clientHeight * DPI;
    }
  }, []);

  useEffect(() => {
    if (!$el.current || typeof defaultValue !== "string" || !defaultValue) return;
    const ctx = $el.current.getContext("2d");
    const { width, height } = $el.current;
    const img = new Image();
    img.onload = () => {
      ctx?.drawImage(img, 0, 0, Math.min(width, img.width), Math.min(height, img.height));
      $imageData.current = ctx?.getImageData(0, 0, width, height) ?? null;
    };
    img.src = defaultValue;
  }, [defaultValue]);

  return (
    <div
      className={cn("relative block", containerClassName, {
        "pointer-events-none opacity-50": disabled,
      })}
    >
      <canvas
        ref={$el}
        className={cn("relative block bg-white", className)}
        style={{ touchAction: "none" }}
        onPointerMove={(event) => onMouseMove(event)}
        onPointerDown={(event) => onMouseDown(event)}
        onPointerUp={(event) => onMouseUp(event)}
        onPointerLeave={(event) => onMouseLeave(event)}
        onPointerEnter={(event) => onMouseEnter(event)}
        {...props}
      />
      <div className="absolute bottom-3 right-3 flex gap-2">
        <button
          type="button"
          className="text-xs text-zinc-500 hover:text-zinc-800"
          onClick={() => onClearClick()}
        >
          Clear
        </button>
      </div>
      {lines.length > 0 && (
        <div className="absolute bottom-3 left-3 flex gap-2">
          <button
            type="button"
            title="Undo"
            className="text-xs text-zinc-500 hover:text-zinc-800"
            onClick={() => onUndoClick()}
          >
            Undo
          </button>
        </div>
      )}
    </div>
  );
}
