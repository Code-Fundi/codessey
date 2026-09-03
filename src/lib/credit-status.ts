export interface CreditTick {
  ok: boolean;
  balance: number;
  paidBalance: number;
  freeBalance: number;
  nextRefreshAt: string;
  secondsUntilRefresh: number;
  source: "wallet" | "ip" | "none";
  error: string | null;
}

export function formatRefreshWait(seconds: number): string {
  if (seconds <= 0) return "now";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${seconds}s`;
}
