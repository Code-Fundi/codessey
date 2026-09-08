"use client";

import { useEffect, useRef } from "react";
import { Image as ImageIcon } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { BrandCard } from "@/components/BrandCard";
import { useCardInteraction } from "@/hooks/useCardInteraction";
import { filenameForPostcard } from "@/lib/postcard-export";
import { cn } from "@/lib/utils";

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
        {capturedUrl ? (
          <div className="flex flex-col items-center gap-3">
            <img
              src={capturedUrl}
              alt={repoName ? `Postcard from ${repoName}` : "Codessey postcard"}
              className="card-postcard rounded-2xl shadow-[0_30px_80px_-30px_rgba(21,128,61,0.45)]"
            />
            <a
              href={capturedUrl}
              download={filenameForPostcard(repoName)}
              className="inline-flex h-8 items-center justify-center rounded-md border border-white/15 bg-transparent px-3 text-sm font-medium text-white/85 hover:bg-white/5 hover:text-white"
            >
              <ImageIcon size={14} className="mr-1.5" />
              Download postcard
            </a>
          </div>
        ) : (
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
        )}
      </DialogContent>
    </Dialog>
  );
}
