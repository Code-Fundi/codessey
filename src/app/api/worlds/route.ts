import { NextResponse } from "next/server";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase/server";
import { getServerWorldLabs } from "@/lib/providers.server";
import type { WorldRow } from "@/lib/database.types";
import { sanitizeWorldSearch } from "@/lib/world-search";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const mine = searchParams.get("mine") === "1";
    const q = sanitizeWorldSearch(searchParams.get("q") ?? "");
    const supabase = await createSupabaseServerClient();
    let query = supabase
      .from("worlds")
      .select(
        "id,user_id,repo_url,branch,repo_name,world_labs_id,operation_id,status,progress,splat_url,thumbnail_url,caption,marble_url,pano_url,is_public,created_at,updated_at",
      )
      .neq("status", "failed")
      .order("created_at", { ascending: false })
      .limit(40);

    if (q) {
      query = query.or(`repo_name.ilike.%${q}%,repo_url.ilike.%${q}%,caption.ilike.%${q}%`);
    }

    if (mine) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return NextResponse.json({ worlds: [] as WorldRow[] });
      query = query.eq("user_id", user.id);
    } else {
      query = query.eq("is_public", true);
    }

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ worlds: (data ?? []) as WorldRow[] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "List failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      worldLabsId?: string;
      repoUrl?: string;
      branch?: string;
      repoName?: string;
      isPublic?: boolean;
    };
    const worldLabsId = body.worldLabsId?.trim() ?? "";
    const repoUrl = body.repoUrl?.trim() ?? "";
    if (!worldLabsId || !repoUrl) {
      return NextResponse.json({ error: "Missing world." }, { status: 400 });
    }

    const world = await getServerWorldLabs().getWorld(worldLabsId);
    const splat =
      world.assets?.splats?.spz_urls?.["500k"] ??
      world.assets?.splats?.spz_urls?.full_res ??
      world.assets?.splats?.spz_urls?.["100k"];
    if (!splat) {
      return NextResponse.json({ error: "World has no splat yet." }, { status: 400 });
    }

    const session = await createSupabaseServerClient();
    const {
      data: { user },
    } = await session.auth.getUser();

    const admin = createSupabaseServiceClient();
    const { data, error } = await admin.rpc("publish_world", {
      p_repo_url: repoUrl,
      p_branch: body.branch?.trim() || "main",
      p_repo_name: body.repoName ?? world.display_name,
      p_world_labs_id: worldLabsId,
      p_splat_url: splat,
      p_thumbnail_url: world.assets?.thumbnail_url ?? null,
      p_caption: world.assets?.caption ?? null,
      p_marble_url: world.world_marble_url ?? null,
      p_pano_url: world.assets?.imagery?.pano_url ?? null,
      p_is_public: body.isPublic !== false,
      p_user_id: user?.id ?? null,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ id: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Publish failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as { id?: string; isPublic?: boolean };
    if (!body.id || typeof body.isPublic !== "boolean") {
      return NextResponse.json({ error: "Invalid update." }, { status: 400 });
    }
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from("worlds")
      .update({ is_public: body.isPublic })
      .eq("id", body.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Update failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
