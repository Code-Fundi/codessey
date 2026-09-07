import type { CoinPackId } from "@/lib/database.types";
import { CUSTOM_CENTS_PER_COIN } from "@/lib/generation";

export const PRESET_PACKS: Array<{
  id: Exclude<CoinPackId, "custom">;
  usd: number;
  usdCents: number;
  coins: number;
  accent: "amber" | "emerald" | "violet";
  coinStack: 1 | 2 | 3;
}> = [
  { id: "p10", usd: 5, usdCents: 500, coins: 10, accent: "amber", coinStack: 1 },
  { id: "p20", usd: 10, usdCents: 1000, coins: 20, accent: "emerald", coinStack: 2 },
  { id: "p40", usd: 20, usdCents: 2000, coins: 40, accent: "violet", coinStack: 3 },
];

export const CUSTOM_MIN_USD = 5;

export function resolvePackAmount(
  packId: CoinPackId,
  customUsd?: number,
): {
  usdCents: number;
  coins: number;
  packId: CoinPackId;
} {
  if (packId !== "custom") {
    const preset = PRESET_PACKS.find((p) => p.id === packId);
    if (!preset) {
      throw new Error("Unknown pack.");
    }
    return { usdCents: preset.usdCents, coins: preset.coins, packId };
  }

  const usd = Number(customUsd);
  if (!Number.isFinite(usd) || usd < CUSTOM_MIN_USD) {
    throw new Error(`Custom amount must be at least $${CUSTOM_MIN_USD}.`);
  }
  const usdCents = Math.round(usd * 100);
  if (usdCents % 100 !== 0) {
    throw new Error("Custom amount must be a whole dollar amount.");
  }
  if (usdCents % CUSTOM_CENTS_PER_COIN !== 0) {
    throw new Error("Custom amount must align with the coin rate.");
  }
  return { usdCents, coins: usdCents / CUSTOM_CENTS_PER_COIN, packId: "custom" };
}
