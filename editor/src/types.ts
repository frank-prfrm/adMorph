export type ElementType = 'text' | 'image' | 'button' | 'container';

export interface CapturedAd {
  id: string;
  elements: AdElement[];
  capturedAt: number;
}

export interface AdElementStyles {
  top: number;
  left: number;
  width: number;
  height: number;
  backgroundColor: string;
  color: string;
  fontSize: string;
  fontFamily?: string;
  fontWeight?: string;
  borderRadius: string;
  backgroundImage?: string;
  opacity?: string;
  zIndex?: string;
}

export interface AdElement {
  id: string;
  type: ElementType;
  /** Text content, image src URL, or empty for containers */
  content: string;
  styles: AdElementStyles;
  zIndex: number;
}
