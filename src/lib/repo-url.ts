import { asTrimmed } from "@/lib/utils";

export type GithubOwnerRepo = { owner: string; repo: string };

/** Stable identity for one landscape per repo: lowercase, no trailing slash, no `.git`. */
export function normalizeRepoUrl(url: unknown): string {
  let value = asTrimmed(url).toLowerCase();
  if (!value) return "";
  value = value.replace(/\/+$/, "");
  value = value.replace(/\.git$/i, "");
  value = value.replace(/\/+$/, "");
  return value;
}

export function parseGithubOwnerRepo(input: unknown): GithubOwnerRepo | null {
  const raw = asTrimmed(input);
  if (!raw) return null;

  let path = raw;
  try {
    if (path.startsWith("git@github.com:")) {
      path = path.replace("git@github.com:", "https://github.com/");
    }
    if (path.includes("://")) {
      const url = new URL(path);
      if (!/github\.com$/i.test(url.hostname)) return null;
      path = url.pathname;
    }
  } catch {
    return null;
  }

  const parts = path.split("/").filter(Boolean);
  if (parts.length < 2) return null;
  const owner = parts[0].replace(/\.git$/i, "");
  const repo = parts[1].replace(/\.git$/i, "");
  if (!owner || !repo || owner === "." || repo === ".") return null;
  if (!/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo)) return null;
  return { owner, repo };
}

export function githubRepoUrl(owner: string, repo: string): string {
  return `https://github.com/${owner}/${repo}`.replace(/\.git$/i, "");
}

export const REPO_APP_PREFIX = "/repo";

export function repoAppPath(owner: string, repo: string): string {
  return `${REPO_APP_PREFIX}/${owner}/${repo}`;
}

export function repoNameFromUrl(url: string): string | null {
  const parsed = parseGithubOwnerRepo(url);
  if (parsed) return parsed.repo;
  const last = url
    .split("/")
    .filter(Boolean)
    .pop()
    ?.replace(/\.git$/i, "");
  return last || null;
}

export function githubPathForRepo(url: string): string | null {
  const parsed = parseGithubOwnerRepo(url);
  if (!parsed) return null;
  return repoAppPath(parsed.owner, parsed.repo);
}
