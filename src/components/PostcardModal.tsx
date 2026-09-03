"use client";

import { useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { BrandCard } from "@/components/BrandCard";
import { useCardInteraction } from "@/hooks/useCardInteraction";
import { cn } from "@/lib/utils";

interface PostcardModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repoName?: string | null;
  imageUrl?: string | null;
}

export function PostcardModal({ open, onOpenChange, repoName, imageUrl }: PostcardModalProps) {
  const allowDismiss = useRef(false);
  const { flipped, tilt, tiltResetting, rotating, holoVars, updateTilt, flip, reset, resetTilt } =
    useCardInteraction();

  useEffect(() => {
    if (!open) {
      allowDismiss.current = false;
      reset();
      return;
    }
    const timer = window.setTimeout(() => {
      allowDismiss.current = true;
    }, 280);
    return () => window.clearTimeout(timer);
  }, [open, reset]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-auto max-w-none border-0 bg-transparent p-3 shadow-none sm:p-5 text-foreground overflow-visible justify-items-center [&>button]:-right-1 [&>button]:-top-2 [&>button]:text-white/80"
        onInteractOutside={(event) => {
          if (!allowDismiss.current) event.preventDefault();
        }}
      >
        <DialogTitle className="sr-only">
          {repoName ? `Postcard from ${repoName}` : "Codessey postcard"}
        </DialogTitle>
        <button
          type="button"
          className={cn(
            "card-holo-wrap card-landscape relative cursor-pointer appearance-none bg-transparent border-0 p-0",
            !flipped && "card-holo-active",
            rotating && "card-holo-rotating",
          )}
          style={holoVars}
          aria-label={flipped ? "Flip postcard to front" : "Flip postcard to back"}
          onClick={flip}
          onPointerMove={(e) => updateTilt(e.clientX, e.clientY, e.currentTarget)}
          onPointerLeave={resetTilt}
        >
          <BrandCard
            variant="postcard"
            repoName={repoName}
            imageUrl={imageUrl}
            flipped={flipped}
            tiltX={tilt.x}
            tiltY={tilt.y}
            tiltResetting={tiltResetting}
            showHolo={!flipped}
          />
        </button>
      </DialogContent>
    </Dialog>
  );
}
