'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { transcriptWindow, useSession } from '@/stores/session';
import type { Card } from '@/types';

export function useSuggestRefresh() {
  const isRecording = useSession((s) => s.isRecording);
  const refreshIntervalMs = useSession((s) => s.settings.refreshIntervalMs);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const inFlight = useRef<AbortController | null>(null);

  const runRefresh = useCallback(async () => {
    const state = useSession.getState();
    const { apiKey, settings, chunks, batches } = state;

    if (!apiKey) {
      toast.error('Add your Groq API key on the Settings page.');
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
          'x-groq-key': apiKey,
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
