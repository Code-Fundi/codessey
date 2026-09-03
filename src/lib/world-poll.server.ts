import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase/server";
import { getServerWorldLabs } from "@/lib/providers.server";
import type { WorldRow } from "@/lib/database.types";
import type { Operation, World } from "@/lib/worldlabs.client";

function splatFromWorld(world: World | null | undefined): string | null {
  const urls = world?.assets?.splats?.spz_urls;
  if (!urls) return null;
  return urls["500k"] ?? urls.full_res ?? urls["100k"] ?? null;
}

function panoFromWorld(world: World | null | undefined): string | null {
  return world?.assets?.imagery?.pano_url ?? null;
}

function worldLabsIdFrom(operation: Operation, world: World | null): string | null {
  return (
    world?.world_id ??
    world?.id ??
    operation.response?.world_id ??
    operation.response?.id ??
    operation.metadata?.world_id ??
    null
  );
}

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

export async function preSavePendingWorld(input: {
  operationId: string;
  repoUrl: string;
  branch: string;
  repoName: string;
  userId: string | null;
}): Promise<WorldRow> {
  const admin = createSupabaseServiceClient();
  const { data, error } = await admin.rpc("pre_save_pending_world", {
    p_operation_id: input.operationId,
    p_repo_url: input.repoUrl,
    p_branch: input.branch,
    p_repo_name: input.repoName,
    p_user_id: input.userId,
    p_is_public: true,
  });
  if (error || !data) {
    throw new Error(error?.message ?? "Could not pre-save pending world.");
  }
  return (Array.isArray(data) ? data[0] : data) as WorldRow;
}

async function claimLatestPending(input: {
  userId: string | null;
  worldId: string;
}): Promise<WorldRow | null> {
  const admin = createSupabaseServiceClient();
  const { data, error } = await admin.rpc("claim_latest_pending_worlds", {
    p_limit: 1,
    p_user_id: input.userId,
    p_world_id: input.worldId,
  });
  if (error) throw new Error(error.message);
  const rows = Array.isArray(data) ? data : data ? [data as WorldRow] : [];
  return rows[0] ?? null;
}

async function applyPollResult(
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

async function getWorldById(id: string): Promise<WorldRow | null> {
  const admin = createSupabaseServiceClient();
  const { data, error } = await admin
    .from("worlds")
    .select(
      "id,user_id,repo_url,branch,repo_name,world_labs_id,operation_id,status,progress,splat_url,thumbnail_url,caption,marble_url,pano_url,is_public,created_at,updated_at",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as WorldRow | null) ?? null;
}

/** Claim the latest pending world for this user/id, poll World Labs once, write back to worlds. */
export async function pollLatestPendingWorld(input: {
  userId: string | null;
  worldId: string;
}): Promise<WorldRow | null> {
  const claimed = await claimLatestPending(input);
  if (claimed?.operation_id && claimed.status === "pending") {
    return tickWorldLabs(claimed);
  }
  return getWorldById(input.worldId);
}

async function tickWorldLabs(claimed: WorldRow): Promise<WorldRow> {
  const operationId = claimed.operation_id;
  if (!operationId) {
    return applyPollResult(claimed.id, {
      done: true,
      error: "Pending world is missing an operation id.",
    });
  }

  const worldLabs = getServerWorldLabs();
  const operation = await worldLabs.getOperation(operationId);
  const progress =
    operation.metadata?.progress?.description ?? claimed.progress ?? "Generating landscape…";

  if (!operation.done) {
    return applyPollResult(claimed.id, {
      done: false,
      progress,
      panoUrl: panoFromWorld(operation.response),
    });
  }

  if (operation.error?.message) {
    return applyPollResult(claimed.id, {
      done: true,
      progress,
      error: operation.error.message,
    });
  }

  let world = operation.response ?? null;
  let worldLabsId = worldLabsIdFrom(operation, world);
  if (!worldLabsId) {
    return applyPollResult(claimed.id, {
      done: true,
      progress,
      error: "World Labs finished without a world id.",
    });
  }

  if (!splatFromWorld(world)) {
    world = await worldLabs.getWorld(worldLabsId);
    worldLabsId = worldLabs.getWorldId(world) ?? worldLabsId;
  }

  const splatUrl = splatFromWorld(world);
  if (!splatUrl || !world) {
    return applyPollResult(claimed.id, {
      done: true,
      progress,
      error: "World generated but no splat URL was returned yet.",
    });
  }

  return applyPollResult(claimed.id, {
    done: true,
    progress: "World ready.",
    worldLabsId,
    splatUrl,
    thumbnailUrl: world.assets?.thumbnail_url ?? null,
    caption: world.assets?.caption ?? null,
    marbleUrl: world.world_marble_url ?? `https://marble.worldlabs.ai/world/${worldLabsId}`,
    panoUrl: panoFromWorld(world),
  });
}

export async function fulfillPendingWorld(
  worldId: string,
  userId: string | null,
  maxTicks = 72,
  intervalMs = 5000,
): Promise<void> {
  for (let i = 0; i < maxTicks; i += 1) {
    const row = await pollLatestPendingWorld({ userId, worldId });
    if (!row || row.status === "complete" || row.status === "failed") return;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
