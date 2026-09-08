import type { WorldRow } from "@/lib/database.types";
import type { BillingSource, GenerationMode } from "@/lib/generation";
import { firstRpcRow } from "@/lib/rpc";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { asTrimmed } from "@/lib/utils";

export const WORLD_SELECT =
  "id,user_id,repo_url,repo_url_norm,branch,repo_name,world_labs_id,operation_id,status,progress,splat_url,thumbnail_url,caption,marble_url,pano_url,generation_mode,billing_source,is_public,discovered_by,plaque_at,created_at,updated_at";

export const SIGNATURE_SELECT =
  "id,world_id,user_id,github_username,message,signature_png,created_at";

export async function lookupWorldByRepoUrl(repoUrl: string): Promise<WorldRow | null> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("lookup_world_by_repo_url", {
    p_repo_url: repoUrl,
  });
  if (error) throw new Error(error.message);
  return firstRpcRow(data as WorldRow | WorldRow[] | null);
}

export async function preSavePendingWorld(input: {
  operationId: string;
  repoUrl: string;
  branch: string;
  repoName: string;
  generationMode: GenerationMode;
  billingSource: BillingSource;
}): Promise<WorldRow> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("pre_save_pending_world", {
    p_operation_id: asTrimmed(input.operationId),
    p_repo_url: asTrimmed(input.repoUrl),
    p_branch: asTrimmed(input.branch) || "main",
    p_repo_name: asTrimmed(input.repoName),
    p_user_id: null,
    p_is_public: true,
    p_generation_mode: input.generationMode,
    p_billing_source: input.billingSource,
  });
  const row = firstRpcRow(data as WorldRow | WorldRow[] | null);
  if (error || !row) {
    throw new Error(error?.message ?? "Could not pre-save pending world.");
  }
  return row;
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
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("apply_world_poll_result", {
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
  const row = firstRpcRow(data as WorldRow | WorldRow[] | null);
  if (error || !row) {
    throw new Error(error?.message ?? "Could not apply poll result.");
  }
  return row;
}

export async function recordWorldVisit(worldId: string): Promise<void> {
  try {
    const supabase = createSupabaseBrowserClient();
    await supabase.rpc("record_world_visit", { p_world_id: worldId });
  } catch {
    /* visit tracking is best-effort */
  }
}
