"use client";

import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { BrandCard } from "@/components/BrandCard";
import { useCardInteraction } from "@/hooks/useCardInteraction";
import { cn } from "@/lib/utils";

export function AboutModal() {
  const [open, setOpen] = useState(false);
  const allowDismiss = useRef(false);
  const { flipped, tilt, tiltResetting, rotating, holoVars, updateTilt, flip, reset, resetTilt } =
    useCardInteraction();

  useEffect(() => {
    if (!open) {
      allowDismiss.current = false;
      return;
    }
    const timer = window.setTimeout(() => {
      allowDismiss.current = true;
    }, 280);
    return () => window.clearTimeout(timer);
  }, [open]);

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-foreground/80 hover:text-foreground font-semibold"
        aria-label="About Codessey"
        onClick={() => setOpen(true)}
      >
        About
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) reset();
          setOpen(next);
        }}
      >
        <DialogContent
          className="w-auto max-w-none border-0 bg-transparent p-3 shadow-none sm:p-5 text-foreground overflow-visible justify-items-center [&>button]:-right-1 [&>button]:-top-2 [&>button]:text-white/80"
          onInteractOutside={(event) => {
            if (!allowDismiss.current) event.preventDefault();
          }}
        >
          <DialogTitle className="sr-only">Codessey card</DialogTitle>
          <div
            role="button"
            tabIndex={0}
            className={cn(
              "card-holo-wrap card-landscape relative cursor-pointer appearance-none bg-transparent border-0 p-0",
              !flipped && "card-holo-active",
              rotating && "card-holo-rotating",
            )}
            style={holoVars}
            aria-label={flipped ? "Flip card to front" : "Flip card to back"}
            onClick={flip}
            onKeyDown={(event) => {
              if (event.target instanceof HTMLAnchorElement) return;
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                flip();
              }
            }}
            onPointerMove={(e) => updateTilt(e.clientX, e.clientY, e.currentTarget)}
            onPointerLeave={resetTilt}
          >
            <BrandCard
              flipped={flipped}
              tiltX={tilt.x}
              tiltY={tilt.y}
              tiltResetting={tiltResetting}
              showHolo={!flipped}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
