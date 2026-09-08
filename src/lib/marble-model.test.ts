import { describe, expect, it } from "vitest";
import { marbleModelLabel, resolveWorldLabsModel, worldTypeLabel } from "./marble-model";

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

describe("world info labels", () => {
  it("labels world type and marble model for sidebar chips", () => {
    expect(worldTypeLabel("world", "marble-1.1")).toBe("World");
    expect(worldTypeLabel("world", "marble-1.1-plus")).toBe("Variable world");
    expect(worldTypeLabel("pano")).toBe("Panorama");
    expect(marbleModelLabel("marble-1.1")).toBe("Marble 1.1");
    expect(marbleModelLabel("marble-1.1-plus")).toBe("Marble 1.1 Plus");
  });
});
