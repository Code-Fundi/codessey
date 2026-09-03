import { NextResponse } from "next/server";
import { verifyPaystackSignature, type PaystackWebhookEvent } from "@/lib/paystack.server";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-paystack-signature");
  const valid = verifyPaystackSignature(rawBody, signature);

  let event: PaystackWebhookEvent | null = null;
  try {
    event = JSON.parse(rawBody) as PaystackWebhookEvent;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const admin = createSupabaseServiceClient();
  const reference = event.data?.reference ?? null;

  await admin.rpc("record_paystack_event", {
    p_event: event.event,
    p_reference: reference,
    p_signature_valid: valid,
    p_payload: event as unknown as import("@/lib/database.types").Json,
  });

  if (!valid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  if (event.event === "charge.success" && event.data?.status === "success" && reference) {
    const { error } = await admin.rpc("credit_pack", {
      p_reference: reference,
      p_paystack_transaction_id: event.data.id,
      p_paid_amount: event.data.amount,
    });
    if (error && !/payment_not_found|payment_not_creditable/i.test(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  if (reference) {
    await admin
      .from("paystack_events")
      .update({ processed_at: new Date().toISOString() })
      .eq("event", event.event)
      .eq("reference", reference);
  }

  return NextResponse.json({ received: true });
}
