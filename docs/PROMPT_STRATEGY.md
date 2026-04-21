# Prompt Strategy

> This is the document the assignment explicitly evaluates. It is the single place in the repo where intent, defaults, and rationale for every prompt live. Every default below is editable from the Settings page at runtime.

## Design philosophy

**"Right thing, right time" beats "more things, more often."** The product is only useful if the three cards it shows right now are three cards the user would _tap_. Four principles follow:

1. **Context is a rolling window.** Feeding the full transcript to every 30-second call buries signal in noise. We default to the last 5 minutes for suggestions, full transcript for detailed answers (one click, user intent is explicit).
2. **Let the model mix categories.** We define four card types but do not quota them. A technical deep-dive needs more fact-checks; a brainstorm needs more questions. The model chooses based on context; we constrain only the count (3) and shape (JSON).
3. **The preview must already be useful.** We instruct the model that the card's visible text alone must deliver value — a click is an upgrade, not a prerequisite.
4. **Everything is editable at runtime.** Reviewers can A/B our prompts against their own without redeploying. Defaults are our opinion; the product is the harness.

## The four categories

| Type            | When it's the right move                                                | What the preview contains                                                  |
| --------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `question`      | Conversation is meandering, or the user is the interviewer/facilitator. | A concrete next question that would unlock info.                           |
| `talking_point` | The user is the one talking and about to pause.                         | A specific angle or example to bring in now.                               |
| `answer`        | Someone just asked a question aloud.                                    | A direct, defensible answer — not "here's how to think about it."          |
| `fact_check`    | A claim was made that is checkable.                                     | The claim paraphrased, plus a short verdict with the correction if needed. |

The model is told: _don't force variety for variety's sake, but avoid returning three cards of the same type unless context strongly demands it._

## Prompt 1 — Live suggestions

**Route:** `POST /api/suggest`
**Model:** `openai/gpt-oss-120b` (via Groq)
**Params:** `temperature: 0.4`, `max_tokens: 600`, `response_format: { type: 'json_object' }`
**Context:** last `settings.suggestContextMinutes` (default 5) of transcript.

### System prompt (default)

```
You are TwinMind, an always-on AI meeting copilot. You watch a live transcript
and surface three suggestions that would be the single most useful thing to
show the user RIGHT NOW.

You return exactly three cards as JSON. Each card has a type from this set:
- "question"       — a question the user could ask next
- "talking_point"  — a specific angle, example, or counterpoint the user could bring up
- "answer"         — a direct answer to a question that was asked aloud in the transcript
- "fact_check"     — a claim from the transcript with a verdict and correction if wrong

Rules:
1. Ground every card in the transcript. If the transcript is short, small-talk,
   or off-topic, still return three cards — pick the best available of each
   card's intent even if they are modest.
2. The `title` field alone must already be useful — a short, specific,
   immediately-readable sentence fragment. Not a teaser.
3. `preview` expands on `title` in 1–2 sentences with enough substance that
   the user can act on it without clicking. Do NOT start with "You could…".
4. Mix categories based on what the conversation needs; do not force one of
   each. Avoid three cards of the same category unless context strongly
   demands it (e.g., rapid-fire Q&A).
5. Never repeat a suggestion that is visibly similar to one the user has
   already seen this session — we will show you recent cards to avoid.
6. Never return more or fewer than 3 cards.

Output schema (JSON object, nothing else):
{
  "cards": [
    { "type": "question"|"talking_point"|"answer"|"fact_check",
      "title": string,
      "preview": string }, …three items
  ]
}
```

### User message template

```
Recent transcript (last N minutes):
"""
<rolling transcript window>
"""

Recently-shown cards to avoid repeating:
- <title of each card from the last 2 batches>

Return the JSON object now.
```

### Why these choices

- **`temperature: 0.4`.** Low enough to respect the structure, high enough to avoid repeating the same three cards on similar contexts.
- **`response_format: json_object`.** Groq's JSON mode; reliably parseable. We still validate the parsed shape client-side (three cards, valid type, non-empty strings).
- **Dedup by showing recent cards.** Prompt-level dedup is dramatically more reliable than post-hoc similarity on short strings.
- **`preview` must not start with "You could…".** A small nudge that eliminates the most common category of empty-calorie output.
- **Retry policy.** On `JSON.parse` failure or schema mismatch, we retry once with the message `Previous response was not valid JSON matching the schema. Return only the JSON object now.` appended. On second failure: surface a toast and skip the refresh — do not break the interval.

## Prompt 2 — Detailed answer (on card click)

**Route:** `POST /api/chat` (when `messages[0].sourceCardId` is set)
**Model:** `openai/gpt-oss-120b`
**Params:** `temperature: 0.5`, streaming on.
**Context:** full transcript + the card's title & preview + any existing chat turns.

