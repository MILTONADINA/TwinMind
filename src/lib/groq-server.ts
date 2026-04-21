import 'server-only';

import Groq, { APIError as GroqAPIError } from 'groq-sdk';
import { HttpError } from './errors';
import { GROQ_KEY_HEADER } from './groq';

export function clientFromRequest(req: Request): Groq {
  const apiKey = req.headers.get(GROQ_KEY_HEADER);
  if (!apiKey) {
    throw new HttpError(401, 'Missing Groq API key. Add one on the Settings page.');
  }
  return new Groq({ apiKey });
}

export function isGroqError(e: unknown): e is GroqAPIError {
  return e instanceof GroqAPIError;
}
