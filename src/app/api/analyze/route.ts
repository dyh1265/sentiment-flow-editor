import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AnalyzeRequestSchema, type AnalyzeResponse } from "@/lib/schemas";
import { scoreTextLocal } from "@/lib/sentiment/local";
import { scoreTextLLM } from "@/lib/sentiment/llm";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  let parsed;
  try {
    parsed = AnalyzeRequestSchema.parse(body);
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json(
        { error: "Invalid request", issues: err.issues },
        { status: 400 },
      );
    }
    throw err;
  }

  try {
    const sentences =
      parsed.mode === "llm" ? await scoreTextLLM(parsed.text) : scoreTextLocal(parsed.text);
    const body: AnalyzeResponse = { sentences, mode: parsed.mode };
    return NextResponse.json(body);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const status = message.includes("OPENAI_API_KEY") ? 400 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
