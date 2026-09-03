"use client";

import type { LucideIcon } from "lucide-react";
import { Briefcase, Code, Mail } from "lucide-react";
import { cn } from "@/lib/utils";

interface BrandCardProps {
  flipped: boolean;
  tiltX?: number;
  tiltY?: number;
  tiltResetting?: boolean;
  showHolo?: boolean;
  variant?: "about" | "postcard";
  repoName?: string | null;
  imageUrl?: string | null;
}

const CONTACT_LINKS: {
  href: string;
  label: string;
  icon: LucideIcon;
  external: boolean;
}[] = [
  {
    href: "https://codefundi.app",
    label: "CodeFundi",
    icon: Briefcase,
    external: true,
  },
  {
    href: "https://github.com/FelixWaweru",
    label: "GitHub profile",
    icon: Code,
    external: true,
  },
  {
    href: "mailto:hi@codefundi.app",
    label: "Email Felix Waweru",
    icon: Mail,
    external: false,
  },
];

export function BrandCard({
  flipped,
  tiltX = 0,
  tiltY = 0,
  tiltResetting = false,
  showHolo = true,
  variant = "about",
  repoName,
  imageUrl,
}: BrandCardProps) {
  return (
    <div className="perspective-card relative">
      <div
        className={cn("card-tilt w-full h-full", tiltResetting && "card-tilt-reset")}
        style={{ transform: `rotateX(${tiltX}deg) rotateY(${tiltY}deg)` }}
      >
        <div className={cn("card-3d relative", flipped && "is-flipped")}>
          <div className="card-face">
            {variant === "postcard" ? (
              <PostcardFront repoName={repoName} imageUrl={imageUrl} showHolo={showHolo} />
            ) : (
              <AboutFront showHolo={showHolo} />
            )}
          </div>
          <div className="card-face card-back">
            {variant === "postcard" ? <PostcardBack /> : <AboutBack />}
          </div>
        </div>
      </div>
    </div>
  );
}

function HoloLayers() {
  return (
    <div className="card-holo-layers pointer-events-none z-[3]" aria-hidden="true">
      <div className="card-holo-rainbow" />
      <div className="card-holo-sparkle" />
      <div className="card-holo-glare" />
    </div>
  );
}

function AboutFront({ showHolo }: { showHolo: boolean }) {
  return (
    <div className="relative isolate h-full w-full overflow-hidden rounded-2xl bg-white border border-zinc-200 shadow-[0_30px_80px_-30px_rgba(21,128,61,0.45)]">
      <div className="relative z-[2] flex h-full flex-col px-7 py-5 sm:px-10 sm:py-6">
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center">
          <img
            src="/default-signature.png"
            alt="Felix Waweru"
            draggable={false}
            className="h-auto w-[min(72%,280px)] max-h-[4.75rem] object-contain object-center select-none"
          />
          <div className="mt-4 flex items-center justify-center gap-3 sm:gap-4">
            {CONTACT_LINKS.map(({ href, label, icon: Icon, external }) => (
              <a
                key={href}
                href={href}
                aria-label={label}
                {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                onClick={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-700 shadow-sm transition-colors hover:border-zinc-400 hover:bg-zinc-50 hover:text-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
              >
                <Icon size={16} strokeWidth={1.75} />
              </a>
            ))}
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-center border-t border-zinc-100 pt-3 sm:pt-4">
          <p className="m-0 text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.42em] text-zinc-400">
            Powered by
          </p>
          <div className="mt-2.5 flex items-center justify-center gap-5 sm:mt-3 sm:gap-6">
            <img
              src="/logos/worldlabs.png"
              alt="World Labs"
              className="h-12 w-12 sm:h-14 sm:w-14 object-contain"
              draggable={false}
            />
            <img
              src="/logos/codefundi.png"
              alt="CodeFundi"
              className="h-12 w-12 sm:h-14 sm:w-14 object-contain"
              draggable={false}
            />
          </div>
        </div>
      </div>
      {showHolo && <HoloLayers />}
    </div>
  );
}

function AboutBack() {
  return (
    <div className="relative isolate h-full w-full overflow-hidden rounded-2xl border border-white/10 shadow-[0_30px_80px_-30px_rgba(21,128,61,0.45)]">
      <img
        src="/map-bg.jpg"
        alt=""
        draggable={false}
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div className="absolute inset-0 bg-black/[0.175]" />
      <p className="absolute inset-x-0 bottom-5 z-[2] text-center font-display text-[33px] uppercase tracking-[0.35em] text-white/80">
        Codessey
      </p>
    </div>
  );
}

function PostcardFront({
  repoName,
  imageUrl,
  showHolo,
}: {
  repoName?: string | null;
  imageUrl?: string | null;
  showHolo: boolean;
}) {
  const name = (repoName?.trim() || "this repo").replace(/[-_]/g, " ");

  return (
    <div className="relative isolate h-full w-full overflow-hidden rounded-2xl border border-white/15 shadow-[0_30px_80px_-30px_rgba(21,128,61,0.45)] bg-zinc-900">
      <img
        src={imageUrl || "/map-bg.jpg"}
        alt=""
        draggable={false}
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/15 to-black/10" />
      <div className="relative z-[2] flex h-full flex-col px-8 py-5">
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center text-center">
          <p className="postcard-outline m-0 font-display text-[clamp(1.15rem,3.2vw,1.85rem)] font-extrabold uppercase tracking-[0.18em]">
            Greetings from
          </p>
          <p className="postcard-outline postcard-outline-lg mt-2 m-0 font-display text-[clamp(1.6rem,5vw,2.75rem)] font-extrabold uppercase leading-tight line-clamp-2">
            {name}
          </p>
        </div>
        <div className="shrink-0 text-center">
          <p className="m-0 font-display text-[30px] sm:text-[33px] font-extrabold uppercase tracking-[0.18em] text-white/90">
            Codessey
          </p>
          <p className="m-0 mt-0.5 text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.22em] text-white/80">
            by CodeFundi
          </p>
        </div>
      </div>
      {showHolo && <HoloLayers />}
    </div>
  );
}

function PostcardBack() {
  return (
    <div className="relative isolate h-full w-full overflow-hidden rounded-2xl border border-white/10 shadow-[0_30px_80px_-30px_rgba(21,128,61,0.45)]">
      <img
        src="/map-bg.jpg"
        alt=""
        draggable={false}
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div className="absolute inset-0 bg-black/15" />
      <div className="absolute inset-4 rounded-xl border border-white/15" />
      <p className="absolute inset-x-0 bottom-5 z-[2] text-center font-display text-[33px] uppercase tracking-[0.35em] text-white/80">
        Codessey
      </p>
    </div>
  );
}
