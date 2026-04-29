export type ElementType = 'text' | 'image' | 'button' | 'container';

export interface CapturedAd {
  id: string;
  elements: AdElement[];
  originalElements: AdElement[];
  capturedAt: number;
  /**
   * Self-contained HTML/CSS recreation of the ad produced by the
   * extractionMode='html' pipeline. When present, Canvas mounts this in a
   * shadow DOM instead of rendering per-element. `elements` may be empty
   * in this mode — the layers list is derived from the rendered DOM.
   */
  html?: string;
  /** Snapshot of `html` at extraction time; survives refines, used for undo/revert. */
  originalHtml?: string;
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
