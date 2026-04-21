import { describe, expect, it } from 'vitest';
import { parseCards } from './suggest-parser';

const validBody = {
  cards: [
    {
      type: 'question',
      title: 'What is the team size?',
      preview: 'The group size affects the plan.',
    },
    {
      type: 'talking_point',
      title: 'Mention the March timeline',
      preview: 'You said March earlier.',
    },
    {
      type: 'fact_check',
      title: 'Claim: they ship weekly',
      preview: 'Based on transcript, monthly.',
    },
  ],
};

describe('parseCards', () => {
  it('returns three cards for a well-formed JSON envelope', () => {
    const result = parseCards(JSON.stringify(validBody));
    expect(result).not.toBeNull();
    expect(result).toHaveLength(3);
    expect(result?.[0].type).toBe('question');
    expect(result?.[0].id).toEqual(expect.any(String));
  });

  it('trims whitespace from title and preview', () => {
    const body = {
      cards: validBody.cards.map((c) => ({
        ...c,
        title: `  ${c.title}  `,
        preview: `\n${c.preview}\n`,
      })),
    };
    const result = parseCards(JSON.stringify(body));
    expect(result?.[0].title).toBe(validBody.cards[0]!.title);
    expect(result?.[0].preview).toBe(validBody.cards[0]!.preview);
  });

  it('returns null for malformed JSON', () => {
    expect(parseCards('not-json')).toBeNull();
    expect(parseCards('{ "cards": [')).toBeNull();
  });

  it('returns null when cards count is not exactly three', () => {
    const twoCards = { cards: validBody.cards.slice(0, 2) };
    const fourCards = { cards: [...validBody.cards, validBody.cards[0]] };
    expect(parseCards(JSON.stringify(twoCards))).toBeNull();
    expect(parseCards(JSON.stringify(fourCards))).toBeNull();
  });

  it('returns null when a card has an unknown type', () => {
    const bad = {
      cards: [validBody.cards[0], validBody.cards[1], { ...validBody.cards[2], type: 'gossip' }],
    };
    expect(parseCards(JSON.stringify(bad))).toBeNull();
  });

  it('returns null when title or preview is empty', () => {
    const emptyTitle = {
      cards: [validBody.cards[0], validBody.cards[1], { ...validBody.cards[2], title: '   ' }],
    };
    const emptyPreview = {
      cards: [validBody.cards[0], validBody.cards[1], { ...validBody.cards[2], preview: '' }],
    };
    expect(parseCards(JSON.stringify(emptyTitle))).toBeNull();
    expect(parseCards(JSON.stringify(emptyPreview))).toBeNull();
  });

  it('returns null when the top-level object lacks a cards array', () => {
    expect(parseCards(JSON.stringify({ items: validBody.cards }))).toBeNull();
    expect(parseCards(JSON.stringify({ cards: 'not-an-array' }))).toBeNull();
    expect(parseCards(JSON.stringify('bare-string'))).toBeNull();
  });
});
