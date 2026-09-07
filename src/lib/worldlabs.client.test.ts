import { describe, expect, it } from "vitest";
import { isOperationComplete, unwrapWorld, worldIdFromOperation } from "./worldlabs.client";
import { decidePollTick } from "./world-poll";
import type { Operation, World } from "./worldlabs.client";

const wrappedWorld = {
  world: {
    id: "wl-1",
    display_name: "Repo",
    world_marble_url: "https://marble.worldlabs.ai/world/wl-1",
    assets: {
      imagery: { pano_url: "https://cdn.worldlabs.ai/pano.jpg" },
      splats: { spz_urls: { "500k": "https://cdn.worldlabs.ai/splat.spz" } },
    },
  },
};

const pendingOp = (over: Partial<Operation> = {}): Operation => ({
  operation_id: "op-1",
  done: false,
  metadata: { world_id: "wl-1", progress: { status: "IN_PROGRESS", description: "Working" } },
  response: null,
  ...over,
});

describe("unwrapWorld", () => {
  it("unwraps GET /worlds { world: { id, assets } }", () => {
    const world = unwrapWorld(wrappedWorld);
    expect(world?.id).toBe("wl-1");
    expect(world?.assets?.imagery?.pano_url).toContain("pano.jpg");
  });

  it("accepts a flat world_id body", () => {
    expect(unwrapWorld({ world_id: "flat-1", display_name: "X" })?.world_id).toBe("flat-1");
  });
});

describe("isOperationComplete", () => {
  it("treats SUCCEEDED as done", () => {
    expect(
      isOperationComplete(
        pendingOp({ metadata: { progress: { status: "SUCCEEDED" }, world_id: "wl-1" } }),
      ),
    ).toBe(true);
  });

  it("is not complete while IN_PROGRESS even if done is false", () => {
    expect(isOperationComplete(pendingOp())).toBe(false);
  });
});

describe("decidePollTick", () => {
  it("completes pano from GET world pano without operation.done", () => {
    const fetched = unwrapWorld(wrappedWorld) as World;
    const decision = decidePollTick({
      operation: pendingOp(),
      fetchedWorld: fetched,
      mode: "pano",
      progressFallback: "Generating landscape…",
    });
    expect(decision.action).toBe("complete");
    if (decision.action === "complete") {
      expect(decision.panoUrl).toContain("pano.jpg");
      expect(decision.splatUrl).toBeNull();
      expect(decision.worldLabsId).toBe("wl-1");
    }
  });

  it("waits for splat in 3D mode while in progress", () => {
    const fetched = unwrapWorld(wrappedWorld) as World;
    const decision = decidePollTick({
      operation: pendingOp(),
      fetchedWorld: {
        ...fetched,
        assets: { imagery: { pano_url: "https://cdn.worldlabs.ai/pano.jpg" } },
      },
      mode: "world",
      progressFallback: "Generating landscape…",
    });
    expect(decision.action).toBe("wait");
  });

  it("completes 3D when a splat exists even if operation.done is false", () => {
    const fetched = unwrapWorld(wrappedWorld) as World;
    const decision = decidePollTick({
      operation: pendingOp(),
      fetchedWorld: fetched,
      mode: "world",
      progressFallback: "Generating landscape…",
    });
    expect(decision.action).toBe("complete");
    if (decision.action === "complete") {
      expect(decision.splatUrl).toContain("splat.spz");
      expect(decision.worldLabsId).toBe("wl-1");
    }
  });
});

describe("worldIdFromOperation", () => {
  it("prefers metadata.world_id while response is null", () => {
    expect(worldIdFromOperation(pendingOp(), null)).toBe("wl-1");
  });
});
