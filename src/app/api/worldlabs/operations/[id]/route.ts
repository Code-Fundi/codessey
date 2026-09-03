import { NextResponse } from "next/server";
import { getServerWorldLabs } from "@/lib/providers.server";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    if (!id || id.length > 128) {
      return NextResponse.json({ error: "Invalid operation." }, { status: 400 });
    }
    const operation = await getServerWorldLabs().getOperation(id);
    return NextResponse.json(operation);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Lookup failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
