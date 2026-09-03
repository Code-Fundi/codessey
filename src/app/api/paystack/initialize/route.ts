import { NextResponse } from "next/server";
import type { CoinPackId } from "@/lib/database.types";
import { resolvePackAmount } from "@/lib/credits";
import {
  createPaymentReference,
  getPaystackCurrency,
  initializePaystackTransaction,
} from "@/lib/paystack.server";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.email) {
      return NextResponse.json({ error: "Sign in to purchase coins." }, { status: 401 });
    }

    const body = (await request.json()) as { packId?: CoinPackId; customUsd?: number };
    const pack = resolvePackAmount(body.packId ?? "p10", body.customUsd);
    const reference = createPaymentReference(user.id);
    const currency = getPaystackCurrency();

    const initialized = await initializePaystackTransaction({
      email: user.email,
      amount: pack.usdCents,
      reference,
      currency,
      metadata: {
        user_id: user.id,
        pack_id: pack.packId,
        coins: pack.coins,
        custom_fields: [
          {
            display_name: "Codessey pack",
            variable_name: "pack_id",
            value: pack.packId,
          },
        ],
      },
    });

    const admin = createSupabaseServiceClient();
    const { error } = await admin.rpc("create_payment", {
      p_reference: initialized.data.reference,
      p_amount: pack.usdCents,
      p_currency: currency,
      p_pack_id: pack.packId,
      p_access_code: initialized.data.access_code,
      p_user_id: user.id,
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      accessCode: initialized.data.access_code,
      reference: initialized.data.reference,
      amount: pack.usdCents,
      coins: pack.coins,
      packId: pack.packId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to start checkout.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
