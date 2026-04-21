const PREFERRED_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
];

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  return PREFERRED_MIME_TYPES.find((m) => MediaRecorder.isTypeSupported(m));
}

export type ChunkHandler = (blob: Blob, startedAt: number, durationMs: number) => void;

export class Recorder {
  private mediaRecorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private chunkStartedAt = 0;

  async start(onChunk: ChunkHandler, chunkMs: number): Promise<void> {
    if (this.mediaRecorder) return;

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    const mimeType = pickMimeType();
    this.mediaRecorder = mimeType
      ? new MediaRecorder(this.stream, { mimeType })
      : new MediaRecorder(this.stream);

    this.chunkStartedAt = Date.now();
    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size === 0) return;
      const now = Date.now();
      onChunk(event.data, this.chunkStartedAt, now - this.chunkStartedAt);
      this.chunkStartedAt = now;
    };

    this.mediaRecorder.start(chunkMs);
  }

  stop(): void {
    try {
      if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
        this.mediaRecorder.stop();
      }
    } finally {
      this.stream?.getTracks().forEach((t) => t.stop());
      this.mediaRecorder = null;
      this.stream = null;
    }
  }

  get isRecording(): boolean {
    return this.mediaRecorder?.state === 'recording';
  }
}
