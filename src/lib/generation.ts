export type GenerationMode = "pano" | "world";
export type BillingSource = "credits" | "user_key";

export const PANO_COINS = 1;
export const WORLD_COINS = 20;
export const GUESTBOOK_COINS = 1;
export const PLAQUE_COINS = 1;
export const SIGNUP_COINS = 2;
export const CUSTOM_CENTS_PER_COIN = 50;
export const WORLDLABS_API_KEYS_URL = "https://platform.worldlabs.ai/api-keys";
export const WORLDLABS_BROWSER_KEY = "codessey:worldlabsApiKey";
export const RETRY_GUESTBOOK_KEY = "codessey:retryGuestbook";
export const MISSING_WORLD_LABS_KEY = "Add a World Labs API key to generate.";

export function coinsForMode(_mode: GenerationMode): number {
  return 0;
}

export function isGenerationMode(value: unknown): value is GenerationMode {
  return value === "pano" || value === "world";
}

export function isBillingSource(value: unknown): value is BillingSource {
  return value === "credits" || value === "user_key";
}
