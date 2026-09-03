import { NextResponse } from "next/server";

/** Secrets stay on the server. This route exists only to avoid stale clients calling it. */
export async function POST() {
  return NextResponse.json({ error: "API keys are not exposed to the browser." }, { status: 404 });
}
