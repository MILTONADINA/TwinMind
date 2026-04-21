'use client';

import { useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { GROQ_KEY_HEADER } from '@/lib/groq';
import { readSseStream } from '@/lib/sse';
import { transcriptText } from '@/lib/transcript';
import { useSession } from '@/stores/session';
import type { ApiMessage, Card, CardSnapshot, Message } from '@/types';

type SendOptions = { card?: Card };

export type SendResult = { ok: true } | { ok: false; reason: 'no-key' | 'empty' };

export function useChatSender() {
  const abortRef = useRef<AbortController | null>(null);

  const send = useCallback(
    async (userInput: string, opts: SendOptions = {}): Promise<SendResult> => {
      const state = useSession.getState();
      const { apiKey, settings } = state;

      if (!apiKey) {
        toast.error('Add your Groq API key on the Settings page.');
        return { ok: false, reason: 'no-key' };
      }

      const text = userInput.trim();
      if (!text && !opts.card) return { ok: false, reason: 'empty' };

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const snapshot: CardSnapshot | undefined = opts.card
        ? { type: opts.card.type, title: opts.card.title, preview: opts.card.preview }
        : undefined;

      const displayContent = opts.card?.title ?? text;

      state.appendUserMessage(displayContent, {
        ...(opts.card ? { sourceCardId: opts.card.id } : {}),
        ...(snapshot ? { cardSnapshot: snapshot } : {}),
      });
      const assistant = state.startAssistantMessage();

      try {
        const fresh = useSession.getState();
        const transcript = transcriptText(fresh.chunks);
        const messagesPayload: ApiMessage[] = fresh.messages
          .filter((m) => m.id !== assistant.id)
          .map(toApiMessage);

        const systemPrompt = opts.card ? settings.prompts.detail : settings.prompts.chat;

        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            [GROQ_KEY_HEADER]: apiKey,
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
          return { ok: true };
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
        return { ok: true };
      } catch (e) {
        if ((e as Error).name !== 'AbortError') {
          toast.error((e as Error).message || 'Chat stream failed');
        }
        return { ok: true };
      } finally {
        useSession.getState().finalizeAssistantMessage(assistant.id);
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [],
  );

  return { send };
}

function toApiMessage(m: Message): ApiMessage {
  if (m.cardSnapshot) {
    return {
      role: m.role,
      content: `I tapped a "${m.cardSnapshot.type}" suggestion.
Title: ${m.cardSnapshot.title}
Preview: ${m.cardSnapshot.preview}

Expand this into a directly-useful answer using the meeting transcript.`,
    };
  }
  return { role: m.role, content: m.content };
}
