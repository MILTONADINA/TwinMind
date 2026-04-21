export type Chunk = {
  id: string;
  startedAt: number;
  durationMs: number;
  text: string;
};

export const CARD_TYPES = ['question', 'talking_point', 'answer', 'fact_check'] as const;
export type CardType = (typeof CARD_TYPES)[number];

export type Card = {
  id: string;
  type: CardType;
  title: string;
  preview: string;
};

export type Batch = {
  id: string;
  createdAt: number;
  cards: [Card, Card, Card];
};

export type Role = 'user' | 'assistant';

export type CardSnapshot = {
  type: CardType;
  title: string;
  preview: string;
};

export type Message = {
  id: string;
  role: Role;
  createdAt: number;
  content: string;
  streaming?: boolean;
  sourceCardId?: string;
  cardSnapshot?: CardSnapshot;
};

export type Prompts = {
  suggest: string;
  detail: string;
  chat: string;
};

export type Settings = {
  prompts: Prompts;
  suggestContextMinutes: number;
  refreshIntervalMs: number;
  chunkMs: number;
};

export type ApiErrorBody = { error: string };
