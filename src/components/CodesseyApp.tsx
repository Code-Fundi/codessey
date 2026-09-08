"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Header } from "@/components/Header";
import { ProductTour } from "@/components/ProductTour";
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
import { RETRY_GUESTBOOK_KEY, MISSING_WORLD_LABS_KEY } from "@/lib/generation";
import { getWorldLabsBrowserKey } from "@/lib/worldlabs-key";
import type { CachedWorld } from "@/lib/localStorage";
import { githubPathForRepo, githubRepoUrl, parseGithubOwnerRepo } from "@/lib/repo-url";
import { asTrimmed } from "@/lib/utils";
import { lookupWorldByRepoUrl, recordWorldVisit } from "@/lib/worlds.client";
import type { WorldLabsModel } from "@/lib/worldlabs.client";
import { useWorldSignatures } from "@/hooks/useWorldSignatures";

export function CodesseyApp({
  initialOwner,
  initialRepo,
}: {
  initialOwner?: string;
  initialRepo?: string;
}) {
  const router = useRouter();
  const { generate, isGenerating, progress, generatingId, generatingWorld, generatingRepoUrl } =
    useWorldGeneration();
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
  const [guestbookRetry, setGuestbookRetry] = useState(0);
  const hydratedPath = useRef<string | null>(null);
  const {
    worlds,
    loading: worldsLoading,
    error: worldsError,
    refetch: refetchWorlds,
  } = usePublicWorlds(mainTab === "explore", worldQuery);
  const { signatures, refetch: refetchSignatures } = useWorldSignatures(world?.id ?? null);

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
      if (row.id) void recordWorldVisit(row.id);
    },
    [applyRow],
  );

  const handleRealtimeRow = useCallback(
    (row: WorldRow) => {
      setWorld((current) => {
        if (!current || current.id !== row.id) return current;
        return cachedWorldFromRow(row, branch);
      });
      if (row.status === "complete" && row.id === generatingId) {
        toast.success("World ready.", { description: row.repo_name ?? row.repo_url });
        void refetchWorlds();
      }
    },
    [branch, generatingId, refetchWorlds],
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
      try {
        const existing = await lookupWorldByRepoUrl(url);
        if (!existing) {
          setBranch("");
          return;
        }
        applyRow(existing, existing.branch ?? "");
        void recordWorldVisit(existing.id);
        if (existing.status === "pending" && existing.operation_id) {
          if (generatingId === existing.id && isGenerating) {
            return;
          }
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
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Lookup failed.");
      }
    })();
  }, [
    initialOwner,
    initialRepo,
    applyRow,
    generate,
    refetchWorlds,
    handleCreditsOpenChange,
    generatingId,
    isGenerating,
  ]);

  useEffect(() => {
    if (!generatingWorld || !generatingId) return;
    if (selectedId !== generatingId) return;
    setWorld(generatingWorld);
  }, [generatingWorld, generatingId, selectedId]);

  useEffect(() => {
    if (!user || world?.status !== "complete") return;
    try {
      if (sessionStorage.getItem(RETRY_GUESTBOOK_KEY) === "1") {
        sessionStorage.removeItem(RETRY_GUESTBOOK_KEY);
        setGuestbookRetry((n) => n + 1);
      }
    } catch {
      /* ignore */
    }
  }, [user, world?.status]);

  const handleTabChange = useCallback(
    (tab: MainTab) => {
      if (tab === "explore") {
        if (typeof window !== "undefined" && window.location.pathname !== "/") {
          router.push("/");
          return;
        }
        setMainTab("explore");
        setSelectedId(null);
        setWorld(null);
        return;
      }
      setMainTab("repos");
    },
    [router],
  );

  const handleSearchWorlds = useCallback(() => {
    refetchWorlds();
  }, [refetchWorlds]);

  const handleGenerate = useCallback(
    async (model: WorldLabsModel) => {
      if (!getWorldLabsBrowserKey()) {
        toast.error(MISSING_WORLD_LABS_KEY);
        handleCreditsOpenChange(true, "worldlabs");
        return;
      }
      const result = await generate(
        repoUrl,
        branch,
        (pending) => {
          setWorld(pending);
          setSelectedId(pending.id ?? null);
          syncRepoPath(repoUrl);
          void refetchWorlds();
        },
        model,
      );
      if (result) {
        setWorld((current) => (current?.id === result.id ? result : current));
        toast.success("World ready.", { description: result.repoName });
        void refetchWorlds();
      }
    },
    [generate, repoUrl, branch, refetchWorlds, syncRepoPath, handleCreditsOpenChange],
  );

  const handleNeedSignIn = useCallback(() => {
    try {
      sessionStorage.setItem(RETRY_GUESTBOOK_KEY, "1");
    } catch {
      /* ignore */
    }
    toast.error("Sign in with GitHub to get 2 free credits");
    handleCreditsOpenChange(true, "signin");
  }, [handleCreditsOpenChange]);

  const handleNeedCredits = useCallback(
    (reason: CreditsDialogReason = "guestbook") => {
      if (reason === "guestbook") {
        try {
          sessionStorage.setItem(RETRY_GUESTBOOK_KEY, "1");
        } catch {
          /* ignore */
        }
      }
      toast.error(
        reason === "plaque"
          ? "You need 1 credit to claim the founder's plaque."
          : "You need 1 credit to sign the guestbook.",
      );
      handleCreditsOpenChange(true, reason);
    },
    [handleCreditsOpenChange],
  );

  const handlePurchased = useCallback(() => {
    void refresh();
    setGuestbookRetry((n) => n + 1);
  }, [refresh]);

  const hasViewerWorld = Boolean(
    world &&
    (world.status === "pending" ||
      world.status === "complete" ||
      asTrimmed(world.splatUrl) ||
      asTrimmed(world.panoUrl)),
  );
  const viewingGenerating = Boolean(world?.id && world.id === generatingId);
  const showGallery = mainTab === "explore" && !hasViewerWorld;
  const formLocked = Boolean(
    world &&
    hasViewerWorld &&
    (world.status === "complete" || world.status === "pending" || viewingGenerating),
  );
  const generatingParsed = generatingRepoUrl ? parseGithubOwnerRepo(generatingRepoUrl) : null;
  const generatingLabel =
    isGenerating && generatingParsed
      ? `${generatingParsed.owner}/${generatingParsed.repo}`
      : isGenerating && generatingRepoUrl
        ? generatingRepoUrl
        : null;

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
            onGenerate={(model) => void handleGenerate(model)}
            onGenerateNewWorld={() => router.push("/")}
            generatingLabel={generatingLabel}
            signatures={signatures}
            onJumpToGenerating={
              generatingRepoUrl
                ? () => {
                    const path = githubPathForRepo(generatingRepoUrl);
                    if (path) router.push(path);
                  }
                : undefined
            }
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
              isGenerating={(viewingGenerating && isGenerating) || world?.status === "pending"}
              progress={
                viewingGenerating
                  ? (progress ?? world?.progress ?? null)
                  : (world?.progress ?? null)
              }
              repoUrl={world?.repoUrl ?? repoUrl}
              repoName={world?.repoName ?? null}
              retryNonce={guestbookRetry}
              onNeedSignIn={handleNeedSignIn}
              onNeedCredits={handleNeedCredits}
              onConsumed={() => {
                void refresh();
                void refetchSignatures();
              }}
              onPlaqueClaimed={(discoveredBy) => {
                setWorld((current) => (current ? { ...current, discoveredBy } : current));
              }}
            />
          )}
        </div>
      </main>
      <ProductTour worldComplete={world?.status === "complete"} />
    </div>
  );
}
