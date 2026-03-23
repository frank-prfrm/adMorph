// Service worker for Ad-Morph Inspector

const EDITOR_URL = 'http://localhost:5173/';

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'open_editor') {
    // Screenshot the CURRENT tab before navigating away — this is the visual
    // the vision model will use to extract the canonical ad element structure.
    chrome.tabs.captureVisibleTab(
      sender.tab.windowId,
      { format: 'jpeg', quality: 85 },
      async (dataUrl) => {
        const screenshot = dataUrl
          ? await cropScreenshot(dataUrl, request.viewRect)
          : null;

        chrome.tabs.query({ url: `${EDITOR_URL}*` }, (tabs) => {
          if (tabs.length > 0) {
            // Editor already open — inject DOM data + screenshot via postMessage
            const tabId = tabs[0].id;
            chrome.scripting.executeScript({
              target: { tabId },
              func: (elements, screenshot) =>
                window.postMessage({ action: 'adMorphData', elements, screenshot }, '*'),
              args: [request.data, screenshot],
            });
            chrome.tabs.update(tabId, { active: true });
          } else {
            // First open — DOM data via URL param; screenshot injected after load
            const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(request.data))));
            chrome.tabs.create({ url: `${EDITOR_URL}?data=${encoded}` }, (newTab) => {
              const onUpdated = (tabId, info) => {
                if (tabId !== newTab.id || info.status !== 'complete') return;
                chrome.tabs.onUpdated.removeListener(onUpdated);
                // Short delay to let React mount and register the message listener
                setTimeout(() => {
                  chrome.scripting.executeScript({
                    target: { tabId },
                    func: (screenshot) =>
                      window.postMessage({ action: 'adMorphScreenshot', screenshot }, '*'),
                    args: [screenshot],
                  });
                }, 600);
              };
              chrome.tabs.onUpdated.addListener(onUpdated);
            });
          }
        });
      }
    );

    sendResponse({ ok: true });
  }
  return true;
});

// ── Screenshot crop ───────────────────────────────────────────────────────────
// Crops captureVisibleTab output to the ad's viewport-relative rect.
// Returns base64 JPEG string (no data: prefix) or null on failure.

async function cropScreenshot(dataUrl, viewRect) {
  try {
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    const imageBitmap = await createImageBitmap(blob);

    const dpr = viewRect.devicePixelRatio || 1;
    const srcX = Math.round(viewRect.left * dpr);
    const srcY = Math.round(viewRect.top * dpr);
    const srcW = Math.round(viewRect.width * dpr);
    const srcH = Math.round(viewRect.height * dpr);

    // Clamp to image bounds
    const safeW = Math.min(srcW, imageBitmap.width - srcX);
    const safeH = Math.min(srcH, imageBitmap.height - srcY);
    if (safeW <= 0 || safeH <= 0) return null;

    const canvas = new OffscreenCanvas(safeW, safeH);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(imageBitmap, srcX, srcY, safeW, safeH, 0, 0, safeW, safeH);

    const outBlob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 });
    return await blobToBase64(outBlob);
  } catch {
    return null;
  }
}

function blobToBase64(blob) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.readAsDataURL(blob);
  });
}
