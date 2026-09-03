import { NextResponse } from "next/server";
import { currentUserId, pollLatestPendingWorld } from "@/lib/world-poll.server";

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { worldId?: string };
    const worldId = body.worldId?.trim() ?? "";
    if (!worldId) {
      return NextResponse.json({ error: "Missing world." }, { status: 400 });
    }

    const userId = await currentUserId();
    const world = await pollLatestPendingWorld({ userId, worldId });
    if (!world) {
      return NextResponse.json({ error: "No pending world to poll." }, { status: 404 });
    }
    return NextResponse.json({ world });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Poll failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
