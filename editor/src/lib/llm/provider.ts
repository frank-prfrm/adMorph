import type { AdElement } from '../../types';

export interface ExtractionResult {
  elements: AdElement[];
  /** Raw JSON string returned by the model — shown in the {} viewer */
  rawJson: string;
}

export interface HtmlExtractionResult {
  /** Self-contained HTML fragment (a single .ad-root div) ready to mount in a shadow DOM. */
  html: string;
  /** Raw text returned by the model — shown in the {} viewer for parity with bbox mode. */
  rawText: string;
}

export interface LLMProvider {
  /** Extract ad elements from a screenshot (vision-first pipeline). */
  extractAd(screenshot: string, adWidth: number, adHeight: number): Promise<ExtractionResult>;
  /**
   * Recreate the ad as HTML/CSS. Optional — providers that don't implement
   * this throw. The renderer mounts the html in a shadow DOM and computes
   * bounding boxes from the rendered layout instead of from the model.
   */
  extractAdAsHtml?(screenshot: string, adWidth: number, adHeight: number): Promise<HtmlExtractionResult>;
  /** Mutate existing elements based on a user prompt. */
  refineAd(elements: AdElement[], userRequest: string, screenshotBase64?: string): Promise<AdElement[]>;
  healthCheck(): Promise<boolean>;
}
