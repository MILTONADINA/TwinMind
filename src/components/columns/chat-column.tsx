'use client';

import { Send } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useChatSender } from '@/hooks/useChatSender';
import { cn } from '@/lib/utils';
import { useSession } from '@/stores/session';

export function ChatColumn() {
  const messages = useSession((s) => s.messages);
  const { send } = useChatSender();
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    void send(text);
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);

  return (
    <Card className="flex h-full min-h-0 flex-col">
      <CardHeader>
        <CardTitle>3. Chat (Detailed Answers)</CardTitle>
        <span className="rounded-full bg-[var(--color-muted)] px-2 py-0.5 text-[10px] font-semibold tracking-wider text-[var(--color-muted-foreground)] uppercase">
          Session-only
        </span>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-3">
        <div ref={scrollRef} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
          {messages.length === 0 ? (
            <p className="mt-8 text-center text-sm text-[var(--color-muted-foreground)]">
              Click a suggestion or type a question below.
            </p>
          ) : (
            messages.map((m) => (
              <div
                key={m.id}
                className={cn(
                  'max-w-[90%] rounded-lg px-3 py-2 text-sm leading-relaxed',
                  m.role === 'user'
                    ? 'self-end bg-[var(--color-primary)]/15 text-[var(--color-foreground)]'
                    : 'self-start bg-[var(--color-muted)] text-[var(--color-foreground)]',
                )}
              >
                {m.sourceCardId && m.role === 'user' ? (
                  <span className="mb-1 block text-[10px] tracking-wider text-[var(--color-muted-foreground)] uppercase">
                    Expanded suggestion
                  </span>
                ) : null}
                <p className="whitespace-pre-wrap">
                  {m.content || (m.streaming ? '…' : '')}
                  {m.streaming ? <span className="ml-0.5 animate-pulse">▍</span> : null}
                </p>
              </div>
            ))
          )}
        </div>

        <form onSubmit={onSubmit} className="flex items-center gap-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Ask anything…"
            aria-label="Chat input"
          />
          <Button type="submit" disabled={!draft.trim()}>
            <Send className="h-4 w-4" />
            Send
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
