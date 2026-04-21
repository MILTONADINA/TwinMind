# Tradeoffs

Every decision here was a fork. This doc records the alternative and why we didn't take it.

## Chunked transcription over streaming

- **Chose:** `MediaRecorder` with a 30-second `timeslice`, one POST per chunk to `/api/transcribe`, which calls Groq Whisper Large V3 non-streaming.
- **Rejected:** WebSocket streaming to Deepgram / a streaming STT with word-level timestamps.
- **Why:** The spec locks STT to Groq Whisper Large V3, which is not a streaming API. Even if it were, the spec asks for transcript to append in ~30-second chunks — streaming would be a nicer UX but not what the evaluators are grading. Chunked is simpler, matches the spec, and lets us focus time on prompt engineering (the actual scored dimension).

## No backend state

- **Chose:** All session state (transcript, batches, chat, settings) in Zustand in the browser tab. Server routes are stateless proxies.
- **Rejected:** Redis / Postgres / Durable Objects to survive reloads.
- **Why:** The spec says "no login, no data persistence needed when reloading the page." Adding a database invents requirements the assignment doesn't have, multiplies the security surface (where does the key go, who can read the transcript), and slows down the happy path.

## Vercel Workflow — skipped

- **Rejected:** Vercel Workflow for the suggestion loop and chat streaming.
- **Why:** Workflow is for durable, long-running, crash-safe orchestration (retries, pause/resume). Our loops are ephemeral by spec — a page reload is meant to wipe state. Workflow adds complexity for zero user-visible benefit.

## Next.js 16 App Router over Vite/Express

- **Chose:** Next.js 16 App Router with co-located route handlers.
- **Rejected:** A Vite + Express (or Hono) split.
- **Why:** First-class streaming via Web Streams, native Fluid Compute targeting on Vercel, `next/font` and `next/image` handle fonts/images with zero config, and there is exactly one `build` command for deployment. The code we'd otherwise write to glue Vite + a Node server together is not code the evaluators asked for.

## Zustand over Redux / Context / Jotai

- **Chose:** Zustand.
- **Rejected:** React Context (too many components subscribe; every update re-renders the tree). Redux + Toolkit (heavier, boilerplate-y, adds a devtools dep we don't need). Jotai (fine, but atom-per-field is overkill here — we have four domains, not forty).
- **Why:** Three columns × handful of slices. Zustand gives us selector-based subscriptions so each column only re-renders for its own slice. Small API, tiny bundle, no provider needed.

## shadcn/ui over a component library

- **Chose:** shadcn/ui (copy-in primitives over Radix).
- **Rejected:** MUI, Chakra, Mantine, Ant.
- **Why:** Every non-shadcn library would require theme overrides to match the prototype's dark palette and typography, and would ship components we don't use. shadcn puts the primitives in `src/components/ui/` — we own them and can style them directly in Tailwind v4 tokens.

## JSON mode over regex parsing

- **Chose:** `response_format: { type: 'json_object' }` + client-side schema validation.
- **Rejected:** Asking the model to emit a specific text format and parsing it.
- **Why:** Groq's JSON mode is reliable enough that the parsing code is ~5 lines. Text formats drift subtly (trailing whitespace, stray Markdown) and cost a retry every ~20 refreshes; JSON mode costs maybe one retry every few hundred.

## Client `setInterval` over server cron

- **Chose:** `setInterval` in the page, driven by the store's `refreshIntervalMs`.
- **Rejected:** Vercel Cron Jobs, scheduled triggers.
- **Why:** The refresh is per-user, per-tab, user-pausable (stop mic = stop refresh). A server cron has none of those properties and would need a channel back to the tab. The client is the authority for "are we currently listening."

## sessionStorage for the API key (not localStorage)

- **Chose:** `sessionStorage` — scoped to the tab, cleared on close.
- **Rejected:** `localStorage` — convenience, persists across sessions.
- **Why:** The spec asks for a user-paste-your-own-key flow with no persistence semantics. sessionStorage is the least surprising default: nothing lingers across browser restarts, nothing to leak if the laptop is shared. Reviewers re-paste on reload (one action), which is a trivially small cost for a clean security story.

## Node.js runtime everywhere

- **Chose:** `export const runtime = 'nodejs'` on every route.
- **Rejected:** Edge runtime.
- **Why:** The Groq SDK uses Node APIs. Fluid Compute on Node reuses function instances across concurrent requests, so cold-start cost is amortised across the session. Edge buys us lower TTFB in exchange for compatibility headaches that the spec-locked stack doesn't need.

## One `/api/chat` route for clicks and typed messages

- **Chose:** Single route, same SSE contract, different `systemPrompt` from settings.
- **Rejected:** Two routes (`/api/detail`, `/api/ask`).
- **Why:** The request shape is identical (messages + transcript + system prompt). Two routes would be copy-paste with a prompt constant swapped. The `systemPrompt` is already user-editable in Settings, so different defaults are one store field, not one route file.

## Tests: pure-function unit tests, no integration / e2e

- **Chose:** Vitest with focused unit tests for the pure parsers that the
  type system cannot guarantee — `parseCards`, `transcriptWindow`,
  `snapshotToJson` / `snapshotToText`.
- **Rejected:** Component tests (React Testing Library), API-route tests
  with a mocked Groq SDK, and Playwright end-to-end tests.
- **Why:** The spec explicitly says _"Do not over-engineer. We are not evaluating production-readiness at scale."_ Three categories divide cleanly:
  1. **Pure functions with tricky correctness** (JSON schema validation,
     time-windowed filtering, structured export). TypeScript can't catch
     a bad-JSON recovery path or a "fall back to last N chunks" branch.
     A dozen table-driven unit tests lock these down in under 100 lines
     — cheap, durable, no mocks required. These are in.
  2. **Code paths against external services** (Groq SDK, MediaRecorder).
     Meaningful tests require non-trivial mocks that tend to drift from
     real behaviour. The interview uses the deployed app live — that's
     the real test harness.
  3. **Model behaviour.** Judgement, not assertions. LLM-eval frameworks
     are out of scope.
