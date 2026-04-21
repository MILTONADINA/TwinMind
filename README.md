# TwinMind — Live Suggestions

> Realtime AI meeting copilot. Listens to your mic, surfaces three useful suggestions every 30 seconds, and streams detailed answers on click. One continuous chat per session — no login, no persistence.

|                             |                                                                           |
| --------------------------- | ------------------------------------------------------------------------- |
| **Live app**                | _Deployed URL added after first Vercel deploy._                           |
| **Reference prototype**     | <https://claude.ai/public/artifacts/2d262df0-0353-47cc-a03a-de434aaa2552> |
| **Models (locked by spec)** | Groq — Whisper Large V3 for STT, GPT-OSS 120B for suggestions & chat      |
| **Hosting**                 | Vercel (Fluid Compute, Node.js 24)                                        |

---

## What it does

- **Left column — Mic & Transcript.** Click to start recording. Transcript appends in ~30-second chunks and auto-scrolls.
- **Middle column — Live Suggestions.** Every ~30 seconds (or when you hit Reload), a fresh batch of **exactly three** typed cards appears at the top. Older batches fade below but stay visible.
- **Right column — Chat.** Click a card to send it as a prompt — the detailed answer streams back with the full-transcript context. Users can also type questions directly. One continuous chat per session.
- **Settings.** The user pastes their own Groq API key. All system prompts and context windows are editable; defaults are the values we tuned.
- **Export.** One button, full session: transcript + every suggestion batch + full chat, all timestamped. JSON or plain text.

## Quickstart

```bash
git clone https://github.com/MILTONADINA/TwinMind.git
cd TwinMind
npm install
npm run dev
```

Then open <http://localhost:3000>, click **Settings**, paste your Groq API key (get one at <https://console.groq.com/keys>), click **Save**, and start talking.

Requirements: **Node 24** (see `.nvmrc`), a microphone, a Groq account.

## How it works

```
 ┌──────────────────────┐    30s chunk     ┌─────────────────────┐
 │ Browser MediaRecorder├─────────────────►│ /api/transcribe     │
 │ (webm/opus, 30s      │   multipart      │ Groq Whisper v3     │
 │  timeslice)          │                  │ → text + timestamps │
 └──────────────────────┘                  └──────────┬──────────┘
            ▲                                         │
            │ append chunk                            │
            │                                         ▼
 ┌──────────┴───────────┐    last ~5min   ┌─────────────────────┐
 │ Zustand session store├────────────────►│ /api/suggest        │
 │ • transcript[]       │   rolling ctx   │ GPT-OSS 120B, JSON  │
 │ • batches[]          │                 │ → 3 typed cards     │
 │ • messages[]         │                 └──────────┬──────────┘
 │ • settings           │                            │
 └──────────┬───────────┘                            │ prepend
            │                                        │
            │ click card / type                      ▼
            │                               ┌─────────────────────┐
            └──────────────────────────────►│ /api/chat (SSE)     │
                                            │ GPT-OSS 120B stream │
                                            │ → detailed answer   │
                                            └─────────────────────┘
```

- **Groq API key** lives in the browser's `sessionStorage` for the tab lifetime only. It is forwarded per-request as the `x-groq-key` header. Server routes proxy straight to `api.groq.com` and never persist, log, or cache the key or the audio.
- **No server-side state.** Reloading the page wipes everything — by design, per spec.
- **Fluid Compute** is the runtime target: default `nodejs` runtime, streaming responses via Web Streams, graceful cancellation when the user hits Reload.

See **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** for the full system design.

## Stack

| Layer         | Choice                                                   | Why                                                                                            |
| ------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Framework     | **Next.js 16** (App Router)                              | Route handlers, streaming, first-class Vercel runtime, typed routes, TypeScript-native config. |
| Runtime       | **Node.js 24** on Fluid Compute                          | Required for the Groq SDK; streaming + request cancellation out of the box.                    |
| Language      | **TypeScript 5.7** (strict + `noUncheckedIndexedAccess`) | Compiler-level safety on a codebase that touches audio buffers and parsed JSON.                |
| Styling       | **Tailwind CSS v4**                                      | CSS-first config keeps theme tokens inline with the prototype's dark palette.                  |
| UI primitives | **shadcn/ui** (Radix under the hood)                     | Copy-in primitives — no opaque dep, full control, accessible by default.                       |
| State         | **Zustand**                                              | Three columns subscribe to slices; no Context re-render fan-out, no Redux boilerplate.         |
| Icons         | **lucide-react**                                         | Matches prototype's line-icon look.                                                            |
| Toasts        | **sonner**                                               | Non-intrusive error surfacing (mic denial, key missing, API failure).                          |
| LLM SDK       | **groq-sdk** (official)                                  | Streaming-first, matches the Vercel AI Gateway contract if we ever swap.                       |

