import { after, NextResponse } from "next/server";
import type { FileListItem } from "@/lib/codefundi.client";
import { tickCredits } from "@/lib/credits.server";
import { buildLandscapePrompt } from "@/lib/prompts";
import { getServerCodeFundi, getServerWorldLabs } from "@/lib/providers.server";
import {
  currentUserId,
  fulfillPendingWorld,
  preSavePendingWorld,
} from "@/lib/world-poll.server";

async function loadDocumentedFiles(
  url: string,
  dataSourceId: string | null,
): Promise<FileListItem[]> {
  const key = dataSourceId || url;
  try {
    const listed = await new Promise<Awaited<
      ReturnType<ReturnType<typeof getServerCodeFundi>["listFiles"]>
    > | null>((resolve, reject) => {
      const timer = setTimeout(() => resolve(null), 2500);
      getServerCodeFundi()
        .listFiles(key, { limit: 40, order_by: "file_path" }, { skipCache: true })
        .then((value) => {
          clearTimeout(timer);
          resolve(value);
        }, (error: unknown) => {
          clearTimeout(timer);
          reject(error);
        });
    });
    return listed?.data ?? [];
  } catch {
    return [];
  }
}

export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { url?: string; branch?: string };
    const url = body.url?.trim() ?? "";
    if (!url || url.length > 2048) {
      return NextResponse.json({ error: "Invalid repository URL." }, { status: 400 });
    }
    const branch = (body.branch?.trim() || "main").slice(0, 200);

    const tick = await tickCredits(request, true);
    if (!tick.ok) {
      const status = tick.error === "rate_limited" ? 429 : 402;
      return NextResponse.json({ error: tick.error ?? "insufficient_coins", tick }, { status });
    }

    const indexRes = await getServerCodeFundi().indexRepo({ url, branch });
    const repo = indexRes.data?.repo;
    if (!repo) {
      return NextResponse.json(
        { error: indexRes.message || "Index failed.", tick },
        { status: 400 },
      );
    }

    const documentedFiles = await loadDocumentedFiles(url, repo.data_source_id);
    const prompt = buildLandscapePrompt(repo, documentedFiles);
    const displayName =
      url
        .split("/")
        .filter(Boolean)
        .pop()
        ?.replace(/\.git$/, "") || "Codessey";

    const operation = await getServerWorldLabs().generateWorld({
      display_name: displayName.slice(0, 64),
      model: "marble-1.1",
      world_prompt: { type: "text", text_prompt: prompt },
    });

    const userId = await currentUserId();
    const world = await preSavePendingWorld({
      operationId: operation.operation_id,
      repoUrl: url,
      branch,
      repoName: displayName,
      userId,
    });

    after(() => {
      void fulfillPendingWorld(world.id, userId).catch((error) => {
        console.error("pending world poll stopped", error);
      });
    });

    return NextResponse.json({
      tick,
      operationId: operation.operation_id,
      repoName: displayName,
      repoUrl: url,
      branch,
      world,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Generate failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
