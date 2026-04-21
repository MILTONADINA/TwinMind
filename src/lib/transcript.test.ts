import { beforeEach, describe, expect, it, vi } from 'vitest';
import { transcriptText, transcriptWindow } from './transcript';
import type { Chunk } from '@/types';

function chunk(id: string, startedAt: number, text: string): Chunk {
  return { id, startedAt, durationMs: 30_000, text };
}

describe('transcriptText', () => {
  it('joins chunk text with spaces', () => {
    const chunks = [chunk('a', 1, 'hello'), chunk('b', 2, 'world')];
    expect(transcriptText(chunks)).toBe('hello world');
  });

  it('returns an empty string for no chunks', () => {
    expect(transcriptText([])).toBe('');
  });
});

describe('transcriptWindow', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-21T12:00:00Z'));
  });

  it('returns chunks within the last N minutes', () => {
    const now = Date.now();
    const chunks = [
      chunk('old', now - 10 * 60_000, 'ten minutes old'),
      chunk('recent-a', now - 3 * 60_000, 'three'),
      chunk('recent-b', now - 1 * 60_000, 'one'),
    ];
    const result = transcriptWindow(chunks, 5);
    expect(result).toBe('three one');
    expect(result).not.toContain('ten minutes old');
  });

  it('falls back to the last few chunks when none are in-window', () => {
    const now = Date.now();
    const chunks = [
      chunk('a', now - 60 * 60_000, 'first'),
      chunk('b', now - 50 * 60_000, 'second'),
      chunk('c', now - 40 * 60_000, 'third'),
      chunk('d', now - 30 * 60_000, 'fourth'),
      chunk('e', now - 20 * 60_000, 'fifth'),
    ];
    const result = transcriptWindow(chunks, 5);
    // Fallback keeps the most recent 4, in order.
    expect(result).toBe('second third fourth fifth');
  });

  it('returns empty string when there are no chunks at all', () => {
    expect(transcriptWindow([], 5)).toBe('');
  });
});
