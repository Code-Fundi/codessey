import type { WorldRow } from "@/lib/database.types";
import { repoCacheKey, type CachedWorld } from "@/lib/localStorage";
import { isWorldLabsModel } from "@/lib/marble-model";
import { parseGithubOwnerRepo, repoNameFromUrl } from "@/lib/repo-url";
import { asTrimmed } from "@/lib/utils";
import { persistWorldMarbleModel, readWorldMarbleModel } from "@/lib/world-meta";

export function cachedWorldFromRow(row: WorldRow, branchOverride?: string): CachedWorld {
  const branch = branchOverride || row.branch || "";
  const storedModel = readWorldMarbleModel(row.id);
  const rowModel = isWorldLabsModel(row.marble_model) ? row.marble_model : null;
  const marbleModel = rowModel ?? storedModel;
  if (rowModel) persistWorldMarbleModel(row.id, rowModel);
  return {
    id: row.id,
    worldId: row.world_labs_id,
    splatUrl: row.splat_url ?? "",
    thumbnailUrl: row.thumbnail_url,
    caption: row.caption,
    marbleUrl: row.marble_url,
    panoUrl: row.pano_url,
    repoKey: repoCacheKey(row.repo_url, branch),
    repoName: row.repo_name ?? repoNameFromUrl(row.repo_url) ?? "World",
    generatedAt: new Date(row.created_at).getTime(),
    status: row.status,
    progress: row.progress,
    generationMode: row.generation_mode,
    marbleModel,
    billingSource: row.billing_source,
    repoUrl: row.repo_url,
    userId: row.user_id,
    discoveredBy: row.discovered_by ?? null,
  };
}

export function ownerRepoHeading(
  repoUrl: string | null | undefined,
  fallbackName?: string | null,
): string {
  const parsed = parseGithubOwnerRepo(repoUrl ?? "");
  if (parsed) return `${parsed.owner}/${parsed.repo}`;
  return fallbackName?.trim() || repoNameFromUrl(repoUrl ?? "") || "";
}

export function viewerMedia(world: { splatUrl?: string | null; panoUrl?: string | null }): {
  splatUrl: string;
  panoUrl: string;
} {
  const splatUrl = world.splatUrl || "";
  const panoUrl = world.panoUrl || "";
  return { splatUrl, panoUrl };
}

export function worldHasViewerMedia(world: {
  splatUrl?: string | null;
  panoUrl?: string | null;
}): boolean {
  return Boolean(asTrimmed(world.splatUrl) || asTrimmed(world.panoUrl));
}

export function viewerShowsGenerating(
  world: { status?: string | null; splatUrl?: string | null; panoUrl?: string | null } | null,
  isGenerating: boolean,
): boolean {
  if (world?.status === "complete" || worldHasViewerMedia(world ?? {})) return false;
  return isGenerating || world?.status === "pending";
}
