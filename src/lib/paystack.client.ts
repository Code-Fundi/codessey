import PaystackPop from "@paystack/inline-js";
import type { CoinPackId, PaymentRow } from "@/lib/database.types";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export interface CheckoutSelection {
  packId: CoinPackId;
  customUsd?: number;
}

export interface InitializeCheckoutResponse {
  accessCode: string;
  reference: string;
  amount: number;
  coins: number;
  packId: CoinPackId;
}

function loadPaystack(): Promise<typeof PaystackPop> {
  return import("@paystack/inline-js").then((mod) => mod.default);
}

export class PaystackBrowserClient {
  async initializeCheckout(selection: CheckoutSelection): Promise<InitializeCheckoutResponse> {
    const res = await fetch("/api/paystack/initialize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(selection),
    });
    const body = (await res.json()) as InitializeCheckoutResponse & { error?: string };
    if (!res.ok) {
      throw new Error(body.error || "Failed to start checkout.");
    }
    return body;
  }

  async openCheckout(params: {
    accessCode: string;
    reference: string;
    onSuccess: (reference: string) => void;
    onCancel: () => void;
  }): Promise<void> {
    const PaystackPop = await loadPaystack();
    const popup = new PaystackPop();
    popup.resumeTransaction(params.accessCode, {
      onSuccess: () => params.onSuccess(params.reference),
      onCancel: params.onCancel,
    });
  }

  async verify(reference: string): Promise<{ balance: number }> {
    const res = await fetch("/api/paystack/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reference }),
    });
    const body = (await res.json()) as { balance?: number; error?: string };
    if (!res.ok) {
      throw new Error(body.error || "Failed to verify payment.");
    }
    return { balance: body.balance ?? 0 };
  }

  async listPayments(): Promise<PaymentRow[]> {
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase
      .from("payments")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);
    return (data ?? []) as PaymentRow[];
  }

  async failPayment(reference: string): Promise<void> {
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.rpc("fail_payment", { p_reference: reference });
    if (error) throw new Error(error.message);
  }
}

export const paystackBrowserClient = new PaystackBrowserClient();
