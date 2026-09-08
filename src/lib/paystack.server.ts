import { createHmac, timingSafeEqual } from "crypto";

export function getPaystackSecretKey(): string {
  const key = process.env.PAYSTACK_SECRET_KEY ?? "";
  if (!key) {
    throw new Error("PAYSTACK_SECRET_KEY is not configured.");
  }
  return key;
}

export function getPaystackPublicKey(): string {
  const key = process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY ?? "";
  if (!key) {
    throw new Error("NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY is not configured.");
  }
  return key;
}

export function getPaystackCurrency(): string {
  return process.env.PAYSTACK_CURRENCY ?? "USD";
}

export interface PaystackVerifyData {
  id: number;
  status: string;
  reference: string;
  amount: number;
  currency: string;
  customer?: { email?: string };
}

export interface PaystackWebhookEvent {
  event: string;
  data: PaystackVerifyData & Record<string, unknown>;
}

export function verifyPaystackSignature(rawBody: string, signature: string | null): boolean {
  if (!signature) return false;
  const hash = createHmac("sha512", getPaystackSecretKey()).update(rawBody).digest("hex");
  const expected = Buffer.from(hash);
  const received = Buffer.from(signature);
  if (expected.length !== received.length) return false;
  return timingSafeEqual(expected, received);
}

export function createPaymentReference(userId: string): string {
  const rand = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  return `csy_${userId.replace(/-/g, "").slice(0, 8)}_${rand}`;
}
