import { createHash } from "crypto";

export function getRequestIp(request: Request): string {
  const cf = request.headers.get("cf-connecting-ip");
  if (cf?.trim()) return cf.trim();
  const real = request.headers.get("x-real-ip");
  if (real?.trim()) return real.trim();
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return "0.0.0.0";
}

export function hashIp(ip: string): string {
  const pepper =
    process.env.CREDITS_IP_PEPPER || process.env.SUPABASE_SERVICE_ROLE_KEY || "codessey-dev-pepper";
  return createHash("sha256").update(`${pepper}:${ip.trim().toLowerCase()}`).digest("hex");
}
