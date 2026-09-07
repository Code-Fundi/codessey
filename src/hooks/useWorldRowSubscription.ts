"use client";

import { useEffect } from "react";
import type { WorldRow } from "@/lib/database.types";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function useWorldRowSubscription(
  worldId: string | null | undefined,
  onRow: (row: WorldRow) => void,
) {
  useEffect(() => {
    if (!worldId) return;
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      return;
    }

    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`world:${worldId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "worlds", filter: `id=eq.${worldId}` },
        async () => {
          const { data } = await supabase
            .from("worlds")
            .select("*")
            .eq("id", worldId)
            .maybeSingle();
          if (data) onRow(data as WorldRow);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [worldId, onRow]);
}
