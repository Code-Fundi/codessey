import { githubPathForRepo, parseGithubOwnerRepo } from "@/lib/repo-url";

const SITE_ORIGIN = "https://codessey.codefundi.app";

export function codesseyShareUrl(repoUrl: string, origin?: string): string | null {
  const path = githubPathForRepo(repoUrl);
  if (!path) return null;
  const base = origin || (typeof window !== "undefined" ? window.location.origin : SITE_ORIGIN);
  return `${base}${path}`;
}

export function codesseyShareText(repoUrl: string): string {
  const parsed = parseGithubOwnerRepo(repoUrl);
  const slug = parsed ? `${parsed.owner}/${parsed.repo}` : "a GitHub repo";
  return `I generated a 3D world from ${slug} on Codessey`;
}

export function twitterShareHref(text: string, url: string): string {
  const params = new URLSearchParams({ text, url });
  return `https://twitter.com/intent/tweet?${params.toString()}`;
}

export function facebookShareHref(url: string): string {
  const params = new URLSearchParams({ u: url });
  return `https://www.facebook.com/sharer/sharer.php?${params.toString()}`;
}
