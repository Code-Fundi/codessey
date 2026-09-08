import leoProfanity from "leo-profanity";

export const GUESTBOOK_MESSAGE_MAX = 280;

let dictionaryReady = false;

function ensureDictionary(): void {
  if (dictionaryReady) return;
  leoProfanity.loadDictionary("en");
  dictionaryReady = true;
}

function maskToken(token: string): string {
  if (token.length <= 1) return "*";
  return token[0] + "*".repeat(token.length - 1);
}

/** Keep the first letter and asterisk the rest (`fuck` → `f***`). */
export function maskGuestbookMessage(input: string): string {
  ensureDictionary();
  const source = input.slice(0, GUESTBOOK_MESSAGE_MAX);
  const list = leoProfanity.list() as string[];
  if (!list.length) return source;

  const escaped = list
    .filter((word) => word.length > 1)
    .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .sort((a, b) => b.length - a.length);
  if (!escaped.length) return source;

  const re = new RegExp(`\\b(${escaped.join("|")})\\b`, "gi");
  return source.replace(re, (match) => maskToken(match));
}

export function clampGuestbookMessage(input: string): string {
  return maskGuestbookMessage(input).slice(0, GUESTBOOK_MESSAGE_MAX);
}
