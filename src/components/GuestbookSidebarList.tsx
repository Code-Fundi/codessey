"use client";

import { PenLine } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useWorldSignatures } from "@/hooks/useWorldSignatures";
import type { WorldSignatureRow } from "@/lib/database.types";

interface GuestbookSidebarListProps {
  worldId: string | null;
  refreshNonce?: number;
}

export function GuestbookSidebarList({ worldId, refreshNonce = 0 }: GuestbookSidebarListProps) {
  const { signatures, loading, error } = useWorldSignatures(worldId, refreshNonce);

  return (
    <>
      <p className="px-1 pb-3 text-[10px] uppercase tracking-[0.14em] text-white/40 font-medium">
        Guestbook
      </p>
      <ul className="space-y-2 p-1">
        {error && (
          <li>
            <div className="text-sm text-red-300/80 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
              {error}
            </div>
          </li>
        )}
        {loading && !signatures.length && (
          <li>
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full bg-white/[0.06]" />
              ))}
            </div>
          </li>
        )}
        {!loading && !signatures.length && !error && (
          <li>
            <p className="text-sm text-white/45 p-3">
              No guestbook signatures yet. Sign the guestbook from the landscape.
            </p>
          </li>
        )}
        {signatures.map((entry) => (
          <li key={entry.id}>
            <GuestbookSidebarCard entry={entry} />
          </li>
        ))}
      </ul>
    </>
  );
}

function GuestbookSidebarCard({ entry }: { entry: WorldSignatureRow }) {
  return (
    <div className="w-full text-left rounded-xl p-3 border border-white/5 bg-white/[0.03]">
      <div className="flex items-center gap-2">
        {entry.signature_png ? (
          <img
            src={entry.signature_png}
            alt=""
            className="h-10 w-10 rounded-md object-contain bg-white"
          />
        ) : (
          <PenLine size={16} className="text-white/40" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white truncate">@{entry.github_username}</p>
          <p className="text-[11px] text-white/55 line-clamp-2">{entry.message}</p>
        </div>
      </div>
    </div>
  );
}
