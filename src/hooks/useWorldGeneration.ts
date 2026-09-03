import { useCallback, useState } from "react";
import { toast } from "sonner";
import type { CreditTick } from "@/lib/credit-status";
import type { WorldRow } from "@/lib/database.types";
import { repoCacheKey, setCache, type CachedWorld } from "@/lib/localStorage";

export class CreditsExpiredError extends Error {
  readonly tick: CreditTick;
  constructor(tick: CreditTick) {
    super(tick.error ?? "insufficient_coins");
    this.name = "CreditsExpiredError";
    this.tick = tick;
  }
}

function toCached(row: WorldRow, repoUrl: string, branch: string): CachedWorld {
  return {
    worldId: row.world_labs_id,
    splatUrl: row.splat_url ?? "",
    thumbnailUrl: row.thumbnail_url,
    caption: row.caption,
    marbleUrl: row.marble_url,
    panoUrl: row.pano_url,
    repoKey: repoCacheKey(repoUrl, branch),
    repoName: row.repo_name ?? repoUrl.split("/").filter(Boolean).pop() ?? "Codessey",
    generatedAt: Date.now(),
    status: row.status,
    progress: row.progress,
  };
}

export function useWorldGeneration() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);

  const generate = useCallback(
    async (
      repoUrl: string,
      branch: string,
      onPending?: (world: CachedWorld, row: WorldRow) => void,
    ): Promise<CachedWorld | null> => {
      const url = repoUrl.trim();
      const resolvedBranch = branch.trim() || "main";
      if (!url) {
        toast.error("Enter a repository URL.");
        return null;
      }

      setIsGenerating(true);
      setProgress("Checking credits…");

      try {
        const startedRes = await fetch("/api/generate/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url, branch: resolvedBranch }),
        });
        const started = (await startedRes.json()) as {
          error?: string;
          tick?: CreditTick;
          operationId?: string;
          repoName?: string;
          repoUrl?: string;
          branch?: string;
          world?: WorldRow;
        };

        if (startedRes.status === 402 || started.tick?.error === "insufficient_coins") {
          throw new CreditsExpiredError(
            started.tick ?? {
              ok: false,
              balance: 0,
              paidBalance: 0,
              freeBalance: 0,
              nextRefreshAt: new Date().toISOString(),
              secondsUntilRefresh: 0,
              source: "ip",
              error: "insufficient_coins",
            },
          );
        }
        if (!startedRes.ok || !started.world?.id) {
          throw new Error(started.error || "Could not start generation.");
        }

        const pending = toCached(
          started.world,
          started.repoUrl ?? url,
          started.branch ?? resolvedBranch,
        );
        setProgress(started.world.progress ?? "Generating landscape (about 5 minutes)…");
        onPending?.(pending, started.world);

        let row = started.world;
        while (row.status === "pending") {
          await new Promise((r) => setTimeout(r, 5000));
          const pollRes = await fetch("/api/generate/poll", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ worldId: started.world.id }),
          });
          const polled = (await pollRes.json()) as { world?: WorldRow; error?: string };
          if (!pollRes.ok || !polled.world) {
            throw new Error(polled.error || "Poll failed.");
          }
          row = polled.world;
          setProgress(row.progress ?? "Generating landscape (about 5 minutes)…");
          onPending?.(toCached(row, started.repoUrl ?? url, started.branch ?? resolvedBranch), row);
        }

        if (row.status === "failed") {
          throw new Error(row.progress || "Generation failed.");
        }
        if (!row.splat_url) {
          throw new Error("World generated but no splat URL was returned yet.");
        }

        const cached = toCached(row, started.repoUrl ?? url, started.branch ?? resolvedBranch);
        setCache(cached);
        return cached;
      } catch (error) {
        if (error instanceof CreditsExpiredError) throw error;
        toast.error(error instanceof Error ? error.message : "Generation failed.");
        return null;
      } finally {
        setIsGenerating(false);
        setProgress(null);
      }
    },
    [],
  );

  return { generate, isGenerating, progress };
}
