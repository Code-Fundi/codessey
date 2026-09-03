import { createHmac, timingSafeEqual } from "crypto";

const PAYSTACK_API = "https://api.paystack.co";

export function getPaystackSecretKey(): string {
  const key = process.env.PAYSTACK_SECRET_KEY ?? "";
  if (!key) {
    throw new Error("PAYSTACK_SECRET_KEY is not configured.");
  }
  return key;
}

export function getPaystackCurrency(): string {
  return process.env.PAYSTACK_CURRENCY ?? "USD";
}

export interface PaystackInitializeResponse {
  status: boolean;
  message: string;
  data: {
    authorization_url: string;
    access_code: string;
    reference: string;
  };
}

export interface PaystackVerifyData {
  id: number;
  status: string;
  reference: string;
  amount: number;
  currency: string;
  customer?: { email?: string };
}

export interface PaystackVerifyResponse {
  status: boolean;
  message: string;
  data: PaystackVerifyData;
}

export interface PaystackWebhookEvent {
  event: string;
  data: PaystackVerifyData & Record<string, unknown>;
}

async function paystackFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${PAYSTACK_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${getPaystackSecretKey()}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  const body = (await response.json()) as T & { status?: boolean; message?: string };
  if (!response.ok || body.status === false) {
    throw new Error(body.message || `Paystack request failed: ${response.status}`);
  }
  return body;
}

export async function initializePaystackTransaction(params: {
  email: string;
  amount: number;
  reference: string;
  currency?: string;
  metadata?: Record<string, unknown>;
}): Promise<PaystackInitializeResponse> {
  return paystackFetch<PaystackInitializeResponse>("/transaction/initialize", {
    method: "POST",
    body: JSON.stringify({
      email: params.email,
      amount: params.amount,
      reference: params.reference,
      currency: params.currency ?? getPaystackCurrency(),
      metadata: params.metadata,
    }),
  });
}

export async function verifyPaystackTransaction(
  reference: string,
): Promise<PaystackVerifyResponse> {
  return paystackFetch<PaystackVerifyResponse>(
    `/transaction/verify/${encodeURIComponent(reference)}`,
    { method: "GET" },
  );
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
