// Service worker for Ad-Morph Inspector

const EDITOR_URL = 'http://localhost:5173/';

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.action === 'open_editor') {
    const payload = JSON.stringify(request.data);
    const encoded = btoa(unescape(encodeURIComponent(payload)));
    const url = `${EDITOR_URL}?data=${encoded}`;

    // Reuse an existing editor tab if one is open so captures accumulate
    chrome.tabs.query({ url: `${EDITOR_URL}*` }, (tabs) => {
      if (tabs.length > 0) {
        // Reload the existing tab with the new data param; the editor will
        // read localStorage (previous ads) + URL param (new ad) on load.
        chrome.tabs.update(tabs[0].id, { url, active: true });
      } else {
        chrome.tabs.create({ url });
      }
    });

    sendResponse({ ok: true });
  }
  return true;
});
