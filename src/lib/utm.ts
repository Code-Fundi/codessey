const ABOUT_UTM = {
  utm_source: "codessey",
  utm_medium: "referral",
  utm_campaign: "about_card",
} as const;

/** Appends Codessey about-card UTM params to http(s) URLs. Leaves mailto and other schemes unchanged. */
export function withUtm(href: string): string {
  const trimmed = href.trim();
  if (!/^https?:\/\//i.test(trimmed)) return href;

  try {
    const url = new URL(trimmed);
    for (const [key, value] of Object.entries(ABOUT_UTM)) {
      url.searchParams.set(key, value);
    }
    return url.toString();
  } catch {
    return href;
  }
}
