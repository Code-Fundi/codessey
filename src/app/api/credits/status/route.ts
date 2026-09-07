import { tickCredits, creditResponse } from "@/lib/credits.server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    let signedIn = false;
    try {
      const session = await createSupabaseServerClient();
      const {
        data: { user },
      } = await session.auth.getUser();
      signedIn = Boolean(user);
    } catch {
      signedIn = false;
    }

    if (!signedIn) {
      return creditResponse({
        ok: true,
        balance: 0,
        paidBalance: 0,
        freeBalance: 0,
        nextRefreshAt: new Date().toISOString(),
        secondsUntilRefresh: 0,
        source: "none",
        error: null,
      });
    }

    const tick = await tickCredits(request, false);
    return creditResponse(tick);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Credit status failed.";
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
