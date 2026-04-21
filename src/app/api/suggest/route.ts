import type Groq from 'groq-sdk';
import { HttpError } from '@/lib/errors';
import { LLM_MODEL } from '@/lib/groq';
import { clientFromRequest, isGroqError } from '@/lib/groq-server';
import { SUGGEST_PROMPT } from '@/lib/prompts';
import { parseCards } from '@/lib/suggest-parser';
import { keepLastChars } from '@/lib/text';
import type { Card } from '@/types';

export const runtime = 'nodejs';

const MAX_TRANSCRIPT_CHARS = 20_000;

type SuggestRequestBody = {
  transcript?: string;
  systemPrompt?: string;
  avoidTitles?: string[];
};

export async function POST(req: Request): Promise<Response> {
  try {
    const groq = clientFromRequest(req);
    const body = (await req.json().catch(() => ({}))) as SuggestRequestBody;

    const transcript = keepLastChars(body.transcript ?? '', MAX_TRANSCRIPT_CHARS);
    const systemPrompt = (body.systemPrompt ?? '').trim() || SUGGEST_PROMPT;
    const avoidTitles = Array.isArray(body.avoidTitles) ? body.avoidTitles.slice(0, 12) : [];

    const userMessage = buildUserMessage(transcript, avoidTitles);
    const cards = await requestCards(groq, systemPrompt, userMessage, req.signal);

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
  signal: AbortSignal,
): Promise<[Card, Card, Card]> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const message =
      attempt === 0
        ? userMessage
        : `${userMessage}

Your previous response was not valid JSON matching the schema. Return only the JSON object now — exactly three cards, each with a valid type, non-empty title, and non-empty preview.`;

    const resp = await groq.chat.completions.create(
      {
        model: LLM_MODEL,
        temperature: 0.4,
        max_tokens: 600,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message },
        ],
      },
      { signal },
    );

    const content = resp.choices[0]?.message?.content ?? '';
    const parsed = parseCards(content);
    if (parsed) return parsed;
  }

  throw new HttpError(422, 'Model did not produce valid suggestion JSON after a retry.');
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
