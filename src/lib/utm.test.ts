import { describe, expect, it } from "vitest";
import { withUtm } from "./utm";

describe("withUtm", () => {
  it("appends about-card UTM params to http(s) URLs", () => {
    expect(withUtm("https://codefundi.app")).toBe(
      "https://codefundi.app/?utm_source=codessey&utm_medium=referral&utm_campaign=about_card",
    );
    expect(withUtm("https://github.com/FelixWaweru")).toBe(
      "https://github.com/FelixWaweru?utm_source=codessey&utm_medium=referral&utm_campaign=about_card",
    );
  });

  it("keeps existing query strings", () => {
    expect(withUtm("https://codefundi.app/docs?ref=nav")).toBe(
      "https://codefundi.app/docs?ref=nav&utm_source=codessey&utm_medium=referral&utm_campaign=about_card",
    );
  });

  it("ignores mailto and other non-http schemes", () => {
    expect(withUtm("mailto:hi@codefundi.app")).toBe("mailto:hi@codefundi.app");
    expect(withUtm("tel:+15555550100")).toBe("tel:+15555550100");
  });
});
