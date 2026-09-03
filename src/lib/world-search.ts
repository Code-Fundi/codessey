export function sanitizeWorldSearch(raw: string): string {
  return raw
    .trim()
    .slice(0, 80)
    .replace(/[%_,*()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
