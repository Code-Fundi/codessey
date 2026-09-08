"use client";

import { useCallback, useEffect, useState } from "react";
import type { WorldSignatureRow } from "@/lib/database.types";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { SIGNATURE_SELECT } from "@/lib/worlds.client";

export function useWorldSignatures(worldId: string | null | undefined, refreshNonce = 0) {
  const [signatures, setSignatures] = useState<WorldSignatureRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(() => {
    if (!worldId) {
      setSignatures([]);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        const { data, error: queryError } = await supabase
          .from("world_signatures")
          .select(SIGNATURE_SELECT)
          .eq("world_id", worldId)
          .order("created_at", { ascending: false });
        if (queryError) throw new Error(queryError.message);
        setSignatures((data ?? []) as WorldSignatureRow[]);
      } catch (err: unknown) {
        setSignatures([]);
        setError(err instanceof Error ? err.message : "Failed to load guestbook.");
      } finally {
        setLoading(false);
      }
    })();
  }, [worldId]);

  useEffect(() => {
    refetch();
  }, [refetch, refreshNonce]);

  return { signatures, loading, error, refetch };
}
