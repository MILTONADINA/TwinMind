'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { DEFAULT_PROMPTS } from '@/lib/prompts';
import { DEFAULT_SETTINGS, useSession } from '@/stores/session';
import type { Settings } from '@/types';

export default function SettingsPage() {
  const hydrate = useSession((s) => s.hydrate);
  const hydrated = useSession((s) => s.hydrated);

  useEffect(() => hydrate(), [hydrate]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
            API key lives in this tab only. Prompts and knobs persist across reloads.
          </p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/">Back to app</Link>
        </Button>
      </div>

      {hydrated ? <SettingsForm /> : <SettingsSkeleton />}
    </div>
  );
}

function SettingsSkeleton() {
  return <p className="text-sm text-[var(--color-muted-foreground)]">Loading settings…</p>;
}

function SettingsForm() {
  const storeKey = useSession.getState().apiKey;
  const storeSettings = useSession.getState().settings;

  const setApiKey = useSession((s) => s.setApiKey);
  const setSettings = useSession((s) => s.setSettings);
  const resetSettingsToDefaults = useSession((s) => s.resetSettingsToDefaults);

  const [keyDraft, setKeyDraft] = useState(storeKey);
  const [draft, setDraft] = useState<Settings>(storeSettings);

  const save = () => {
    setApiKey(keyDraft.trim());
    setSettings(draft);
    toast.success('Settings saved.');
  };

  const reset = () => {
    resetSettingsToDefaults();
    setDraft(DEFAULT_SETTINGS);
    toast.success('Prompts and knobs reset to defaults.');
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Groq API key</CardTitle>
          <span className="text-[10px] tracking-wider text-[var(--color-muted-foreground)] uppercase">
            sessionStorage
          </span>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label htmlFor="api-key">Key (never sent anywhere except Groq)</Label>
          <Input
            id="api-key"
            type="password"
            value={keyDraft}
            autoComplete="off"
            spellCheck={false}
            placeholder="gsk_..."
            onChange={(e) => setKeyDraft(e.target.value)}
          />
          <p className="text-xs text-[var(--color-muted-foreground)]">
            Get one at{' '}
            <a
              className="underline"
              href="https://console.groq.com/keys"
              target="_blank"
              rel="noreferrer"
            >
              console.groq.com/keys
            </a>
            .
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Runtime knobs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="ctx">Suggestion context window</Label>
              <span className="text-xs text-[var(--color-muted-foreground)]">
                last {draft.suggestContextMinutes} min
              </span>
            </div>
            <Slider
              id="ctx"
              min={1}
              max={15}
              step={1}
              value={[draft.suggestContextMinutes]}
              onValueChange={(v) =>
                setDraft((d) => ({
                  ...d,
                  suggestContextMinutes: v[0] ?? d.suggestContextMinutes,
                }))
              }
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="refresh">Auto-refresh interval</Label>
              <span className="text-xs text-[var(--color-muted-foreground)]">
                every {Math.round(draft.refreshIntervalMs / 1000)}s
              </span>
            </div>
            <Slider
              id="refresh"
              min={10}
              max={90}
              step={5}
              value={[Math.round(draft.refreshIntervalMs / 1000)]}
              onValueChange={(v) =>
                setDraft((d) => ({ ...d, refreshIntervalMs: (v[0] ?? 30) * 1000 }))
              }
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="chunk">Audio chunk size</Label>
              <span className="text-xs text-[var(--color-muted-foreground)]">
                {Math.round(draft.chunkMs / 1000)}s per chunk
              </span>
            </div>
            <Slider
              id="chunk"
              min={10}
              max={60}
              step={5}
              value={[Math.round(draft.chunkMs / 1000)]}
              onValueChange={(v) => setDraft((d) => ({ ...d, chunkMs: (v[0] ?? 30) * 1000 }))}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Prompts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <PromptField
            id="suggest-prompt"
            label="Live-suggestion system prompt"
            value={draft.prompts.suggest}
            defaultValue={DEFAULT_PROMPTS.suggest}
            rows={10}
            onChange={(v) => setDraft((d) => ({ ...d, prompts: { ...d.prompts, suggest: v } }))}
          />
          <PromptField
            id="detail-prompt"
            label="Detailed-answer system prompt (on card click)"
            value={draft.prompts.detail}
            defaultValue={DEFAULT_PROMPTS.detail}
            rows={7}
            onChange={(v) => setDraft((d) => ({ ...d, prompts: { ...d.prompts, detail: v } }))}
          />
          <PromptField
            id="chat-prompt"
            label="Chat system prompt (free-form questions)"
            value={draft.prompts.chat}
            defaultValue={DEFAULT_PROMPTS.chat}
            rows={6}
            onChange={(v) => setDraft((d) => ({ ...d, prompts: { ...d.prompts, chat: v } }))}
          />
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={reset}>
          Reset to defaults
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/">Cancel</Link>
          </Button>
          <Button onClick={save}>Save</Button>
        </div>
      </div>
    </div>
  );
}

function PromptField({
  id,
  label,
  value,
  defaultValue,
  rows,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  defaultValue: string;
  rows: number;
  onChange: (v: string) => void;
}) {
  const isDirty = value !== defaultValue;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label htmlFor={id}>{label}</Label>
        {isDirty ? (
          <button
            type="button"
            className="text-[10px] tracking-wider text-[var(--color-muted-foreground)] uppercase hover:text-[var(--color-foreground)]"
            onClick={() => onChange(defaultValue)}
          >
            Reset this
          </button>
        ) : null}
      </div>
      <Textarea id={id} rows={rows} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
