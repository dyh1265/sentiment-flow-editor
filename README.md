# Sentiment Flow Editor

Paste text, see sentiment per sentence, visualize the emotional flow as a curve, pick a target arc, and get LLM rewrite suggestions for the sentences that deviate. Apply rewrites inline, toggle before/after, copy out the result.

**The entire app runs in your browser.** There is no backend. Local sentiment scoring (VADER) is pure JavaScript. LLM features (high-accuracy scoring, rewrite suggestions, grammar fix) call the OpenAI API directly from your browser using a key you paste into the Settings modal. The key is stored in `localStorage` and never leaves your device except to go straight to `api.openai.com`.

## Features

- Per-sentence sentiment scoring with a local analyzer (VADER, zero cost, offline) or OpenAI for higher accuracy.
- Interactive Recharts line chart with hover and click synchronization across the editor and chart.
- Three built-in target arcs: story (U-curve), persuasive (ramp), viral hook (hook-dip-payoff).
- Weak-sentence detection against the selected target arc.
- LLM-powered rewrite suggestions with schema-validated JSON and one retry on parse failure.
- One-click grammar/spelling fix that preserves tone and sentiment.
- Before / After toggle with chart animation and revert-to-original.
- Copy-to-clipboard, loading skeletons, error banners, empty state, and language-mismatch warnings.
- Bring Your Own Key: no auth, no billing, no server logs. The operator of a deployment never sees user text or keys.

## Stack

- Next.js 15 (App Router) in **static export** mode (`output: "export"`)
- TypeScript (strict), Tailwind CSS
- Recharts, Zod
- OpenAI JS SDK v4 (`dangerouslyAllowBrowser: true`)
- VADER Sentiment (`vader-sentiment`, pure JS)
- `franc-min` for client-side language detection
- Vitest (unit) + Playwright (E2E)

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Click **Settings** in the top-right to paste an OpenAI API key and pick a model. Local VADER mode works immediately with no key.

## Scripts

```bash
npm run dev       # dev server (localhost:3000)
npm run build     # static export -> ./out
npm run start     # serve ./out on :3000 (via `serve`)
npm run preview   # alias for start
npm run lint      # eslint
npm run format    # prettier write
npm test          # vitest unit tests
npm run test:e2e  # playwright e2e (builds + serves first)
```

## Environment variables

Only one, and it's optional:


| Name                   | Required | Default                 | Purpose                                                    |
| ---------------------- | -------- | ----------------------- | ---------------------------------------------------------- |
| `NEXT_PUBLIC_SITE_URL` | no       | `http://localhost:3000` | Absolute URL used for OpenGraph/Twitter metadata at build. |


There is no `OPENAI_API_KEY` env var — users add their own key through the Settings UI.

## Settings & API key

**Settings** (top-right) opens a modal where you pick a provider, paste its API key, and choose a model. Keys are stored per-provider so you can switch back and forth without retyping.

### Supported providers


