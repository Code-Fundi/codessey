"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { Header } from "@/components/Header";
import { RepoPanel, type MainTab } from "@/components/RepoPanel";
import { WorldGallery } from "@/components/WorldGallery";
import { WorldViewer } from "@/components/WorldViewer";
import type { CreditsDialogReason } from "@/components/CreditPurchaseDialog";
import { useRepos } from "@/hooks/useRepos";
import { CreditsExpiredError, useWorldGeneration } from "@/hooks/useWorldGeneration";
import { useWallet } from "@/hooks/useWallet";
import { usePublicWorlds } from "@/hooks/usePublicWorlds";
import { getCache, repoCacheKey, type CachedWorld } from "@/lib/localStorage";
import type { Repository } from "@/lib/codefundi.client";
import type { WorldRow } from "@/lib/database.types";

export default function Index() {
  const { repos, loading, loadingMore, hasMore, error, loadMore } = useRepos();
  const { generate, isGenerating, progress } = useWorldGeneration();
  const { refresh } = useWallet();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [repoUrl, setRepoUrl] = useState("");
  const [branch, setBranch] = useState("main");
  const [world, setWorld] = useState<CachedWorld | null>(null);
  const [creditsOpen, setCreditsOpen] = useState(false);
  const [creditsReason, setCreditsReason] = useState<CreditsDialogReason>("purchase");
  const [mainTab, setMainTab] = useState<MainTab>("explore");
  const [worldQuery, setWorldQuery] = useState("");
  const {
    worlds,
    loading: worldsLoading,
    error: worldsError,
    refetch: refetchWorlds,
  } = usePublicWorlds(mainTab === "explore", worldQuery);

  const handleSelect = useCallback((repo: Repository) => {
    setSelectedId(repo.id);
    setRepoUrl(repo.link);
    setBranch(repo.branch || "main");
    setWorld(getCache(repoCacheKey(repo.link, repo.branch || "main")));
    setMainTab("explore");
  }, []);

  const handleSelectWorld = useCallback((row: WorldRow) => {
    setSelectedId(row.id);
    setRepoUrl(row.repo_url);
    setBranch(row.branch || "main");
    setWorld({
      worldId: row.world_labs_id,
      splatUrl: row.splat_url ?? "",
      thumbnailUrl: row.thumbnail_url,
      caption: row.caption,
      marbleUrl: row.marble_url,
      panoUrl: row.pano_url,
      repoKey: repoCacheKey(row.repo_url, row.branch || "main"),
      repoName: row.repo_name ?? row.repo_url.split("/").filter(Boolean).pop() ?? "World",
      generatedAt: new Date(row.created_at).getTime(),
      status: row.status,
      progress: row.progress,
    });
  }, []);

  const handleTabChange = useCallback((tab: MainTab) => {
    setMainTab(tab);
    if (tab === "explore" && !isGenerating) {
      setSelectedId(null);
      setWorld((current) => (current?.status === "pending" ? current : null));
    }
  }, [isGenerating]);

  const handleCreditsOpenChange = useCallback((open: boolean, reason?: CreditsDialogReason) => {
    if (reason) setCreditsReason(reason);
    if (!open) setCreditsReason("purchase");
    setCreditsOpen(open);
  }, []);

  const handleSearchWorlds = useCallback(async () => {
    if (!repoUrl.trim()) {
      refetchWorlds();
      return;
    }
    const previousUrl = repoUrl;
    const previousBranch = branch;
    try {
      const result = await generate(repoUrl, branch, (pending) => {
        setWorld(pending);
        setSelectedId(null);
        void refetchWorlds();
      });
      if (result) {
        setWorld(result);
        toast.success("World ready.", { description: result.repoName });
        void refresh();
        void refetchWorlds();
      }
    } catch (error) {
      setRepoUrl(previousUrl);
      setBranch(previousBranch);
      if (error instanceof CreditsExpiredError) {
        setCreditsReason("expired");
        setCreditsOpen(true);
        void refresh();
      }
    }
  }, [generate, repoUrl, branch, refresh, refetchWorlds]);

  const showGallery =
    mainTab === "explore" &&
    !isGenerating &&
    world?.status !== "pending" &&
    !world?.splatUrl;

  return (
    <div className="h-screen bg-[#090C10] text-foreground overflow-hidden">
      <Header
        creditsOpen={creditsOpen}
        creditsReason={creditsReason}
        onCreditsOpenChange={handleCreditsOpenChange}
      />
      <main className="pt-14 flex flex-col md:grid md:grid-cols-[1fr_2fr] h-full w-full overflow-hidden">
        <div className="order-2 md:order-1 flex-1 min-h-0 md:h-full overflow-hidden flex flex-col">
          <RepoPanel
            tab={mainTab}
            onTabChange={handleTabChange}
            repos={repos}
            loading={loading}
            loadingMore={loadingMore}
            hasMore={hasMore}
            error={error}
            worlds={worlds}
            worldsLoading={worldsLoading}
            worldsError={worldsError}
            worldQuery={worldQuery}
            onWorldQueryChange={setWorldQuery}
            selectedId={selectedId}
            repoUrl={repoUrl}
            branch={branch}
            isGenerating={isGenerating}
            canGenerate={Boolean(repoUrl.trim())}
            onSelect={handleSelect}
            onSelectWorld={handleSelectWorld}
            onRepoUrlChange={setRepoUrl}
            onBranchChange={setBranch}
            onLoadMore={loadMore}
            onSearchWorlds={() => void handleSearchWorlds()}
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
              repoName={world?.repoName ?? repoUrl.split("/").filter(Boolean).pop() ?? null}
            />
          )}
        </div>
      </main>
    </div>
  );
}
