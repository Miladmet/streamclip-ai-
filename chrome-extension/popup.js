// StreamClip AI - Popup Controller

document.addEventListener('DOMContentLoaded', async () => {
  const activeChannelLabel = document.getElementById('activeChannelLabel');
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
    'vault'
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

  renderVault(state.vault || []);

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
