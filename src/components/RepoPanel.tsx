import { Globe, Loader2, Search, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import type { Repository } from "@/lib/codefundi.client";
import type { WorldRow } from "@/lib/database.types";
import { hasCache, repoCacheKey } from "@/lib/localStorage";
import { cn } from "@/lib/utils";
import { RepositoryCard } from "./RepositoryCard";

export type MainTab = "explore" | "repos";

interface RepoPanelProps {
  tab: MainTab;
  onTabChange: (tab: MainTab) => void;
  repos: Repository[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  worlds: WorldRow[];
  worldsLoading: boolean;
  worldsError: string | null;
  worldQuery: string;
  onWorldQueryChange: (value: string) => void;
  selectedId: string | null;
  repoUrl: string;
  branch: string;
  isGenerating: boolean;
  canGenerate: boolean;
  onSelect: (repo: Repository) => void;
  onSelectWorld: (world: WorldRow) => void;
  onRepoUrlChange: (value: string) => void;
  onBranchChange: (value: string) => void;
  onLoadMore: () => void;
  onSearchWorlds: () => void;
}

export function RepoPanel(props: RepoPanelProps) {
  const {
    tab,
    onTabChange,
    repos,
    loading,
    loadingMore,
    hasMore,
    error,
    worlds,
    worldsLoading,
    worldsError,
    worldQuery,
    onWorldQueryChange,
    selectedId,
    repoUrl,
    branch,
    isGenerating,
    canGenerate,
    onSelect,
    onSelectWorld,
    onRepoUrlChange,
    onBranchChange,
    onLoadMore,
    onSearchWorlds,
  } = props;

  return (
    <aside className="h-full flex flex-col bg-white/[0.04] backdrop-blur-md border-t md:border-t-0 border-r-0 md:border-r border-white/[0.07] p-4 md:p-5">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onTabChange("explore")}
          className={cn(
            "text-xs uppercase tracking-[0.18em] font-medium px-2 py-1 rounded-md",
            tab === "explore" ? "text-white bg-white/10" : "text-white/45 hover:text-white/70",
          )}
        >
          Explore
        </button>
        <button
          type="button"
          onClick={() => onTabChange("repos")}
          className={cn(
            "text-xs uppercase tracking-[0.18em] font-medium px-2 py-1 rounded-md",
            tab === "repos" ? "text-white bg-white/10" : "text-white/45 hover:text-white/70",
          )}
        >
          Indexed Repos
        </button>
        {(loading || loadingMore || worldsLoading || isGenerating) && (
          <Loader2 size={12} className="text-green-400 animate-spin" />
        )}
      </div>

      <Separator className="my-3 bg-white/10" />

      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin -mx-1 px-1">
        {tab === "repos" ? (
          <>
            {error && !repos.length && (
              <div className="text-sm text-red-300/80 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                Failed to load repos: {error}
              </div>
            )}
            {loading && !repos.length && (
              <div className="space-y-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full bg-white/[0.06]" />
                ))}
              </div>
            )}
            <ul className="space-y-2 p-1">
              {repos.map((repo, i) => (
                <li key={repo.id}>
                  <RepositoryCard
                    repo={repo}
                    index={i}
                    selected={selectedId === repo.id}
                    cached={hasCache(repoCacheKey(repo.link, repo.branch ?? "main"))}
                    onSelect={onSelect}
                  />
                </li>
              ))}
            </ul>
            {hasMore && (
              <div className="sticky bottom-0 pt-3 pb-1 bg-gradient-to-t from-[#090C10] to-transparent">
                <Button
                  onClick={onLoadMore}
                  variant="outline"
                  size="sm"
                  disabled={loadingMore}
                  className="w-full bg-transparent border-white/10 text-white/70 hover:bg-white/5 hover:text-white"
                >
                  {loadingMore ? (
                    <>
                      <Loader2 size={14} className="mr-2 animate-spin" /> Loading…
                    </>
                  ) : (
                    "Load More"
                  )}
                </Button>
              </div>
            )}
          </>
        ) : (
          <>
            <label className="block px-1 pb-3">
              <span className="text-[10px] uppercase tracking-[0.14em] text-white/40 font-medium">
                Name search
              </span>
              <Input
                value={worldQuery}
                onChange={(e) => onWorldQueryChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onSearchWorlds();
                }}
                placeholder="Filter worlds by name"
                className="mt-1 h-10 bg-black/30 border-white/10 text-white"
              />
            </label>
            <ul className="space-y-2 p-1">
              {worldsError && (
                <li>
                  <div className="text-sm text-red-300/80 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                    {worldsError}
                  </div>
                </li>
              )}
              {worldsLoading && !worlds.length && (
                <li>
                  <div className="space-y-2">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <Skeleton key={i} className="h-16 w-full bg-white/[0.06]" />
                    ))}
                  </div>
                </li>
              )}
              {!worldsLoading && !worlds.length && !worldsError && (
                <li>
                  <p className="text-sm text-white/45 p-3">
                    No worlds match yet. Search a repo URL below to create one.
                  </p>
                </li>
              )}
              {worlds.map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => onSelectWorld(row)}
                    className={cn(
                      "w-full text-left rounded-xl p-3 border transition-colors",
                      selectedId === row.id
                        ? "border-green-600/80 bg-green-600/20"
                        : "border-white/5 bg-white/[0.03] hover:bg-white/[0.06]",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      {row.thumbnail_url || row.pano_url ? (
                        <img
                          src={(row.thumbnail_url || row.pano_url) as string}
                          alt=""
                          className="h-10 w-10 rounded-md object-cover"
                        />
                      ) : (
                        <Globe size={16} className="text-white/40" />
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white truncate">
                          {row.repo_name ?? "World"}
                        </p>
                        <p className="text-[11px] text-white/45 truncate">
                          {row.status === "pending"
                            ? row.progress ?? "Generating…"
                            : `${row.branch} · ${row.is_public ? "public" : "private"}`}
                        </p>
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {tab === "explore" && (
        <div className="pt-4 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="min-w-0">
              <span className="text-[10px] uppercase tracking-[0.14em] text-white/40 font-medium">
                Repo URL
              </span>
              <Input
                value={repoUrl}
                onChange={(e) => onRepoUrlChange(e.target.value)}
                placeholder="https://github.com/org/repo"
                disabled={isGenerating}
                className="mt-1 h-10 bg-black/30 border-white/10 text-white"
              />
            </label>
            <label className="min-w-0">
              <span className="text-[10px] uppercase tracking-[0.14em] text-white/40 font-medium">
                Branch
              </span>
              <Input
                value={branch}
                onChange={(e) => onBranchChange(e.target.value)}
                placeholder="main"
                disabled={isGenerating}
                className="mt-1 h-10 bg-black/30 border-white/10 text-white"
              />
            </label>
          </div>

          <Button
            onClick={onSearchWorlds}
            disabled={isGenerating || (!canGenerate && !worldQuery.trim())}
            className="w-full h-11 bg-green-700 hover:bg-green-800 text-white font-semibold shadow-[0_8px_32px_-12px_rgba(21,128,61,0.55)] transition-transform hover:scale-[1.01] disabled:opacity-40 disabled:saturate-50 disabled:hover:scale-100"
          >
            {isGenerating ? (
              <>
                <Loader2 size={16} className="mr-2 animate-spin" /> Generating…
              </>
            ) : canGenerate ? (
              <>
                <Sparkles size={16} className="mr-2" /> Search Worlds
              </>
            ) : (
              <>
                <Search size={16} className="mr-2" /> Search Worlds
              </>
            )}
          </Button>
        </div>
      )}
    </aside>
  );
}
