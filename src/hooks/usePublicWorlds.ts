"use client";

import { useCallback, useEffect, useState } from "react";
import type { WorldRow } from "@/lib/database.types";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { sanitizeWorldSearch } from "@/lib/world-search";
import { WORLD_SELECT } from "@/lib/worlds.client";

export function usePublicWorlds(enabled: boolean, query = "") {
  const [worlds, setWorlds] = useState<WorldRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(() => {
    if (!enabled) return;
    const q = sanitizeWorldSearch(query);
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        let request = supabase
          .from("worlds")
          .select(WORLD_SELECT)
          .eq("is_public", true)
          .eq("status", "complete")
          .order("created_at", { ascending: false })
          .limit(40);
        if (q) {
          request = request.or(`repo_name.ilike.%${q}%,repo_url.ilike.%${q}%,caption.ilike.%${q}%`);
        }
        const { data, error: queryError } = await request;
        if (queryError) throw new Error(queryError.message);
        setWorlds((data ?? []) as WorldRow[]);
      } catch (err: unknown) {
        setWorlds([]);
        setError(err instanceof Error ? err.message : "Failed to load worlds.");
      } finally {
        setLoading(false);
      }
    })();
  }, [enabled, query]);

  useEffect(() => {
    if (!enabled) return;
    const timer = window.setTimeout(() => {
      refetch();
    }, 200);
    return () => window.clearTimeout(timer);
  }, [enabled, refetch]);

  return { worlds, loading, error, refetch };
}
