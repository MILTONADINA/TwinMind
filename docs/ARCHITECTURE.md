# Architecture

## Design goals

1. **Feel instant.** Measure reload-to-first-suggestion and chat-to-first-token; keep both under a second after network cost.
2. **No state on the server.** The server is a thin, stateless proxy over Groq. All session state lives in the browser tab and dies on reload — the spec requires this, and it removes a whole class of security and ops concerns.
3. **Readable code path per feature.** One column = one component subtree = one slice of state. A reader should be able to start at `src/app/page.tsx` and trace any user action to its API handler in under a minute.

## Component map

```
src/
├── app/
│   ├── api/
│   │   ├── transcribe/route.ts   POST: audio chunk → text
│   │   ├── suggest/route.ts      POST: transcript window → 3 cards
│   │   └── chat/route.ts         POST: prompt + transcript → SSE stream
│   ├── settings/page.tsx         Key + prompts + knobs
│   ├── layout.tsx                Root, dark theme, toaster
│   ├── page.tsx                  3-column shell
│   ├── globals.css               Tailwind v4 tokens
│   └── error.tsx                 Graceful route-level error boundary
├── components/
│   ├── columns/
│   │   ├── transcript-column.tsx
│   │   ├── suggestions-column.tsx
│   │   └── chat-column.tsx
│   └── ui/                        shadcn primitives
├── lib/
│   ├── groq.ts                    Thin SDK wrappers + fetch helpers
│   ├── prompts.ts                 Default system prompts (exported constants)
│   ├── recorder.ts                MediaRecorder wrapper, 30s timeslice
│   ├── export.ts                  Session → JSON / TXT
│   └── utils.ts                   cn() + small helpers
├── stores/
│   └── session.ts                 Zustand store (transcript, batches, chat, settings)
└── types/
    └── index.ts                   Shared types (Chunk, Batch, Card, Message)
```

## Data model

```ts
type Chunk = {
  id: string;
  startedAt: number; // epoch ms
  durationMs: number;
  text: string;
};

type CardType = 'question' | 'talking_point' | 'answer' | 'fact_check';

type Card = {
  id: string;
  type: CardType;
  title: string; // short, already-useful preview
  preview: string; // 1–2 sentences elaborating the title
};

type Batch = {
  id: string;
  createdAt: number;
  cards: [Card, Card, Card]; // exactly three
};

type Message = {
  id: string;
  role: 'user' | 'assistant';
  createdAt: number;
  content: string;
  sourceCardId?: string; // set when a suggestion click seeded the message
};

type Settings = {
  groqApiKey: string; // sessionStorage only
  prompts: {
    suggest: string;
    detail: string;
    chat: string;
  };
  suggestContextMinutes: number; // default 5
  detailContextMinutes: number; // default Infinity (full)
  refreshIntervalMs: number; // default 30_000
  chunkMs: number; // default 30_000
};
```

## Request flow

### 1. Start recording → transcript chunk

```
User clicks mic
  → recorder.start() with { timeslice: chunkMs }
  → every chunkMs, onDataAvailable fires
  → POST /api/transcribe (multipart/form-data, x-groq-key header)
    → route forwards to Groq Whisper Large V3
    → { text, startedAt, durationMs } appended to store.chunks
  → transcript column re-renders, scrolls to bottom
```

### 2. Auto-refresh suggestions (every 30s)

```
setInterval in page
  → pull last suggestContextMinutes of transcript from store
  → POST /api/suggest with { transcript, prompt }
  → route calls Groq chat.completions with response_format: { type: 'json_object' }
  → parse + validate exactly three cards, each with a valid CardType
  → on malformed: one retry with a stricter "return valid JSON only" nudge
  → store.prependBatch(batch); newest floats to top, older fade
```

The **Reload suggestions** button runs the same pipeline immediately and resets the interval.

### 3. Click suggestion → streaming detailed answer

```
User taps a card
  → store.appendMessage({ role: 'user', content: card.title, sourceCardId: card.id })
  → POST /api/chat with { messages, transcript, prompt: settings.prompts.detail }
  → route pipes Groq streaming response into a ReadableStream (SSE)
  → client reads Response.body, appends tokens to the active assistant message
  → AbortController cancels cleanly if the user closes the tab / navigates
```

### 4. Free-form chat

Same as (3) but triggered by the chat input rather than a card. The system prompt is `settings.prompts.chat` instead of `.detail` — slightly different tone and length targets.

## API contracts

All three routes use the Node.js runtime (Fluid Compute) and expect the header `x-groq-key: <user-provided key>`.

### `POST /api/transcribe`

- **Body:** `multipart/form-data` with a single `audio` field (webm/opus from MediaRecorder).
- **Response:** `{ text: string, startedAt: number, durationMs: number }`
- **Errors:** `401` if key missing, `502` if Groq rejects, `413` if audio > 25 MB.

### `POST /api/suggest`

- **Body:** `{ transcript: string, systemPrompt?: string }`
- **Response:** `{ cards: [Card, Card, Card] }`
- **Errors:** `401`, `502`, `422` if model output is unparseable after one retry.

### `POST /api/chat`

- **Body:** `{ messages: Message[], transcript: string, systemPrompt?: string }`
- **Response:** `text/event-stream`. Each event is a JSON line `{ delta: string }`. Terminator: `{ done: true }`.
- **Errors:** before stream opens: `401` / `502`. Mid-stream: error event `{ error: string }` then close.

## Performance budget

| Metric                             | Target                      | Measurement           |
| ---------------------------------- | --------------------------- | --------------------- |
| Reload click → first card rendered | ≤ 1200 ms                   | client timestamp diff |
| Chat send → first token            | ≤ 800 ms                    | first SSE event       |
| 30s chunk → transcript append      | ≤ 1500 ms after chunk close | client timestamp diff |

Suggestion route is `temperature: 0.4` and capped at ~600 tokens — generation is fast because the output shape is small. Chat route is `temperature: 0.5` with no hard cap; first-token latency dominates perceived speed, which is why we stream.

## Error handling

- **Mic permission denied** → toast + reset mic button to idle.
- **No API key** → route returns `401`; client toast with a link to `/settings`.
- **Groq 5xx** → toast + keep the last-good batch on screen, don't blank the column.
- **Malformed JSON from suggest** → one retry with stricter prompt; on second failure, toast + skip this refresh (don't break the interval).
- **Stream cancellation** → `AbortController` on every fetch; on reload click, abort in-flight suggest before starting the new one.

## Runtime

- All routes: `export const runtime = 'nodejs'` (explicit — we rely on the Node stdlib and the Groq SDK).
- No edge middleware / proxy (Next 16 renamed `middleware` → `proxy`) — the app doesn't need pre-cache request interception.
- No `use cache` directives — there is nothing cacheable; every request is live, user-scoped, and key-scoped.
