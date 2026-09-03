import { describe, expect, it } from "vitest";
import { CUSTOM_MIN_USD, PRESET_PACKS, resolvePackAmount } from "./credits";

describe("resolvePackAmount", () => {
  it("maps preset packs to cents and bonus coins", () => {
    expect(resolvePackAmount("p10")).toEqual({ usdCents: 500, coins: 10, packId: "p10" });
    expect(resolvePackAmount("p20")).toEqual({ usdCents: 1000, coins: 20, packId: "p20" });
    expect(resolvePackAmount("p40")).toEqual({ usdCents: 2000, coins: 40, packId: "p40" });
  });

  it("keeps preset catalog aligned with SQL seed", () => {
    expect(PRESET_PACKS.map((p) => p.id)).toEqual(["p10", "p20", "p40"]);
    expect(PRESET_PACKS.every((p) => p.usdCents === p.usd * 100)).toBe(true);
  });

  it("converts custom whole-dollar amounts at $1 per coin", () => {
    expect(resolvePackAmount("custom", 15)).toEqual({
      usdCents: 1500,
      coins: 15,
      packId: "custom",
    });
  });

  it("rejects custom amounts below the minimum", () => {
    expect(() => resolvePackAmount("custom", CUSTOM_MIN_USD - 1)).toThrow(/at least/);
    expect(() => resolvePackAmount("custom", Number.NaN)).toThrow(/at least/);
  });

  it("rejects fractional custom dollars", () => {
    expect(() => resolvePackAmount("custom", 5.5)).toThrow(/whole dollar/);
  });
});
