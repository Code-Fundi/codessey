import { NextResponse } from "next/server";
import { CodeFundiAPIError } from "@/lib/codefundi.client";
import { getServerCodeFundi } from "@/lib/providers.server";
import { asTrimmed } from "@/lib/utils";
import { hasBlueprintPayload, type RepoBlueprint } from "@/lib/prompts";

export const maxDuration = 30;

function asBlueprint(payload: unknown): RepoBlueprint | null {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as Record<string, unknown>;
  const nested =
    root.data && typeof root.data === "object" && !Array.isArray(root.data)
      ? (root.data as Record<string, unknown>)
      : root;
  const blueprint: RepoBlueprint = {
    url: typeof nested.url === "string" ? nested.url : null,
    branch: typeof nested.branch === "string" ? nested.branch : null,
    description: typeof nested.description === "string" ? nested.description : null,
    readme:
      typeof nested.readme === "string"
        ? nested.readme
        : typeof nested.data === "string"
          ? nested.data
          : null,
    conventions: (nested.conventions as RepoBlueprint["conventions"]) ?? null,
    dependencies: nested.dependencies,
    languages: nested.languages,
    total_files: typeof nested.total_files === "number" ? nested.total_files : null,
    file_count: typeof nested.file_count === "number" ? nested.file_count : null,
  };
  return hasBlueprintPayload(blueprint) ? blueprint : null;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { url?: unknown };
    const url = asTrimmed(body.url);
    if (!url || url.length > 2048) {
      return NextResponse.json({ error: "Invalid repository URL." }, { status: 400 });
    }

    const result = await getServerCodeFundi().getRepoBlueprint(url);
    const blueprint = asBlueprint(result.data ?? result);
    return NextResponse.json({ blueprint });
  } catch (error) {
    if (
      error instanceof CodeFundiAPIError &&
      (error.statusCode === 404 || error.statusCode === 400)
    ) {
      return NextResponse.json({ blueprint: null });
    }
    const message = error instanceof Error ? error.message : "Blueprint lookup failed.";
    const status = error instanceof CodeFundiAPIError ? error.statusCode : 500;
    return NextResponse.json({ error: message }, { status: status >= 400 ? status : 500 });
  }
}
