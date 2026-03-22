import type { AdElement } from '../../types';

export interface LLMProvider {
  refineAd(elements: AdElement[], userRequest: string): Promise<AdElement[]>;
  healthCheck(): Promise<boolean>;
}
