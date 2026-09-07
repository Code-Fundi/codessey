import { createCodeFundiClient } from "@/lib/codefundi.client";
import { CODEFUNDI_BASE_URL } from "@/lib/api";

export function getServerCodeFundi() {
  const apiKey = process.env.CODEFUNDI_API_KEY;
  if (!apiKey) throw new Error("CODEFUNDI_API_KEY is not configured.");
  return createCodeFundiClient({ baseUrl: CODEFUNDI_BASE_URL, apiKey });
}
