import type { AdElement } from '../../types';
import { AiRefineError } from '../../utils/openai';

export type ExtractionPromptId = 'elements' | 'scene';

export const VISION_SYSTEM_PROMPT = `You are an ad design assistant. You can see a screenshot of the rendered ad and its JSON data.
Use the visual appearance to inform your changes.
Return ONLY a valid JSON array with the same structure.

Rules you MUST follow:
1. Never change: id, styles.top, styles.left, styles.width, styles.height, zIndex
2. You MAY change: content, styles.backgroundColor, styles.color, styles.fontSize, styles.borderRadius, styles.backgroundImage, styles.fontWeight
3. Never add or remove elements. Same length, same IDs, same order.
4. Return raw JSON only. No markdown fences. No explanation.`;

export const SYSTEM_PROMPT = `You are an ad design assistant. You receive a JSON array of AdElement objects and a user request.
Return ONLY a valid JSON array with the same structure.

Rules you MUST follow:
1. Never change: id, styles.top, styles.left, styles.width, styles.height, zIndex
2. You MAY change: content, styles.backgroundColor, styles.color, styles.fontSize, styles.borderRadius, styles.backgroundImage, styles.fontWeight
3. Never add or remove elements from the array — the output array must have the same length and the same IDs in the same order.
4. Return raw JSON only. No markdown fences. No explanation.`;

export const EXTRACTION_SYSTEM_PROMPT = `You are a visual ad layout extractor. Your job is to identify and describe EVERY visible element in the advertisement image as a flat list of layers.

CRITICAL RULES — you MUST follow all of these:
1. You MUST extract EVERY visible element: backgrounds, images, headlines, body text, logos, buttons, dividers, overlays. A typical ad has 5–15 elements. Never return fewer than 3.
2. el-0 is always the root container: top=0, left=0, width=100, height=100, backgroundColor=dominant background color.
3. ALL coordinates (top, left, width, height) are PERCENTAGES of the ad dimensions (0–100). Example: an element centered horizontally at half-height with 50% width and 20% height → left=25, top=40, width=50, height=20.
4. zIndex starts at 0 (root), increment by 1 per layer going forward.
5. type must be one of: "container" (background/wrapper), "image" (photo/graphic/logo), "text" (any readable copy), "button" (CTA with label).
6. content = exact visible text for text and button types. Empty string for container and image types.
7. Colors must be hex (e.g. "#1a2b3c") or "transparent". Never use rgb() or named colors.
8. fontSize is in CSS pixels (e.g. "24px"), estimated relative to the ad dimensions provided.
9. Return ONLY the JSON object. No markdown, no explanation, no extra text.

Example of a correct response for a 300×250 ad:
{
  "elements": [
    {
      "id": "el-0",
      "type": "container",
      "content": "",
      "styles": { "top": 0, "left": 0, "width": 100, "height": 100, "backgroundColor": "#1a1a2e", "color": "#ffffff", "fontSize": "16px", "fontWeight": "400", "borderRadius": "0px", "backgroundImage": "" },
      "zIndex": 0
    },
    {
      "id": "el-1",
      "type": "image",
      "content": "",
      "styles": { "top": 0, "left": 0, "width": 100, "height": 64, "backgroundColor": "transparent", "color": "#ffffff", "fontSize": "16px", "fontWeight": "400", "borderRadius": "0px", "backgroundImage": "" },
      "zIndex": 1
    },
    {
      "id": "el-2",
      "type": "text",
      "content": "Summer Sale — Up to 50% Off",
      "styles": { "top": 68, "left": 5, "width": 89, "height": 14, "backgroundColor": "transparent", "color": "#ffffff", "fontSize": "22px", "fontWeight": "700", "borderRadius": "0px", "backgroundImage": "" },
      "zIndex": 2
    },
    {
      "id": "el-3",
      "type": "text",
      "content": "Limited time only. Shop now and save big.",
      "styles": { "top": 85, "left": 5, "width": 89, "height": 8, "backgroundColor": "transparent", "color": "#cccccc", "fontSize": "13px", "fontWeight": "400", "borderRadius": "0px", "backgroundImage": "" },
      "zIndex": 3
    },
    {
      "id": "el-4",
      "type": "button",
      "content": "Shop Now",
      "styles": { "top": 82, "left": 63, "width": 31, "height": 13, "backgroundColor": "#e63946", "color": "#ffffff", "fontSize": "14px", "fontWeight": "600", "borderRadius": "6px", "backgroundImage": "" },
      "zIndex": 4
    }
  ]
}`;

