import PaystackPop from "@paystack/inline-js";
import type {
  CoinPackId,
  CreateMyPaymentResult,
  MyWalletResult,
  PaymentRow,
} from "@/lib/database.types";
import { firstRpcRow } from "@/lib/rpc";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export interface CheckoutSelection {
  packId: CoinPackId;
  customUsd?: number;
}

export interface InitializeCheckoutResponse {
  reference: string;
  amount: number;
  coins: number;
  packId: CoinPackId;
  email: string;
  publicKey: string;
  currency: string;
}

function loadPaystack(): Promise<typeof PaystackPop> {
  return import("@paystack/inline-js").then((mod) => mod.default);
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function getPublicKey(): string {
  const key = process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY ?? "";
  if (!key) throw new Error("NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY is not configured.");
  return key;
}

export class PaystackBrowserClient {
  async initializeCheckout(selection: CheckoutSelection): Promise<InitializeCheckoutResponse> {
    const supabase = createSupabaseBrowserClient();
    const customCents =
      selection.packId === "custom" && selection.customUsd != null
        ? Math.round(selection.customUsd * 100)
        : null;
    const { data, error } = await supabase.rpc("create_my_payment", {
      p_pack_id: selection.packId,
      p_custom_cents: customCents,
    });
    const row = firstRpcRow(data as CreateMyPaymentResult | CreateMyPaymentResult[] | null);
    if (error || !row) {
      throw new Error(error?.message || "Failed to start checkout.");
    }
    return {
      reference: row.reference,
      amount: row.amount,
      coins: row.coins,
      packId: row.pack_id as CoinPackId,
      email: row.email,
      publicKey: getPublicKey(),
      currency: row.currency,
    };
  }

  async openCheckout(params: {
    publicKey: string;
    email: string;
    amount: number;
    reference: string;
    currency: string;
    metadata?: Record<string, unknown>;
    onSuccess: (reference: string) => void;
    onCancel: () => void;
  }): Promise<void> {
    const PaystackPopCtor = await loadPaystack();
    const popup = new PaystackPopCtor();
    popup.newTransaction({
      key: params.publicKey,
      email: params.email,
      amount: params.amount,
      ref: params.reference,
      currency: params.currency,
      metadata: params.metadata,
      onSuccess: (transaction: { reference?: string }) => {
        params.onSuccess(transaction?.reference || params.reference);
      },
      onCancel: params.onCancel,
    });
  }

  async verify(reference: string): Promise<{ balance: number }> {
    const supabase = createSupabaseBrowserClient();
    for (let i = 0; i < 20; i += 1) {
      const { data, error } = await supabase
        .from("payments")
        .select("status")
        .eq("reference", reference)
        .maybeSingle();
      if (error) throw new Error(error.message);
      const status = (data as { status?: string } | null)?.status;
      if (status === "success") {
        const wallet = await supabase.rpc("get_my_wallet");
        const row = firstRpcRow(wallet.data as MyWalletResult | MyWalletResult[] | null);
        return { balance: row?.balance ?? 0 };
      }
      if (status === "failed" || status === "abandoned") {
        throw new Error("Payment did not complete.");
      }
      await sleep(1000);
    }
    throw new Error("Payment is processing. Coins will appear shortly.");
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
