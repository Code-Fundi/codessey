import { isWorldLabsModel } from "@/lib/marble-model";
import type { WorldLabsModel } from "@/lib/worldlabs.client";

const MODEL_KEY = "codessey:worldMarbleModels";

function readMap(): Record<string, WorldLabsModel> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(MODEL_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") return {};
    const next: Record<string, WorldLabsModel> = {};
    for (const [id, value] of Object.entries(parsed)) {
      if (id && isWorldLabsModel(value)) next[id] = value;
    }
    return next;
  } catch {
    return {};
  }
}

export function readWorldMarbleModel(worldId: string | null | undefined): WorldLabsModel | null {
  if (!worldId) return null;
  return readMap()[worldId] ?? null;
}

export function persistWorldMarbleModel(
  worldId: string | null | undefined,
  model: string | null | undefined,
): WorldLabsModel | null {
  if (!worldId || !isWorldLabsModel(model)) return null;
  if (typeof window === "undefined") return model;
  try {
    const next = { ...readMap(), [worldId]: model };
    window.localStorage.setItem(MODEL_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota */
  }
  return model;
}
