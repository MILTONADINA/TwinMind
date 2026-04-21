import type { Batch, Chunk, Message } from '@/types';

export type SessionSnapshot = {
  exportedAt: number;
  transcript: Chunk[];
  suggestionBatches: Batch[];
  chat: Message[];
};

export function buildSnapshot(
  chunks: Chunk[],
  batches: Batch[],
  messages: Message[],
): SessionSnapshot {
  return {
    exportedAt: Date.now(),
    transcript: chunks,
    suggestionBatches: batches,
    chat: messages,
  };
}

export function snapshotToJson(snapshot: SessionSnapshot): string {
  return JSON.stringify(snapshot, null, 2);
}

export function snapshotToText(snapshot: SessionSnapshot): string {
  const lines: string[] = [];
  lines.push(`TwinMind session export — ${new Date(snapshot.exportedAt).toISOString()}`);
  lines.push('');

  lines.push('## Transcript');
  if (snapshot.transcript.length === 0) {
    lines.push('  (empty)');
  } else {
    for (const chunk of snapshot.transcript) {
      lines.push(`  [${new Date(chunk.startedAt).toISOString()}] ${chunk.text}`);
    }
  }
  lines.push('');

  lines.push('## Suggestion batches (newest first)');
  if (snapshot.suggestionBatches.length === 0) {
    lines.push('  (empty)');
  } else {
    for (const batch of snapshot.suggestionBatches) {
      lines.push(`  [${new Date(batch.createdAt).toISOString()}]`);
      for (const card of batch.cards) {
        lines.push(`    - (${card.type}) ${card.title}`);
        lines.push(`        ${card.preview}`);
      }
    }
  }
  lines.push('');

  lines.push('## Chat');
  if (snapshot.chat.length === 0) {
    lines.push('  (empty)');
  } else {
    for (const message of snapshot.chat) {
      lines.push(`  [${new Date(message.createdAt).toISOString()}] ${message.role.toUpperCase()}`);
      for (const line of message.content.split('\n')) lines.push(`    ${line}`);
    }
  }

  return lines.join('\n') + '\n';
}

export function triggerDownload(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
