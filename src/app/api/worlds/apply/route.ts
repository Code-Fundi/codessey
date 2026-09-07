import { NextResponse } from "next/server";
import { applyWorldPollResult } from "@/lib/world-poll.server";
import { asTrimmed } from "@/lib/utils";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      worldId?: unknown;
      done?: unknown;
      progress?: unknown;
      error?: unknown;
      worldLabsId?: unknown;
      splatUrl?: unknown;
      thumbnailUrl?: unknown;
      caption?: unknown;
      marbleUrl?: unknown;
      panoUrl?: unknown;
      apiKey?: unknown;
    };
    void body.apiKey;
    const worldId = asTrimmed(body.worldId);
    if (!worldId) {
      return NextResponse.json({ error: "Missing world." }, { status: 400 });
    }

    const world = await applyWorldPollResult(worldId, {
      done: body.done === true,
      progress: asTrimmed(body.progress) || null,
      error: asTrimmed(body.error) || null,
      worldLabsId: asTrimmed(body.worldLabsId) || null,
      splatUrl: asTrimmed(body.splatUrl) || null,
      thumbnailUrl: asTrimmed(body.thumbnailUrl) || null,
      caption: asTrimmed(body.caption) || null,
      marbleUrl: asTrimmed(body.marbleUrl) || null,
      panoUrl: asTrimmed(body.panoUrl) || null,
    });
    return NextResponse.json({ world });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Apply failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
