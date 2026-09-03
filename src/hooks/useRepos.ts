import { useCallback, useEffect, useState } from "react";
import type { Repository } from "@/lib/codefundi.client";
import { REPOS_PER_PAGE } from "@/lib/api";
import { listMockRepos } from "@/lib/mockRepos";

const INITIAL_PAGE = listMockRepos({ limit: REPOS_PER_PAGE, offset: 0 });

export function useRepos() {
  const [repos, setRepos] = useState<Repository[]>(() => INITIAL_PAGE.data ?? []);
  const [offset, setOffset] = useState(() => INITIAL_PAGE.data?.length ?? 0);
  const [hasMore, setHasMore] = useState(() => Boolean(INITIAL_PAGE.pagination?.has_more));
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPage = useCallback((nextOffset: number, append: boolean) => {
    try {
      if (append) setLoadingMore(true);
      else setLoading(true);

      const res = listMockRepos({
        limit: REPOS_PER_PAGE,
        offset: nextOffset,
      });
      const data = res.data ?? [];
      setRepos((prev) => (append ? [...prev, ...data] : data));
      setHasMore(Boolean(res.pagination?.has_more));
      setOffset(nextOffset + data.length);
      setError(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    fetchPage(0, false);
  }, [fetchPage]);

  const loadMore = useCallback(() => {
    if (!hasMore || loadingMore) return;
    fetchPage(offset, true);
  }, [hasMore, loadingMore, offset, fetchPage]);

  return { repos, loading, loadingMore, hasMore, error, loadMore };
}
