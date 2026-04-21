import { HttpError } from '@/lib/errors';
import { clientFromRequest, isGroqError, LLM_MODEL } from '@/lib/groq';
import { CHAT_PROMPT } from '@/lib/prompts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_TRANSCRIPT_CHARS = 60_000;
const MAX_MESSAGES = 40;

type ChatRequestBody = {
  messages?: { role: 'user' | 'assistant'; content: string }[];
  transcript?: string;
  systemPrompt?: string;
};

export async function POST(req: Request): Promise<Response> {
  let groqStream: AsyncIterable<{ choices: { delta?: { content?: string | null } }[] }> | null =
    null;

  try {
    const groq = clientFromRequest(req);
    const body = (await req.json().catch(() => ({}))) as ChatRequestBody;

    const messages = Array.isArray(body.messages) ? body.messages.slice(-MAX_MESSAGES) : [];
    if (messages.length === 0) {
      throw new HttpError(400, 'messages is required');
    }

    const transcript = truncate(body.transcript ?? '', MAX_TRANSCRIPT_CHARS);
    const userSystem = (body.systemPrompt ?? '').trim() || CHAT_PROMPT;
    const groundedSystem = `${userSystem}

---
Meeting transcript so far (grounding — treat as what you heard):
"""
${transcript || '(no transcript yet)'}
"""`;

    groqStream = (await groq.chat.completions.create({
      model: LLM_MODEL,
      temperature: 0.5,
      stream: true,
      messages: [
        { role: 'system', content: groundedSystem },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
      ],
    })) as unknown as AsyncIterable<{ choices: { delta?: { content?: string | null } }[] }>;
  } catch (e) {
    if (e instanceof HttpError) {
      return Response.json({ error: e.message }, { status: e.status });
    }
    if (isGroqError(e)) {
      console.error('chat: groq error', e.status, e.name);
      return Response.json({ error: 'Groq chat call failed' }, { status: 502 });
    }
    console.error('chat: unexpected error', (e as Error).message);
    return Response.json({ error: 'Chat failed' }, { status: 500 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      try {
        for await (const chunk of groqStream!) {
          const delta = chunk.choices[0]?.delta?.content ?? '';
          if (delta) send({ delta });
        }
        send({ done: true });
      } catch (e) {
        console.error('chat: stream error', (e as Error).message);
        send({ error: 'stream error' });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      'x-accel-buffering': 'no',
      connection: 'keep-alive',
    },
  });
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(text.length - max);
}
