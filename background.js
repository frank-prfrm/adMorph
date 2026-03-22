// Service worker for Ad-Morph Inspector
// Receives captured ad data from content.js and opens the editor with it.

const EDITOR_URL = 'http://localhost:5173/';

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.action === 'open_editor') {
    const payload = JSON.stringify(request.data);
    const encoded = btoa(unescape(encodeURIComponent(payload)));
    const url = `${EDITOR_URL}?data=${encoded}`;
    chrome.tabs.create({ url });
    sendResponse({ ok: true });
  }
  return true; // keep message channel open for async sendResponse
});