| Provider                       | Free tier?          | Notes                                                                                                                                                                                                                                                                                          | Where to get a key                                                   |
| ------------------------------ | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| **OpenAI**                     | No (paid)           | Reliable JSON mode, best-calibrated for this app's prompts. Suggested models: `gpt-4o-mini`, `gpt-4o`, `gpt-4.1-mini`, `gpt-4.1`.                                                                                                                                                              | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |
| **Groq**                       | Yes                 | Very fast hosted inference. **Note:** Groq's API doesn't send permissive CORS headers, so browser-origin calls are blocked. Works only if you proxy through your own server.                                                                                                                   | [console.groq.com/keys](https://console.groq.com/keys)               |
| **OpenRouter**                 | Partial             | One key, many models. Supports browser CORS. Models ending in `:free` share a global pool and hit 429s often during peak hours. Suggested free: `meta-llama/llama-3.3-70b-instruct:free`, `deepseek/deepseek-chat-v3-0324:free`. Adding $10 of credit unlocks paid variants that cost pennies. | [openrouter.ai/keys](https://openrouter.ai/keys)                     |
| **Google Gemini**              | Yes, generous       | Your own quota (not a shared pool). ~15 RPM and ~1M tokens/day on `gemini-2.5-flash-lite`. Suggested: `gemini-2.5-flash-lite`, `gemini-2.5-flash`, `gemini-2.0-flash`.                                                                                                                         | [aistudio.google.com/apikey](https://aistudio.google.com/apikey)     |
| **Custom (OpenAI-compatible)** | Depends on endpoint | You supply the Base URL. Works with anything that speaks the OpenAI wire protocol — `https://openrouter.ai/api/v1`, `https://api.together.xyz/v1`, `https://api.mistral.ai/v1`, `http://localhost:11434/v1` (Ollama), LM Studio, self-hosted proxies, etc.                                     | Whichever provider you point at                                      |


OpenAI / Groq / OpenRouter / Custom all speak the OpenAI wire protocol and go through the same SDK client. Gemini has its own REST API, wrapped in `src/lib/client/chat.ts` behind the same `chat()` interface so the three consumer modules (`suggest`, `fixGrammar`, `scoreTextLLM`) don't care which provider is active. The model field is a free-text input with a datalist, so you can paste any model id the provider supports even if it's not in the suggestions.

**Using the Custom provider:** pick `Custom (OpenAI-compatible)` in Settings, paste a base URL (e.g. `https://openrouter.ai/api/v1`), paste the matching API key, type a model id, and save. The OpenAI SDK is pointed at that URL verbatim — no attribution headers are added, so it stays compatible with every endpoint. Use the dedicated OpenRouter provider instead if you want the `HTTP-Referer` / `X-Title` attribution headers.

### Storage

- `sfe.provider` — currently active provider
- `sfe.{openai,groq,openrouter,gemini,custom}.apiKey` — per-provider key
- `sfe.{openai,groq,openrouter,gemini,custom}.model` — per-provider model selection
- `sfe.custom.baseURL` — the URL the Custom provider points at

The **Clear saved key for X** link in Settings wipes just that provider's key. Any JavaScript running on this origin can read `localStorage`, so treat these like short-lived, scoped keys. If you're uncomfortable with that tradeoff, stick to local (VADER) mode — it works without any key.

## Deployment

Because the build output is a pile of static files, you can host it almost anywhere.

### Docker (nginx serving `out/`)

```bash
docker compose up --build
```

Then open [http://localhost:3000](http://localhost:3000). The image is `nginx:1.27-alpine` serving the exported site; there is no Node runtime in the final image.

```bash
docker build -t sentiment-flow-editor .
docker run --rm -p 3000:80 sentiment-flow-editor
```

### Vercel

`vercel.json` already sets `outputDirectory: "out"` so Vercel serves the static export as-is. No environment variables required.

### GitHub Pages

A ready-to-run workflow lives at [.github/workflows/pages.yml](.github/workflows/pages.yml). On every push to `master` (and on manual `workflow_dispatch`) it builds the static site with `GITHUB_PAGES=true` — which flips [next.config.mjs](next.config.mjs) into `basePath: /sentiment-flow-editor` mode so every asset URL is prefixed correctly — drops a `.nojekyll` in `out/` (GitHub Pages otherwise strips underscore-prefixed folders like `_next/`), and publishes the artifact via `actions/deploy-pages`.

**One-time setup** (required before the first deploy succeeds):

1. In GitHub, go to **Settings → Pages**.
2. Under **Source**, pick **GitHub Actions**.
3. Push to `master` (or run the workflow manually from the Actions tab).

The live URL is `https://<your-user>.github.io/sentiment-flow-editor/`. If you fork the repo under a different name, either rename the `basePath` default in `next.config.mjs` or set `NEXT_PUBLIC_BASE_PATH=/your-repo-name` in the workflow's build step.

### Any other static host

Run `npm run build`, then upload the contents of `out/` to Netlify, Cloudflare Pages, S3 + CloudFront, Surge, nginx, etc. SPA fallback to `/index.html` is handled by `trailingSlash: true` + generated `index.html` per route, so no rewrite rules are required for this single-page app.

## CI

GitHub Actions at [.github/workflows/ci.yml](.github/workflows/ci.yml) runs on every push and PR:

- `test` — `npm ci`, lint, unit tests, static export build, assert `out/index.html` exists.
- `e2e` — Playwright happy path against a freshly built + served static bundle.
- `docker` — Builds the nginx image via Buildx with Actions cache.

## Project structure

```
src/
  app/
    layout.tsx                  root layout, metadata
    page.tsx                    main editor page
    icon.svg                    favicon
    globals.css
  components/
    CopyButton.tsx
    EmptyState.tsx
    FixGrammarButton.tsx        calls lib/client/fixGrammar
    SettingsModal.tsx           API key + model input
  features/
    analysis/
      TextPane.tsx              editor with sentence-colored overlay
      SentimentChart.tsx        Recharts line chart with target overlay
    target-arcs/
      ArcPicker.tsx
    rewrite/
      SuggestionPanel.tsx
      BeforeAfterToggle.tsx
  hooks/
    useAnalyze.ts               debounced, in-browser analyzer
    useSuggest.ts
  lib/
    splitSentences.ts
    arcs.ts
    detectWeak.ts
    detectLanguage.ts
    schemas.ts                  Zod schemas + types
    client/                     browser-only, BYOK
      apiKey.ts                 localStorage + MissingApiKeyError
      openaiClient.ts           dangerouslyAllowBrowser client factory
      suggest.ts                rewrite suggestions (retry once)
      fixGrammar.ts             grammar fix (retry once)
    sentiment/
      types.ts
      local.ts                  VADER (browser-safe)
      llm.ts                    OpenAI JSON-mode scorer (browser)
tests/
  unit/                         splitter, arcs, detectWeak, local scorer,
                                language detect, client LLM modules
  e2e/                          Playwright happy path
docker/
  nginx.conf                    static-site nginx config
Dockerfile                      Node build stage -> nginx runtime stage
```