export const SCENE_EXTRACTION_PROMPT = `Your task is to convert the provided image into a machine-readable, fully exhaustive JSON file that contains every discernible element required to recreate the image with maximal fidelity inside of generative-image engines (e.g., Nano Banana, flux, DALL·E, etc.).
This JSON must encode every visible detail, regardless of size, prominence, or relevance.
If it exists visually, it must exist in your JSON.
Do not summarize.
Do not provide interpretations.
Do not omit micro-details.
Do not output text descriptions outside the JSON.
Return a single JSON object ONLY.

PRE-ANALYSIS PROTOCOL (MANDATORY)
Before generating JSON, silently perform three internal scans (do NOT output these steps):
1. Macro Sweep — identify: full scene type, overall layout, lighting environment, color distribution, perspective, atmosphere, foreground/background separation.
2. Micro Sweep — scan for: texture patterns, material type, reflections + highlights, dust/scratches/wear, stitching/seams/imperfections, shadows (hard/soft, direction, gradation), OCR text and typography (exact styles, sizes, case).
3. Relationship Sweep — map: spatial placement of all objects, orientation, occlusions, overlaps, hierarchy of visual attention, connections (e.g. "object A resting on object B").

BOUNDING BOX CONVENTION (STRICT, applies to every object)
- Image origin is the TOP-LEFT corner. x increases to the right, y increases downward.
- bounding_box_percentage.x and .y refer to the TOP-LEFT corner of the box. They are NOT the center.
- All four values (x, y, width, height) are normalized to 0.0–1.0 of the full image. Examples:
    full image  → { x: 0.0,  y: 0.0,  width: 1.0,  height: 1.0 }
    top-right quadrant → { x: 0.5,  y: 0.0,  width: 0.5,  height: 0.5 }
    centered 20%×20% box → { x: 0.4,  y: 0.4,  width: 0.2,  height: 0.2 }
- The box must tightly enclose the object's visible pixels — no extra padding, no large margins.
- x + width must be ≤ 1.0. y + height must be ≤ 1.0. Boxes outside the image are invalid.
- Be precise to two decimal places (e.g. 0.42, not 0.5) — pixel-accurate bounding boxes are required.

OUTPUT FORMAT (STRICT)
Produce one valid JSON object using the following schema. Expand arrays and objects as required so that all details in the image are captured.

{
  "meta": {
    "image_quality": "Low/Medium/High/Very High",
    "image_type": "Photo/Illustration/Diagram/Screenshot/etc",
    "resolution_estimation": "Approximate resolution if discernable",
    "file_characteristics": {
      "compression_artifacts": "None/Low/Medium/High",
      "noise_level": "None/Low/Medium/High",
      "lens_type_estimation": "If inferable (e.g., wide/tele/macro)"
    }
  },
  "global_context": {
    "scene_description": "Comprehensive paragraph describing entire scene exactly as visible",
    "environment_type": "Indoor/Outdoor/Studio/Virtual/Unknown",
    "time_of_day": "If discernable: Day/Night/Golden hour/etc",
    "weather_atmosphere": "Foggy/Clear/Hazy/Rainy/Chaotic/Serene/etc",
    "lighting": {
      "source": "Sunlight/Artificial/Mixed/Backlit/etc",
      "direction": "Top-down/Side/Back/etc",
      "quality": "Hard/Soft/Diffused",
      "color_temperature": "Warm/Cool/Neutral (in Kelvin if inferable)"
    },
    "color_palette": {
      "dominant_hex_estimates": ["#RRGGBB"],
      "accent_colors": ["#RRGGBB"],
      "contrast_level": "Low/Medium/High"
    }
  },
  "composition": {
    "camera_angle": "Eye-level/High-angle/Low-angle/Macro/etc",
    "framing": "Close-up/Medium/Wide/Extreme/etc",
    "depth_of_field": "Shallow/Medium/Deep",
    "focal_point": "Primary element pulling visual attention",
    "symmetry_type": "None/Horizontal/Vertical/Radial/etc",
    "rule_of_thirds_alignment": "If objects align with thirds intersections"
  },
  "objects": [
    {
      "id": "obj_001",
      "label": "Object name or classification",
      "category": "Person/Vehicle/Furniture/Text/Screen/UI elements/etc",
      "location": {
        "relative_position": "Top-left/Center-right/etc",
        "bounding_box_percentage": { "x": 0.0, "y": 0.0, "width": 0.0, "height": 0.0 }
      },
      // Bounding box convention (STRICT):
      //   - Image origin is the top-left corner. x increases rightward, y increases downward.
      //   - x and y refer to the TOP-LEFT corner of the box (NOT the center).
      //   - All four values are normalized to 0.0–1.0 relative to the full image.
      //   - The box must tightly enclose the object's visible pixels — no extra padding.
      //   - x + width must be ≤ 1.0; y + height must be ≤ 1.0.
      "dimensions_relative": "Large/Medium/Small relative to frame",
      "distance_from_camera": "Near/Mid/Far",
      "pose_orientation": "Facing direction, tilt, rotation, posture data",
      "material": "Wood/Metal/Glass/Plastic/Fabric/etc",
      "surface_properties": {
        "texture": "Smooth/Rough/Glossy/Matte/Patterned/etc",
        "reflectivity": "None/Low/Medium/High",
        "micro_details": "Scratches/Scuffs/Dust/Stains/Print patterns/etc",
        "wear_state": "New/Worn/Damaged/Dirty/etc"
      },
      "color_details": {
        "base_color_hex": "#RRGGBB",
        "secondary_colors": ["#RRGGBB"],
        "gradient_or_pattern": "Describe if present"
      },
      "interaction_with_light": {
        "shadow_casting": "Direction/Sharpness/Occlusion areas",
        "highlight_zones": "Where light hits strongest",
        "translucency": "If applicable"
      },
      "text_content": {
        "raw_text": "Exact OCR extraction",
        "font_style": "Sans-serif/Serif/Monospace/etc",
        "font_weight": "Light/Regular/Bold/etc",
        "text_case": "Uppercase/Lowercase/Mixed",
        "alignment": "Left/Center/Right",
        "color_hex": "#RRGGBB"
      },
      "relationships": [
        { "type": "next_to/overlapping/attached/holding/etc", "target_object_id": "obj_002" }
      ]
    }
  ],
  "background_details": {
    "texture": "Wall/sky/clouds/fabric/etc",
    "patterns": "Stripes/speckled/no pattern/etc",
    "lighting_behavior": "How background receives light",
    "additional_elements": ["Any secondary or subtle elements"]
  },
  "foreground_elements": {
    "particles": "Dust/smoke/bokeh debris etc if present",
    "artifacts": "Lens flare, chromatic aberration, reflections"
  },
  "reconstruction_notes": {
    "mandatory_elements_for_recreation": "List must-have items",
    "sensitivity_factors": "Details that strongly influence resemblance",
    "ambiguities": "Anything not fully verifiable"
  }
}`;