### System prompt (default)

```
You are TwinMind, expanding one live-meeting suggestion into a concrete,
directly-useful answer.

The user tapped a suggestion card. You have the full meeting transcript and
the card's title and preview. Write a detailed, specific, defensible response:

- Lead with the answer in the first sentence. No preamble.
- Be concrete. Use names, numbers, and examples from the transcript when
  they exist. Do not hedge unless the transcript itself is ambiguous.
- If the card is a fact-check and the claim is correct, say so plainly and
  move on. If it is wrong, give the correct fact first, then the evidence.
- Keep it under ~200 words unless the user explicitly asks for more depth.
- Format with short paragraphs and bullet points only when a list is the
  honest shape of the answer.
```

### Why

The detail prompt diverges from the suggestion prompt in three places: _full_ transcript (the user committed attention — we can afford tokens), no JSON (streaming prose), explicit length target (200 words ≈ 5 seconds to read, fits a meeting beat).

## Prompt 3 — Free-form chat

**Route:** `POST /api/chat` (when the user typed the message)
**Model:** `openai/gpt-oss-120b`
**Params:** `temperature: 0.5`, streaming on.
**Context:** full transcript + full chat history.

### System prompt (default)

```
You are TwinMind, an always-on AI meeting copilot. The user is in a live
conversation and has asked you a question mid-meeting. The full transcript
so far is attached as grounding — treat it as what you "heard."

- Answer the user's question directly and specifically.
- Ground claims in the transcript when the transcript is relevant. If the
  question is unrelated to the meeting, answer it on its own merits.
- Respect the user's time — under ~150 words unless the question genuinely
  needs more.
- Never invent meeting content. If asked "what did X say about Y" and the
  transcript doesn't contain it, say so.
```

### Why

Slightly shorter default length (150 vs 200) because free-form questions are more often lookups than deep dives. Explicit "never invent meeting content" because transcript-grounded answers that confabulate are the single worst failure mode of this category.

## Context window strategy

| Call            | Default window  | Rationale                                                                                                                      |
| --------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `/api/suggest`  | Last 5 minutes  | Roughly 500 tokens of speech; enough for continuity, small enough to keep the model focused on the _current_ thread. Editable. |
| Detailed answer | Full transcript | User just committed attention via a tap; cost of extra tokens is justified by one-shot quality. Editable.                      |
| Free-form chat  | Full transcript | Same reasoning; questions often reference arbitrary earlier moments. Editable.                                                 |

We do not window-truncate the chat message history — the session is short by construction (one meeting ≈ 30–90 minutes) and the Groq 120B context is generous.

## Handling failure

| Failure                                           | Detection                              | Response                                                                                      |
| ------------------------------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------- |
| No API key                                        | 401 from any route                     | Toast with link to `/settings`; column keeps last-good state.                                 |
| Groq 5xx / timeout                                | non-2xx response                       | Toast; skip this refresh; keep last-good batch.                                               |
| Malformed JSON from suggest                       | `JSON.parse` throws or schema mismatch | One retry with a corrective nudge; on second failure, toast + skip.                           |
| Stream cancellation (user hits Reload mid-answer) | `AbortController`                      | Cleanly abort the fetch; truncate the in-flight assistant message with an ellipsis indicator. |
| Empty transcript at first tick                    | length check client-side               | Skip the call entirely — do not waste a round-trip showing "three cards about nothing."       |

## Evaluation rubric (what "good" looks like)

When tuning defaults we judge by four questions:

1. **Would the user tap any of these three?** If zero of the three preview texts would cause a hand movement, the batch is bad regardless of individual card quality.
2. **Is there a mix?** Three `question`s in a row after the user has been monologuing for five minutes is a failure.
3. **Is the preview self-sufficient?** If the title/preview reads like "more after the click," the card failed its job.
4. **Does the detailed answer lead with the answer?** First-sentence preamble (`"That's a great question…"`, `"Here's how to think about it…"`) is an automatic regression.

## Things we tried and dropped

- **Category quotas (one of each type).** Felt rigid. A three-person brainstorm doesn't need a fact-check every 30 seconds; a technical interview might need three.
- **Feeding the full transcript to `/api/suggest`.** Latency degraded and the model started re-surfacing themes from the start of the meeting instead of the current thread.
- **Asking the model to score its own cards and drop the lowest.** Added a generation pass for marginal gains; JSON mode + a tight rubric got us most of the way there without the second call.

## Future improvements (not in scope)

- Voice-activity detection to flush chunks on silence rather than strict 30s boundaries.
- Speaker diarization (Whisper Large V3 doesn't do this natively; would need a second model).
- Per-meeting type profiles (interview / brainstorm / 1:1) selectable from Settings.
