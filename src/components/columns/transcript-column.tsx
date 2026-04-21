'use client';

import { Mic, MicOff } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { GROQ_KEY_HEADER } from '@/lib/groq';
import { Recorder } from '@/lib/recorder';
import { cn } from '@/lib/utils';
import { useSession } from '@/stores/session';

export function TranscriptColumn() {
  const hydrated = useSession((s) => s.hydrated);
  const apiKey = useSession((s) => s.apiKey);
  const chunks = useSession((s) => s.chunks);
  const isRecording = useSession((s) => s.isRecording);
  const chunkMs = useSession((s) => s.settings.chunkMs);
  const appendChunk = useSession((s) => s.appendChunk);
  const setRecording = useSession((s) => s.setRecording);

  const recorderRef = useRef<Recorder | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const hasKey = apiKey.length > 0;
  const showNoKeyHint = hydrated && !hasKey;

  const handleChunk = useCallback(
    async (blob: Blob, startedAt: number, durationMs: number) => {
      const currentKey = useSession.getState().apiKey;
      if (!currentKey) return;
      const form = new FormData();
      form.append('audio', blob, `chunk.${guessExt(blob.type)}`);
      try {
        const res = await fetch('/api/transcribe', {
          method: 'POST',
          headers: { [GROQ_KEY_HEADER]: currentKey },
          body: form,
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          toast.error(body.error ?? `Transcription failed (${res.status})`);
          return;
        }
        const data = (await res.json()) as { text?: string };
        appendChunk(data.text ?? '', startedAt, durationMs);
      } catch (e) {
        toast.error((e as Error).message || 'Transcription failed');
      }
    },
    [appendChunk],
  );

  const startRecording = useCallback(async () => {
    if (!hasKey) return;
    if (!recorderRef.current) recorderRef.current = new Recorder();
    try {
      await recorderRef.current.start(handleChunk, chunkMs);
      setRecording(true);
    } catch (e) {
      const err = e as DOMException;
      if (err.name === 'NotAllowedError' || err.name === 'SecurityError') {
        toast.error('Microphone access was denied.');
      } else {
        toast.error(err.message || 'Could not start microphone.');
      }
    }
  }, [hasKey, chunkMs, handleChunk, setRecording]);

  const stopRecording = useCallback(() => {
    recorderRef.current?.stop();
    setRecording(false);
  }, [setRecording]);

  useEffect(() => {
    return () => {
      recorderRef.current?.stop();
    };
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [chunks]);

  const helperText = showNoKeyHint
    ? 'Add your Groq API key on the Settings page to enable the mic.'
    : isRecording
      ? 'Listening. Transcript appends every ~30s.'
      : 'Click mic to start. Transcript appends every ~30s.';

  return (
    <Card className="flex h-full min-h-0 flex-col">
      <CardHeader>
        <CardTitle>1. Mic & Transcript</CardTitle>
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wider uppercase',
            isRecording
              ? 'bg-[var(--color-destructive)]/20 text-[var(--color-destructive)]'
              : 'bg-[var(--color-muted)] text-[var(--color-muted-foreground)]',
          )}
        >
          {isRecording ? 'Recording' : 'Idle'}
        </span>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-4">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={isRecording ? stopRecording : startRecording}
            disabled={showNoKeyHint}
            className={cn(
              'flex h-14 w-14 items-center justify-center rounded-full transition-all outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-background)] disabled:cursor-not-allowed disabled:opacity-40',
              isRecording
                ? 'animate-pulse bg-[var(--color-destructive)] text-[var(--color-destructive-foreground)]'
                : 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)] hover:brightness-110',
            )}
            aria-label={isRecording ? 'Stop recording' : 'Start recording'}
            title={showNoKeyHint ? 'Add a Groq API key on the Settings page first' : undefined}
          >
            {isRecording ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
          </button>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            {helperText}
            {showNoKeyHint ? (
              <>
                {' '}
                <Link className="underline hover:text-[var(--color-foreground)]" href="/settings">
                  Open settings
                </Link>
                .
              </>
            ) : null}
          </p>
        </div>

        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)]/40 p-3 text-sm leading-relaxed"
        >
          {chunks.length === 0 ? (
            <p className="flex h-full items-center justify-center text-center text-[var(--color-muted-foreground)]">
              No transcript yet — start the mic.
            </p>
          ) : (
            <div className="space-y-2">
              {chunks.map((c) => (
                <p key={c.id} className="text-[var(--color-foreground)]">
                  <span className="mr-2 text-xs text-[var(--color-muted-foreground)]">
                    {formatClock(c.startedAt)}
                  </span>
                  {c.text}
                </p>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function formatClock(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function guessExt(mime: string): string {
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('mp4')) return 'mp4';
  return 'webm';
}
