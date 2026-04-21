import { CARD_TYPES, type Card, type CardType } from '@/types';
import { uid } from './id';

const TYPE_SET = new Set<string>(CARD_TYPES);

// Parse the model's JSON-mode response into a validated tuple of three cards.
// Returns null on any schema violation so callers can retry once.
export function parseCards(text: string): [Card, Card, Card] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== 'object') return null;
  const envelope = parsed as { cards?: unknown };
  if (!Array.isArray(envelope.cards) || envelope.cards.length !== 3) return null;

  const cards: Card[] = [];
  for (const raw of envelope.cards) {
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Record<string, unknown>;
    const { type, title, preview } = r;
    if (typeof type !== 'string' || !TYPE_SET.has(type)) return null;
    if (typeof title !== 'string' || !title.trim()) return null;
    if (typeof preview !== 'string' || !preview.trim()) return null;
    cards.push({
      id: uid(),
      type: type as CardType,
      title: title.trim(),
      preview: preview.trim(),
    });
  }
  return [cards[0]!, cards[1]!, cards[2]!];
}
