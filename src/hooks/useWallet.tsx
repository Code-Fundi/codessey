"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import type { CreditTick } from "@/lib/credit-status";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const EMPTY: CreditTick = {
  ok: true,
  balance: 0,
  paidBalance: 0,
  freeBalance: 0,
  nextRefreshAt: new Date(0).toISOString(),
  secondsUntilRefresh: 0,
  source: "ip",
  error: null,
};

interface WalletValue {
  user: User | null;
  balance: number;
  paidBalance: number;
  freeBalance: number;
  secondsUntilRefresh: number;
  nextRefreshAt: string;
  credits: CreditTick;
  loading: boolean;
  refresh: () => Promise<void>;
}

const WalletContext = createContext<WalletValue | null>(null);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [credits, setCredits] = useState<CreditTick>(EMPTY);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
        const supabase = createSupabaseBrowserClient();
        const {
          data: { user: nextUser },
        } = await supabase.auth.getUser();
        setUser(nextUser);
      }
      const res = await fetch("/api/credits/status");
      if (res.ok) {
        setCredits((await res.json()) as CreditTick);
      }
    } catch {
      /* local preview without supabase */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(), 60_000);
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      return () => window.clearInterval(interval);
    }
    const supabase = createSupabaseBrowserClient();
    const { data } = supabase.auth.onAuthStateChange(() => {
      void refresh();
    });
    return () => {
      window.clearInterval(interval);
      data.subscription.unsubscribe();
    };
  }, [refresh]);

  const value = useMemo<WalletValue>(
    () => ({
      user,
      balance: credits.balance,
      paidBalance: credits.paidBalance,
      freeBalance: credits.freeBalance,
      secondsUntilRefresh: credits.secondsUntilRefresh,
      nextRefreshAt: credits.nextRefreshAt,
      credits,
      loading,
      refresh,
    }),
    [user, credits, loading, refresh],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletValue {
  const ctx = useContext(WalletContext);
  if (!ctx) {
    throw new Error("useWallet must be used within WalletProvider.");
  }
  return ctx;
}
