import { describe, expect, it } from "vitest";
import { viewerShowsGenerating } from "./cached-world";

describe("viewerShowsGenerating", () => {
  it("never shows generating when the world is complete or has media", () => {
    expect(
      viewerShowsGenerating(
        { status: "complete", splatUrl: "https://example.com/a.spz", panoUrl: "" },
        true,
      ),
    ).toBe(false);
    expect(
      viewerShowsGenerating(
        { status: "pending", splatUrl: "", panoUrl: "https://cdn/p.png" },
        true,
      ),
    ).toBe(false);
  });

  it("shows generating for pending worlds without assets", () => {
    expect(viewerShowsGenerating({ status: "pending", splatUrl: "", panoUrl: "" }, false)).toBe(
      true,
    );
    expect(viewerShowsGenerating(null, true)).toBe(true);
  });
});
