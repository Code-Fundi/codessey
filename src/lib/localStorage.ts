export interface CachedWorld {
  worldId: string;
  splatUrl: string;
  thumbnailUrl?: string | null;
  caption?: string | null;
  marbleUrl?: string | null;
  panoUrl?: string | null;
  repoKey: string;
  repoName: string;
  generatedAt: number;
  status?: "pending" | "complete" | "failed";
  progress?: string | null;
}

const KEY = (id: string) => `codessey:${id}`;

export function repoCacheKey(url: string, branch: string): string {
  return `${url.trim().toLowerCase()}|${(branch || "main").trim()}`;
}

export function getCache(repoKey: string): CachedWorld | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY(repoKey));
    if (!raw) return null;
    return JSON.parse(raw) as CachedWorld;
  } catch {
    return null;
  }
}

export function setCache(world: CachedWorld): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY(world.repoKey), JSON.stringify(world));
  } catch {
    /* ignore */
  }
}

export function hasCache(repoKey: string): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(KEY(repoKey)) !== null;
}
