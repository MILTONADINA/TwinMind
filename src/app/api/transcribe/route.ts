import { HttpError } from '@/lib/errors';
import { WHISPER_MODEL } from '@/lib/groq';
import { clientFromRequest, isGroqError } from '@/lib/groq-server';

export const runtime = 'nodejs';

const MAX_AUDIO_BYTES = 25 * 1024 * 1024; // Groq Whisper limit

export async function POST(req: Request): Promise<Response> {
  try {
    const groq = clientFromRequest(req);

    const form = await req.formData();
    const audio = form.get('audio');
    if (!(audio instanceof Blob)) {
      return Response.json({ error: 'Missing audio field' }, { status: 400 });
    }
    if (audio.size === 0) {
      return Response.json({ text: '' });
    }
    if (audio.size > MAX_AUDIO_BYTES) {
      return Response.json({ error: 'Audio chunk exceeds 25 MB' }, { status: 413 });
    }

    const file = new File([audio], `chunk.${extensionFor(audio.type)}`, {
      type: audio.type || 'audio/webm',
    });

    const result = await groq.audio.transcriptions.create(
      {
        file,
        model: WHISPER_MODEL,
        response_format: 'json',
      },
      { signal: req.signal },
    );

    return Response.json({ text: result.text ?? '' });
  } catch (e) {
    if (e instanceof HttpError) {
      return Response.json({ error: e.message }, { status: e.status });
    }
    if (isGroqError(e)) {
      console.error('transcribe: groq error', e.status, e.name);
      return Response.json({ error: 'Groq transcription failed' }, { status: 502 });
    }
    console.error('transcribe: unexpected error', (e as Error).message);
    return Response.json({ error: 'Transcription failed' }, { status: 500 });
  }
}

function extensionFor(mime: string): string {
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('mp4')) return 'mp4';
  if (mime.includes('wav')) return 'wav';
  return 'webm';
}
