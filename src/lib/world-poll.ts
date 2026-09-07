import type { GenerationMode } from "@/lib/generation";
import {
  isOperationComplete,
  panoUrlFromWorld,
  splatUrlFromWorld,
  unwrapWorld,
  worldIdFromOperation,
  type Operation,
  type World,
} from "@/lib/worldlabs.client";

export type PollDecision =
  | {
      action: "fail";
      message: string;
      worldLabsId: string | null;
      panoUrl: string | null;
      progress: string;
    }
  | {
      action: "complete";
      worldLabsId: string;
      panoUrl: string | null;
      splatUrl: string | null;
      world: World | null;
      progress: string;
    }
  | {
      action: "wait";
      worldLabsId: string | null;
      panoUrl: string | null;
      progress: string;
    };

export function mergePollWorld(operation: Operation, fetched: World | null): World | null {
  return unwrapWorld(fetched) ?? unwrapWorld(operation.response) ?? operation.response ?? null;
}

export function decidePollTick(input: {
  operation: Operation;
  fetchedWorld: World | null;
  mode: GenerationMode;
  progressFallback: string;
}): PollDecision {
  const world = mergePollWorld(input.operation, input.fetchedWorld);
  const worldLabsId = worldIdFromOperation(input.operation, world);
  const panoUrl = panoUrlFromWorld(world);
  const splatUrl = splatUrlFromWorld(world);
  const progress =
    input.operation.metadata?.progress?.description ??
    input.progressFallback ??
    "Generating landscape…";
  const status = input.operation.metadata?.progress?.status?.toUpperCase() ?? "";
  const failedMessage =
    input.operation.error?.message ??
    (status === "FAILED"
      ? input.operation.metadata?.progress?.description || "Generation failed."
      : null);

  if (failedMessage) {
    return { action: "fail", message: failedMessage, worldLabsId, panoUrl, progress };
  }

  if (input.mode === "pano" && panoUrl && worldLabsId) {
    return {
      action: "complete",
      worldLabsId,
      panoUrl,
      splatUrl: null,
      world,
      progress: "World ready.",
    };
  }

  if (input.mode === "world" && splatUrl && worldLabsId) {
    return {
      action: "complete",
      worldLabsId,
      panoUrl,
      splatUrl,
      world,
      progress: "World ready.",
    };
  }

  if (!isOperationComplete(input.operation)) {
    return { action: "wait", worldLabsId, panoUrl, progress };
  }

  if (!worldLabsId) {
    return {
      action: "fail",
      message: "World Labs finished without a world id.",
      worldLabsId: null,
      panoUrl,
      progress,
    };
  }

  if (input.mode === "world" && !splatUrl) {
    return {
      action: "fail",
      message: "World generated but no splat URL was returned yet.",
      worldLabsId,
      panoUrl,
      progress,
    };
  }

  if (input.mode === "pano" && !panoUrl) {
    return {
      action: "fail",
      message: "World generated but no panorama URL was returned yet.",
      worldLabsId,
      panoUrl,
      progress,
    };
  }

  return {
    action: "complete",
    worldLabsId,
    panoUrl,
    splatUrl: input.mode === "pano" ? null : splatUrl,
    world,
    progress: "World ready.",
  };
}

export function logPollTick(input: {
  operation: Operation;
  fetchedWorld: World | null;
  decision: PollDecision;
}) {
  if (process.env.NODE_ENV !== "development") return;
  const op = input.operation;
  console.debug("[codessey:poll]", {
    done: op.done,
    progressStatus: op.metadata?.progress?.status ?? null,
    metadataWorldId: op.metadata?.world_id ?? null,
    hasResponse: Boolean(op.response),
    fetchedAssets: Boolean(input.fetchedWorld?.assets),
    action: input.decision.action,
  });
}
