# Sentiment Flow Editor

Paste text, see sentiment per sentence, visualize emotional flow as a curve, pick a target arc, and get LLM rewrite suggestions for the sentences that deviate. Apply rewrites inline, toggle before/after, copy out the result.

## Features

- Per-sentence sentiment scoring with either a local analyzer (VADER, zero cost) or OpenAI for higher accuracy.
- Interactive Recharts line chart with hover synchronization across the editor and chart.
- Three built-in target arcs: story (U-curve), persuasive (ramp), viral hook (hook-dip-payoff).
- Weak-sentence detection against the selected target arc.
- LLM-powered rewrite suggestions with schema-validated JSON and a single retry on parse failure.
- Before / After toggle with chart animation and one-click revert to the original text.
- Copy-to-clipboard, loading skeletons, error banners, and a clean empty state.

## Stack

- Next.js 15 (App Router) + TypeScript (strict)
- Tailwind CSS
- Recharts
- Zod
- OpenAI (model configurable via `OPENAI_MODEL`, defaults to `gpt-4o-mini`)
- Vitest (unit + integration) + Playwright (E2E)

## Getting started (Node)

```bash
npm install
cp .env.example .env.local   # fill OPENAI_API_KEY to use LLM features
npm run dev
```

Open <http://localhost:3000>.

Local VADER scoring works with no API key. LLM mode and rewrite suggestions require `OPENAI_API_KEY`.

## Scripts

```bash
npm run dev        # dev server
npm run build      # production build
npm run start      # run production build
npm run lint       # eslint
npm run format     # prettier write
npm test           # vitest unit + integration (40 tests)
npm run test:e2e   # playwright e2e (boots a production server)
```

## Environment variables

| Name             | Required                            | Default       | Purpose                                                  |
| ---------------- | ----------------------------------- | ------------- | -------------------------------------------------------- |
| `OPENAI_API_KEY` | yes, for LLM mode and /api/suggest  | —             | Authenticates the OpenAI client                          |
| `OPENAI_MODEL`   | no                                  | `gpt-4o-mini` | Overrides the OpenAI model used for analysis & rewriting |
| `BUILD_STANDALONE` | no (set to `1` in Docker builds)  | unset         | Emits a self-contained `server.js` bundle                |

## API

- `GET  /api/health` → `{ status: "ok" }`
- `POST /api/analyze` → body `{ text, mode: "local" | "llm" }` → `{ sentences: [{ text, score, label, start?, end? }], mode }`
- `POST /api/suggest` → body `{ sentence, before?, after?, targetScore, n? }` → `{ suggestions: [{ text, predictedScore }] }`

All inputs and outputs are Zod-validated.

## Docker

Multi-stage Node 22 Alpine image using Next's standalone output. Build is gated on `BUILD_STANDALONE=1` (set by the Dockerfile) so `next start` still works for non-container workflows.

```bash
cp .env.example .env
docker compose up --build
```

Then hit <http://localhost:3000>. The container exposes a healthcheck at `/api/health`.

Without compose:

```bash
docker build -t sentiment-flow-editor .
docker run --rm -p 3000:3000 \
  -e OPENAI_API_KEY=sk-... \
  -e OPENAI_MODEL=gpt-4o-mini \
  sentiment-flow-editor
```

## Deployment

- **Vercel** — `vercel.json` pins Node build and install. Set `OPENAI_API_KEY` (and optionally `OPENAI_MODEL`) as project environment variables.
- **Any container host** — push the Docker image to Fly.io, Railway, ECS, GCP Cloud Run, etc.

## CI

GitHub Actions at [.github/workflows/ci.yml](.github/workflows/ci.yml) runs on every push and PR:

- `test` job — `npm ci`, lint, unit+integration tests, `next build`.
- `e2e` job — Playwright happy path against a real production server.
- `docker` job — Builds the image via Buildx with GitHub Actions cache.

## Project structure

```
src/
  app/
    layout.tsx              # root layout, OG/metadata
    page.tsx                # main editor page
    icon.svg                # favicon
    opengraph-image.tsx     # dynamic OG image
    api/
      analyze/route.ts      # sentiment scoring (local or LLM)
      suggest/route.ts      # LLM rewrite suggestions (retry once)
      health/route.ts       # { status: "ok" }
  components/
    CopyButton.tsx
    EmptyState.tsx
  features/
    analysis/
      TextPane.tsx          # editor with sentence-colored overlay
      SentimentChart.tsx    # Recharts line chart with target overlay
    target-arcs/
      ArcPicker.tsx
    rewrite/
      SuggestionPanel.tsx
      BeforeAfterToggle.tsx
  hooks/
    useAnalyze.ts           # debounced analyzer with abort
    useSuggest.ts
  lib/
    splitSentences.ts
    arcs.ts
    detectWeak.ts
    schemas.ts              # all Zod schemas and types
    openai.ts               # lazy OpenAI client
    sentiment/
      types.ts
      local.ts              # VADER
      llm.ts                # OpenAI JSON-mode scorer
tests/
  unit/                     # splitter, arcs, detectWeak, local scorer
  integration/              # analyze + suggest API routes (OpenAI mocked)
  e2e/                      # Playwright happy path
```

## Release

Ship v1.0.0 with:

```bash
git tag -a v1.0.0 -m "Sentiment Flow Editor v1.0.0"
git push --tags
```
