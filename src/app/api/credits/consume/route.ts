import { tickCredits, creditResponse } from "@/lib/credits.server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const tick = await tickCredits(request, true);
    const status = tick.ok ? 200 : tick.error === "rate_limited" ? 429 : 402;
    return creditResponse(tick, status);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Consume failed.";
    return creditResponse(
      {
        ok: false,
        balance: 0,
        paidBalance: 0,
        freeBalance: 0,
        nextRefreshAt: new Date().toISOString(),
        secondsUntilRefresh: 0,
        source: "none",
        error: message,
      },
      500,
    );
  }
}
