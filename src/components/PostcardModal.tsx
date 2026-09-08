"use client";

import { Image as ImageIcon } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { BrandCard } from "@/components/BrandCard";
import { useCardInteraction } from "@/hooks/useCardInteraction";
import { downloadObjectUrl, filenameForPostcard } from "@/lib/postcard-export";
import { cn } from "@/lib/utils";
import { useEffect, useRef } from "react";

interface PostcardModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repoName?: string | null;
  imageUrl?: string | null;
  caption?: string | null;
  capturedUrl?: string | null;
  signatureSrc?: string | null;
}

export function PostcardModal({
  open,
  onOpenChange,
  repoName,
  imageUrl,
  caption,
  capturedUrl,
  signatureSrc,
}: PostcardModalProps) {
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
        <div className="relative">
          <button
            type="button"
            className={cn(
              "card-holo-wrap card-postcard relative cursor-pointer appearance-none bg-transparent border-0 p-0",
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
              caption={caption}
              signatureSrc={signatureSrc}
              flipped={flipped}
              tiltX={tilt.x}
              tiltY={tilt.y}
              tiltResetting={tiltResetting}
              showHolo={!flipped}
              holoIntensity={1}
            />
          </button>
          {!flipped && (
            <div className="pointer-events-none absolute inset-x-0 bottom-3 z-20 flex justify-center px-3">
              <button
                type="button"
                disabled={!capturedUrl}
                onClick={(event) => {
                  event.stopPropagation();
                  if (!capturedUrl) return;
                  downloadObjectUrl(capturedUrl, filenameForPostcard(repoName));
                }}
                className="pointer-events-auto inline-flex h-8 items-center justify-center rounded-md border border-white/20 bg-black/55 px-3 text-sm font-medium text-white/90 backdrop-blur-sm hover:bg-white/10 hover:text-white disabled:opacity-60"
              >
                <ImageIcon size={14} className="mr-1.5" />
                {capturedUrl ? "Download postcard" : "Preparing…"}
              </button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
