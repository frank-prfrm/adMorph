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
  const s = highlighter.style;
  s.all = 'unset';
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
  s.background = 'rgba(59,130,246,0.25)';
  s.outline = '1px dashed rgba(255,255,255,0.6)';
  s.outlineOffset = '-4px';
  highlighter.dataset.tag = el.tagName.toLowerCase();
}

// ── Click / mousedown capture ────────────────────────────────────────────────

document.addEventListener('mousedown', (e) => {
  if (!inspectionActive) return;
  e.preventDefault();
  e.stopImmediatePropagation();
}, true);

document.addEventListener('click', async (e) => {
  if (!inspectionActive) return;

  e.preventDefault();
  e.stopImmediatePropagation();

  inspectionActive = false;
  highlighter.style.display = 'none';
  chrome.storage.local.set({ inspectActive: false });

  const rootEl = highlightedEl || findBestContainer(e.target);
  const containerRect = rootEl.getBoundingClientRect();

  // DOM elements — used as an immediate preview while the vision model processes
  const adElements = await captureTree(rootEl);

  // Viewport-relative bounds so background.js can crop the screenshot
  const viewRect = {
    top: containerRect.top,
    left: containerRect.left,
    width: containerRect.width,
    height: containerRect.height,
    devicePixelRatio: window.devicePixelRatio || 1,
  };

  chrome.runtime.sendMessage({ action: 'open_editor', data: adElements, viewRect });
}, true);

// ── Container heuristic ───────────────────────────────────────────────────────

function findBestContainer(el) {
  const viewportW = window.innerWidth;
  const viewportH = window.innerHeight;
  let current = el;
  while (current && current !== document.body && current !== document.documentElement) {
    const rect = current.getBoundingClientRect();
    // Stop if this element is larger than 90% of the viewport (likely a page wrapper)
    if (rect.width > viewportW * 0.9 || rect.height > viewportH * 0.9) break;
    // Return the first (innermost) element that looks like a self-contained ad block
    if (rect.width >= 80 && rect.height >= 80 && current.children.length >= 2) {
      return current;
    }
    current = current.parentElement;
  }
  return el.parentElement || el;
}

// ── Capture logic ────────────────────────────────────────────────────────────

async function captureTree(rootEl) {
  idCounter = 0;
  const containerRect = rootEl.getBoundingClientRect();
  const allNodes = [rootEl, ...Array.from(rootEl.querySelectorAll('*'))];
  const elements = await Promise.all(
    allNodes.map((el, idx) => captureElement(el, containerRect, idx))
  );
  return elements.filter((el) => el.styles.width > 0 && el.styles.height > 0);
}

async function captureElement(el, containerRect, idx) {
  const rect = el.getBoundingClientRect();
  const style = window.getComputedStyle(el);

  const top = rect.top - containerRect.top;
  const left = rect.left - containerRect.left;

  // Don't capture backgroundImage on elements that have <img> children —
  // the child img elements will be captured separately, avoiding ghost doubles.
  const hasImgChild = el.querySelector('img') !== null;
  const bgImage = !hasImgChild && style.backgroundImage !== 'none' ? style.backgroundImage : undefined;
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
  if (src.startsWith('blob:') || src.startsWith('data:')) return blobUrlToDataUrl(src);
  return src;
}

async function resolveBgImage(bgImage) {
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
    return url;
  }
}
