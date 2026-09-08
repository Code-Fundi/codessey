import { describe, expect, it } from "vitest";
import { resolveWorldLabsModel } from "./marble-model";

describe("resolveWorldLabsModel", () => {
  it("maps Draft / 1.0 / 1.1 to Marble API models", () => {
    expect(resolveWorldLabsModel("draft", "standard")).toBe("marble-1.0-draft");
    expect(resolveWorldLabsModel("1.0", "standard")).toBe("marble-1.0");
    expect(resolveWorldLabsModel("1.1", "standard")).toBe("marble-1.1");
  });

  it("sends marble-1.1-plus for variable world generation", () => {
    expect(resolveWorldLabsModel("1.1", "variable")).toBe("marble-1.1-plus");
    expect(resolveWorldLabsModel("draft", "variable")).toBe("marble-1.1-plus");
  });
});
