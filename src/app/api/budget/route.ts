import { NextResponse, connection } from "next/server";
import { getBudget } from "@/lib/openrouter";

export async function GET() {
  await connection(); // always run per request, never prerender a budget snapshot
  if (process.env.MOCK_AI === "1") return NextResponse.json({ mock: true });
  if (!process.env.OPENROUTER_API_KEY) return NextResponse.json({ noKey: true });
  try {
    return NextResponse.json(await getBudget());
  } catch (e) {
    console.error("budget: upstream failed", e);
    return NextResponse.json({ error: "upstream_error" }, { status: 502 });
  }
}
