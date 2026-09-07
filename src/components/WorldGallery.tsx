"use client";

import { Map } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { WorldRow } from "@/lib/database.types";
import { parseGithubOwnerRepo, repoNameFromUrl } from "@/lib/repo-url";
import { cn } from "@/lib/utils";

interface WorldGalleryProps {
  worlds: WorldRow[];
  loading: boolean;
  error: string | null;
  selectedId: string | null;
  onSelect: (world: WorldRow) => void;
}

export function WorldGallery({ worlds, loading, error, selectedId, onSelect }: WorldGalleryProps) {
  return (
    <section className="relative h-full w-full flex flex-col overflow-hidden p-3 sm:p-4 md:p-6">
      <div className="pointer-events-none absolute inset-0 radial-blue" />
      <div className="relative shrink-0 mb-3 text-xs text-white/40 font-display uppercase tracking-[0.3em] text-center">
        Explore worlds
      </div>
      <div className="relative flex-1 min-h-0 overflow-y-auto scrollbar-thin pr-1">
        {error && (
          <div className="text-sm text-red-300/80 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
            {error}
          </div>
        )}
        {loading && !worlds.length && (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="aspect-[3/4] w-full rounded-2xl bg-white/[0.06]" />
            ))}
          </div>
        )}
        {!loading && !worlds.length && !error && (
          <div className="h-full min-h-[240px] flex flex-col items-center justify-center gap-3 text-center px-6">
            <Map className="h-8 w-8 text-white/30" />
            <p className="text-sm text-white/70">No public worlds yet.</p>
            <p className="text-xs text-white/40">Generate a landscape and it will show up here.</p>
          </div>
        )}
        {worlds.length > 0 && (
          <ul className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 pb-4">
            {worlds.map((row) => (
              <li key={row.id}>
                <WorldPreviewCard
                  world={row}
                  selected={selectedId === row.id}
                  onSelect={onSelect}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function WorldPreviewCard({
  world,
  selected,
  onSelect,
}: {
  world: WorldRow;
  selected: boolean;
  onSelect: (world: WorldRow) => void;
}) {
  const parsed = parseGithubOwnerRepo(world.repo_url);
  const title = parsed?.repo ?? world.repo_name ?? repoNameFromUrl(world.repo_url) ?? "World";
  const owner = parsed?.owner ?? null;
  const created = new Date(world.created_at);
  const createdLabel = Number.isNaN(created.getTime())
    ? ""
    : created.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

  return (
    <button
      type="button"
      onClick={() => onSelect(world)}
      aria-pressed={selected}
      aria-label={`Open ${title} world`}
      className={cn(
        "gallery-card group relative w-full aspect-[3/4] overflow-hidden rounded-2xl text-left border transition-transform duration-200",
        "hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/70",
        selected ? "border-blue-500/80 ring-1 ring-blue-500/40" : "border-white/10",
      )}
    >
      <img
        src={world.pano_url || world.thumbnail_url || "/map-bg.jpg"}
        alt=""
        draggable={false}
        className="absolute inset-0 h-full w-full object-cover scale-[1.02] group-hover:scale-105 transition-transform duration-500"
      />
      {world.status === "pending" && (
        <div className="absolute inset-0 z-[1] flex items-center justify-center bg-black/45 text-[11px] uppercase tracking-[0.18em] text-white/80">
          Generating…
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-black/10" />
      <div className="absolute inset-x-0 bottom-0 z-[1] p-3.5">
        <p className="text-sm font-semibold text-white truncate">{title}</p>
        {owner && <p className="mt-0.5 text-[11px] text-white/70 truncate">{owner}</p>}
        {world.caption && (
          <p className="mt-1 text-[11px] leading-snug text-white/70 line-clamp-2">
            {world.caption}
          </p>
        )}
        <p className="mt-2 text-[10px] uppercase tracking-[0.16em] text-white/45">
          {world.branch}
          {createdLabel ? ` · ${createdLabel}` : ""}
        </p>
      </div>
    </button>
  );
}
