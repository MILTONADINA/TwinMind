'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { GROQ_KEY_HEADER } from '@/lib/groq';
import { transcriptWindow } from '@/lib/transcript';
import { useSession } from '@/stores/session';
import type { Card } from '@/types';

type RefreshOptions = { isManual?: boolean };

export function useSuggestRefresh() {
  const isRecording = useSession((s) => s.isRecording);
  const refreshIntervalMs = useSession((s) => s.settings.refreshIntervalMs);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const inFlight = useRef<AbortController | null>(null);

  const runRefresh = useCallback(async (options: RefreshOptions = {}) => {
    const state = useSession.getState();
    const { apiKey, settings, chunks, batches, isRecording: recording } = state;

    if (!apiKey) {
      toast.error('Add your Groq API key on the Settings page.');
      return;
    }

    if (chunks.length === 0 && !recording) {
      if (options.isManual) {
        toast.message('Start recording first — no transcript to analyse yet.');
      }
      return;
    }

    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    setIsRefreshing(true);

    try {
      const transcript = transcriptWindow(chunks, settings.suggestContextMinutes);
      const avoidTitles = batches.slice(0, 2).flatMap((b) => b.cards.map((c) => c.title));

      const response = await fetch('/api/suggest', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          [GROQ_KEY_HEADER]: apiKey,
        },
        body: JSON.stringify({
          transcript,
          systemPrompt: settings.prompts.suggest,
          avoidTitles,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        toast.error(body.error ?? `Suggestions failed (${response.status})`);
        return;
      }

      const data = (await response.json()) as { cards: Card[] };
      if (!Array.isArray(data.cards) || data.cards.length !== 3) {
        toast.error('Got an unexpected suggestion shape from the API.');
        return;
      }

      state.prependBatch([data.cards[0]!, data.cards[1]!, data.cards[2]!]);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        toast.error((e as Error).message || 'Suggestions fetch failed');
      }
    } finally {
      if (inFlight.current === controller) inFlight.current = null;
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!isRecording) return;
    const id = setInterval(() => {
      void runRefresh();
    }, refreshIntervalMs);
    return () => clearInterval(id);
  }, [isRecording, refreshIntervalMs, runRefresh]);

  useEffect(() => {
    return () => inFlight.current?.abort();
  }, []);

  return { isRefreshing, runRefresh };
}
