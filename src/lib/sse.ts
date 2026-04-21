export type SseEvent = { delta?: string; done?: boolean; error?: string };

export async function readSseStream(
  response: Response,
  onEvent: (event: SseEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  if (!response.body) return;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const abortListener = () => reader.cancel().catch(() => {});
  signal?.addEventListener('abort', abortListener);

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const raw = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 2);
        if (!raw.startsWith('data:')) continue;
        const payload = raw.slice(5).trim();
        if (!payload) continue;
        try {
          onEvent(JSON.parse(payload) as SseEvent);
        } catch {
          // ignore malformed line; server will close the stream shortly
        }
      }
    }
  } finally {
    signal?.removeEventListener('abort', abortListener);
  }
}
