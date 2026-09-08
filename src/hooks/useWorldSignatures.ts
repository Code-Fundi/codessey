"use client";

import { useCallback, useEffect, useState } from "react";
import type { WorldSignatureRow } from "@/lib/database.types";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function useWorldSignatures(worldId: string | null | undefined) {
  const [signatures, setSignatures] = useState<WorldSignatureRow[]>([]);
  const [loading, setLoading] = useState(false);

  const refetch = useCallback(() => {
    if (!worldId) {
      setSignatures([]);
      return;
    }
    setLoading(true);
    void (async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        const { data, error } = await supabase
          .from("world_signatures")
          .select("id,world_id,user_id,github_username,message,signature_png,created_at")
          .eq("world_id", worldId)
          .order("created_at", { ascending: false });
        if (error) throw new Error(error.message);
        setSignatures((data ?? []) as WorldSignatureRow[]);
      } catch {
        setSignatures([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [worldId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { signatures, loading, refetch };
}
