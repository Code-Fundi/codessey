import { redirect } from "next/navigation";
import { repoAppPath } from "@/lib/repo-url";

export default async function LegacyRepoWorldPage({
  params,
}: {
  params: Promise<{ owner: string; repo: string }>;
}) {
  const { owner, repo } = await params;
  redirect(repoAppPath(owner, repo));
}
