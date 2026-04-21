import type Groq from 'groq-sdk';
import { HttpError } from '@/lib/errors';
import { clientFromRequest, isGroqError, LLM_MODEL } from '@/lib/groq';
import { uid } from '@/lib/id';
import { SUGGEST_PROMPT } from '@/lib/prompts';
import { CARD_TYPES, type Card, type CardType } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_TRANSCRIPT_CHARS = 20_000;
const TYPE_SET = new Set<string>(CARD_TYPES);

type SuggestRequestBody = {
  transcript?: string;
  systemPrompt?: string;
  avoidTitles?: string[];
};

export async function POST(req: Request): Promise<Response> {
  try {
    const groq = clientFromRequest(req);
    const body = (await req.json().catch(() => ({}))) as SuggestRequestBody;

    const transcript = truncate(body.transcript ?? '', MAX_TRANSCRIPT_CHARS);
    const systemPrompt = (body.systemPrompt ?? '').trim() || SUGGEST_PROMPT;
    const avoidTitles = Array.isArray(body.avoidTitles) ? body.avoidTitles.slice(0, 12) : [];

    const userMessage = buildUserMessage(transcript, avoidTitles);
    const cards = await requestCards(groq, systemPrompt, userMessage, /* allowRetry */ true);

    return Response.json({ cards });
  } catch (e) {
    if (e instanceof HttpError) {
      return Response.json({ error: e.message }, { status: e.status });
    }
    if (isGroqError(e)) {
      console.error('suggest: groq error', e.status, e.name);
      return Response.json({ error: 'Groq suggestion call failed' }, { status: 502 });
    }
    console.error('suggest: unexpected error', (e as Error).message);
    return Response.json({ error: 'Suggestion failed' }, { status: 500 });
  }
}

async function requestCards(
  groq: Groq,
  systemPrompt: string,
  userMessage: string,
  allowRetry: boolean,
): Promise<[Card, Card, Card]> {
  const resp = await groq.chat.completions.create({
    model: LLM_MODEL,
    temperature: 0.4,
    max_tokens: 600,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
  });

  const content = resp.choices[0]?.message?.content ?? '';
  const parsed = parseCards(content);
  if (parsed) return parsed;

  if (allowRetry) {
    const correction =
      userMessage +
      '\n\nYour previous response was not valid JSON matching the schema. Return only the JSON object now — exactly three cards, each with a valid type, non-empty title, and non-empty preview.';
    return requestCards(groq, systemPrompt, correction, false);
  }

  throw new HttpError(422, 'Model did not produce valid suggestion JSON after a retry.');
}

function parseCards(text: string): [Card, Card, Card] | null {
  try {
    const parsed = JSON.parse(text) as { cards?: unknown };
    if (!parsed.cards || !Array.isArray(parsed.cards) || parsed.cards.length !== 3) return null;
    const cards: Card[] = [];
    for (const raw of parsed.cards) {
      if (!raw || typeof raw !== 'object') return null;
      const r = raw as Record<string, unknown>;
      const type = r.type;
      const title = r.title;
      const preview = r.preview;
      if (typeof type !== 'string' || !TYPE_SET.has(type)) return null;
      if (typeof title !== 'string' || !title.trim()) return null;
      if (typeof preview !== 'string' || !preview.trim()) return null;
      cards.push({
        id: uid(),
        type: type as CardType,
        title: title.trim(),
        preview: preview.trim(),
      });
    }
    return [cards[0]!, cards[1]!, cards[2]!];
  } catch {
    return null;
  }
}

function buildUserMessage(transcript: string, avoidTitles: string[]): string {
  const parts: string[] = [];
  parts.push('Recent transcript window:');
  parts.push('"""');
  parts.push(
    transcript.trim() ||
      '(no speech yet — return three modest but grounded suggestions about starting the meeting)',
  );
  parts.push('"""');
  if (avoidTitles.length > 0) {
    parts.push('');
    parts.push('Recently-shown card titles to avoid repeating:');
    for (const title of avoidTitles) parts.push(`- ${title}`);
  }
  parts.push('');
  parts.push('Return the JSON object now.');
  return parts.join('\n');
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(text.length - max);
}
