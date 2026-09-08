import { describe, expect, it } from "vitest";
import { codesseyShareText, codesseyShareUrl, facebookShareHref, twitterShareHref } from "./share";

describe("share links", () => {
  it("builds a Codessey deep link and post copy from a GitHub URL", () => {
    expect(codesseyShareUrl("https://github.com/acme/repo", "https://codessey.codefundi.app")).toBe(
      "https://codessey.codefundi.app/acme/repo",
    );
    expect(codesseyShareText("https://github.com/acme/repo")).toBe(
      "I generated a 3D world from acme/repo on Codessey",
    );
  });

  it("builds X and Facebook share URLs", () => {
    const url = "https://codessey.codefundi.app/acme/repo";
    const text = "I generated a 3D world from acme/repo on Codessey";
    expect(twitterShareHref(text, url)).toContain("twitter.com/intent/tweet");
    expect(twitterShareHref(text, url)).toContain(encodeURIComponent(url));
    expect(facebookShareHref(url)).toBe(
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
    );
  });
});
