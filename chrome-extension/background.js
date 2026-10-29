// StreamClip AI - Background Service Worker (Manifest V3)

let offscreenCreated = false;

async function ensureOffscreenDocument() {
  if (offscreenCreated) return;
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT']
  });

  if (existingContexts.length > 0) {
    offscreenCreated = true;
    return;
  }

  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['USER_MEDIA', 'AUDIO_PLAYBACK', 'BLOBS'],
    justification: 'Continuously render 9:16 vertical canvas buffer and encode rolling 30s WebM clips.'
  });
  offscreenCreated = true;
}

chrome.runtime.onInstalled.addListener(() => {
  console.log('StreamClip AI Chrome Extension installed.');
  chrome.storage.local.set({
    activeChannel: 'streamer',
    currentLayout: 'split-right',
    panX: 50,
    panY: 50,
    zoom: 1.0,
    autoDownload: true,
    vault: []
  });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  handleMessage(request, sender, sendResponse);
  return true; // Keep asynchronous sendResponse channel open
});

async function handleMessage(request, sender, sendResponse) {
  try {
    await ensureOffscreenDocument();

    if (request.action === 'TWITCH_CHANNEL_ACTIVE') {
      await chrome.storage.local.set({ activeChannel: request.channel });
      sendResponse({ success: true });
      return;
    }

    if (request.action === 'CAPTURE_CLIP') {
      const channel = request.channel || 'streamer';
      const clipper = request.clipper || 'Viewer';

      chrome.runtime.sendMessage({
        target: 'offscreen',
        action: 'SLICE_CLIP',
        channel,
        clipper
      }, async (response) => {
        if (response && response.success) {
          // Store in vault
          const { vault = [], autoDownload = true } = await chrome.storage.local.get(['vault', 'autoDownload']);
          const clipItem = {
            id: 'clip_' + Date.now(),
            channel,
            clipper,
            timestamp: new Date().toLocaleTimeString(),
            blobUrl: response.dataUrl,
            thumbUrl: response.thumbUrl,
            duration: response.duration || '30s',
            size: response.size || '10MB'
          };

          vault.unshift(clipItem);
          if (vault.length > 20) vault.pop();
          await chrome.storage.local.set({ vault });

          // Auto-download clip via chrome.downloads API
          if (autoDownload && response.dataUrl) {
            const filename = `StreamClip_${channel}_${Date.now()}.webm`;
            chrome.downloads.download({
              url: response.dataUrl,
              filename: filename,
              saveAs: false
            });
          }

          sendResponse({ success: true, clip: clipItem });
        } else {
          sendResponse({ success: false, error: response?.error || 'Failed to capture clip from buffer' });
        }
      });
      return;
    }

    if (request.action === 'GET_STATUS') {
      const state = await chrome.storage.local.get(['activeChannel', 'currentLayout', 'vault', 'panX', 'panY', 'zoom']);
      sendResponse({ success: true, state });
      return;
    }
  } catch (err) {
    console.error('StreamClip AI Service Worker error:', err);
    sendResponse({ success: false, error: err.message });
  }
}
