import type { Chunk } from '@/types';

const MIN_FALLBACK_CHUNKS = 4;

export function transcriptText(chunks: Chunk[]): string {
  return chunks.map((c) => c.text).join(' ');
}

// Return a joined-text view of chunks that fall inside the last `minutes`
// window. If no chunks are recent enough (e.g., a long silence), fall back
// to the last MIN_FALLBACK_CHUNKS so the model always has some recent
// context instead of an empty string.
export function transcriptWindow(chunks: Chunk[], minutes: number): string {
  if (chunks.length === 0) return '';
  const cutoff = Date.now() - minutes * 60 * 1000;
  const windowed = chunks.filter((c) => c.startedAt >= cutoff);
  const selected = windowed.length > 0 ? windowed : chunks.slice(-MIN_FALLBACK_CHUNKS);
  return selected.map((c) => c.text).join(' ');
}
