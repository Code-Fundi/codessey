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
    expect(read("src/hooks/useWorldGeneration.tsx")).not.toMatch(/\/api\/worldlabs/);
    expect(read(".env.example")).not.toMatch(/WORLDLABS_API_KEY/);
    expect(read("src/hooks/useWorldGeneration.tsx")).toMatch(/MISSING_WORLD_LABS_KEY/);
  });

  it("signs the guestbook from the browser with one coin", () => {
    expect(existsSync(resolve(root, "src/app/api/credits/consume/route.ts"))).toBe(false);
    expect(read("src/lib/generation.ts")).toMatch(/GUESTBOOK_COINS = 1/);
    expect(read("src/components/WorldViewer.tsx")).toMatch(/sign_guestbook/);
    expect(read("src/hooks/useWallet.tsx")).toMatch(/get_my_wallet/);
  });

  it("reads wallet balance from get_my_wallet instead of a status route", () => {
    expect(existsSync(resolve(root, "src/app/api/credits/status/route.ts"))).toBe(false);
    expect(read("src/hooks/useWallet.tsx")).toMatch(/get_my_wallet/);
    expect(read("src/hooks/useWallet.tsx")).not.toMatch(/\/api\/credits\/status/);
  });

  it("creates checkout with create_my_payment and keeps the Paystack webhook", () => {
    expect(existsSync(resolve(root, "src/app/api/paystack/initialize/route.ts"))).toBe(false);
    expect(existsSync(resolve(root, "src/app/api/paystack/verify/route.ts"))).toBe(false);
    expect(existsSync(resolve(root, "src/app/api/paystack/webhook/route.ts"))).toBe(true);
    expect(read("src/lib/paystack.client.ts")).toMatch(/create_my_payment/);
  });

  it("generates worlds through publishable-key RPCs", () => {
    expect(existsSync(resolve(root, "src/app/api/worlds/lookup/route.ts"))).toBe(false);
    expect(existsSync(resolve(root, "src/app/api/worlds/pending/route.ts"))).toBe(false);
    expect(existsSync(resolve(root, "src/app/api/worlds/apply/route.ts"))).toBe(false);
    expect(read("src/lib/worlds.client.ts")).toMatch(/lookup_world_by_repo_url/);
    expect(read("src/lib/worlds.client.ts")).toMatch(/pre_save_pending_world/);
    expect(read("src/lib/worlds.client.ts")).toMatch(/apply_world_poll_result/);
  });

  it("re-enables signup grant of 2 coins in the postcard migration", () => {
    const sql = read("supabase/migrations/20260906190000_postcard_credits_realtime.sql");
    expect(sql).toMatch(/perform public\.grant_signup_coins\(new\.id\)/);
    expect(sql).toMatch(/'free_gen_coins', 2/);
    expect(sql).toMatch(/'postcard_download'/);
    expect(sql).toMatch(/status in \('complete', 'pending'\)/);
  });
});
