export interface GuestbookDraft {
  message: string;
  signatureDataUrl: string;
}

const keyFor = (worldId: string) => `codessey:guestbookDraft:${worldId}`;

export function readGuestbookDraft(worldId: string): GuestbookDraft | null {
  if (typeof window === "undefined" || !worldId) return null;
  try {
    const raw = window.localStorage.getItem(keyFor(worldId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GuestbookDraft;
    if (typeof parsed.message !== "string" || typeof parsed.signatureDataUrl !== "string") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeGuestbookDraft(worldId: string, draft: GuestbookDraft): void {
  if (typeof window === "undefined" || !worldId) return;
  try {
    window.localStorage.setItem(keyFor(worldId), JSON.stringify(draft));
  } catch {
    /* ignore quota */
  }
}

export function clearGuestbookDraft(worldId: string): void {
  if (typeof window === "undefined" || !worldId) return;
  try {
    window.localStorage.removeItem(keyFor(worldId));
  } catch {
    /* ignore */
  }
}
