"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Header } from "@/components/Header";
import { RepoPanel, type MainTab } from "@/components/RepoPanel";
import { WorldGallery } from "@/components/WorldGallery";
import { WorldViewer } from "@/components/WorldViewer";
import type { CreditsDialogReason } from "@/components/CreditPurchaseDialog";
import { useWorldGeneration } from "@/hooks/useWorldGeneration";
import { useWorldRowSubscription } from "@/hooks/useWorldRowSubscription";
import { useWallet } from "@/hooks/useWallet";
import { usePublicWorlds } from "@/hooks/usePublicWorlds";
import { cachedWorldFromRow } from "@/lib/cached-world";
import type { WorldRow } from "@/lib/database.types";
import { RETRY_POSTCARD_KEY, MISSING_WORLD_LABS_KEY } from "@/lib/generation";
import { getWorldLabsBrowserKey } from "@/lib/worldlabs-key";
import type { CachedWorld } from "@/lib/localStorage";
import { githubPathForRepo, githubRepoUrl } from "@/lib/repo-url";
import { asTrimmed } from "@/lib/utils";

export function CodesseyApp({
  initialOwner,
  initialRepo,
}: {
  initialOwner?: string;
  initialRepo?: string;
}) {
  const router = useRouter();
  const { generate, isGenerating, progress } = useWorldGeneration();
  const { user, refresh } = useWallet();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [repoUrl, setRepoUrl] = useState(
    initialOwner && initialRepo ? githubRepoUrl(initialOwner, initialRepo) : "",
  );
  const [branch, setBranch] = useState("");
  const [world, setWorld] = useState<CachedWorld | null>(null);
  const [creditsOpen, setCreditsOpen] = useState(false);
  const [creditsReason, setCreditsReason] = useState<CreditsDialogReason>("purchase");
  const [mainTab, setMainTab] = useState<MainTab>(
    initialOwner && initialRepo ? "repos" : "explore",
  );
  const [worldQuery, setWorldQuery] = useState("");
  const [postcardRetry, setPostcardRetry] = useState(0);
  const hydratedPath = useRef<string | null>(null);
  const {
    worlds,
    loading: worldsLoading,
    error: worldsError,
    refetch: refetchWorlds,
  } = usePublicWorlds(mainTab === "explore", worldQuery);

  const syncRepoPath = useCallback(
    (url: string) => {
      const path = githubPathForRepo(url);
      if (!path) return;
      if (typeof window !== "undefined" && window.location.pathname === path) return;
      router.replace(path);
    },
    [router],
  );

  const applyRow = useCallback(
    (row: WorldRow, nextBranch?: string) => {
      setSelectedId(row.id);
      setRepoUrl(row.repo_url);
      setBranch(nextBranch ?? row.branch ?? "");
      setWorld(cachedWorldFromRow(row, nextBranch ?? row.branch ?? ""));
      syncRepoPath(row.repo_url);
    },
    [syncRepoPath],
  );

  const handleSelectWorld = useCallback(
    (row: WorldRow) => {
      applyRow(row);
    },
    [applyRow],
  );

  const handleRealtimeRow = useCallback(
    (row: WorldRow) => {
      setWorld(cachedWorldFromRow(row, branch));
      setSelectedId(row.id);
      if (row.status === "complete" && !isGenerating) {
        toast.success("World ready.", { description: row.repo_name ?? row.repo_url });
        void refetchWorlds();
      }
    },
    [branch, isGenerating, refetchWorlds],
  );

  const handleCreditsOpenChange = useCallback((open: boolean, reason?: CreditsDialogReason) => {
    if (reason) setCreditsReason(reason);
    if (!open) setCreditsReason("purchase");
    setCreditsOpen(open);
  }, []);

  useWorldRowSubscription(world?.id, handleRealtimeRow);

  useEffect(() => {
    if (!initialOwner || !initialRepo) return;
    const key = `${initialOwner}/${initialRepo}`.toLowerCase();
    if (hydratedPath.current === key) return;
    hydratedPath.current = key;
    const url = githubRepoUrl(initialOwner, initialRepo);
    setRepoUrl(url);
    setMainTab("repos");

    void (async () => {
      const lookupRes = await fetch(`/api/worlds/lookup?repoUrl=${encodeURIComponent(url)}`);
      const lookup = (await lookupRes.json()) as { world?: WorldRow | null; error?: string };
      if (!lookupRes.ok) {
        toast.error(lookup.error || "Lookup failed.");
        return;
      }
      const existing = lookup.world ?? null;
      if (!existing) {
        setBranch("");
        return;
      }
      applyRow(existing, existing.branch ?? "");
      if (existing.status === "pending" && existing.operation_id) {
        if (!getWorldLabsBrowserKey()) {
          toast.error(MISSING_WORLD_LABS_KEY);
          handleCreditsOpenChange(true, "worldlabs");
          return;
        }
        const result = await generate(url, existing.branch ?? "", (pending) => {
          setWorld(pending);
          setSelectedId(pending.id ?? null);
        });
        if (result) {
          setWorld(result);
          toast.success("World ready.", { description: result.repoName });
          void refetchWorlds();
        }
      }
    })();
  }, [initialOwner, initialRepo, applyRow, generate, refetchWorlds, handleCreditsOpenChange]);

  useEffect(() => {
    if (!user || world?.status !== "complete") return;
    try {
      if (sessionStorage.getItem(RETRY_POSTCARD_KEY) === "1") {
        sessionStorage.removeItem(RETRY_POSTCARD_KEY);
        setPostcardRetry((n) => n + 1);
      }
    } catch {
      /* ignore */
    }
  }, [user, world?.status]);

  const handleTabChange = useCallback(
    (tab: MainTab) => {
      setMainTab(tab);
      if (tab === "explore" && !isGenerating) {
        setSelectedId(null);
        setWorld((current) => (current?.status === "pending" ? current : null));
      }
    },
    [isGenerating],
  );

  const handleSearchWorlds = useCallback(() => {
    refetchWorlds();
  }, [refetchWorlds]);

  const handleGenerate = useCallback(async () => {
    if (!getWorldLabsBrowserKey()) {
      toast.error(MISSING_WORLD_LABS_KEY);
      handleCreditsOpenChange(true, "worldlabs");
      return;
    }
    const result = await generate(repoUrl, branch, (pending) => {
      setWorld(pending);
      setSelectedId(pending.id ?? null);
      syncRepoPath(repoUrl);
      void refetchWorlds();
    });
    if (result) {
      setWorld(result);
      toast.success("World ready.", { description: result.repoName });
      syncRepoPath(repoUrl);
      void refetchWorlds();
    }
  }, [generate, repoUrl, branch, refetchWorlds, syncRepoPath, handleCreditsOpenChange]);

  const handleNeedSignIn = useCallback(() => {
    try {
      sessionStorage.setItem(RETRY_POSTCARD_KEY, "1");
    } catch {
      /* ignore */
    }
    toast.error("Sign in with GitHub to get 2 free credits for postcards");
    handleCreditsOpenChange(true, "signin");
  }, [handleCreditsOpenChange]);

  const handleNeedCredits = useCallback(() => {
    try {
      sessionStorage.setItem(RETRY_POSTCARD_KEY, "1");
    } catch {
      /* ignore */
    }
    toast.error("You need 1 credit to download a postcard.");
    handleCreditsOpenChange(true, "postcard");
  }, [handleCreditsOpenChange]);

  const handlePurchased = useCallback(() => {
    void refresh();
    setPostcardRetry((n) => n + 1);
  }, [refresh]);

  const hasViewerWorld = Boolean(
    world &&
    (world.status === "pending" ||
      world.status === "complete" ||
      asTrimmed(world.splatUrl) ||
      asTrimmed(world.panoUrl)),
  );
  const showGallery = mainTab === "explore" && !isGenerating && !hasViewerWorld;
  const formLocked = Boolean(
    world && (world.status === "pending" || world.status === "complete") && hasViewerWorld,
  );

  return (
    <div className="h-screen bg-[#090C10] text-foreground overflow-hidden">
      <Header
        creditsOpen={creditsOpen}
        creditsReason={creditsReason}
        onCreditsOpenChange={handleCreditsOpenChange}
        onPurchased={handlePurchased}
      />
      <main className="pt-14 flex flex-col md:grid md:grid-cols-[1fr_2fr] h-full w-full overflow-hidden">
        <div className="order-2 md:order-1 flex-1 min-h-0 md:h-full overflow-hidden flex flex-col">
          <RepoPanel
            tab={mainTab}
            onTabChange={handleTabChange}
            worlds={worlds}
            worldsLoading={worldsLoading}
            worldsError={worldsError}
            worldQuery={worldQuery}
            onWorldQueryChange={setWorldQuery}
            selectedId={selectedId}
            repoUrl={repoUrl}
            branch={branch}
            isGenerating={isGenerating}
            formLocked={formLocked}
            onSelectWorld={handleSelectWorld}
            onRepoUrlChange={setRepoUrl}
            onBranchChange={setBranch}
            onSearchWorlds={handleSearchWorlds}
            onGenerate={() => void handleGenerate()}
            onGenerateNewWorld={() => router.push("/")}
          />
        </div>
        <div className="order-1 md:order-2 shrink-0 h-[min(52vh,520px)] md:h-full md:shrink overflow-hidden flex flex-col">
          {showGallery ? (
            <WorldGallery
              worlds={worlds}
              loading={worldsLoading}
              error={worldsError}
              selectedId={selectedId}
              onSelect={handleSelectWorld}
            />
          ) : (
            <WorldViewer
              world={world}
              isGenerating={isGenerating || world?.status === "pending"}
              progress={progress ?? world?.progress ?? null}
              repoUrl={world?.repoUrl ?? repoUrl}
              repoName={world?.repoName ?? null}
              retryNonce={postcardRetry}
              onNeedSignIn={handleNeedSignIn}
              onNeedCredits={handleNeedCredits}
              onConsumed={() => void refresh()}
            />
          )}
        </div>
      </main>
    </div>
  );
}