export const HTML_RECREATION_PROMPT = `You are an expert front-end developer recreating an advertisement as self-contained HTML and CSS.

Your output is a single HTML fragment that, when rendered in a browser at the ad's exact dimensions, looks as close to the source image as possible. The browser will compute layout — you do NOT output bounding-box coordinates anywhere.

OUTPUT REQUIREMENTS
- Wrap everything in a single root div: <div class="ad-root" style="position:relative; width:Wpx; height:Hpx; overflow:hidden;">…</div> where W and H are the exact ad dimensions you are given.
- All descendants use position:absolute with top/left/width/height in pixels relative to the ad-root.
- Inline ALL styles via the style="" attribute OR a single <style> tag inside ad-root. Do NOT reference external resources, fonts, or images.
- For photographic content (faces, products, screenshots-within-ads, real-world photos): use <div data-image-source="preserve" …></div>. The renderer will fill these from the original screenshot crop. Do NOT try to describe the photo in HTML — just leave the box.
- For text, use semantic tags (<h1>, <h2>, <p>, <button>, <span>) styled to match the visible glyphs. Match font-family, font-weight, font-size, letter-spacing, color, line-height, text-shadow as faithfully as you can identify.
- For decorative geometry (logos that are vector marks, icons, dividers, badges, gradient blobs): draw with HTML/CSS — no images. Use box-shadow, border-radius, gradients, transforms freely.
- Tag every meaningful element with a data-role attribute drawn from this list (extend if needed): "background", "logo", "headline", "subhead", "body-text", "cta-button", "hero-image", "thumbnail", "engagement-badge", "icon", "divider".
- Every data-role value within a single ad must be unique. Append numeric suffixes for repeats: "thumbnail-1", "thumbnail-2", "engagement-badge-1", etc.

DO NOT
- Do not output Markdown, code fences, prose, or commentary. Output ONLY the HTML fragment.
- Do not include <html>, <head>, <body>, <script>, or external links.
- Do not produce <img src="…"> with URLs you don't actually have.

QUALITY RULES
- Recreate every visible element. If you see it, output it.
- Z-order: deeper elements come earlier in DOM order; foreground elements come last.
- For gradients and glows, use CSS gradients/box-shadow rather than approximated solids.
- When uncertain about an exact color, sample the dominant color from the area and use it.`;

