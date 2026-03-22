import type { AdElement } from '../../types';

export interface LLMProvider {
  /** Extract ad elements from a screenshot (vision-first pipeline). */
  extractAd(screenshot: string, adWidth: number, adHeight: number): Promise<AdElement[]>;
  /** Mutate existing elements based on a user prompt. */
  refineAd(elements: AdElement[], userRequest: string, screenshotBase64?: string): Promise<AdElement[]>;
  healthCheck(): Promise<boolean>;
}
