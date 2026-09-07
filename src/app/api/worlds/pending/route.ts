import { NextResponse } from "next/server";
import { isBillingSource, isGenerationMode } from "@/lib/generation";
import { currentUserId, preSavePendingWorld } from "@/lib/world-poll.server";
import { asTrimmed } from "@/lib/utils";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      operationId?: unknown;
      repoUrl?: unknown;
      branch?: unknown;
      repoName?: unknown;
      generationMode?: unknown;
      billingSource?: unknown;
      apiKey?: unknown;
    };
    void body.apiKey;
    const operationId = asTrimmed(body.operationId);
    const repoUrl = asTrimmed(body.repoUrl);
    const branch = asTrimmed(body.branch);
    const repoName =
      asTrimmed(body.repoName) ||
      repoUrl
        .split("/")
        .filter(Boolean)
        .pop()
        ?.replace(/\.git$/i, "") ||
      "Codessey";
    const generationMode = isGenerationMode(body.generationMode) ? body.generationMode : "world";
    const billingSource = isBillingSource(body.billingSource) ? body.billingSource : "user_key";
    if (!operationId || !repoUrl) {
      return NextResponse.json({ error: "Missing world." }, { status: 400 });
    }

    const userId = await currentUserId();
    const world = await preSavePendingWorld({
      operationId,
      repoUrl,
      branch,
      repoName,
      userId,
      generationMode,
      billingSource,
    });
    return NextResponse.json({ world });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Pre-save failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
