import type { AdElement } from '../../types';

export interface ExtractionResult {
  elements: AdElement[];
  /** Raw JSON string returned by the model — shown in the {} viewer */
  rawJson: string;
}

export interface LLMProvider {
  /** Extract ad elements from a screenshot (vision-first pipeline). */
  extractAd(screenshot: string, adWidth: number, adHeight: number): Promise<ExtractionResult>;
  /** Mutate existing elements based on a user prompt. */
  refineAd(elements: AdElement[], userRequest: string, screenshotBase64?: string): Promise<AdElement[]>;
  healthCheck(): Promise<boolean>;
}
