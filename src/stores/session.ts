'use client';

import { create } from 'zustand';
import { uid } from '@/lib/id';
import {
  DEFAULT_CHUNK_MS,
  DEFAULT_PROMPTS,
  DEFAULT_REFRESH_INTERVAL_MS,
  DEFAULT_SUGGEST_CONTEXT_MINUTES,
} from '@/lib/prompts';
import {
  loadApiKey,
  loadSettings as loadSettingsFromStorage,
  saveApiKey,
  saveSettings as saveSettingsToStorage,
} from '@/lib/storage';
import type { Batch, Card, Chunk, Message, Role, Settings } from '@/types';

export const DEFAULT_SETTINGS: Settings = {
  prompts: DEFAULT_PROMPTS,
  suggestContextMinutes: DEFAULT_SUGGEST_CONTEXT_MINUTES,
  refreshIntervalMs: DEFAULT_REFRESH_INTERVAL_MS,
  chunkMs: DEFAULT_CHUNK_MS,
};

type SessionState = {
  hydrated: boolean;

  chunks: Chunk[];
  batches: Batch[];
  messages: Message[];

  apiKey: string;
  settings: Settings;

  isRecording: boolean;

  hydrate: () => void;

  setApiKey: (key: string) => void;
  setSettings: (next: Settings) => void;
  resetSettingsToDefaults: () => void;

  setRecording: (v: boolean) => void;
  appendChunk: (text: string, startedAt: number, durationMs: number) => void;

  prependBatch: (cards: [Card, Card, Card]) => Batch;

  appendUserMessage: (content: string, sourceCardId?: string) => Message;
  startAssistantMessage: () => Message;
  patchAssistantMessage: (id: string, delta: string) => void;
  finalizeAssistantMessage: (id: string) => void;

  resetSession: () => void;
};

export const useSession = create<SessionState>((set, get) => ({
  hydrated: false,

  chunks: [],
  batches: [],
  messages: [],

  apiKey: '',
  settings: DEFAULT_SETTINGS,

  isRecording: false,

  hydrate: () => {
    if (get().hydrated) return;
    set({
      apiKey: loadApiKey(),
      settings: loadSettingsFromStorage(DEFAULT_SETTINGS),
      hydrated: true,
    });
  },

  setApiKey: (key) => {
    saveApiKey(key);
    set({ apiKey: key });
  },

  setSettings: (next) => {
    saveSettingsToStorage(next);
    set({ settings: next });
  },

  resetSettingsToDefaults: () => {
    saveSettingsToStorage(DEFAULT_SETTINGS);
    set({ settings: DEFAULT_SETTINGS });
  },

  setRecording: (v) => set({ isRecording: v }),

  appendChunk: (text, startedAt, durationMs) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const chunk: Chunk = {
      id: uid(),
      startedAt,
      durationMs,
      text: trimmed,
    };
    set((s) => ({ chunks: [...s.chunks, chunk] }));
  },

  prependBatch: (cards) => {
    const batch: Batch = {
      id: uid(),
      createdAt: Date.now(),
      cards,
    };
    set((s) => ({ batches: [batch, ...s.batches] }));
    return batch;
  },

  appendUserMessage: (content, sourceCardId) => {
    const message: Message = {
      id: uid(),
      role: 'user' as Role,
      createdAt: Date.now(),
      content,
      ...(sourceCardId ? { sourceCardId } : {}),
    };
    set((s) => ({ messages: [...s.messages, message] }));
    return message;
  },

  startAssistantMessage: () => {
    const message: Message = {
      id: uid(),
      role: 'assistant' as Role,
      createdAt: Date.now(),
      content: '',
      streaming: true,
    };
    set((s) => ({ messages: [...s.messages, message] }));
    return message;
  },

  patchAssistantMessage: (id, delta) => {
    set((s) => ({
      messages: s.messages.map((m) => (m.id === id ? { ...m, content: m.content + delta } : m)),
    }));
  },

  finalizeAssistantMessage: (id) => {
    set((s) => ({
      messages: s.messages.map((m) => (m.id === id ? { ...m, streaming: false } : m)),
    }));
  },

  resetSession: () => {
    set({
      chunks: [],
      batches: [],
      messages: [],
    });
  },
}));

export function transcriptText(chunks: Chunk[]): string {
  return chunks.map((c) => c.text).join(' ');
}

export function transcriptWindow(chunks: Chunk[], minutes: number): string {
  if (chunks.length === 0) return '';
  const cutoff = Date.now() - minutes * 60 * 1000;
  const windowed = chunks.filter((c) => c.startedAt >= cutoff);
  return (windowed.length ? windowed : chunks.slice(-Math.max(1, Math.ceil(minutes * 2))))
    .map((c) => c.text)
    .join(' ');
}
