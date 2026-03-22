// Ad-Morph Inspector – content script
// Injected into every frame (all_frames: true).

let inspectionActive = false;
let idCounter = 0;

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

  const target = e.target;
  if (target === highlighter) return;

  const rect = target.getBoundingClientRect();
  highlighter.style.cssText = `
    display: block;
    width: ${rect.width}px;
    height: ${rect.height}px;
    top: ${rect.top + window.scrollY}px;
    left: ${rect.left + window.scrollX}px;
  `;
  highlighter.dataset.tag = target.tagName.toLowerCase();
}, { passive: true });

document.addEventListener('mouseleave', () => {
  if (inspectionActive) highlighter.style.display = 'none';
});

// ── Click capture ────────────────────────────────────────────────────────────

document.addEventListener('click', async (e) => {
  if (!inspectionActive) return;

  e.preventDefault();
  e.stopPropagation();

  inspectionActive = false;
  highlighter.style.display = 'none';
  chrome.storage.local.set({ inspectActive: false });

  const adElements = await captureTree(e.target);
  chrome.runtime.sendMessage({ action: 'open_editor', data: adElements });
}, true);

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
