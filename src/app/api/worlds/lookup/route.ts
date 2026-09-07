import { NextResponse } from "next/server";
import { lookupWorldByRepoUrl } from "@/lib/world-poll.server";
import { asTrimmed } from "@/lib/utils";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const repoUrl = asTrimmed(searchParams.get("repoUrl"));
    if (!repoUrl) {
      return NextResponse.json({ error: "Missing repository URL." }, { status: 400 });
    }
    const world = await lookupWorldByRepoUrl(repoUrl);
    return NextResponse.json({ world });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Lookup failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
