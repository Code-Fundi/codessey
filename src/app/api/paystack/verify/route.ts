import { NextResponse } from "next/server";
import { verifyPaystackTransaction } from "@/lib/paystack.server";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase/server";
import type { CreditPackResult } from "@/lib/database.types";

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    }

    const { reference } = (await request.json()) as { reference?: string };
    if (!reference) {
      return NextResponse.json({ error: "Missing reference." }, { status: 400 });
    }

    const verified = await verifyPaystackTransaction(reference);
    if (verified.data.status !== "success") {
      return NextResponse.json({ error: "Payment is not successful yet." }, { status: 400 });
    }

    const admin = createSupabaseServiceClient();
    const { data: payment, error: paymentError } = await admin
      .from("payments")
      .select("user_id")
      .eq("reference", reference)
      .maybeSingle();
    if (paymentError || !payment || (payment as { user_id: string }).user_id !== user.id) {
      return NextResponse.json({ error: "Payment not found." }, { status: 404 });
    }

    const { data, error } = await admin.rpc("credit_pack", {
      p_reference: reference,
      p_paystack_transaction_id: verified.data.id,
      p_paid_amount: verified.data.amount,
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      credited: (data as CreditPackResult[] | null)?.[0]?.credited ?? false,
      balance: (data as CreditPackResult[] | null)?.[0]?.balance ?? 0,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Verification failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
