import { asTrimmed } from "@/lib/utils";

export function indexRepoPayload(
  url: string,
  branch?: string | null,
): { url: string; branch?: string } {
  const trimmed = asTrimmed(branch);
  return trimmed ? { url, branch: trimmed } : { url };
}
