import type { WorldRow } from "@/lib/database.types";
import { parseGithubOwnerRepo, repoNameFromUrl } from "@/lib/repo-url";

export type GenerationJobStatus = "pending" | "complete" | "failed";

export interface GenerationJob {
  id: string;
  repoUrl: string;
  repoName: string;
  status: GenerationJobStatus;
  progress: string | null;
  updatedAt: number;
}

const JOBS_KEY = "codessey:generationJobs";
const NOTIFIED_KEY = "codessey:notifiedWorlds";
const MAX_JOBS = 8;

function statusFromWorld(status: string | null | undefined): GenerationJobStatus {
  if (status === "complete") return "complete";
  if (status === "failed") return "failed";
  return "pending";
}

export function jobLabel(repoUrl: string, fallback?: string | null): string {
  const parsed = parseGithubOwnerRepo(repoUrl);
  if (parsed) return `${parsed.owner}/${parsed.repo}`;
  return fallback?.trim() || repoNameFromUrl(repoUrl) || "World";
}

export function jobFromWorldRow(row: WorldRow): GenerationJob {
  return {
    id: row.id,
    repoUrl: row.repo_url,
    repoName: jobLabel(row.repo_url, row.repo_name),
    status: statusFromWorld(row.status),
    progress: row.progress ?? null,
    updatedAt: Date.now(),
  };
}

export function upsertGenerationJob(jobs: GenerationJob[], next: GenerationJob): GenerationJob[] {
  const rest = jobs.filter((job) => job.id !== next.id);
  return [next, ...rest].slice(0, MAX_JOBS);
}

export function readGenerationJobs(): GenerationJob[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(JOBS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as GenerationJob[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((job) => job && typeof job.id === "string" && job.repoUrl);
  } catch {
    return [];
  }
}

export function writeGenerationJobs(jobs: GenerationJob[]): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(JOBS_KEY, JSON.stringify(jobs));
  } catch {
    /* ignore quota */
  }
}

export function wasWorldNotified(worldId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.sessionStorage.getItem(NOTIFIED_KEY);
    const ids = raw ? (JSON.parse(raw) as string[]) : [];
    return Array.isArray(ids) && ids.includes(worldId);
  } catch {
    return false;
  }
}

export function markWorldNotified(worldId: string): void {
  if (typeof window === "undefined") return;
  try {
    const raw = window.sessionStorage.getItem(NOTIFIED_KEY);
    const ids = raw ? (JSON.parse(raw) as string[]) : [];
    const next = [worldId, ...(Array.isArray(ids) ? ids.filter((id) => id !== worldId) : [])].slice(
      0,
      40,
    );
    window.sessionStorage.setItem(NOTIFIED_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}
