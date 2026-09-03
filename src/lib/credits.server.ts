import { NextResponse } from "next/server";
import { getRequestIp, hashIp } from "@/lib/request-ip";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase/server";
import type { CreditTick } from "@/lib/credit-status";

type TickRow = {
  ok: boolean;
  balance: number;
  paid_balance: number;
  free_balance: number;
  next_refresh_at: string;
  seconds_until_refresh: number;
  source: string;
  error: string | null;
};

function mapTick(row: TickRow | undefined): CreditTick {
  return {
    ok: Boolean(row?.ok),
    balance: row?.balance ?? 0,
    paidBalance: row?.paid_balance ?? 0,
    freeBalance: row?.free_balance ?? 0,
    nextRefreshAt: row?.next_refresh_at ?? new Date().toISOString(),
    secondsUntilRefresh: row?.seconds_until_refresh ?? 0,
    source: row?.source === "wallet" ? "wallet" : "ip",
    error: row?.error ?? null,
  };
}

export async function tickCredits(request: Request, consume: boolean): Promise<CreditTick> {
  const ipHash = hashIp(getRequestIp(request));
  let userId: string | null = null;
  try {
    const session = await createSupabaseServerClient();
    const {
      data: { user },
    } = await session.auth.getUser();
    userId = user?.id ?? null;
  } catch {
    userId = null;
  }

  const admin = createSupabaseServiceClient();
  const { data, error } = await admin.rpc("tick_credits_as", {
    p_ip_hash: ipHash,
    p_user_id: userId,
    p_consume: consume,
  });
  if (error) {
    throw new Error(error.message);
  }
  const row = (data as TickRow[] | null)?.[0];
  return mapTick(row);
}

export function creditResponse(tick: CreditTick, status = 200) {
  return NextResponse.json(tick, { status });
}
