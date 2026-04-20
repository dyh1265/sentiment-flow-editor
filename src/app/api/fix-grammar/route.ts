import { NextResponse } from "next/server";
import { ZodError } from "zod";
import {
  FixGrammarRequestSchema,
  FixGrammarResponseSchema,
  type FixGrammarResponse,
} from "@/lib/schemas";
import { getOpenAIClient, getOpenAIModel } from "@/lib/openai";

export const runtime = "nodejs";

const SYSTEM_PROMPT = [
  "You are a careful copy editor. Fix only grammar, spelling, punctuation, capitalization, and obvious typos in the user's text.",
  "Preserve the author's meaning, voice, tone, sentence structure, and emotional sentiment.",
  "Do not rewrite for style, do not reorder sentences, do not add or remove content, and do not translate.",
  "Keep paragraph breaks exactly as given.",
  'Return strict JSON of the form {"text": "<corrected text>"}.',
  "Output JSON only, no prose, no code fences.",
].join(" ");

const STRICT_REMINDER =
  "Your previous reply was not valid JSON matching the schema. Respond with ONLY a JSON object " +
  'of the form {"text":"..."} containing the corrected text.';

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  let parsed;
  try {
    parsed = FixGrammarRequestSchema.parse(body);
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json(
        { error: "Invalid request", issues: err.issues },
        { status: 400 },
      );
    }
    throw err;
  }

  let client;
  try {
    client = getOpenAIClient();
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
  const model = getOpenAIModel();

  const callOnce = async (extraSystem?: string): Promise<string> => {
    const completion = await client.chat.completions.create({
      model,
      // Low temperature: grammar fixes should be deterministic, not creative.
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        ...(extraSystem ? [{ role: "system" as const, content: extraSystem }] : []),
        { role: "user", content: parsed.text },
      ],
    });
    return completion.choices[0]?.message?.content ?? "";
  };

  const tryParse = (raw: string): FixGrammarResponse | null => {
    try {
      const json = JSON.parse(raw);
      const res = FixGrammarResponseSchema.safeParse(json);
      return res.success ? res.data : null;
    } catch {
      return null;
    }
  };

  try {
    let raw = await callOnce();
    let result = tryParse(raw);
    if (!result) {
      raw = await callOnce(STRICT_REMINDER);
      result = tryParse(raw);
    }
    if (!result) {
      return NextResponse.json(
        { error: "Model did not return corrected text" },
        { status: 502 },
      );
    }
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
