const ALLOWED_HOST_SUFFIXES = [".worldlabs.ai", ".worldlabs.com"];
const ALLOWED_HOSTS = new Set(["worldlabs.ai", "worldlabs.com", "marble.worldlabs.ai"]);

export function isAllowedPanoHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (ALLOWED_HOSTS.has(host)) return true;
  return ALLOWED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

export function parsePanoProxyUrl(raw: string | null): URL | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return null;
    if (!isAllowedPanoHost(url.hostname)) return null;
    return url;
  } catch {
    return null;
  }
}

export function proxiedPanoSrc(panoUrl: string | null | undefined): string | null {
  const url = asTrimmedUrl(panoUrl);
  if (!url) return null;
  return `/api/media/pano?url=${encodeURIComponent(url)}`;
}

function asTrimmedUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed || null;
}
