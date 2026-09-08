"use client";

import { useEffect } from "react";
import type { WorldRow } from "@/lib/database.types";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { WORLD_SELECT } from "@/lib/worlds.client";

export function useWorldRowSubscription(
  worldId: string | null | undefined,
  onRow: (row: WorldRow) => void,
) {
  useWorldRowsSubscription(worldId ? [worldId] : [], onRow);
}

export function useWorldRowsSubscription(worldIds: string[], onRow: (row: WorldRow) => void) {
  const key = [...new Set(worldIds.filter(Boolean))].sort().join(",");

  useEffect(() => {
    const ids = key ? key.split(",") : [];
    if (!ids.length) return;
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      return;
    }

    const supabase = createSupabaseBrowserClient();
    const channels = ids.map((worldId) =>
      supabase
        .channel(`world:${worldId}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "worlds", filter: `id=eq.${worldId}` },
          async () => {
            const { data } = await supabase
              .from("worlds")
              .select(WORLD_SELECT)
              .eq("id", worldId)
              .maybeSingle();
            if (data) onRow(data as WorldRow);
          },
        )
        .subscribe(),
    );

    return () => {
      for (const channel of channels) {
        void supabase.removeChannel(channel);
      }
    };
  }, [key, onRow]);
}
