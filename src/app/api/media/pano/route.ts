import { NextResponse } from "next/server";
import { parsePanoProxyUrl } from "@/lib/pano-proxy";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("url");
  const target = parsePanoProxyUrl(raw);
  if (!target) {
    return NextResponse.json({ error: "Invalid panorama URL." }, { status: 400 });
  }

  const upstream = await fetch(target.toString(), {
    headers: { Accept: "image/*" },
    redirect: "follow",
  });
  if (!upstream.ok) {
    return NextResponse.json({ error: "Panorama fetch failed." }, { status: upstream.status });
  }

  const contentType = upstream.headers.get("content-type") || "image/jpeg";
  if (!contentType.startsWith("image/")) {
    return NextResponse.json({ error: "Panorama was not an image." }, { status: 400 });
  }

  const buffer = await upstream.arrayBuffer();
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=3600",
    },
  });
}
