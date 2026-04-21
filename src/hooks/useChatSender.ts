'use client';

import { useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { readSseStream } from '@/lib/sse';
import { transcriptText, useSession } from '@/stores/session';
import type { Card } from '@/types';

type SendOptions = {
  card?: Card;
};

export function useChatSender() {
  const abortRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const send = useCallback(async (userInput: string, opts: SendOptions = {}) => {
    const state = useSession.getState();
    const { apiKey, settings } = state;

    if (!apiKey) {
      toast.error('Add your Groq API key on the Settings page.');
      return;
    }

    const text = userInput.trim();
    if (!text && !opts.card) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const sourceCardId = opts.card?.id;
    const displayContent = opts.card?.title ?? text;
    const modelContent = opts.card
      ? `I tapped a "${opts.card.type}" suggestion.
Title: ${opts.card.title}
Preview: ${opts.card.preview}

Expand this into a directly-useful answer using the meeting transcript.`
      : text;

    state.appendUserMessage(displayContent, sourceCardId);
    const assistant = state.startAssistantMessage();

    try {
      const fresh = useSession.getState();
      const transcript = transcriptText(fresh.chunks);
      const messagesPayload = fresh.messages
        .filter((m) => m.id !== assistant.id)
        .map((m) =>
          m.id === fresh.messages[fresh.messages.length - 2]?.id && opts.card
            ? { role: m.role, content: modelContent }
            : { role: m.role, content: m.content },
        );

      const systemPrompt = opts.card ? settings.prompts.detail : settings.prompts.chat;

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-groq-key': apiKey,
        },
        body: JSON.stringify({
          messages: messagesPayload,
          transcript,
          systemPrompt,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        toast.error(body.error ?? `Chat failed (${response.status})`);
        return;
      }

      await readSseStream(
        response,
        (event) => {
          if (event.error) {
            toast.error(event.error);
            return;
          }
          if (event.delta) useSession.getState().patchAssistantMessage(assistant.id, event.delta);
        },
        controller.signal,
      );
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        toast.error((e as Error).message || 'Chat stream failed');
      }
    } finally {
      useSession.getState().finalizeAssistantMessage(assistant.id);
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, []);

  return { send, cancel };
}
