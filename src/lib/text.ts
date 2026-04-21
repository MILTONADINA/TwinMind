// Keep the last `max` characters of `text`. Used to bound transcript size
// going to the model without losing recent context.
export function keepLastChars(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(text.length - max);
}
