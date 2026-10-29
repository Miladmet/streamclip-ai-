// StreamClip AI - Popup Controller

document.addEventListener('DOMContentLoaded', async () => {
  const activeChannelLabel = document.getElementById('activeChannelLabel');
  const connectStreamBtn = document.getElementById('connectStreamBtn');
  const streamStatusBadge = document.getElementById('streamStatusBadge');
  const clipBtn = document.getElementById('clipBtn');
  const layoutSelect = document.getElementById('layoutSelect');
  const panX = document.getElementById('panX');
  const panXVal = document.getElementById('panXVal');
  const panY = document.getElementById('panY');
  const panYVal = document.getElementById('panYVal');
  const zoom = document.getElementById('zoom');
  const zoomVal = document.getElementById('zoomVal');
  const fitTwitchBtn = document.getElementById('fitTwitchBtn');
  const hookInput = document.getElementById('hookInput');
  const copyTitleBtn = document.getElementById('copyTitleBtn');
  const titleSug = document.getElementById('titleSug');
  const vaultList = document.getElementById('vaultList');

  // Load stored state
  const state = await chrome.storage.local.get([
    'activeChannel',
    'currentLayout',
    'panX',
    'panY',
    'zoom',
    'vault',
    'isStreamConnected'
  ]);

  if (state.activeChannel) activeChannelLabel.textContent = `@${state.activeChannel}`;
  if (state.currentLayout) layoutSelect.value = state.currentLayout;
  if (state.panX !== undefined) {
    panX.value = state.panX;
    panXVal.textContent = `${state.panX}%`;
  }
  if (state.panY !== undefined) {
    panY.value = state.panY;
    panYVal.textContent = `${state.panY}%`;
  }
  if (state.zoom !== undefined) {
    zoom.value = Math.round(state.zoom * 10);
    zoomVal.textContent = `${state.zoom.toFixed(1)}x`;
  }

  if (state.isStreamConnected) {
    connectStreamBtn.innerHTML = '<span>✅ Live Tab Connected!</span>';
    connectStreamBtn.style.background = 'rgba(16, 185, 129, 0.4)';
    streamStatusBadge.textContent = 'Mode: 🔴 Live Stream Active';
    streamStatusBadge.style.color = '#10b981';
  }

  renderVault(state.vault || []);

  // Connect active stream tab (Twitch or YouTube)
  connectStreamBtn.addEventListener('click', async () => {
    connectStreamBtn.disabled = true;
    connectStreamBtn.innerHTML = '<span>🎥 Connecting Stream Tab...</span>';

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) {
        alert('Please open a Twitch or YouTube stream tab first.');
        resetConnectBtn();
        return;
      }

      // Extract channel name from URL if on Twitch
      try {
        const url = new URL(tab.url);
        if (url.hostname.includes('twitch.tv')) {
          const parts = url.pathname.split('/').filter(Boolean);
          if (parts.length > 0) {
            const ch = parts[0];
            activeChannelLabel.textContent = `@${ch}`;
            chrome.storage.local.set({ activeChannel: ch });
          }
        }
      } catch (e) {}

      const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id });

      chrome.runtime.sendMessage({
        target: 'offscreen',
        action: 'CONNECT_STREAM',
        streamId: streamId
      }, (res) => {
        connectStreamBtn.disabled = false;
        if (res && res.success) {
          connectStreamBtn.innerHTML = '<span>✅ Live Tab Connected!</span>';
          connectStreamBtn.style.background = 'rgba(16, 185, 129, 0.4)';
          streamStatusBadge.textContent = 'Mode: 🔴 Live Stream Active';
          streamStatusBadge.style.color = '#10b981';
          chrome.storage.local.set({ isStreamConnected: true });
        } else {
          resetConnectBtn();
          alert('Could not capture tab audio/video: ' + (res?.error || 'Unknown error'));
        }
      });
    } catch (err) {
      resetConnectBtn();
      alert('Tab capture permission error: ' + err.message);
    }
  });

  function resetConnectBtn() {
    connectStreamBtn.disabled = false;
    connectStreamBtn.innerHTML = '<span>🎥 Connect Live Stream Tab</span>';
    connectStreamBtn.style.background = 'rgba(16, 185, 129, 0.15)';
  }

  function syncConfig() {
    const config = {
      layout: layoutSelect.value,
      panX: parseInt(panX.value, 10),
      panY: parseInt(panY.value, 10),
      zoom: parseInt(zoom.value, 10) / 10,
      hookBanner: hookInput.value
    };

    chrome.storage.local.set({
      currentLayout: config.layout,
      panX: config.panX,
      panY: config.panY,
      zoom: config.zoom
    });

    chrome.runtime.sendMessage({
      target: 'offscreen',
      action: 'SET_CONFIG',
      ...config
    });
  }

  layoutSelect.addEventListener('change', syncConfig);
  panX.addEventListener('input', () => {
    panXVal.textContent = `${panX.value}%`;
    syncConfig();
  });
  panY.addEventListener('input', () => {
    panYVal.textContent = `${panY.value}%`;
    syncConfig();
  });
  zoom.addEventListener('input', () => {
    zoomVal.textContent = `${(zoom.value / 10).toFixed(1)}x`;
    syncConfig();
  });
  hookInput.addEventListener('input', syncConfig);

  fitTwitchBtn.addEventListener('click', () => {
    panX.value = 28;
    panXVal.textContent = '28%';
    panY.value = 34;
    panYVal.textContent = '34%';
    zoom.value = 15;
    zoomVal.textContent = '1.5x';
    syncConfig();
  });

  clipBtn.addEventListener('click', () => {
    clipBtn.disabled = true;
    clipBtn.innerHTML = '<span>⚡ Slicing last 30s WebM...</span>';

    const channel = activeChannelLabel.textContent.replace('@', '');

    chrome.runtime.sendMessage({
      action: 'CAPTURE_CLIP',
      channel: channel,
      clipper: 'Popup'
    }, (res) => {
      clipBtn.disabled = false;
      clipBtn.innerHTML = '<span>⚡ Slice Last 30s (9:16 WebM)</span>';

      if (res && res.success) {
        chrome.storage.local.get(['vault'], (d) => {
          renderVault(d.vault || []);
        });
      } else {
        alert(res?.error || 'Could not export clip.');
      }
    });
  });

  copyTitleBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(titleSug.textContent);
    copyTitleBtn.textContent = 'Copied!';
    setTimeout(() => { copyTitleBtn.textContent = 'Copy'; }, 1500);
  });

  function renderVault(vault) {
    if (!vault.length) {
      vaultList.innerHTML = '<div style="font-size:11px; color:var(--muted); text-align:center; padding:6px;">No clips captured yet.</div>';
      return;
    }

    vaultList.innerHTML = vault.map(clip => `
      <div class="vault-item">
        <div>
          <strong>${clip.channel}</strong> (${clip.timestamp})
          <span style="color:var(--muted); font-size:10px;">${clip.size}</span>
        </div>
        <a href="${clip.blobUrl}" download="StreamClip_${clip.channel}_${clip.id}.webm">Download</a>
      </div>
    `).join('');
  }
});
