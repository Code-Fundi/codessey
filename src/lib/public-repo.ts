const PRIVATE_REPO_RE = /private|permission|inaccessible|not found|403|401|404/i;

export function isPrivateRepoError(status: number | undefined, message: string): boolean {
  if (status === 401 || status === 403 || status === 404) return true;
  return PRIVATE_REPO_RE.test(message);
}

export function publicRepoToast(
  status: number | undefined,
  message: string,
  fallback?: string,
): string {
  if (isPrivateRepoError(status, message)) {
    return "Use a public GitHub repository.";
  }
  return fallback || message || "Repository lookup failed.";
}
