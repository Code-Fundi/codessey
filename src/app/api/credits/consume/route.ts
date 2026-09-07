import { tickCredits, creditResponse } from "@/lib/credits.server";
import { POSTCARD_COINS } from "@/lib/generation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const session = await createSupabaseServerClient();
    const {
      data: { user },
    } = await session.auth.getUser();
    if (!user) {
      return creditResponse(
        {
          ok: false,
          balance: 0,
          paidBalance: 0,
          freeBalance: 0,
          nextRefreshAt: new Date().toISOString(),
          secondsUntilRefresh: 0,
          source: "none",
          error: "not_authenticated",
        },
        401,
      );
    }

    let amount = POSTCARD_COINS;
    try {
      const body = (await request.json()) as { amount?: unknown };
      if (body.amount != null && body.amount !== POSTCARD_COINS) {
        return creditResponse(
          {
            ok: false,
            balance: 0,
            paidBalance: 0,
            freeBalance: 0,
            nextRefreshAt: new Date().toISOString(),
            secondsUntilRefresh: 0,
            source: "none",
            error: "invalid_amount",
          },
          400,
        );
      }
      if (body.amount === POSTCARD_COINS) amount = POSTCARD_COINS;
    } catch {
      amount = POSTCARD_COINS;
    }

    const tick = await tickCredits(request, true, amount);
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
