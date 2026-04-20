import { NextResponse } from "next/server";
import { ZodError } from "zod";
import {
  SuggestRequestSchema,
  SuggestResponseSchema,
  type SuggestResponse,
} from "@/lib/schemas";
import { getOpenAIClient, getOpenAIModel } from "@/lib/openai";

export const runtime = "nodejs";

const SYSTEM_PROMPT = [
  "You rewrite a single sentence to shift its emotional sentiment toward a target score in [-1, 1].",
  "Rules: preserve the sentence's original meaning, entities, tense, and point of view.",
  "Do not add new facts or change what the sentence asserts; only change tone and word choice.",
  "Return strict JSON matching this schema:",
  `{"suggestions":[{"text": string, "predictedScore": number between -1 and 1}]}`,
  "Return exactly the requested number of suggestions. Output JSON only, no prose.",
].join(" ");

const STRICT_REMINDER =
  "Your previous reply was not valid JSON matching the schema. Respond with ONLY a JSON object " +
  `of the form {"suggestions":[{"text":"...","predictedScore":0.5}]}.`;

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  let parsed;
  try {
    parsed = SuggestRequestSchema.parse(body);
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json(
        { error: "Invalid request", issues: err.issues },
        { status: 400 },
      );
    }
    throw err;
  }

  const userPayload = JSON.stringify({
    sentence: parsed.sentence,
    before: parsed.before ?? "",
    after: parsed.after ?? "",
    targetScore: parsed.targetScore,
    n: parsed.n,
  });

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
      temperature: 0.7,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        ...(extraSystem ? [{ role: "system" as const, content: extraSystem }] : []),
        { role: "user", content: userPayload },
      ],
    });
    return completion.choices[0]?.message?.content ?? "";
  };

  const tryParse = (raw: string): SuggestResponse | null => {
    try {
      const json = JSON.parse(raw);
      const res = SuggestResponseSchema.safeParse(json);
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
        { error: "Model did not return valid suggestions" },
        { status: 502 },
      );
    }
    const trimmed: SuggestResponse = {
      suggestions: result.suggestions.slice(0, parsed.n),
    };
    return NextResponse.json(trimmed);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
