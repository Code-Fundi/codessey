import { CodesseyApp } from "@/components/CodesseyApp";

export default async function RepoWorldPage({
  params,
}: {
  params: Promise<{ owner: string; repo: string }>;
}) {
  const { owner, repo } = await params;
  return <CodesseyApp initialOwner={owner} initialRepo={repo} />;
}
