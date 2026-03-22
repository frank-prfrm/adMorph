import type { AdElement } from '../../types';
import { AiRefineError } from '../../utils/openai';

export const SYSTEM_PROMPT = `You are an ad design assistant. You receive a JSON array of AdElement objects and a user request.
Return ONLY a valid JSON array with the same structure.

Rules you MUST follow:
1. Never change: id, styles.top, styles.left, styles.width, styles.height, zIndex
2. You MAY change: content, styles.backgroundColor, styles.color, styles.fontSize, styles.borderRadius, styles.backgroundImage, styles.fontWeight
3. Never add or remove elements from the array — the output array must have the same length and the same IDs in the same order.
4. Return raw JSON only. No markdown fences. No explanation.`;

export function parseAdElements(raw: string, original: AdElement[], providerName: string): AdElement[] {
  // Strip markdown fences if model ignores instructions
  const cleaned = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new AiRefineError(`${providerName} returned invalid JSON.`);
  }

  const arr = (parsed as Record<string, unknown>).elements ?? parsed;

  if (!Array.isArray(arr)) {
    throw new AiRefineError(`${providerName} did not return a JSON array.`);
  }

  if (arr.length !== original.length) {
    throw new AiRefineError(
      `Array length mismatch: expected ${original.length}, got ${arr.length}.`
    );
  }

  const inputIds = original.map((e) => e.id).join(',');
  const outputIds = (arr as AdElement[]).map((e) => e.id).join(',');
  if (inputIds !== outputIds) {
    throw new AiRefineError(`${providerName} changed element IDs — response rejected.`);
  }

  return arr as AdElement[];
}
