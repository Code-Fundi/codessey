import { useCallback, useState } from "react";
import { toast } from "sonner";
import type { WorldRow } from "@/lib/database.types";
import type { BillingSource, GenerationMode } from "@/lib/generation";
import { MISSING_WORLD_LABS_KEY } from "@/lib/generation";
import { setCache, type CachedWorld } from "@/lib/localStorage";
import { cachedWorldFromRow } from "@/lib/cached-world";
import type { RepositoryIndexInitRepo } from "@/lib/codefundi.client";
import { buildLandscapePrompt, hasBlueprintPayload, type RepoBlueprint } from "@/lib/prompts";
import { publicRepoToast } from "@/lib/public-repo";
import { indexRepoPayload } from "@/lib/codefundi-index";
import { asTrimmed } from "@/lib/utils";
import { decidePollTick, logPollTick } from "@/lib/world-poll";
import { getWorldLabsBrowserKey } from "@/lib/worldlabs-key";
import {
  createWorldLabsClient,
  unwrapWorld,
  type Operation,
  type World,
  WorldLabsAPIError,
} from "@/lib/worldlabs.client";

async function readJson<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toCached(row: WorldRow, branch: string): CachedWorld {
  return cachedWorldFromRow(row, branch);
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
      const url = asTrimmed(repoUrl);
      const typedBranch = asTrimmed(branch);
      const mode: GenerationMode = "world";
      if (!url) {
        toast.error("Enter a repository URL.");
        return null;
      }

      setIsGenerating(true);
      setProgress("Looking up existing world…");

      try {
        const lookupRes = await fetch(`/api/worlds/lookup?repoUrl=${encodeURIComponent(url)}`);
        const lookup = await readJson<{ world?: WorldRow | null; error?: string }>(lookupRes);
        if (!lookupRes.ok) throw new Error(lookup.error || "Lookup failed.");

        const existing = lookup.world ?? null;
        const persistBranch = typedBranch || existing?.branch || "";
        const canReuse = existing && existing.status === "complete" && Boolean(existing.splat_url);
        if (canReuse && existing) {
          const cached = toCached(existing, persistBranch);
          setCache(cached);
          return cached;
        }

        const userKey = getWorldLabsBrowserKey();
        if (!userKey) throw new Error(MISSING_WORLD_LABS_KEY);

        if (existing?.status === "pending" && existing.operation_id) {
          setProgress(existing.progress ?? "Resuming generation…");
          onPending?.(toCached(existing, persistBranch), existing);
          return pollUntilReady({
            row: existing,
            url,
            branch: persistBranch,
            mode: existing.generation_mode === "world" ? "world" : "pano",
            onPending,
            setProgress,
          });
        }

        setProgress("Reading repository…");
        const blueprintRes = await fetch("/api/codefundi/blueprint", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
        });
        const blueprintBody = await readJson<{ blueprint?: RepoBlueprint | null; error?: string }>(
          blueprintRes,
        );
        if (!blueprintRes.ok) {
          throw new Error(
            publicRepoToast(blueprintRes.status, blueprintBody.error || "Blueprint lookup failed."),
          );
        }

        let index: RepositoryIndexInitRepo | null = null;
        const blueprint = hasBlueprintPayload(blueprintBody.blueprint)
          ? blueprintBody.blueprint
          : null;
        if (!blueprint) {
          setProgress("Indexing repository…");
          const indexRes = await fetch("/api/codefundi/index", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(indexRepoPayload(url, typedBranch)),
          });
          const indexed = await readJson<{ index?: RepositoryIndexInitRepo; error?: string }>(
            indexRes,
          );
          if (!indexRes.ok || !indexed.index) {
            throw new Error(publicRepoToast(indexRes.status, indexed.error || "Index failed."));
          }
          index = indexed.index;
        }

        const resolvedBranch = typedBranch || index?.branch || "";
        const prompt = buildLandscapePrompt({
          index,
          blueprint,
          repoUrl: url,
          branch: resolvedBranch,
        });
        const displayName =
          url
            .split("/")
            .filter(Boolean)
            .pop()
            ?.replace(/\.git$/i, "") || "Codessey";

        setProgress("Starting World Labs with your key…");
        const billingSource: BillingSource = "user_key";
        let operation: Operation;
        try {
          operation = await createWorldLabsClient({ apiKey: userKey }).generateWorld({
            display_name: displayName.slice(0, 64),
            model: "marble-1.1",
            world_prompt: { type: "text", text_prompt: prompt },
          });
        } catch (error) {
          if (error instanceof WorldLabsAPIError && error.statusCode === 401) {
            throw new Error("World Labs rejected that API key.");
          }
          throw error;
        }
        const operationId = operation.operation_id;

        const pendingRes = await fetch("/api/worlds/pending", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            operationId,
            repoUrl: url,
            branch: resolvedBranch,
            repoName: displayName,
            generationMode: mode,
            billingSource,
          }),
        });
        const pendingBody = await readJson<{ world?: WorldRow; error?: string }>(pendingRes);
        if (!pendingRes.ok || !pendingBody.world?.id) {
          throw new Error(pendingBody.error || "Could not save pending world.");
        }

        const row = pendingBody.world;
        setProgress(row.progress ?? "Generating landscape…");
        onPending?.(toCached(row, resolvedBranch), row);

        return pollUntilReady({
          row,
          url,
          branch: resolvedBranch,
          mode,
          initial: operation,
          onPending,
          setProgress,
        });
      } catch (error) {
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

async function pollUntilReady(input: {
  row: WorldRow;
  url: string;
  branch: string;
  mode: GenerationMode;
  initial?: Operation | null;
  onPending?: (world: CachedWorld, row: WorldRow) => void;
  setProgress: (value: string | null) => void;
}): Promise<CachedWorld | null> {
  let row = input.row;
  const operationId = row.operation_id;
  if (!operationId) throw new Error("Pending world is missing an operation id.");

  const userKey = getWorldLabsBrowserKey();
  if (!userKey) throw new Error(MISSING_WORLD_LABS_KEY);
  const client = createWorldLabsClient({ apiKey: userKey });

  const fetchOperation = async (): Promise<Operation> => client.getOperation(operationId);

  const fetchWorld = async (worldId: string): Promise<World | null> => {
    try {
      return unwrapWorld(await client.getWorld(worldId));
    } catch {
      return null;
    }
  };

  const apply = async (patch: {
    done: boolean;
    progress?: string | null;
    error?: string | null;
    worldLabsId?: string | null;
    splatUrl?: string | null;
    thumbnailUrl?: string | null;
    caption?: string | null;
    marbleUrl?: string | null;
    panoUrl?: string | null;
  }): Promise<WorldRow> => {
    const res = await fetch("/api/worlds/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ worldId: row.id, ...patch }),
    });
    const body = await readJson<{ world?: WorldRow; error?: string }>(res);
    if (!res.ok || !body.world) throw new Error(body.error || "Apply failed.");
    return body.world;
  };

  let operation = input.initial ?? (await fetchOperation());

  for (let i = 0; i < 72; i += 1) {
    if (i > 0 || !input.initial) {
      await sleep(5000);
      operation = await fetchOperation();
    }

    const metadataWorldId = operation.metadata?.world_id ?? null;
    let fetchedWorld: World | null = null;
    if (metadataWorldId) {
      fetchedWorld = await fetchWorld(metadataWorldId);
    }

    const decision = decidePollTick({
      operation,
      fetchedWorld,
      mode: input.mode,
      progressFallback: row.progress ?? "Generating landscape…",
    });
    logPollTick({ operation, fetchedWorld, decision });
    input.setProgress(decision.progress);

    if (decision.action === "fail") {
      row = await apply({
        done: true,
        progress: decision.progress,
        error: decision.message,
        worldLabsId: decision.worldLabsId,
        panoUrl: decision.panoUrl,
      });
      throw new Error(decision.message);
    }

    if (decision.action === "complete") {
      row = await apply({
        done: true,
        progress: decision.progress,
        worldLabsId: decision.worldLabsId,
        splatUrl: decision.splatUrl,
        thumbnailUrl: decision.world?.assets?.thumbnail_url ?? null,
        caption: decision.world?.assets?.caption ?? null,
        marbleUrl:
          decision.world?.world_marble_url ??
          `https://marble.worldlabs.ai/world/${decision.worldLabsId}`,
        panoUrl: decision.panoUrl,
      });
      break;
    }

    row = await apply({
      done: false,
      progress: decision.progress,
      worldLabsId: decision.worldLabsId,
      panoUrl: decision.panoUrl,
    });
    input.onPending?.(toCached(row, input.branch), row);
  }

  if (row.status === "failed") {
    throw new Error(row.progress || "Generation failed.");
  }
  if (row.status === "pending") {
    throw new Error("Generation timed out. Try again in a few minutes.");
  }
  if (input.mode === "world" && !row.splat_url) {
    throw new Error("World generated but no splat URL was returned yet.");
  }
  if (input.mode === "pano" && !row.pano_url) {
    throw new Error("World generated but no panorama URL was returned yet.");
  }

  const cached = toCached(row, input.branch);
  setCache(cached);
  return cached;
}
