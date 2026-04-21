// Client-safe Groq constants. Kept in a file with no SDK imports so that
// client bundles that need, say, the request header name do not drag in
// groq-sdk and its Node dependencies.

export const WHISPER_MODEL = 'whisper-large-v3';
export const LLM_MODEL = 'openai/gpt-oss-120b';
export const GROQ_KEY_HEADER = 'x-groq-key';
