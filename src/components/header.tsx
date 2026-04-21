'use client';

import { Download, Settings as SettingsIcon, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { buildSnapshot, snapshotToJson, snapshotToText, triggerDownload } from '@/lib/export';
import { useSession } from '@/stores/session';

export function Header() {
  const chunks = useSession((s) => s.chunks);
  const batches = useSession((s) => s.batches);
  const messages = useSession((s) => s.messages);
  const resetSession = useSession((s) => s.resetSession);
  const isRecording = useSession((s) => s.isRecording);

  const canExport = chunks.length + batches.length + messages.length > 0;

  const handleExport = (format: 'json' | 'txt') => {
    if (!canExport) {
      toast.error('Nothing to export yet.');
      return;
    }
    const snapshot = buildSnapshot(chunks, batches, messages);
    const stamp = new Date(snapshot.exportedAt).toISOString().replace(/[:.]/g, '-');
    if (format === 'json') {
      triggerDownload(
        `twinmind-session-${stamp}.json`,
        snapshotToJson(snapshot),
        'application/json',
      );
    } else {
      triggerDownload(`twinmind-session-${stamp}.txt`, snapshotToText(snapshot), 'text/plain');
    }
  };

  const handleReset = () => {
    if (isRecording) {
      toast.error('Stop recording before resetting.');
      return;
    }
    if (!canExport) return;
    if (window.confirm('Clear the current session transcript, suggestions, and chat?')) {
      resetSession();
      toast.success('Session cleared.');
    }
  };

  return (
    <header className="border-b border-[var(--color-border)] bg-[var(--color-background)]/80 backdrop-blur">
      <div className="mx-auto flex max-w-screen-2xl items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full bg-[var(--color-primary)]" />
          <span className="text-sm font-semibold tracking-tight">TwinMind</span>
          <span className="text-xs text-[var(--color-muted-foreground)]">Live Suggestions</span>
        </Link>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleExport('json')}
            disabled={!canExport}
            title="Export session as JSON"
          >
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Export JSON</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleExport('txt')}
            disabled={!canExport}
            title="Export session as TXT"
          >
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Export TXT</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReset}
            disabled={!canExport || isRecording}
            title="Clear session"
          >
            <Trash2 className="h-4 w-4" />
            <span className="hidden sm:inline">Clear</span>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href="/settings">
              <SettingsIcon className="h-4 w-4" />
              <span className="hidden sm:inline">Settings</span>
            </Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
