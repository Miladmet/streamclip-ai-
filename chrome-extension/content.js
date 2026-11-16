// StreamClip AI - Content Script (Twitch & YouTube)
(function () {
  'use strict';

  // Do not inject on creator dashboards or studio pages
  if (window.location.hostname.includes('studio.youtube.com') ||
      window.location.pathname.startsWith('/dashboard') ||
      window.location.pathname.startsWith('/creator')) {
    return;
  }

  let currentChannel = getStreamChannel();
  let hypeLevel = 0;
  let chatEvents = [];
  let lastClipTime = 0;
  const CLIP_COOLDOWN_MS = 15000; // 15-second cooldown between clips

  // Word-boundary keywords (exclude standalone single letters like 'W' to prevent false positives)
  const HYPE_PATTERNS = [
    /\bPOG\b/i,
    /\bPOGGERS\b/i,
    /\bPOGCHAMP\b/i,
    /\bLUL\b/i,
    /\bLULW\b/i,
    /\bKEKW\b/i,
    /\bOMG\b/i,
    /\bWTF\b/i,
    /\bCLUTCH\b/i,
    /\bLETSGO\b/i,
    /\bINSANE\b/i,
    /\bGG\b/i,
    /🔥/,
    /😱/,
    /💀/
  ];

  function getStreamChannel() {
    const host = window.location.hostname;
    if (host.includes('twitch.tv')) {
      const parts = window.location.pathname.split('/').filter(Boolean);
      if (!parts.length) return null;
      const reserved = ['directory', 'videos', 'p', 'search', 'settings', 'subscriptions', 'wallet', 'friends', 'moderator'];
      if (reserved.includes(parts[0].toLowerCase())) return null;
      return parts[0].toLowerCase();
    }
    if (host.includes('youtube.com')) {
      // YouTube video or stream
      const titleEl = document.querySelector('h1.ytd-watch-metadata, #title h1');
      if (titleEl && titleEl.textContent.trim()) {
        return titleEl.textContent.trim().substring(0, 24);
      }
      return 'youtube_stream';
    }
    return null;
  }

  function injectWidget() {
    if (document.getElementById('streamclip-ai-floating-widget')) return;
    const channel = getStreamChannel();
    if (!channel) return;

    const container = document.createElement('div');
    container.id = 'streamclip-ai-floating-widget';

    // Build DOM safely without raw innerHTML vulnerability
    const card = document.createElement('div');
    card.className = 'scai-widget-card';

    const header = document.createElement('div');
    header.className = 'scai-header';

    const brand = document.createElement('div');
    brand.className = 'scai-brand';
    brand.innerHTML = '<span>⚡ StreamClip AI</span> <span class="scai-badge">9:16</span>';

    const chLabel = document.createElement('span');
    chLabel.className = 'scai-channel';
    chLabel.textContent = '@' + channel;

    header.appendChild(brand);
    header.appendChild(chLabel);

    const btn = document.createElement('button');
    btn.id = 'scai-trigger-btn';
    btn.className = 'scai-clip-btn';
    btn.innerHTML = '<span>⚡ Clip Last 30s (9:16)</span>';

    const hypeBox = document.createElement('div');
    hypeBox.className = 'scai-hype-container';
    hypeBox.innerHTML = `
      <div class="scai-hype-header">
        <span>🔥 Chat Hype</span>
        <span id="scai-hype-pct">0%</span>
      </div>
      <div class="scai-hype-track">
        <div id="scai-hype-bar" class="scai-hype-fill"></div>
      </div>
    `;

    card.appendChild(header);
    card.appendChild(btn);
    card.appendChild(hypeBox);
    container.appendChild(card);
    document.body.appendChild(container);

    btn.addEventListener('click', () => {
      triggerClip('Viewer Click');
    });

    observeChat();
    notifyBackgroundTabActive(channel);
  }

  function showToast(message, isSuccess = true) {
    const existing = document.querySelector('.scai-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'scai-toast';
    toast.style.borderColor = isSuccess ? '#10b981' : '#f59e0b';

    const iconSpan = document.createElement('span');
    iconSpan.textContent = isSuccess ? '✅' : '⚡';

    const textSpan = document.createElement('span');
    textSpan.textContent = message;

    toast.appendChild(iconSpan);
    toast.appendChild(textSpan);
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3200);
  }

  function triggerClip(clipper = 'Viewer') {
    const now = Date.now();
    if (now - lastClipTime < CLIP_COOLDOWN_MS) {
      const waitSec = Math.ceil((CLIP_COOLDOWN_MS - (now - lastClipTime)) / 1000);
      showToast(`Clip cooldown (${waitSec}s remaining)...`, false);
      return;
    }
    lastClipTime = now;

    const channel = getStreamChannel() || 'streamer';
    showToast(`Clipping last 30s of @${channel}...`, false);

    chrome.runtime.sendMessage({
      action: 'CAPTURE_CLIP',
      channel: channel,
      clipper: clipper
    }, (response) => {
      if (chrome.runtime.lastError) {
        showToast('Extension connecting...', false);
        return;
      }
      if (response && response.success) {
        showToast('Clip captured! Saved to Session Vault.');
      } else {
        showToast(response?.error || 'Started recording canvas buffer.');
      }
    });
  }

  function notifyBackgroundTabActive(channel) {
    chrome.runtime.sendMessage({
      action: 'TWITCH_CHANNEL_ACTIVE',
      channel: channel
    }, () => {
      if (chrome.runtime.lastError) { /* ignore cleanup error */ }
    });
  }

  // Monitor only actual live chat containers (not the whole document body)
  function observeChat() {
    const chatContainer =
      document.querySelector('.chat-scrollable-area__message-container') || // Twitch
      document.querySelector('yt-live-chat-item-list-renderer #items');     // YouTube Live Chat

    if (!chatContainer) {
      // Retry in 2 seconds if chat hasn't loaded yet
      setTimeout(observeChat, 2000);
      return;
    }

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // Read only chat message text, never widget toasts
            if (node.closest('#streamclip-ai-floating-widget') || node.classList.contains('scai-toast')) {
              continue;
            }

            const rawText = (node.textContent || '').trim();
            if (!rawText) continue;

            // Extract author and message body separately
            const authorEl =
              node.querySelector('[data-a-target="chat-message-username"]') || // Twitch
              node.querySelector('#author-name');                              // YouTube
            const author = authorEl ? authorEl.textContent.trim() : 'ChatViewer';

            // Extract message body text (excluding username element)
            const bodyEl =
              node.querySelector('[data-a-target="chat-line-message-body"]') || // Twitch
              node.querySelector('#message') ||                                  // YouTube
              node;
            const messageText = (bodyEl.textContent || '').trim();

            // Check for explicit !clip command at word boundary in message text
            if (/(^|\s)!clip\b/i.test(messageText)) {
              triggerClip(author);
            }

            // Check for hype patterns
            let isHype = false;
            for (const pat of HYPE_PATTERNS) {
              if (pat.test(rawText)) {
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

    observer.observe(chatContainer, { childList: true, subtree: true });
    setInterval(decayHypeMeter, 1000);
  }

  function updateHypeMeter() {
    const now = Date.now();
    chatEvents = chatEvents.filter(e => now - e.time < 7000);
    const msgCount = chatEvents.length;
    const hypeCount = chatEvents.filter(e => e.isHype).length;
    // Balanced score: requires 10+ normal messages or 4+ hype emotes in a 7s window
    const score = Math.min(100, Math.round((msgCount * 3) + (hypeCount * 18)));

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

  // SPA navigation detector
  let lastUrl = window.location.href;
  setInterval(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      const channel = getStreamChannel();
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