export const EXTRACTION_PROMPTS: Record<ExtractionPromptId, { label: string; description: string }> = {
  elements: {
    label: 'Element Extractor',
    description: 'Extracts editable layers — text, images, buttons — with bounding boxes sized for the canvas.',
  },
  scene: {
    label: 'Scene Descriptor',
    description: 'Exhaustive scene analysis: materials, lighting, micro-details. Maps detected objects to canvas layers.',
  },
};

/** Map a scene-format category string to our AdElement type. */
function categoryToType(category: string): AdElement['type'] {
  const c = category.toLowerCase();
  if (c.includes('text') || c.includes('typography') || c.includes('copy')) return 'text';
  if (c.includes('button') || c.includes('cta') || c.includes('ui')) return 'button';
  if (c.includes('person') || c.includes('vehicle') || c.includes('product') ||
      c.includes('screen') || c.includes('photo') || c.includes('image') || c.includes('logo')) return 'image';
  return 'container';
}

/** Map scene font_weight string to a CSS font-weight value. */
function mapFontWeight(fw: string | undefined): string {
  if (!fw) return '400';
  const f = fw.toLowerCase();
  if (f === 'bold' || f === 'heavy') return '700';
  if (f === 'light' || f === 'thin') return '300';
  if (f === 'medium' || f === 'semibold') return '600';
  return '400';
}

/**
 * Extract a JSON object/array from raw model output that may contain markdown
 * fences or surrounding prose. Tries the trimmed string first, then falls back
 * to slicing from the first `{`/`[` to the matching last `}`/`]`.
 */
function extractJsonBlob(raw: string): string {
  const stripped = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
  try {
    JSON.parse(stripped);
    return stripped;
  } catch {
    // fall through to slice-based recovery
  }
  const firstBrace = raw.indexOf('{');
  const firstBracket = raw.indexOf('[');
  const start = firstBrace === -1 ? firstBracket
              : firstBracket === -1 ? firstBrace
              : Math.min(firstBrace, firstBracket);
  const lastBrace = raw.lastIndexOf('}');
  const lastBracket = raw.lastIndexOf(']');
  const end = Math.max(lastBrace, lastBracket);
  if (start === -1 || end === -1 || end <= start) return stripped;
  return raw.slice(start, end + 1).trim();
}

/**
 * Pretty-print the parse failure: exact byte position, line/col, and a window
 * of surrounding context with the offending byte marked. Returned string is
 * suitable for logging *and* stuffing into an error message.
 */
function describeJsonParseError(text: string, err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  const posMatch = msg.match(/position\s+(\d+)/i);
  if (!posMatch) return msg;
  const pos = parseInt(posMatch[1], 10);
  if (Number.isNaN(pos)) return msg;

  const before = text.slice(0, pos);
  const line = before.split('\n').length;
  const col = pos - before.lastIndexOf('\n');
  const winStart = Math.max(0, pos - 120);
  const winEnd = Math.min(text.length, pos + 120);
  const window = text.slice(winStart, pos) + '>>>HERE>>>' + text.slice(pos, winEnd);
  return `${msg} (line ${line}, col ${col})\n…${window}…`;
}

/**
 * Parse the exhaustive scene JSON (returned by SCENE_EXTRACTION_PROMPT) into AdElement[].
 * Coordinates are in 0–1 bounding_box_percentage → multiply by 100 → feed to pctToPixels.
 */
