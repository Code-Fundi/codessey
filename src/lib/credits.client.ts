import type { AppConfigRow, CoinPackRow } from "@/lib/database.types";
import { catalogPackFromRow, type DisplayCoinPack } from "@/lib/credits";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export interface CoinCatalog {
  packs: DisplayCoinPack[];
  customMinUsd: number;
  centsPerCoin: number;
}

const CATALOG_SELECT = "id,label,usd_cents,coins,sort_order,accent";
const CONFIG_KEYS = ["custom_min_usd_cents", "custom_cents_per_coin"] as const;

function intConfig(rows: AppConfigRow[], key: string, fallback: number): number {
  const value = rows.find((row) => row.key === key)?.value_int;
  return Number.isFinite(value) && (value as number) > 0 ? (value as number) : fallback;
}

/** Public catalog via RLS SELECT on coin_packs + app_config. Checkout still prices via RPC. */
export async function fetchCoinCatalog(): Promise<CoinCatalog> {
  const supabase = createSupabaseBrowserClient();
  const [packsRes, configRes] = await Promise.all([
    supabase.from("coin_packs").select(CATALOG_SELECT).order("sort_order", { ascending: true }),
    supabase
      .from("app_config")
      .select("key,value_int")
      .in("key", [...CONFIG_KEYS]),
  ]);
  if (packsRes.error) throw new Error(packsRes.error.message);
  if (configRes.error) throw new Error(configRes.error.message);

  const packs = ((packsRes.data ?? []) as CoinPackRow[]).map(catalogPackFromRow);
  const config = (configRes.data ?? []) as AppConfigRow[];
  const minCents = intConfig(config, "custom_min_usd_cents", 500);
  const centsPerCoin = intConfig(config, "custom_cents_per_coin", 50);

  return {
    packs,
    customMinUsd: minCents / 100,
    centsPerCoin,
  };
}
