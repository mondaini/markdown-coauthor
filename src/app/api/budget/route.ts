import { NextResponse, connection } from "next/server";
import { getBudget } from "@/lib/openrouter";

export async function GET() {
  await connection(); // always run per request, never prerender a budget snapshot
  if (process.env.MOCK_AI === "1" || !process.env.OPENROUTER_API_KEY) {
    return NextResponse.json({ mock: true });
  }
  try {
    return NextResponse.json(await getBudget());
  } catch (e) {
    const message = e instanceof Error ? e.message : "Upstream error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
