import { WORLDLABS_BROWSER_KEY } from "@/lib/generation";
import { asTrimmed } from "@/lib/utils";

export function getWorldLabsBrowserKey(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const value = asTrimmed(window.localStorage.getItem(WORLDLABS_BROWSER_KEY));
    return value || null;
  } catch {
    return null;
  }
}

export function setWorldLabsBrowserKey(key: string): void {
  if (typeof window === "undefined") return;
  const value = asTrimmed(key);
  try {
    if (!value) {
      window.localStorage.removeItem(WORLDLABS_BROWSER_KEY);
      return;
    }
    window.localStorage.setItem(WORLDLABS_BROWSER_KEY, value);
  } catch {
    /* ignore quota / private mode */
  }
}

export function clearWorldLabsBrowserKey(): void {
  setWorldLabsBrowserKey("");
}
