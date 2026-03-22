// Ad-Morph Inspector – content script
// Injected into every frame (all_frames: true).

let inspectionActive = false;
let idCounter = 0;
// Tracks the element currently shown in the highlighter (may differ from e.target)
let highlightedEl = null;

// ── Highlighter overlay ──────────────────────────────────────────────────────

const highlighter = document.createElement('div');
highlighter.id = 'ad-morph-highlighter';
document.body.appendChild(highlighter);

// ── Message handling ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((request) => {
  if (request.action === 'toggle_inspect') {
    inspectionActive = request.active !== undefined ? request.active : !inspectionActive;
    if (!inspectionActive) highlighter.style.display = 'none';
  }
});

// ── Hover highlight ──────────────────────────────────────────────────────────

document.addEventListener('mousemove', (e) => {
  if (!inspectionActive) return;

  const raw = e.target;
  if (raw === highlighter) return;

  highlightedEl = findBestContainer(raw);
  positionHighlighter(highlightedEl);
}, { passive: true });

document.addEventListener('mouseleave', () => {
  if (inspectionActive) highlighter.style.display = 'none';
});

function positionHighlighter(el) {
  const rect = el.getBoundingClientRect();
  // Apply every layout property inline so page stylesheets can't override anything.
  // position:fixed + viewport coords — do NOT add scrollY/scrollX.
  const s = highlighter.style;
  s.all = 'unset';           // reset any inherited/page styles
  s.position = 'fixed';
  s.display = 'block';
  s.top = rect.top + 'px';
  s.left = rect.left + 'px';
  s.width = rect.width + 'px';
  s.height = rect.height + 'px';
  s.zIndex = '2147483647';
  s.pointerEvents = 'none';
  s.boxSizing = 'border-box';
  s.border = '3px solid #3b82f6';
  s.borderRadius = '3px';
  // Solid semi-transparent fill so it's clearly visible over any background
  s.background = 'rgba(59,130,246,0.25)';
  s.outline = '1px dashed rgba(255,255,255,0.6)';
  s.outlineOffset = '-4px';
  highlighter.dataset.tag = el.tagName.toLowerCase();
}

// ── Click / mousedown capture ────────────────────────────────────────────────

// Block mousedown too — many ads navigate on mousedown before click fires
document.addEventListener('mousedown', (e) => {
  if (!inspectionActive) return;
  e.preventDefault();
  e.stopImmediatePropagation();
}, true);

document.addEventListener('click', async (e) => {
  if (!inspectionActive) return;

  e.preventDefault();
  e.stopImmediatePropagation(); // stop same-element handlers, not just bubbling

  inspectionActive = false;
  highlighter.style.display = 'none';
  chrome.storage.local.set({ inspectActive: false });

  const rootEl = highlightedEl || findBestContainer(e.target);
  const adElements = await captureTree(rootEl);
  chrome.runtime.sendMessage({ action: 'open_editor', data: adElements });
}, true);

// ── Container heuristic ───────────────────────────────────────────────────────

/**
 * Walk UP from `el` to find a suitable ad container:
 * an ancestor that has ≥2 children and a meaningful bounding box.
 * Falls back to the direct parent if nothing better is found.
 */
function findBestContainer(el) {
  // If the element already has multiple children it's a good root
  if (el.children.length >= 2) return el;

  let current = el.parentElement;
  while (current && current !== document.body && current !== document.documentElement) {
    const rect = current.getBoundingClientRect();
    if (current.children.length >= 2 && rect.width >= 80 && rect.height >= 80) {
      return current;
    }
    current = current.parentElement;
  }

  // Fallback: at minimum use the direct parent so we don't capture bare <img>
  return el.parentElement && el.parentElement !== document.body
    ? el.parentElement
    : el;
}

// ── Capture logic ────────────────────────────────────────────────────────────

/**
 * Walk the subtree of `rootEl` and return a flat AdElement[] array.
 * All coordinates are relative to the root element's top-left corner.
 */
async function captureTree(rootEl) {
  idCounter = 0;
  const containerRect = rootEl.getBoundingClientRect();

  // Collect root + all descendants
  const allNodes = [rootEl, ...Array.from(rootEl.querySelectorAll('*'))];

  const elements = await Promise.all(
    allNodes.map((el, idx) => captureElement(el, containerRect, idx))
  );

  // Filter out invisible / zero-size elements
  return elements.filter(
    (el) => el.styles.width > 0 && el.styles.height > 0
  );
}

async function captureElement(el, containerRect, idx) {
  const rect = el.getBoundingClientRect();
  const style = window.getComputedStyle(el);

  const top = rect.top - containerRect.top;
  const left = rect.left - containerRect.left;

  const bgImage = style.backgroundImage !== 'none' ? style.backgroundImage : undefined;

  // Resolve blob: URLs to data URIs so they survive the tab change
  const resolvedBgImage = bgImage ? await resolveBgImage(bgImage) : undefined;
  const src = await resolveImageSrc(el);

  return {
    id: `el-${idx}`,
    type: classifyType(el),
    content: el.tagName === 'IMG' ? (src || '') : (el.childElementCount === 0 ? (el.innerText?.trim() || '') : ''),
    styles: {
      top,
      left,
      width: rect.width,
      height: rect.height,
      backgroundColor: style.backgroundColor,
      color: style.color,
      fontSize: style.fontSize,
      fontFamily: style.fontFamily,
      fontWeight: style.fontWeight,
      borderRadius: style.borderRadius,
      backgroundImage: resolvedBgImage,
      opacity: style.opacity,
      zIndex: style.zIndex,
    },
    zIndex: parseInt(style.zIndex) || idx,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function classifyType(el) {
  const tag = el.tagName.toLowerCase();
  if (tag === 'img') return 'image';
  if (tag === 'button' || tag === 'a' || el.getAttribute('role') === 'button') return 'button';
  if (el.childElementCount === 0 && el.innerText?.trim()) return 'text';
  return 'container';
}

async function resolveImageSrc(el) {
  if (el.tagName !== 'IMG') return null;
  const src = el.currentSrc || el.src;
  if (!src) return null;
  if (src.startsWith('blob:') || src.startsWith('data:')) {
    return blobUrlToDataUrl(src);
  }
  return src;
}

async function resolveBgImage(bgImage) {
  // Extract url(...) value
  const match = bgImage.match(/url\(["']?(.+?)["']?\)/);
  if (!match) return bgImage;
  const url = match[1];
  if (url.startsWith('blob:') || url.startsWith('data:')) {
    const dataUrl = await blobUrlToDataUrl(url);
    return dataUrl ? `url("${dataUrl}")` : bgImage;
  }
  return bgImage;
}

async function blobUrlToDataUrl(url) {
  try {
    const resp = await fetch(url);
    const blob = await resp.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
  } catch {
    return url; // return original on failure
  }
}
