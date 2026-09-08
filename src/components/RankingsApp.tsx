"use client";

import { useCallback, useEffect, useState } from "react";
import { Header } from "@/components/Header";
import type { CreditsDialogReason } from "@/components/CreditPurchaseDialog";
import type { WorldRankingSnapshotRow, WorldRow } from "@/lib/database.types";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { parseGithubOwnerRepo, repoNameFromUrl } from "@/lib/repo-url";
import Link from "next/link";

type RankedWorld = WorldRankingSnapshotRow & {
  worlds:
    | Pick<WorldRow, "repo_url" | "repo_name" | "thumbnail_url" | "pano_url">
    | Pick<WorldRow, "repo_url" | "repo_name" | "thumbnail_url" | "pano_url">[]
    | null;
};

function nestedWorld(row: RankedWorld) {
  const value = row.worlds;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

function WorldRankCard({
  row,
  metric,
  rank,
}: {
  row: RankedWorld;
  metric: "visits" | "signatures";
  rank: number;
}) {
  const world = nestedWorld(row);
  const url = world?.repo_url ?? "";
  const parsed = parseGithubOwnerRepo(url);
  const path = parsed ? `/${parsed.owner}/${parsed.repo}` : "/";
  const name = repoNameFromUrl(url) ?? world?.repo_name ?? "World";
  const thumb = world?.pano_url || world?.thumbnail_url;
  const count = metric === "visits" ? row.visit_count : row.signature_count;

  return (
    <li>
      <Link
        href={path}
        className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.03] p-3 hover:bg-white/[0.06]"
      >
        <span className="w-7 text-sm tabular-nums text-white/45">{rank}</span>
        {thumb ? (
          <img src={thumb} alt="" className="h-10 w-10 rounded-md object-cover" />
        ) : (
          <div className="h-10 w-10 rounded-md bg-white/10" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white truncate">{name}</p>
          <p className="text-[11px] text-white/45 truncate">{parsed?.owner ?? url}</p>
        </div>
        <p className="text-sm tabular-nums text-white/80">{count}</p>
      </Link>
    </li>
  );
}

export function RankingsApp() {
  const [creditsOpen, setCreditsOpen] = useState(false);
  const [creditsReason, setCreditsReason] = useState<CreditsDialogReason>("purchase");
  const [rows, setRows] = useState<RankedWorld[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const handleCreditsOpenChange = useCallback((open: boolean, reason?: CreditsDialogReason) => {
    if (reason) setCreditsReason(reason);
    if (!open) setCreditsReason("purchase");
    setCreditsOpen(open);
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        await supabase.rpc("snapshot_world_rankings");
        const { data, error: queryError } = await supabase
          .from("world_ranking_snapshots")
          .select(
            "id,world_id,visit_count,signature_count,rank_visits,rank_populated,snapshot_at,is_stale,worlds(repo_url,repo_name,thumbnail_url,pano_url)",
          )
          .eq("is_stale", false);
        if (queryError) throw new Error(queryError.message);
        setRows((data ?? []) as RankedWorld[]);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Could not load rankings.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const byVisits = [...rows].sort((a, b) => a.rank_visits - b.rank_visits);
  const bySignatures = [...rows].sort((a, b) => a.rank_populated - b.rank_populated);

  return (
    <div className="min-h-screen bg-[#090C10] text-foreground">
      <Header
        creditsOpen={creditsOpen}
        creditsReason={creditsReason}
        onCreditsOpenChange={handleCreditsOpenChange}
      />
      <main className="pt-20 px-4 pb-10 max-w-5xl mx-auto">
        <h1 className="font-display text-2xl font-extrabold tracking-[0.12em]">Rankings</h1>
        <p className="mt-2 text-sm text-white/55">
          Most visited in the last 24 hours, and most guestbook signatures overall. Snapshots roll
          at most once a day.
        </p>
        {error && (
          <p className="mt-4 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200">
            {error}
          </p>
        )}
        {loading && <p className="mt-6 text-sm text-white/45">Loading ranks…</p>}
        <div className="mt-8 grid gap-8 md:grid-cols-2">
          <section>
            <h2 className="text-xs uppercase tracking-[0.18em] text-white/40">Most visited</h2>
            <ul className="mt-3 space-y-2">
              {byVisits.map((row) => (
                <WorldRankCard
                  key={`v-${row.id}`}
                  row={row}
                  metric="visits"
                  rank={row.rank_visits}
                />
              ))}
              {!loading && !byVisits.length && (
                <li className="text-sm text-white/45">No visits recorded yet.</li>
              )}
            </ul>
          </section>
          <section>
            <h2 className="text-xs uppercase tracking-[0.18em] text-white/40">Most populated</h2>
            <ul className="mt-3 space-y-2">
              {bySignatures.map((row) => (
                <WorldRankCard
                  key={`s-${row.id}`}
                  row={row}
                  metric="signatures"
                  rank={row.rank_populated}
                />
              ))}
              {!loading && !bySignatures.length && (
                <li className="text-sm text-white/45">No signatures recorded yet.</li>
              )}
            </ul>
          </section>
        </div>
      </main>
    </div>
  );
}
