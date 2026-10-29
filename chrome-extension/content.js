// StreamClip AI - Twitch Content Script
(function () {
  'use strict';

  let currentChannel = getTwitchChannel();
  let hypeLevel = 0;
  let chatEvents = [];
  const HYPE_KEYWORDS = ['POG', 'LUL', 'KEKW', 'OMG', 'WTF', 'CLIP', 'CLUTCH', '🔥', '😱', 'LETSGO', 'INSANE', 'W'];

  function getTwitchChannel() {
    const parts = window.location.pathname.split('/').filter(Boolean);
    if (!parts.length) return null;
    const reserved = ['directory', 'videos', 'p', 'search', 'settings', 'subscriptions', 'wallet', 'friends', 'moderator'];
    if (reserved.includes(parts[0].toLowerCase())) return null;
    return parts[0].toLowerCase();
  }

  function injectWidget() {
    if (document.getElementById('streamclip-ai-floating-widget')) return;
    const channel = getTwitchChannel();
    if (!channel) return;

    const container = document.createElement('div');
    container.id = 'streamclip-ai-floating-widget';
    container.innerHTML = `
      <div class="scai-widget-card">
        <div class="scai-header">
          <div class="scai-brand">
            <span>⚡ StreamClip AI</span>
            <span class="scai-badge">9:16</span>
          </div>
          <span class="scai-channel">@${channel}</span>
        </div>
        <button id="scai-trigger-btn" class="scai-clip-btn">
          <span>⚡ Clip Last 30s (9:16)</span>
        </button>
        <div class="scai-hype-container">
          <div class="scai-hype-header">
            <span>🔥 Chat Hype</span>
            <span id="scai-hype-pct">0%</span>
          </div>
          <div class="scai-hype-track">
            <div id="scai-hype-bar" class="scai-hype-fill"></div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(container);

    const btn = document.getElementById('scai-trigger-btn');
    btn.addEventListener('click', () => {
      triggerClip('Viewer Click');
    });

    observeTwitchChat();
    notifyBackgroundTabActive(channel);
  }

  function showToast(message, isSuccess = true) {
    const toast = document.createElement('div');
    toast.className = 'scai-toast';
    toast.style.borderColor = isSuccess ? '#10b981' : '#f59e0b';
    toast.innerHTML = `<span>${isSuccess ? '✅' : '⚡'}</span> <span>${message}</span>`;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3200);
  }

  function triggerClip(clipper = 'Viewer') {
    const channel = getTwitchChannel() || 'streamer';
    showToast(`Clipping last 30s of @${channel}...`, false);

    chrome.runtime.sendMessage({
      action: 'CAPTURE_CLIP',
      channel: channel,
      clipper: clipper
    }, (response) => {
      if (response && response.success) {
        showToast(`Clip captured! Saved to Session Vault.`);
      } else {
        showToast(response?.error || 'Started recording canvas buffer.');
      }
    });
  }

  function notifyBackgroundTabActive(channel) {
    chrome.runtime.sendMessage({
      action: 'TWITCH_CHANNEL_ACTIVE',
      channel: channel
    });
  }

  // Monitor native Twitch DOM chat for !clip and hype words
  function observeTwitchChat() {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const textContent = (node.textContent || '').trim();
            if (!textContent) continue;

            const upper = textContent.toUpperCase();

            // Check for !clip command
            if (upper.includes('!CLIP')) {
              // Extract username if possible
              const authorEl = node.querySelector('[data-a-target="chat-message-username"]');
              const author = authorEl ? authorEl.textContent.trim() : 'ChatViewer';
              triggerClip(author);
            }

            // Hype spike detection
            let isHype = false;
            for (const kw of HYPE_KEYWORDS) {
              if (upper.includes(kw)) {
                isHype = true;
                break;
              }
            }

            const now = Date.now();
            chatEvents.push({ time: now, isHype });
            updateHypeMeter();
          }
        }
      }
    });

    const chatContainer = document.querySelector('.chat-scrollable-area__message-container') || document.body;
    observer.observe(chatContainer, { childList: true, subtree: true });

    setInterval(decayHypeMeter, 1000);
  }

  function updateHypeMeter() {
    const now = Date.now();
    chatEvents = chatEvents.filter(e => now - e.time < 7000);
    const msgCount = chatEvents.length;
    const hypeCount = chatEvents.filter(e => e.isHype).length;
    const score = Math.min(100, Math.round((msgCount * 5) + (hypeCount * 15)));

    hypeLevel = score;
    const bar = document.getElementById('scai-hype-bar');
    const label = document.getElementById('scai-hype-pct');
    if (bar && label) {
      bar.style.width = `${hypeLevel}%`;
      label.textContent = `${hypeLevel}%`;
    }

    if (hypeLevel >= 100) {
      chatEvents = [];
      triggerClip('ChatHypeSpike');
    }
  }

  function decayHypeMeter() {
    const now = Date.now();
    const prevLen = chatEvents.length;
    chatEvents = chatEvents.filter(e => now - e.time < 7000);
    if (prevLen !== chatEvents.length) {
      updateHypeMeter();
    }
  }

  // URL Change detector (Twitch is an SPA)
  let lastUrl = window.location.href;
  setInterval(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      const channel = getTwitchChannel();
      if (channel) {
        const existing = document.getElementById('streamclip-ai-floating-widget');
        if (existing) existing.remove();
        injectWidget();
      }
    }
  }, 1000);

  // Initialize
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectWidget);
  } else {
    injectWidget();
  }
})();
