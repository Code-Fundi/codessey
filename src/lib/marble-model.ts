import type { GenerationMode } from "@/lib/generation";
import type { WorldLabsModel } from "@/lib/worldlabs.client";

export type MarbleModelChoice = "draft" | "1.0" | "1.1";
export type WorldGenKind = "standard" | "variable";

export const MARBLE_MODEL_STORAGE_KEY = "codessey:marbleModel";
export const WORLD_GEN_KIND_STORAGE_KEY = "codessey:worldGenKind";

export const MARBLE_MODEL_CHOICES: { id: MarbleModelChoice; label: string }[] = [
  { id: "draft", label: "Draft" },
  { id: "1.0", label: "Marble 1.0" },
  { id: "1.1", label: "Marble 1.1" },
];

export function isMarbleModelChoice(value: unknown): value is MarbleModelChoice {
  return value === "draft" || value === "1.0" || value === "1.1";
}

export function isWorldGenKind(value: unknown): value is WorldGenKind {
  return value === "standard" || value === "variable";
}

export function readStoredMarbleModel(): MarbleModelChoice {
  if (typeof window === "undefined") return "1.1";
  try {
    const value = window.localStorage.getItem(MARBLE_MODEL_STORAGE_KEY);
    return isMarbleModelChoice(value) ? value : "1.1";
  } catch {
    return "1.1";
  }
}

export function readStoredWorldGenKind(): WorldGenKind {
  if (typeof window === "undefined") return "standard";
  try {
    const value = window.localStorage.getItem(WORLD_GEN_KIND_STORAGE_KEY);
    return isWorldGenKind(value) ? value : "standard";
  } catch {
    return "standard";
  }
}

export function persistMarbleModel(choice: MarbleModelChoice): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(MARBLE_MODEL_STORAGE_KEY, choice);
  } catch {
    /* ignore */
  }
}

export function persistWorldGenKind(kind: WorldGenKind): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(WORLD_GEN_KIND_STORAGE_KEY, kind);
  } catch {
    /* ignore */
  }
}

/** Variable (Plus) always sends marble-1.1-plus. Draft/1.0 cannot be variable. */
export function resolveWorldLabsModel(
  choice: MarbleModelChoice,
  kind: WorldGenKind,
): WorldLabsModel {
  if (kind === "variable") return "marble-1.1-plus";
  if (choice === "draft") return "marble-1.0-draft";
  if (choice === "1.0") return "marble-1.0";
  return "marble-1.1";
}

export function isWorldLabsModel(value: unknown): value is WorldLabsModel {
  return (
    value === "marble-1.0-draft" ||
    value === "marble-1.0" ||
    value === "marble-1.1" ||
    value === "marble-1.1-plus"
  );
}

export function marbleModelLabel(model: string | null | undefined): string | null {
  if (model === "marble-1.1-plus") return "Marble 1.1 Plus";
  if (model === "marble-1.1") return "Marble 1.1";
  if (model === "marble-1.0") return "Marble 1.0";
  if (model === "marble-1.0-draft") return "Draft";
  return null;
}

export function worldTypeLabel(
  mode: GenerationMode | null | undefined,
  model?: string | null,
): string {
  if (model === "marble-1.1-plus") return "Variable world";
  if (mode === "pano") return "Panorama";
  return "World";
}
