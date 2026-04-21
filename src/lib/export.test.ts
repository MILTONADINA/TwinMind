import { describe, expect, it } from 'vitest';
import { buildSnapshot, snapshotToJson, snapshotToText } from './export';
import type { Batch, Chunk, Message } from '@/types';

const chunks: Chunk[] = [
  { id: 'c1', startedAt: Date.UTC(2026, 3, 21, 12, 0, 0), durationMs: 30_000, text: 'hello world' },
];
const batches: Batch[] = [
  {
    id: 'b1',
    createdAt: Date.UTC(2026, 3, 21, 12, 0, 30),
    cards: [
      { id: 'k1', type: 'question', title: 'Team size?', preview: 'Group size drives planning.' },
      { id: 'k2', type: 'talking_point', title: 'March target', preview: 'You mentioned March.' },
      { id: 'k3', type: 'answer', title: 'It ships in May', preview: 'Per the roadmap.' },
    ],
  },
];
const messages: Message[] = [
  { id: 'm1', role: 'user', createdAt: Date.UTC(2026, 3, 21, 12, 1, 0), content: 'expand that' },
  { id: 'm2', role: 'assistant', createdAt: Date.UTC(2026, 3, 21, 12, 1, 1), content: 'because…' },
];

describe('buildSnapshot', () => {
  it('bundles transcript, batches, and chat with an exportedAt timestamp', () => {
    const snap = buildSnapshot(chunks, batches, messages);
    expect(snap.transcript).toBe(chunks);
    expect(snap.suggestionBatches).toBe(batches);
    expect(snap.chat).toBe(messages);
    expect(snap.exportedAt).toEqual(expect.any(Number));
  });
});

describe('snapshotToJson', () => {
  it('produces stable, pretty JSON that round-trips', () => {
    const snap = buildSnapshot(chunks, batches, messages);
    const json = snapshotToJson(snap);
    const parsed = JSON.parse(json) as typeof snap;
    expect(parsed.transcript[0]!.text).toBe('hello world');
    expect(parsed.chat).toHaveLength(2);
  });
});

describe('snapshotToText', () => {
  it('renders transcript, batches, and chat with timestamps', () => {
    const snap = buildSnapshot(chunks, batches, messages);
    const txt = snapshotToText(snap);
    expect(txt).toContain('TwinMind session export');
    expect(txt).toContain('hello world');
    expect(txt).toContain('(question) Team size?');
    expect(txt).toContain('USER');
    expect(txt).toContain('ASSISTANT');
  });

  it('labels empty sections rather than omitting them', () => {
    const snap = buildSnapshot([], [], []);
    const txt = snapshotToText(snap);
    expect(txt).toMatch(/## Transcript\n\s*\(empty\)/);
    expect(txt).toMatch(/## Suggestion batches \(newest first\)\n\s*\(empty\)/);
    expect(txt).toMatch(/## Chat\n\s*\(empty\)/);
  });
});
