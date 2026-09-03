import { describe, expect, it } from "vitest";
import { getRequestIp, hashIp } from "./request-ip";

describe("getRequestIp", () => {
  it("prefers Cloudflare, then x-real-ip, then x-forwarded-for", () => {
    const request = new Request("https://codessey.codefundi.app", {
      headers: {
        "cf-connecting-ip": "203.0.113.10",
        "x-real-ip": "198.51.100.2",
        "x-forwarded-for": "192.0.2.1, 10.0.0.1",
      },
    });
    expect(getRequestIp(request)).toBe("203.0.113.10");
  });

  it("uses the first forwarded hop", () => {
    const request = new Request("https://codessey.codefundi.app", {
      headers: { "x-forwarded-for": " 192.0.2.9 , 10.0.0.1" },
    });
    expect(getRequestIp(request)).toBe("192.0.2.9");
  });
});

describe("hashIp", () => {
  it("returns a 64-char hex digest matching ip_quotas.ip_hash", () => {
    const digest = hashIp("203.0.113.10");
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is stable for the same IP and pepper", () => {
    expect(hashIp("203.0.113.10")).toBe(hashIp("203.0.113.10"));
  });
});
