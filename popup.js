const btn = document.getElementById('inspect-btn');
const status = document.getElementById('status');

let isActive = false;

// Sync button state with storage on open
chrome.storage.local.get('inspectActive', ({ inspectActive }) => {
  isActive = !!inspectActive;
  updateUI();
});

btn.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  isActive = !isActive;
  await chrome.storage.local.set({ inspectActive: isActive });

  chrome.tabs.sendMessage(tab.id, { action: 'toggle_inspect', active: isActive });
  updateUI();

  if (isActive) window.close(); // close popup so user can hover the page
});

function updateUI() {
  if (isActive) {
    btn.textContent = 'Stop Inspecting';
    btn.classList.add('active');
    status.textContent = 'Hover & click an ad element…';
  } else {
    btn.textContent = 'Inspect Ad';
    btn.classList.remove('active');
    status.textContent = 'Click an ad element on the page.';
  }
}
