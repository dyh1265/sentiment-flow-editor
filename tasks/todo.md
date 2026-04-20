# Sentiment Flow Editor — Task Checklist

## Phases

- [x] Phase 1 — Setup (Next.js + TS + Tailwind + ESLint/Prettier, folder structure, .env.example, README, /api/health)
- [x] Phase 2 — Sentence processing (splitSentences + local VADER scorer + label + Vitest unit tests)
- [x] Phase 3 — UI core (2-column layout, TextPane with sentence highlighting, SentimentChart, hover sync)
- [x] Phase 4 — Target arcs (arcs.ts, ArcPicker, overlay on chart, detectWeak + unit tests)
- [x] Phase 5 — Rewrite suggestions (/api/suggest with Zod + retry, SuggestionPanel, apply flow, LLM mode in /api/analyze)
- [x] Phase 6 — Before/After (original snapshot, toggle, chart animation, revert)
- [x] Phase 7 — UX polish (copy-to-clipboard, loading state, error banner, empty state)
- [x] Phase 8 — Tests (40 unit+integration passing + Playwright happy path passing)
- [x] Phase 9 — DevOps (GitHub Actions: lint/test/build, e2e, docker build; vercel.json)
- [x] Phase 10 — Launch polish (SVG favicon, dynamic OG image, polished README, v1.0.0 tag instructions)

Plus (on user request): Dockerfile + docker-compose.yml for the Next.js server (conditional `output: standalone` via `BUILD_STANDALONE=1`).

## Review

### Verification run

- `npm test` — 40/40 Vitest tests passing (6 files: splitSentences, local scorer, arcs, detectWeak, analyze route, suggest route).
- `npm run test:e2e` — Playwright happy path passing against a real production server (load sample → chart renders → arc toggles → edit → before/after → copy).
- `npm run lint` — no warnings or errors.
- `npm run build` — clean production build; routes registered: `/`, `/api/analyze`, `/api/health`, `/api/suggest`, `/icon.svg`, `/opengraph-image`.

### Behavior diff vs. plan

- Plan said TextPane should use a textarea + highlighted overlay — implemented exactly that (overlay div mirrors the textarea, scroll-synced, clickable sentence spans).
- Plan specified "no database" / "no auth" — respected. All state is in-memory React state with an `original` snapshot for Before/After.
- Sentence splitter extends the plan's spec: handles ellipses (`...`/`…`) as non-terminal when mid-prose, which matches expected editorial behavior; collapses `?!` / `!!!`; treats double newlines as hard boundaries.
- LLM rewrite retry: one strict-reminder retry, then 502 — matches the plan.
- Chart animation uses Recharts' built-in `isAnimationActive` on the actual line, 400ms duration.
- Docker (added per user request) uses Next's `output: standalone`, gated behind `BUILD_STANDALONE=1` so local `next start` keeps working.

### Residual risks

- LLM score predictions in `/api/suggest` are produced by the model; they are best-effort and not re-scored locally. A follow-up could pipe each suggestion through VADER for a second opinion.
- VADER is English-only. Users with multilingual text should toggle the "High-accuracy (LLM)" switch.
- Textarea overlay can drift if a custom font is loaded after first paint; we use a system monospace stack to avoid this.
- Playwright E2E boots a full production server (~30-60s on CI); acceptable for a single happy-path test but would need parallelization if the suite grows.
- `next lint` is deprecated in favor of direct ESLint; migration is a Next 16 concern and out of scope for v1.0.0.
