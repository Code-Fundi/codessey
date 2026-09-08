"use client";

import { useEffect, useState } from "react";
import { Globe, Loader2, PenLine, Search, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import type { WorldRow, WorldSignatureRow } from "@/lib/database.types";
import {
  MARBLE_MODEL_CHOICES,
  persistMarbleModel,
  persistWorldGenKind,
  readStoredMarbleModel,
  readStoredWorldGenKind,
  resolveWorldLabsModel,
  type MarbleModelChoice,
  type WorldGenKind,
} from "@/lib/marble-model";
import { parseGithubOwnerRepo, repoNameFromUrl } from "@/lib/repo-url";
import { cn } from "@/lib/utils";
import type { WorldLabsModel } from "@/lib/worldlabs.client";

export type MainTab = "explore" | "repos";

interface RepoPanelProps {
  tab: MainTab;
  onTabChange: (tab: MainTab) => void;
  worlds: WorldRow[];
  worldsLoading: boolean;
  worldsError: string | null;
  worldQuery: string;
  onWorldQueryChange: (value: string) => void;
  selectedId: string | null;
  repoUrl: string;
  branch: string;
  isGenerating: boolean;
  formLocked?: boolean;
  onSelectWorld: (world: WorldRow) => void;
  onRepoUrlChange: (value: string) => void;
  onBranchChange: (value: string) => void;
  onSearchWorlds: () => void;
  onGenerate: (model: WorldLabsModel) => void;
  onGenerateNewWorld?: () => void;
  generatingLabel?: string | null;
  signatures?: WorldSignatureRow[];
  onJumpToGenerating?: () => void;
}

export function RepoPanel(props: RepoPanelProps) {
  const {
    tab,
    onTabChange,
    worlds,
    worldsLoading,
    worldsError,
    worldQuery,
    onWorldQueryChange,
    selectedId,
    repoUrl,
    branch,
    isGenerating,
    formLocked = false,
    onSelectWorld,
    onRepoUrlChange,
    onBranchChange,
    onSearchWorlds,
    onGenerate,
    onGenerateNewWorld,
    generatingLabel,
    signatures = [],
    onJumpToGenerating,
  } = props;

  const [modelChoice, setModelChoice] = useState<MarbleModelChoice>("1.1");
  const [genKind, setGenKind] = useState<WorldGenKind>("standard");

  useEffect(() => {
    setModelChoice(readStoredMarbleModel());
    setGenKind(readStoredWorldGenKind());
  }, []);

  const variableAllowed = modelChoice === "1.1";
  const inputsDisabled = isGenerating || formLocked;
  const showNewWorld = formLocked && !isGenerating;

  const selectModel = (choice: MarbleModelChoice) => {
    setModelChoice(choice);
    persistMarbleModel(choice);
    if (choice !== "1.1" && genKind === "variable") {
      setGenKind("standard");
      persistWorldGenKind("standard");
    }
  };

  const selectKind = (kind: WorldGenKind) => {
    if (kind === "variable" && !variableAllowed) {
      setModelChoice("1.1");
      persistMarbleModel("1.1");
    }
    setGenKind(kind);
    persistWorldGenKind(kind);
  };

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
          data-tour="repos"
          className={cn(
            "text-xs uppercase tracking-[0.18em] font-medium px-2 py-1 rounded-md",
            tab === "repos" ? "text-white bg-white/10" : "text-white/45 hover:text-white/70",
          )}
        >
          Indexed Repos
        </button>
        {(worldsLoading || isGenerating) && (
          <Loader2 size={12} className="text-blue-400 animate-spin" />
        )}
      </div>

      {generatingLabel && onJumpToGenerating && (
        <button
          type="button"
          onClick={onJumpToGenerating}
          className="mt-3 rounded-lg border border-blue-400/30 bg-blue-500/10 px-3 py-2 text-left text-[11px] text-blue-100/90 hover:bg-blue-500/20"
        >
          Generating {generatingLabel}…
        </button>
      )}

      <Separator className="my-3 bg-white/10" />

      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin -mx-1 px-1">
        {tab === "repos" ? (
          <div className="px-1 py-2 space-y-3">
            <p className="text-sm text-white/70">Generate a landscape from a GitHub repository.</p>
            <p className="text-xs text-white/45 leading-relaxed">
              Add your World Labs key to generate a landscape. Guestbook signatures and founder
              plaques cost 1 credit after you sign in.
            </p>
            {signatures.length > 0 && (
              <div className="pt-2 space-y-2">
                <p className="text-[10px] uppercase tracking-[0.14em] text-white/40 font-medium">
                  Guestbook
                </p>
                <ul className="space-y-2">
                  {signatures.map((entry) => (
                    <li
                      key={entry.id}
                      className="rounded-xl border border-white/5 bg-white/[0.03] p-3"
                    >
                      <div className="flex items-center gap-2">
                        {entry.signature_png ? (
                          <img
                            src={entry.signature_png}
                            alt=""
                            className="h-10 w-14 rounded-md object-contain bg-white"
                          />
                        ) : (
                          <PenLine size={16} className="text-white/40" />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-white truncate">
                            @{entry.github_username}
                          </p>
                          <p className="text-[11px] text-white/55 line-clamp-2">{entry.message}</p>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
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
                    No worlds match yet. Open Indexed Repos to generate one.
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
                        ? "border-blue-500/80 bg-blue-600/20"
                        : "border-white/5 bg-white/[0.03] hover:bg-white/[0.06]",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      {row.pano_url || row.thumbnail_url ? (
                        <img
                          src={(row.pano_url || row.thumbnail_url) as string}
                          alt=""
                          className="h-10 w-10 rounded-md object-cover"
                        />
                      ) : (
                        <Globe size={16} className="text-white/40" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-white truncate">
                            {repoNameFromUrl(row.repo_url) ?? row.repo_name ?? "World"}
                          </p>
                        </div>
                        <p className="text-[11px] text-white/55 truncate">
                          {parseGithubOwnerRepo(row.repo_url)?.owner ?? "unknown"}
                        </p>
                        <p className="text-[11px] text-white/45 truncate">
                          {row.status === "pending"
                            ? (row.progress ?? "Generating…")
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
        <div className="pt-4">
          <Button
            onClick={onSearchWorlds}
            disabled={worldsLoading}
            className="w-full h-11 bg-blue-700 hover:bg-blue-800 text-white font-semibold shadow-[0_8px_32px_-12px_rgba(37,99,235,0.55)] transition-transform hover:scale-[1.01] disabled:opacity-40 disabled:saturate-50 disabled:hover:scale-100"
          >
            {worldsLoading ? (
              <>
                <Loader2 size={16} className="mr-2 animate-spin" /> Searching…
              </>
            ) : (
              <>
                <Search size={16} className="mr-2" /> Search Worlds
              </>
            )}
          </Button>
        </div>
      )}

      {tab === "repos" && (
        <div className="pt-4 space-y-3">
          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-[0.14em] text-white/40 font-medium">
              Model
            </p>
            <div className="flex flex-wrap gap-1.5">
              {MARBLE_MODEL_CHOICES.map((choice) => (
                <button
                  key={choice.id}
                  type="button"
                  disabled={inputsDisabled}
                  onClick={() => selectModel(choice.id)}
                  className={cn(
                    "rounded-md px-2 py-1 text-[11px] font-medium",
                    modelChoice === choice.id
                      ? "bg-white/15 text-white"
                      : "text-white/45 hover:text-white/70",
                    inputsDisabled && "opacity-40",
                  )}
                >
                  {choice.label}
                </button>
              ))}
            </div>
            <p className="text-[10px] uppercase tracking-[0.14em] text-white/40 font-medium">
              World size
            </p>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                disabled={inputsDisabled}
                onClick={() => selectKind("standard")}
                className={cn(
                  "rounded-md px-2 py-1 text-[11px] font-medium",
                  genKind === "standard"
                    ? "bg-white/15 text-white"
                    : "text-white/45 hover:text-white/70",
                  inputsDisabled && "opacity-40",
                )}
              >
                World generation
              </button>
              <button
                type="button"
                disabled={inputsDisabled}
                onClick={() => selectKind("variable")}
                className={cn(
                  "rounded-md px-2 py-1 text-[11px] font-medium",
                  genKind === "variable"
                    ? "bg-white/15 text-white"
                    : "text-white/45 hover:text-white/70",
                  inputsDisabled && "opacity-40",
                )}
              >
                Variable world generation
              </button>
            </div>
            <p className="text-[11px] text-white/40 leading-relaxed">
              These use World Labs credits on your key, not Codessey coins.
              {genKind === "variable"
                ? " Variable sizing uses Marble 1.1 Plus and may add extra World Labs credits."
                : ""}
            </p>
          </div>
          <label className="block min-w-0">
            <span className="text-[10px] uppercase tracking-[0.14em] text-white/40 font-medium">
              Repo URL
            </span>
            <Input
              value={repoUrl}
              onChange={(e) => onRepoUrlChange(e.target.value)}
              placeholder="https://github.com/org/repo"
              disabled={inputsDisabled}
              className="mt-1 h-10 bg-black/30 border-white/10 text-white"
            />
          </label>
          <label className="block min-w-0">
            <span className="text-[10px] uppercase tracking-[0.14em] text-white/40 font-medium">
              Branch
            </span>
            <Input
              value={branch}
              onChange={(e) => onBranchChange(e.target.value)}
              placeholder="default"
              disabled={inputsDisabled}
              className="mt-1 h-10 bg-black/30 border-white/10 text-white"
            />
          </label>

          {showNewWorld ? (
            <Button
              onClick={onGenerateNewWorld}
              className="w-full h-11 bg-amber-600 hover:bg-amber-700 text-white font-semibold shadow-[0_8px_32px_-12px_rgba(217,119,6,0.55)] transition-transform hover:scale-[1.01]"
            >
              <Sparkles size={16} className="mr-2" /> Generate New World
            </Button>
          ) : (
            <Button
              onClick={() => onGenerate(resolveWorldLabsModel(modelChoice, genKind))}
              disabled={isGenerating}
              className="w-full h-11 bg-blue-700 hover:bg-blue-800 text-white font-semibold shadow-[0_8px_32px_-12px_rgba(37,99,235,0.55)] transition-transform hover:scale-[1.01] disabled:opacity-40 disabled:saturate-50 disabled:hover:scale-100"
            >
              {isGenerating ? (
                <>
                  <Loader2 size={16} className="mr-2 animate-spin" /> Generating…
                </>
              ) : (
                <>
                  <Sparkles size={16} className="mr-2" /> Generate World
                </>
              )}
            </Button>
          )}
        </div>
      )}
    </aside>
  );
}
