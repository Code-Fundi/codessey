import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel: string) => readFileSync(resolve(root, rel), "utf8");

describe("plan credit contracts", () => {
  it("does not proxy World Labs with a server API key", () => {
    expect(existsSync(resolve(root, "src/app/api/worldlabs/generate/route.ts"))).toBe(false);
    expect(read("src/lib/providers.server.ts")).not.toMatch(/WORLDLABS_API_KEY|getServerWorldLabs/);
    expect(read("src/hooks/useWorldGeneration.ts")).not.toMatch(/\/api\/worldlabs/);
    expect(read(".env.example")).not.toMatch(/WORLDLABS_API_KEY/);
    expect(read("src/hooks/useWorldGeneration.ts")).toMatch(/MISSING_WORLD_LABS_KEY/);
  });

  it("requires a session and amount 1 for postcard consume", () => {
    const file = read("src/app/api/credits/consume/route.ts");
    expect(file).toMatch(/getUser/);
    expect(file).toMatch(/POSTCARD_COINS/);
    expect(file).toMatch(/401/);
  });

  it("returns a 0 balance for unauthenticated status", () => {
    const file = read("src/app/api/credits/status/route.ts");
    expect(file).toMatch(/signedIn/);
    expect(file).toMatch(/balance: 0/);
  });

  it("re-enables signup grant of 2 coins in the postcard migration", () => {
    const sql = read("supabase/migrations/20260906190000_postcard_credits_realtime.sql");
    expect(sql).toMatch(/perform public\.grant_signup_coins\(new\.id\)/);
    expect(sql).toMatch(/'free_gen_coins', 2/);
    expect(sql).toMatch(/'postcard_download'/);
    expect(sql).toMatch(/status in \('complete', 'pending'\)/);
  });
});
