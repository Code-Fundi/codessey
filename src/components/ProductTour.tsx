"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { getWorldLabsBrowserKey } from "@/lib/worldlabs-key";

const TOUR_DONE_KEY = "codessey:tourDone";

const STEPS = [
  {
    id: "coins",
    selector: "[data-tour='coins']",
    title: "Codessey coins",
    body: "Add a World Labs key here to generate landscapes. Codessey coins are for guestbook signatures and founder plaques.",
  },
  {
    id: "repos",
    selector: "[data-tour='repos']",
    title: "Indexed Repos",
    body: "Paste a public GitHub URL and generate a 3D world from the repository.",
  },
  {
    id: "guestbook",
    selector: "[data-tour='guestbook']",
    title: "Sign Guestbook",
    body: "After a world is ready, sign the guestbook for 1 credit (sign in required).",
  },
] as const;

function isTourDone(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(TOUR_DONE_KEY) === "1";
  } catch {
    return true;
  }
}

function markTourDone(): void {
  try {
    window.localStorage.setItem(TOUR_DONE_KEY, "1");
  } catch {
    /* ignore */
  }
}

function firstAvailableStep(from = 0): number {
  for (let i = from; i < STEPS.length; i += 1) {
    if (document.querySelector(STEPS[i].selector)) return i;
  }
  return -1;
}

export function ProductTour({ worldComplete }: { worldComplete: boolean }) {
  const [step, setStep] = useState(0);
  const [active, setActive] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const current = STEPS[step];

  const syncRect = useCallback(() => {
    const node = document.querySelector(STEPS[step]?.selector ?? "");
    setRect(node?.getBoundingClientRect() ?? null);
  }, [step]);

  useEffect(() => {
    if (isTourDone()) return;
    if (getWorldLabsBrowserKey() && worldComplete) {
      markTourDone();
      return;
    }
    const timer = window.setTimeout(() => {
      const start = firstAvailableStep(0);
      if (start < 0) return;
      setStep(start);
      setActive(true);
    }, 600);
    return () => window.clearTimeout(timer);
  }, [worldComplete]);

  useEffect(() => {
    if (!active) return;
    syncRect();
    window.addEventListener("resize", syncRect);
    return () => window.removeEventListener("resize", syncRect);
  }, [active, syncRect]);

  if (!active || !current) return null;

  const finish = () => {
    markTourDone();
    setActive(false);
  };

  const next = () => {
    const upcoming = firstAvailableStep(step + 1);
    if (upcoming < 0) {
      finish();
      return;
    }
    setStep(upcoming);
  };

  const remaining = STEPS.filter((_, i) => i >= step && document.querySelector(STEPS[i].selector));
  const last = remaining.length <= 1;

  return (
    <div className="fixed inset-0 z-[80]" role="dialog" aria-label="Codessey tour">
      <button
        type="button"
        className="absolute inset-0 bg-black/55"
        aria-label="Skip tour"
        onClick={finish}
      />
      {rect && (
        <div
          className="pointer-events-none absolute rounded-lg ring-2 ring-blue-400/80"
          style={{
            top: rect.top - 6,
            left: rect.left - 6,
            width: rect.width + 12,
            height: rect.height + 12,
          }}
        />
      )}
      <div
        className="absolute z-[81] w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-white/15 bg-[#090C10] p-4 text-white shadow-xl"
        style={{
          top: rect ? Math.min(rect.bottom + 12, window.innerHeight - 180) : 80,
          left: rect ? Math.min(Math.max(rect.left, 16), window.innerWidth - 360) : 16,
        }}
      >
        <p className="text-[10px] uppercase tracking-[0.18em] text-white/40">Codessey tour</p>
        <h2 className="mt-1 font-display text-base font-extrabold">{current.title}</h2>
        <p className="mt-2 text-sm text-white/70 leading-relaxed">{current.body}</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-white/60 hover:text-white"
            onClick={finish}
          >
            Skip
          </Button>
          <Button
            type="button"
            size="sm"
            className="bg-blue-700 hover:bg-blue-800 text-white"
            onClick={next}
          >
            {last ? "Done" : "Next"}
          </Button>
        </div>
      </div>
    </div>
  );
}
