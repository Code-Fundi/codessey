"use client";

import { useCallback, useEffect, useState } from "react";
import type { WorldRow } from "@/lib/database.types";
import { sanitizeWorldSearch } from "@/lib/world-search";

export function usePublicWorlds(enabled: boolean, query = "") {
  const [worlds, setWorlds] = useState<WorldRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(() => {
    if (!enabled) return;
    const q = sanitizeWorldSearch(query);
    const url = q ? `/api/worlds?q=${encodeURIComponent(q)}` : "/api/worlds";
    setLoading(true);
    setError(null);
    fetch(url)
      .then(async (res) => {
        const body = (await res.json()) as { worlds?: WorldRow[]; error?: string };
        if (!res.ok) throw new Error(body.error || "Failed to load worlds.");
        return body.worlds ?? [];
      })
      .then((rows) => {
        setWorlds(rows);
      })
      .catch((err: unknown) => {
        setWorlds([]);
        setError(err instanceof Error ? err.message : "Failed to load worlds.");
      })
      .finally(() => {
        setLoading(false);
      });
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