export function parseSceneElements(raw: string, providerName: string): AdElement[] {
  const cleaned = extractJsonBlob(raw);
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(cleaned) as Record<string, unknown>;
  } catch (e) {
    const detail = describeJsonParseError(cleaned, e);
    console.group(`[${providerName}] scene JSON parse failed`);
    console.error(detail);
    console.log('full raw response:', raw);
    console.groupEnd();
    throw new AiRefineError(`${providerName} returned invalid JSON for scene extraction. ${detail}`);
  }

  const objects = parsed.objects as Array<Record<string, unknown>> | undefined;
  if (!Array.isArray(objects) || objects.length === 0) {
    throw new AiRefineError(`${providerName} scene response contained no objects array.`);
  }

  // Build the background element from the global color palette
  const palette = (parsed.global_context as Record<string, unknown> | undefined)?.color_palette as Record<string, unknown> | undefined;
  const dominantColors = palette?.dominant_hex_estimates as string[] | undefined;
  const bgColor = dominantColors?.[0] ?? '#000000';

  const background: AdElement = {
    id: 'el-0',
    type: 'container',
    content: '',
    styles: {
      top: 0, left: 0, width: 100, height: 100,
      backgroundColor: bgColor,
      color: '#ffffff',
      fontSize: '16px',
      fontWeight: '400',
      borderRadius: '0px',
      backgroundImage: '',
      opacity: '1',
      zIndex: '0',
    },
    zIndex: 0,
  };

  const elements: AdElement[] = [background];

  objects.forEach((obj, i) => {
    const location = obj.location as Record<string, unknown> | undefined;
    const bbox = location?.bounding_box_percentage as Record<string, number> | undefined;
    const textContent = obj.text_content as Record<string, unknown> | undefined;
    const colorDetails = obj.color_details as Record<string, unknown> | undefined;

    // bounding_box_percentage is 0–1; multiply by 100 for our % system (pctToPixels converts to px)
    const left   = ((bbox?.x   ?? 0) * 100);
    const top    = ((bbox?.y   ?? 0) * 100);
    const width  = ((bbox?.width  ?? 1) * 100);
    const height = ((bbox?.height ?? 1) * 100);

    const rawText = textContent?.raw_text as string | undefined;
    const category = obj.category as string | undefined ?? '';
    const type = categoryToType(category);

    elements.push({
      id: `el-${i + 1}`,
      type,
      content: rawText ?? '',
      styles: {
        top,
        left,
        width,
        height,
        backgroundColor: colorDetails?.base_color_hex as string ?? 'transparent',
        color: textContent?.color_hex as string ?? '#ffffff',
        fontSize: '16px',
        fontWeight: mapFontWeight(textContent?.font_weight as string | undefined),
        borderRadius: '0px',
        backgroundImage: '',
        opacity: '1',
        zIndex: String(i + 1),
      },
      zIndex: i + 1,
    });
  });

  return elements;
}

/** Convert percentage coordinates (0–100) returned by the AI into CSS pixels. */
export function pctToPixels(elements: AdElement[], adW: number, adH: number): AdElement[] {
  return elements.map((el) => ({
    ...el,
    styles: {
      ...el.styles,
      left:   (el.styles.left   / 100) * adW,
      top:    (el.styles.top    / 100) * adH,
      width:  (el.styles.width  / 100) * adW,
      height: (el.styles.height / 100) * adH,
    },
  }));
}

export function parseExtractedElements(raw: string, providerName: string): AdElement[] {
  const cleaned = extractJsonBlob(raw);

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    const detail = describeJsonParseError(cleaned, e);
    console.group(`[${providerName}] extraction JSON parse failed`);
    console.error(detail);
    console.log('full raw response:', raw);
    console.groupEnd();
    throw new AiRefineError(`${providerName} returned invalid JSON during extraction. ${detail}`);
  }

  const arr = (parsed as Record<string, unknown>).elements ?? parsed;
  if (!Array.isArray(arr) || arr.length === 0) {
    throw new AiRefineError(`${providerName} returned an empty element array.`);
  }

  return arr as AdElement[];
}

export function parseAdElements(raw: string, original: AdElement[], providerName: string): AdElement[] {
  const cleaned = extractJsonBlob(raw);

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    const detail = describeJsonParseError(cleaned, e);
    console.group(`[${providerName}] refine JSON parse failed`);
    console.error(detail);
    console.log('full raw response:', raw);
    console.groupEnd();
    throw new AiRefineError(`${providerName} returned invalid JSON. ${detail}`);
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
