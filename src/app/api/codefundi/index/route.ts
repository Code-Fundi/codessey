import { NextResponse } from "next/server";
import { CodeFundiAPIError } from "@/lib/codefundi.client";
import { indexRepoPayload } from "@/lib/codefundi-index";
import { getServerCodeFundi } from "@/lib/providers.server";
import { asTrimmed } from "@/lib/utils";

export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { url?: unknown; branch?: unknown };
    const url = asTrimmed(body.url);
    const branch = asTrimmed(body.branch);
    if (!url || url.length > 2048) {
      return NextResponse.json({ error: "Invalid repository URL." }, { status: 400 });
    }

    const indexRes = await getServerCodeFundi().indexRepo(indexRepoPayload(url, branch));
    const repo = indexRes.data?.repo;
    if (!repo) {
      return NextResponse.json({ error: indexRes.message || "Index failed." }, { status: 400 });
    }
    return NextResponse.json({ index: repo });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Index failed.";
    const status = error instanceof CodeFundiAPIError ? error.statusCode : 400;
    return NextResponse.json({ error: message }, { status: status >= 400 ? status : 400 });
  }
}
