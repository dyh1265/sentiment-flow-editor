import { z } from "zod";

export const AnalyzeModeSchema = z.enum(["local", "llm"]);
export type AnalyzeMode = z.infer<typeof AnalyzeModeSchema>;

export const AnalyzeRequestSchema = z.object({
  text: z.string().min(1).max(20_000),
  mode: AnalyzeModeSchema.default("local"),
});
export type AnalyzeRequest = z.infer<typeof AnalyzeRequestSchema>;

export const SentimentLabelSchema = z.enum(["negative", "neutral", "positive"]);

export const ScoredSentenceSchema = z.object({
  text: z.string(),
  score: z.number().min(-1).max(1),
  label: SentimentLabelSchema,
  start: z.number().int().nonnegative().optional(),
  end: z.number().int().nonnegative().optional(),
});
export type ScoredSentenceDto = z.infer<typeof ScoredSentenceSchema>;

export const AnalyzeResponseSchema = z.object({
  sentences: z.array(ScoredSentenceSchema),
  mode: AnalyzeModeSchema,
});
export type AnalyzeResponse = z.infer<typeof AnalyzeResponseSchema>;

export const SuggestRequestSchema = z.object({
  sentence: z.string().min(1).max(2_000),
  before: z.string().max(4_000).optional(),
  after: z.string().max(4_000).optional(),
  targetScore: z.number().min(-1).max(1),
  n: z.number().int().min(1).max(5).default(3),
});
export type SuggestRequest = z.infer<typeof SuggestRequestSchema>;

export const SuggestionSchema = z.object({
  text: z.string().min(1),
  predictedScore: z.number().min(-1).max(1),
});
export type Suggestion = z.infer<typeof SuggestionSchema>;

export const SuggestResponseSchema = z.object({
  suggestions: z.array(SuggestionSchema).min(1),
});
export type SuggestResponse = z.infer<typeof SuggestResponseSchema>;
