// StreamClip AI - Background Service Worker (Manifest V3)

async function ensureOffscreenDocument() {
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT']
  });

  if (existingContexts.length > 0) {
    return;
  }

  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['USER_MEDIA', 'AUDIO_PLAYBACK', 'BLOBS'],
    justification: 'Continuously render 9:16 vertical canvas buffer and encode rolling 30s WebM clips.'
  });
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
    isStreamConnected: false,
    vault: []
  });
});

chrome.runtime.onStartup.addListener(() => {
  // Reset transient connection state on browser restart
  chrome.storage.local.set({ isStreamConnected: false });
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

    if (request.action === 'DISCONNECT_STREAM') {
      await chrome.storage.local.set({ isStreamConnected: false });
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
        if (chrome.runtime.lastError) {
          sendResponse({ success: false, error: chrome.runtime.lastError.message });
          return;
        }

        if (response && response.success) {
          const { vault = [], autoDownload = true } = await chrome.storage.local.get(['vault', 'autoDownload']);
          const cleanChannel = channel.replace(/[^a-zA-Z0-9_-]/g, '_');
          const filename = `StreamClip_${cleanChannel}_${Date.now()}.webm`;

          // Download immediately using blob URL or data URL
          if (response.dataUrl) {
            chrome.downloads.download({
              url: response.dataUrl,
              filename: filename,
              saveAs: false
            });
          }

          // Store only metadata in chrome.storage.local to avoid hitting 10MB quota
          const clipMetadata = {
            id: 'clip_' + Date.now(),
            channel,
            clipper,
            filename: filename,
            timestamp: new Date().toLocaleTimeString(),
            duration: response.duration || '30s',
            size: response.size || '7.5 MB',
            thumbUrl: response.thumbUrl || ''
          };

          vault.unshift(clipMetadata);
          if (vault.length > 20) vault.pop();
          await chrome.storage.local.set({ vault });

          sendResponse({ success: true, clip: clipMetadata });
        } else {
          sendResponse({ success: false, error: response?.error || 'Failed to capture clip from buffer' });
        }
      });
      return;
    }

    if (request.action === 'GET_STATUS') {
      const state = await chrome.storage.local.get(['activeChannel', 'currentLayout', 'vault', 'panX', 'panY', 'zoom', 'isStreamConnected']);
      sendResponse({ success: true, state });
      return;
    }
  } catch (err) {
    console.error('StreamClip AI Service Worker error:', err);
    sendResponse({ success: false, error: err.message });
  }
}
