import type { AdElement } from '../types';

const SYSTEM_PROMPT = `You are an ad design assistant. You receive a JSON array of AdElement objects and a user request.
Return ONLY a valid JSON array with the same structure.

Rules you MUST follow:
1. Never change: id, styles.top, styles.left, styles.width, styles.height, zIndex
2. You MAY change: content, styles.backgroundColor, styles.color, styles.fontSize, styles.borderRadius, styles.backgroundImage, styles.fontWeight
3. Never add or remove elements from the array — the output array must have the same length and the same IDs in the same order.
4. Return raw JSON only. No markdown fences. No explanation.`;

export class AiRefineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiRefineError';
  }
}

export async function refineAdWithAI(
  elements: AdElement[],
  userRequest: string,
  apiKey: string
): Promise<AdElement[]> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      response_format: { type: 'json_object' },
      temperature: 0.7,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Current ad JSON:\n${JSON.stringify(elements, null, 2)}\n\nUser request: ${userRequest}\n\nReturn the modified array wrapped in {"elements": [...]}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new AiRefineError(`OpenAI API error ${response.status}: ${err}`);
  }

  const data = await response.json();
  const raw = data.choices?.[0]?.message?.content;

  if (!raw) throw new AiRefineError('Empty response from OpenAI.');

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new AiRefineError('OpenAI returned invalid JSON.');
  }

  // Unwrap {elements: [...]} wrapper if present
  const arr = (parsed as Record<string, unknown>).elements ?? parsed;

  if (!Array.isArray(arr)) {
    throw new AiRefineError('OpenAI did not return a JSON array.');
  }

  if (arr.length !== elements.length) {
    throw new AiRefineError(
      `Array length mismatch: expected ${elements.length}, got ${arr.length}.`
    );
  }

  // Verify IDs are preserved
  const inputIds = elements.map((e) => e.id).join(',');
  const outputIds = (arr as AdElement[]).map((e) => e.id).join(',');
  if (inputIds !== outputIds) {
    throw new AiRefineError('OpenAI changed element IDs — response rejected.');
  }

  return arr as AdElement[];
}
