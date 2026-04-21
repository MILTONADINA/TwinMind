'use client';

import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useChatSender } from '@/hooks/useChatSender';
import { useSuggestRefresh } from '@/hooks/useSuggestRefresh';
import { cn } from '@/lib/utils';
import { useSession } from '@/stores/session';
import type { Card as CardData, CardType } from '@/types';

const TYPE_STYLES: Record<CardType, { label: string; border: string; dot: string; title: string }> =
  {
    question: {
      label: 'Question',
      border: 'border-l-[var(--color-accent-blue)]',
      dot: 'bg-[var(--color-accent-blue)]',
      title: 'text-[var(--color-accent-blue)]',
    },
    talking_point: {
      label: 'Talking point',
      border: 'border-l-[var(--color-accent-purple)]',
      dot: 'bg-[var(--color-accent-purple)]',
      title: 'text-[var(--color-accent-purple)]',
    },
    answer: {
      label: 'Answer',
      border: 'border-l-[var(--color-accent-green)]',
      dot: 'bg-[var(--color-accent-green)]',
      title: 'text-[var(--color-accent-green)]',
    },
    fact_check: {
      label: 'Fact-check',
      border: 'border-l-[var(--color-accent-amber)]',
      dot: 'bg-[var(--color-accent-amber)]',
      title: 'text-[var(--color-accent-amber)]',
    },
  };

export function SuggestionsColumn() {
  const batches = useSession((s) => s.batches);
  const isRecording = useSession((s) => s.isRecording);
  const refreshSeconds = useSession((s) => Math.round(s.settings.refreshIntervalMs / 1000));

  const { runRefresh, isRefreshing } = useSuggestRefresh();
  const { send } = useChatSender();

  return (
    <Card className="flex h-full min-h-0 flex-col">
      <CardHeader>
        <CardTitle>2. Live Suggestions</CardTitle>
        <span className="rounded-full bg-[var(--color-muted)] px-2 py-0.5 text-[10px] font-semibold tracking-wider text-[var(--color-muted-foreground)] uppercase">
          {batches.length} {batches.length === 1 ? 'batch' : 'batches'}
        </span>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-3">
        <div className="flex items-center justify-between">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void runRefresh()}
            disabled={isRefreshing}
          >
            <RefreshCw className={cn('h-4 w-4', isRefreshing && 'animate-spin')} />
            {isRefreshing ? 'Refreshing…' : 'Reload suggestions'}
          </Button>
          <span className="text-xs text-[var(--color-muted-foreground)]">
            {isRecording ? `auto-refresh in ${refreshSeconds}s` : 'auto-refresh paused'}
          </span>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
          {batches.length === 0 ? (
            <p className="mt-8 text-center text-sm text-[var(--color-muted-foreground)]">
              Suggestions appear here once recording starts.
            </p>
          ) : (
            batches.map((batch, batchIdx) => (
              <div
                key={batch.id}
                className={cn(
                  'flex flex-col gap-2 transition-opacity',
                  batchIdx === 0 ? 'opacity-100' : batchIdx === 1 ? 'opacity-75' : 'opacity-50',
                )}
              >
                <div className="flex items-center justify-between text-[10px] tracking-wider text-[var(--color-muted-foreground)] uppercase">
                  <span>{batchIdx === 0 ? 'Newest' : formatTime(batch.createdAt)}</span>
                  <span>{formatTime(batch.createdAt)}</span>
                </div>
                {batch.cards.map((card) => (
                  <SuggestionCard
                    key={card.id}
                    card={card}
                    onSelect={() => void send(card.title, { card })}
                  />
                ))}
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function SuggestionCard({ card, onSelect }: { card: CardData; onSelect: () => void }) {
  const style = TYPE_STYLES[card.type];
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'group w-full rounded-lg border border-l-4 border-[var(--color-border)] bg-[var(--color-muted)]/50 p-3 text-left transition-colors hover:bg-[var(--color-muted)] focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] focus-visible:outline-none',
        style.border,
      )}
    >
      <div className="flex items-center gap-2 text-[10px] tracking-wider uppercase">
        <span className={cn('h-1.5 w-1.5 rounded-full', style.dot)} />
        <span className={style.title}>{style.label}</span>
      </div>
      <p className="mt-1 text-sm font-medium text-[var(--color-foreground)]">{card.title}</p>
      <p className="mt-1 text-xs leading-relaxed text-[var(--color-muted-foreground)]">
        {card.preview}
      </p>
    </button>
  );
}

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
