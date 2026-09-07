import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase/server";
import type { WorldRow } from "@/lib/database.types";
import type { BillingSource, GenerationMode } from "@/lib/generation";
import { normalizeRepoUrl } from "@/lib/repo-url";
import { asTrimmed } from "@/lib/utils";

export const WORLD_SELECT =
  "id,user_id,repo_url,repo_url_norm,branch,repo_name,world_labs_id,operation_id,status,progress,splat_url,thumbnail_url,caption,marble_url,pano_url,generation_mode,billing_source,is_public,created_at,updated_at";

export async function currentUserId(): Promise<string | null> {
  try {
    const session = await createSupabaseServerClient();
    const {
      data: { user },
    } = await session.auth.getUser();
    return user?.id ?? null;
  } catch {
    return null;
  }
}

export async function lookupWorldByRepoUrl(repoUrl: string): Promise<WorldRow | null> {
  const norm = normalizeRepoUrl(repoUrl);
  if (!norm) return null;
  const admin = createSupabaseServiceClient();
  const { data, error } = await admin.rpc("lookup_world_by_repo_url", {
    p_repo_url: repoUrl,
  });
  if (error) throw new Error(error.message);
  return (data as WorldRow | null) ?? null;
}

export async function preSavePendingWorld(input: {
  operationId: string;
  repoUrl: string;
  branch: string;
  repoName: string;
  userId: string | null;
  generationMode: GenerationMode;
  billingSource: BillingSource;
}): Promise<WorldRow> {
  const admin = createSupabaseServiceClient();
  const { data, error } = await admin.rpc("pre_save_pending_world", {
    p_operation_id: asTrimmed(input.operationId),
    p_repo_url: asTrimmed(input.repoUrl),
    p_branch: asTrimmed(input.branch) || "main",
    p_repo_name: asTrimmed(input.repoName),
    p_user_id: input.userId,
    p_is_public: true,
    p_generation_mode: input.generationMode,
    p_billing_source: input.billingSource,
  });
  if (error || !data) {
    throw new Error(error?.message ?? "Could not pre-save pending world.");
  }
  return (Array.isArray(data) ? data[0] : data) as WorldRow;
}

export async function applyWorldPollResult(
  worldId: string,
  patch: {
    done: boolean;
    progress?: string | null;
    error?: string | null;
    worldLabsId?: string | null;
    splatUrl?: string | null;
    thumbnailUrl?: string | null;
    caption?: string | null;
    marbleUrl?: string | null;
    panoUrl?: string | null;
  },
): Promise<WorldRow> {
  const admin = createSupabaseServiceClient();
  const { data, error } = await admin.rpc("apply_world_poll_result", {
    p_world_id: worldId,
    p_done: patch.done,
    p_progress: patch.progress ?? null,
    p_error: patch.error ?? null,
    p_world_labs_id: patch.worldLabsId ?? null,
    p_splat_url: patch.splatUrl ?? null,
    p_thumbnail_url: patch.thumbnailUrl ?? null,
    p_caption: patch.caption ?? null,
    p_marble_url: patch.marbleUrl ?? null,
    p_pano_url: patch.panoUrl ?? null,
  });
  if (error || !data) {
    throw new Error(error?.message ?? "Could not apply poll result.");
  }
  return (Array.isArray(data) ? data[0] : data) as WorldRow;
}

export async function getWorldById(id: string): Promise<WorldRow | null> {
  const admin = createSupabaseServiceClient();
  const { data, error } = await admin
    .from("worlds")
    .select(WORLD_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as WorldRow | null) ?? null;
}