See **[docs/TRADEOFFS.md](docs/TRADEOFFS.md)** for what we considered and rejected.

## Prompt strategy

The evaluation hinges on showing the **right thing at the right time**. Four principles drive our prompts:

1. **Context is a rolling window, not the full transcript.** The suggestion call sees the last ~5 minutes (configurable). Older content crowds out signal. The detailed-answer call sees the full transcript because depth matters there.
2. **The model chooses its own mix — we constrain it to 3 cards across 4 categories** (`question`, `talking_point`, `answer`, `fact_check`) and ask it to optimise for variety and immediate usefulness. We explicitly instruct the model that the preview must already deliver value without a click.
3. **JSON mode, not regex parsing.** Structured output via Groq's `response_format: { type: 'json_object' }`, with a schema-guided system prompt and one retry on malformed JSON. The shape is small and enforceable.
4. **Defaults are opinionated, but everything is editable.** Prompts and context windows live in the Settings page. Reviewers can A/B our defaults against their own without re-deploying.

The full prompts, rationale, and failure-mode handling live in **[docs/PROMPT_STRATEGY.md](docs/PROMPT_STRATEGY.md)**.

## Security

- **No server-persisted secrets.** The Groq key is user-provided, held in `sessionStorage`, forwarded per-request, and never logged.
- **No server state for audio.** Audio chunks stream through `/api/transcribe` to Groq and the server retains nothing.
- **No telemetry.** `poweredByHeader` off, Next telemetry disabled in CI, no analytics SDK.
- **Locked model provider.** All inference goes to `api.groq.com` via the official SDK over HTTPS.

Details in **[SECURITY.md](SECURITY.md)**.

## Spec compliance checklist

| Requirement                                                                | Where                                          |
| -------------------------------------------------------------------------- | ---------------------------------------------- |
| Start/stop mic button                                                      | `src/components/columns/transcript-column.tsx` |
| Transcript appends every ~30s, auto-scrolls                                | `src/lib/recorder.ts`, transcript column       |
| Transcript + suggestions auto-refresh every ~30s                           | session store interval                         |
| Manual Reload button updates transcript then suggestions                   | suggestions column header                      |
| Exactly 3 fresh suggestions per refresh                                    | `src/app/api/suggest/route.ts`                 |
| New batch prepends; older batches visible (faded)                          | suggestions column                             |
| Typed, tappable cards (question / talking_point / answer / fact_check)     | card component                                 |
| Click → detailed answer with full-transcript context                       | `src/app/api/chat/route.ts`                    |
| Type-anything chat input                                                   | chat column                                    |
| One continuous chat per session, no login, no persistence                  | session store                                  |
| Export full session with timestamps (JSON + TXT)                           | `src/lib/export.ts`                            |
| Settings: user pastes Groq key, prompts editable, context windows editable | `/settings` page                               |
| Models: Whisper Large V3 + GPT-OSS 120B, same for everyone                 | `src/lib/groq.ts`                              |
| Public deploy URL + public GitHub repo                                     | Vercel + this repo                             |

## Development

```bash
npm run dev         # dev server with Turbopack
npm run typecheck   # tsc --noEmit
npm run lint        # eslint (next/core-web-vitals + next/typescript)
npm run format      # prettier --write .
npm run check       # typecheck + lint + format:check
npm run build       # production build
```

CI runs all checks + a production build on every push and PR (`.github/workflows/ci.yml`).

## Deployment

```bash
vercel link         # once
vercel              # preview
vercel --prod       # production
```

No environment variables are required — the Groq key is user-provided at runtime.

## License

MIT — see [LICENSE](LICENSE).
