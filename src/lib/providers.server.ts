import { createCodeFundiClient } from "@/lib/codefundi.client";
import { createWorldLabsClient } from "@/lib/worldlabs.client";
import { CODEFUNDI_BASE_URL, WORLDLABS_BASE_URL } from "@/lib/api";

export function getServerCodeFundi() {
  const apiKey = process.env.CODEFUNDI_API_KEY;
  if (!apiKey) throw new Error("CODEFUNDI_API_KEY is not configured.");
  return createCodeFundiClient({ baseUrl: CODEFUNDI_BASE_URL, apiKey });
}

export function getServerWorldLabs() {
  const apiKey = process.env.WORLDLABS_API_KEY;
  if (!apiKey) throw new Error("WORLDLABS_API_KEY is not configured.");
  return createWorldLabsClient({ baseUrl: WORLDLABS_BASE_URL, apiKey });
}
