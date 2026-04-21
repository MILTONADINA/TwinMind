import type { Settings } from '@/types';
import { DEFAULT_PROMPTS } from './prompts';

const SETTINGS_KEY = 'twinmind.settings.v1';
const API_KEY = 'twinmind.groq-key.v1';

export function loadSettings(defaults: Settings): Settings {
  if (typeof window === 'undefined') return defaults;
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      ...defaults,
      ...parsed,
      prompts: { ...DEFAULT_PROMPTS, ...(parsed.prompts ?? {}) },
    };
  } catch {
    return defaults;
  }
}

export function saveSettings(settings: Settings): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // storage disabled or quota exceeded — the session is usable without persistence
  }
}

export function loadApiKey(): string {
  if (typeof window === 'undefined') return '';
  try {
    return window.sessionStorage.getItem(API_KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveApiKey(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    if (key) window.sessionStorage.setItem(API_KEY, key);
    else window.sessionStorage.removeItem(API_KEY);
  } catch {
    // ignore
  }
}
