"use client";

import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

interface BlurUpImageProps {
  src: string;
  previewSrc?: string | null;
  alt?: string;
  className?: string;
}

export function BlurUpImage({ src, previewSrc, alt = "", className }: BlurUpImageProps) {
  const [loaded, setLoaded] = useState(false);
  const preview = previewSrc && previewSrc !== src ? previewSrc : null;

  useEffect(() => {
    setLoaded(false);
  }, [src]);

  return (
    <>
      {!loaded && (
        <div className="absolute inset-0 z-0 overflow-hidden bg-white/[0.07]">
          {preview ? (
            <img
              src={preview}
              alt=""
              draggable={false}
              className="h-full w-full object-cover blur-2xl scale-125 opacity-80"
            />
          ) : (
            <div className="h-full w-full animate-pulse bg-gradient-to-br from-white/12 via-white/[0.05] to-transparent" />
          )}
        </div>
      )}
      <img
        key={src}
        src={src}
        alt={alt}
        draggable={false}
        decoding="async"
        onLoad={() => setLoaded(true)}
        className={cn(
          "z-[1] transition-opacity duration-300",
          loaded ? "opacity-100" : "opacity-0",
          className,
        )}
      />
    </>
  );
}
