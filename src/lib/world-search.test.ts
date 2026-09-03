import { describe, expect, it } from "vitest";
import { sanitizeWorldSearch } from "./world-search";

describe("sanitizeWorldSearch", () => {
  it("trims and collapses whitespace", () => {
    expect(sanitizeWorldSearch("  codessey   world ")).toBe("codessey world");
  });

  it("strips PostgREST filter metacharacters", () => {
    expect(sanitizeWorldSearch("foo%bar_baz*")).toBe("foo bar baz");
  });
});
