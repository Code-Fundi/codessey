import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
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
        "id,user_id,repo_url,repo_url_norm,branch,repo_name,world_labs_id,operation_id,status,progress,splat_url,thumbnail_url,caption,marble_url,pano_url,generation_mode,billing_source,is_public,created_at,updated_at",
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
      query = query.eq("is_public", true).eq("status", "complete");
    }

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ worlds: (data ?? []) as WorldRow[] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "List failed.";
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
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Sign in to update a world." }, { status: 401 });
    }
    const { error } = await supabase
      .from("worlds")
      .update({ is_public: body.isPublic })
      .eq("id", body.id)
      .eq("user_id", user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Update failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
