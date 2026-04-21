# Security

## Threat model

TwinMind is a single-page web app that proxies user-provided credentials to a third-party LLM provider (Groq) and processes user microphone audio. The assets we protect, in priority order:

1. **The user's Groq API key** — the most sensitive thing in the system.
2. **Meeting audio and transcripts** — potentially confidential by content, even though the app has no login.
3. **The chat history** — often contains the sensitive parts of the transcript distilled.

## API key handling

- **Entry.** The key is entered on the `/settings` page by the user. The input is `type="password"` and never echoed back after save.
- **Storage.** The key lives only in the browser tab's `sessionStorage` for the duration of the tab. It is never written to `localStorage`, a cookie, IndexedDB, or any server-side store.
- **Transit.** The key is sent per-request as an `x-groq-key` header over HTTPS to our own origin. The Next.js route handler reads the header, forwards the request to `api.groq.com` via the official `groq-sdk`, and returns the response. The server never logs the header value.
- **Lifetime.** Closing the tab wipes the key. There is no "remember me."
- **No shared key.** We do not ship a service key. The app is unusable until the user provides their own — this is intentional, per the spec.

## Audio handling

- Audio is captured via the browser `MediaRecorder` with user consent (browser-enforced permission prompt).
- Each ~30-second chunk is POSTed to `/api/transcribe` as `multipart/form-data` and streamed through to Groq.
- The server retains nothing: no disk writes, no in-memory buffers beyond the scope of a single request, no structured logs containing the audio stream.
- Transcripts live in the browser tab's Zustand store only. They die on reload by design.

## Transport

- All third-party traffic goes to `https://api.groq.com` via the official `groq-sdk` (TLS, certificate pinning handled by Node.js).
- No analytics SDKs, no third-party pixels, no CDN JS other than Next.js framework assets. `poweredByHeader` is off.

## Logging

- Route handlers do not log request bodies, the `x-groq-key` header, or model outputs.
- Error paths log a sanitized message (`"Groq returned 502"`) without the underlying response body.
- Next.js telemetry is disabled in CI.

## What this app does _not_ protect against

- **A malicious browser extension.** Extensions with content-script permissions on the page can read `sessionStorage`. This is a platform limitation, not something this app can mitigate.
- **A user pasting their key on a shared machine and closing the tab mid-session.** The key is in sessionStorage until the tab closes — someone with physical access to the browser before then could read it via devtools. This is explicitly accepted in exchange for the "paste-and-go" UX the spec requires.
- **Groq-side logging.** Once a request crosses into `api.groq.com`, Groq's retention policies apply. We direct users to review them at <https://groq.com/privacy>.

## Dependency hygiene

- `eslint-config-next` + `@typescript-eslint` catch the common injection/XSS mistakes on the frontend.
- `npm audit` runs as part of CI review (not failing CI — too noisy — but reviewed before each release).
- GitHub secret-scanning and push protection are enabled on the repo.

## Reporting a vulnerability

Open a private security advisory on the GitHub repository. Do not file a public issue.
