// ==========================================
// ON-SCREEN CHARACTER NARRATOR ENGINE + GLOBAL MOJIBAKE SCRUBBER
// - 100% Pure ASCII source (immune to encoding corruption)
// - Automatically scrubs any Windows-1252 / UTF-8 mojibake from DOM and Canvas
// - Instant playback with pre-buffered audio + Mobile Touch-Unlock support
// - Fast, natural educational cadence (~15% faster: 1.20x playbackRate)
// - Smooth "AI" pronunciation (no pause between A and I)
// - Static character with arms resting down at her sides & transparent background
// ==========================================

const NARRATOR_MUTE_KEY = 'ai_lab_narrator_muted_v1';
const SPEECH_SPEED_RATE = 1.20;

let isMuted = localStorage.getItem(NARRATOR_MUTE_KEY) === 'true';
let isSpeaking = false;
let playbackAborted = false;
let mouthFrameTimer = null;
let mobileAudioUnlocked = false;

// ==========================================
// GLOBAL UTF-8 MOJIBAKE AUTO-SCRUBBER (DOM + CANVAS)
// Uses pure \uXXXX unicode escapes so this file is 100% pure ASCII
// ==========================================
const MOJIBAKE_REPLACEMENTS = [
  [new RegExp('\\u00e2\\u20ac\\u00a2', 'g'), '//'],
  [new RegExp('\\u00e2\\u20ac\\u201d', 'g'), ' - '],
  [new RegExp('\\u00e2\\u20ac\\u201c', 'g'), '-'],
  [new RegExp('\\u00e2\\u20ac\\u2122', 'g'), "'"],
  [new RegExp('\\u00e2\\u20ac\\u0153', 'g'), '"'],
  [new RegExp('\\u00e2\\u20ac\\u009d', 'g'), '"'],
  [new RegExp('\\u00e2\\u0153\\u00a8', 'g'), ''],
  [new RegExp('\\u00e2\\u0153\\u201c', 'g'), '\u2714'],
  [new RegExp('\\u00e2\\u0153\\u201d', 'g'), '\u2714'],
  [new RegExp('\\u00e2\\u0153\\u2013', 'g'), '\u2716'],
  [new RegExp('\\u00e2\\u0153\\u201e', 'g'), '\u2702'],
  [new RegExp('\\u00e2\\u0153\\u201a', 'g'), '\u2702'],
  [new RegExp('\\u00c2\\u00b7', 'g'), '\u00b7'],
  [new RegExp('\\u00e2\\u02c6\\u2019', 'g'), '-'],
  [new RegExp('\\u00e2\\u02dc\\u2026', 'g'), '*'],
  [new RegExp('\\u00e2\\u2013\\u00b6', 'g'), '> '],
  [new RegExp('\\u00e2\\u2014\\u20ac', 'g'), '<'],
  [new RegExp('\\u00e2\\u2013\\u00b2', 'g'), '^'],
  [new RegExp('\\u00e2\\u2020\\u2019', 'g'), '->'],
  [new RegExp('\\u00e2\\u2020\\u2018', 'g'), '<-'],
  [new RegExp('\\u00e2\\u2030\\u00a0', 'g'), '!='],
  [new RegExp('\\u00c3\\u2014', 'g'), 'x'],
  [new RegExp('\\u00c2\\u00b0', 'g'), ' deg']
];

function hasMojibakeMarkers(str) {
  return (
    str.indexOf('\u00e2') !== -1 ||
    str.indexOf('\u00c2') !== -1 ||
    str.indexOf('\u00c3') !== -1 ||
    str.indexOf('\u00f0') !== -1
  );
}

function cleanMojibakeString(str) {
  if (!str || typeof str !== 'string' || !hasMojibakeMarkers(str)) return str;
  let out = str;
  for (const [pattern, replacement] of MOJIBAKE_REPLACEMENTS) {
    out = out.replace(pattern, replacement);
  }
  out = out.replace(new RegExp('\\u00e2\\u20ac[^\\sA-Za-z0-9]*', 'g'), ' - ');
  out = out.replace(new RegExp('\\u00e2\\u0153[^\\sA-Za-z0-9]*', 'g'), '');
  out = out.replace(new RegExp('\\u00f0\\u0178[^\\sA-Za-z0-9]*', 'g'), '');
  return out;
}

function scrubDomMojibake(root = document.body) {
  if (!root) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  let node;
  while ((node = walker.nextNode())) {
    const val = node.nodeValue;
    if (val && hasMojibakeMarkers(val)) {
      node.nodeValue = cleanMojibakeString(val);
    }
  }
  if (document.title && hasMojibakeMarkers(document.title)) {
    document.title = cleanMojibakeString(document.title);
  }
}

function setupGlobalMojibakeProtection() {
  if (typeof window === 'undefined') return;

  if (typeof CanvasRenderingContext2D !== 'undefined' && !CanvasRenderingContext2D.prototype._mojibakePatched) {
    const origFillText = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (text, x, y, maxWidth) {
      const clean = cleanMojibakeString(String(text));
      if (maxWidth !== undefined) {
        return origFillText.call(this, clean, x, y, maxWidth);
      }
      return origFillText.call(this, clean, x, y);
    };
    CanvasRenderingContext2D.prototype._mojibakePatched = true;
  }

  scrubDomMojibake(document.body);
  const domCleanerObserver = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === 'characterData' && m.target) {
        const v = m.target.nodeValue;
        if (v && hasMojibakeMarkers(v)) {
          m.target.nodeValue = cleanMojibakeString(v);
        }
      } else if (m.addedNodes && m.addedNodes.length > 0) {
        m.addedNodes.forEach(n => {
          if (n.nodeType === Node.TEXT_NODE && hasMojibakeMarkers(n.nodeValue || '')) {
            n.nodeValue = cleanMojibakeString(n.nodeValue);
          } else if (n.nodeType === Node.ELEMENT_NODE) {
            scrubDomMojibake(n);
          }
        });
      }
    }
  });

  if (document.body) {
    domCleanerObserver.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }
}

// Persistent shared Audio element unlocked on first user tap for iOS Safari / Android
const sharedAudioPlayer = typeof Audio !== 'undefined' ? new Audio() : null;
if (sharedAudioPlayer) {
  sharedAudioPlayer.preload = 'auto';
  sharedAudioPlayer.defaultPlaybackRate = SPEECH_SPEED_RATE;
}

const preloadedAudioMap = new Map();

function ensureNoReferrerMeta() {
  if (typeof document === 'undefined') return;
  if (!document.querySelector('meta[name="referrer"]')) {
    const meta = document.createElement('meta');
    meta.name = 'referrer';
    meta.content = 'no-referrer';
    document.head.appendChild(meta);
  }
}

function setupMobileAudioUnlocker() {
  if (typeof window === 'undefined') return;

  const unlockHandler = () => {
    if (mobileAudioUnlocked) return;
    mobileAudioUnlocked = true;

    if (sharedAudioPlayer && !isSpeaking) {
      sharedAudioPlayer.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
      sharedAudioPlayer.volume = 0.01;
      const p = sharedAudioPlayer.play();
      if (p !== undefined) {
        p.then(() => {
          sharedAudioPlayer.pause();
          sharedAudioPlayer.currentTime = 0;
          sharedAudioPlayer.volume = 1.0;
        }).catch(() => {
          sharedAudioPlayer.volume = 1.0;
        });
      }
    }

    if ('speechSynthesis' in window && !isSpeaking) {
      try {
        const silentUtter = new SpeechSynthesisUtterance('');
        silentUtter.volume = 0;
        window.speechSynthesis.speak(silentUtter);
      } catch {}
    }

    window.removeEventListener('touchstart', unlockHandler, true);
    window.removeEventListener('pointerdown', unlockHandler, true);
    window.removeEventListener('click', unlockHandler, true);
  };

  window.addEventListener('touchstart', unlockHandler, { capture: true, passive: true });
  window.addEventListener('pointerdown', unlockHandler, { capture: true, passive: true });
  window.addEventListener('click', unlockHandler, { capture: true, passive: true });
}

function normalizeTextForSpeech(rawText) {
  return cleanMojibakeString(rawText)
    .replace(/\([^)]*\)/g, '')
    .replace(/\bAI's\b/g, "A-I's")
    .replace(/\bAI\b/g, 'A-I')
    .replace(/#1\b/g, 'number one')
    .replace(/#2\b/g, 'number two')
    .replace(/#3\b/g, 'number three')
    .replace(/#[0-9]+/g, '')
    .replace(/SmolLM2/gi, 'Small L-M 2')
    .replace(/Logits/gi, 'low-jits')
    .replace(/[\u2022\u00b7]/g, ' ')
    .replace(/\u2014/g, ', ')
    .replace(/["\u201c\u201d`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitIntoSpeechChunks(cleanText) {
  const rawSentences = cleanText.match(/[^.!?]+[.!?]+/g) || [cleanText];
  const chunks = [];

  for (const s of rawSentences) {
    const trimmed = s.trim();
    if (!trimmed) continue;
    if (trimmed.length <= 175) {
      chunks.push(trimmed);
    } else {
      const parts = trimmed.split(/,\s+|\s+and\s+/);
      let acc = '';
      for (const p of parts) {
        if ((acc + ' ' + p).trim().length <= 170) {
          acc = (acc ? acc + ', ' + p : p).trim();
        } else {
          if (acc) chunks.push(acc + '.');
          acc = p.trim();
        }
      }
      if (acc) chunks.push(acc);
    }
  }
  return chunks;
}

function buildGoogleTtsUrl(chunkText) {
  return `https://translate.googleapis.com/translate_tts?client=gtx&ie=UTF-8&tl=en-US&q=${encodeURIComponent(chunkText)}`;
}

function preloadChunkAudio(chunkText) {
  if (preloadedAudioMap.has(chunkText)) {
    return preloadedAudioMap.get(chunkText);
  }
  ensureNoReferrerMeta();
  const audio = new Audio();
  audio.preload = 'auto';
  audio.defaultPlaybackRate = SPEECH_SPEED_RATE;
  audio.playbackRate = SPEECH_SPEED_RATE;
  audio.src = buildGoogleTtsUrl(chunkText);
  audio.load();
  preloadedAudioMap.set(chunkText, audio);
  return audio;
}

const KNOWN_WALKTHROUGH_SCRIPTS = [
  "We just unlocked the Inside the AI's Head panel on the right. Unlike a human, this AI doesn't know what it's going to say at the end of a sentence. It holds an election across its dictionary to pick strictly one word piece at a time.",
  "The AI just read your question and scored every piece in its dictionary. Look at the Word Election Leaderboard on the right, and look at the Certainty Meter dial. Now it glues this piece onto your sentence and repeats the contest!",
  "You just caught one of the biggest secrets of AI! AI doesn't actually read or write whole English words. It uses numbered puzzle pieces called Tokens. Common words get their own single token, but longer or less-common words get built on the fly by gluing smaller pieces together!",
  "Notice how that piece turned purple in the output box! Because your Creativity Dial is turned above 0, the AI rolls a weighted die. That's why AI gives slightly different answers every time you ask the same question.",
  "The AI finished its sentence! Now for the coolest part: Click any colored word in the output box on the left. Click one of the runner-up bars in the Word Election Leaderboard. Press the purple Force This Word Instead button to watch the AI write a brand-new ending!",
  "Old computer programs used a lazy rule: Always connect 'it' to the closest noun. That rule fails half the time! Modern Transformer AI uses Self-Attention: every word broadcasts a search query across the sentence.",
  "How does a computer made of numbers understand what you mean? During training, the AI builds this Meaning Star Map. Every time two words show up in similar conversations, gravity pulls their stars closer together."
];

function prewarmKnownScripts() {
  ensureNoReferrerMeta();
  KNOWN_WALKTHROUGH_SCRIPTS.forEach(script => {
    const clean = normalizeTextForSpeech(script);
    const chunks = splitIntoSpeechChunks(clean);
    chunks.forEach(ch => preloadChunkAudio(ch));
  });
}

function getInstructorSvgHtml() {
  return `
    <svg class="narrator-avatar-svg" viewBox="0 0 240 270" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="cheekGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#f48c8c" stop-opacity="0.65"/>
          <stop offset="100%" stop-color="#f48c8c" stop-opacity="0"/>
        </radialGradient>
        <linearGradient id="hairGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#8b4513"/>
          <stop offset="100%" stop-color="#5c2c0c"/>
        </linearGradient>
        <linearGradient id="suitGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#52545a"/>
          <stop offset="100%" stop-color="#383a40"/>
        </linearGradient>
      </defs>

      <path d="M 158 58 C 195 45, 222 82, 206 126 C 198 110, 188 104, 175 102 C 166 90, 160 72, 158 58 Z" fill="url(#hairGrad)" />
      <ellipse cx="161" cy="67" rx="6" ry="11" transform="rotate(-22 161 67)" fill="#4a2106"/>

      <path d="M 88 216 L 152 216 L 158 266 L 82 266 Z" fill="#1e1f24"/>
      <path d="M 92 156 L 148 156 L 146 220 L 94 220 Z" fill="#f4f4f6"/>

      <rect x="111" y="134" width="18" height="24" rx="6" fill="#f3c3a4"/>
      <polygon points="106,154 134,154 120,182" fill="#fbd3b7"/>

      <g class="narrator-arm-left-down">
        <rect x="69" y="224" width="12" height="17" rx="6" fill="#fbd3b7"/>
        <rect x="69" y="218" width="13" height="7" rx="2" fill="#ffffff"/>
        <path d="M 86 155 C 76 158, 71 170, 68 219 L 83 219 L 88 168 Z" fill="url(#suitGrad)"/>
      </g>

      <g class="narrator-arm-right-down">
        <rect x="159" y="224" width="12" height="17" rx="6" fill="#fbd3b7"/>
        <rect x="158" y="218" width="13" height="7" rx="2" fill="#ffffff"/>
        <path d="M 154 155 C 164 158, 169 170, 172 219 L 157 219 L 152 168 Z" fill="url(#suitGrad)"/>
      </g>

      <path d="M 86 155 L 106 154 L 114 218 L 82 222 C 79 200, 82 174, 86 155 Z" fill="url(#suitGrad)"/>
      <path d="M 154 155 L 134 154 L 126 218 L 158 222 C 161 200, 158 174, 154 155 Z" fill="url(#suitGrad)"/>

      <polygon points="106,154 95,162 111,196 114,186" fill="#6c6f78"/>
      <polygon points="134,154 145,162 129,196 126,186" fill="#6c6f78"/>

      <ellipse cx="120" cy="84" rx="54" ry="52" fill="url(#hairGrad)"/>

      <ellipse cx="68" cy="98" rx="9" ry="13" fill="#f7c8aa"/>
      <ellipse cx="172" cy="98" rx="9" ry="13" fill="#f7c8aa"/>
      <circle cx="67" cy="108" r="2.2" fill="#ffffff"/>
      <circle cx="173" cy="108" r="2.2" fill="#ffffff"/>

      <rect x="72" y="44" width="96" height="96" rx="46" fill="#fbd3b7"/>

      <circle cx="88" cy="108" r="14" fill="url(#cheekGlow)"/>
      <circle cx="152" cy="108" r="14" fill="url(#cheekGlow)"/>

      <g class="narrator-eyes">
        <ellipse cx="98" cy="92" rx="7.5" ry="11.5" fill="#43230f"/>
        <ellipse cx="98" cy="95" rx="6" ry="7" fill="#7c431e"/>
        <circle cx="96" cy="87" r="2.8" fill="#ffffff"/>
        <ellipse cx="142" cy="92" rx="7.5" ry="11.5" fill="#43230f"/>
        <ellipse cx="142" cy="95" rx="6" ry="7" fill="#7c431e"/>
        <circle cx="140" cy="87" r="2.8" fill="#ffffff"/>
      </g>

      <path d="M 88 74 Q 98 69 107 74" stroke="#5c2c0c" stroke-width="2.5" stroke-linecap="round"/>
      <path d="M 133 74 Q 142 69 152 74" stroke="#5c2c0c" stroke-width="2.5" stroke-linecap="round"/>

      <ellipse cx="120" cy="103" rx="2.5" ry="1.8" fill="#e5b293"/>

      <g class="narrator-mouth-group">
        <g class="mouth-state mouth-open" style="display:none;">
          <path d="M 106 113 Q 120 116 134 113 C 134 128, 106 128, 106 113 Z" fill="#b92b4f"/>
          <path d="M 111 121 Q 120 116 129 121 C 127 127, 113 127, 111 121 Z" fill="#ff8fa3"/>
        </g>
        <g class="mouth-state mouth-mid" style="display:none;">
          <ellipse cx="120" cy="118" rx="8" ry="6.5" fill="#b92b4f"/>
          <ellipse cx="120" cy="121" rx="5.5" ry="3.5" fill="#ff8fa3"/>
        </g>
        <g class="mouth-state mouth-smile">
          <path d="M 108 115 Q 120 123 132 115" stroke="#b92b4f" stroke-width="3" stroke-linecap="round" fill="none"/>
        </g>
      </g>

      <g class="narrator-glasses">
        <circle cx="96" cy="92" r="21" fill="rgba(255,255,255,0.12)" stroke="#8c867e" stroke-width="3.2"/>
        <circle cx="144" cy="92" r="21" fill="rgba(255,255,255,0.12)" stroke="#8c867e" stroke-width="3.2"/>
        <path d="M 117 92 Q 120 89 123 92" stroke="#8c867e" stroke-width="3.2" fill="none"/>
        <path d="M 83 80 L 90 75" stroke="rgba(255,255,255,0.6)" stroke-width="2.2" stroke-linecap="round"/>
        <path d="M 131 80 L 138 75" stroke="rgba(255,255,255,0.6)" stroke-width="2.2" stroke-linecap="round"/>
      </g>

      <path d="M 68 78 C 68 38, 172 38, 172 78 C 152 68, 118 58, 92 48 C 84 60, 76 70, 68 78 Z" fill="url(#hairGrad)"/>
    </svg>
  `;
}

function injectNarratorStyles() {
  if (document.getElementById('narrator-engine-styles')) return;
  const style = document.createElement('style');
  style.id = 'narrator-engine-styles';
  style.textContent = `
    .walkthrough-modal.with-narrator {
      max-width: 720px !important;
      max-height: 92dvh !important;
      overflow-y: auto !important;
    }

    .wt-narrator-layout {
      display: grid;
      grid-template-columns: 165px 1fr;
      gap: 1.25rem;
      align-items: center;
    }

    .narrator-stage-col {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: transparent !important;
      border: none !important;
      box-shadow: none !important;
      padding: 0 !important;
      position: relative;
    }

    .narrator-avatar-svg {
      width: 155px;
      height: 175px;
      overflow: visible;
      display: block;
    }

    .narrator-eyes {
      transform-origin: 120px 92px;
      animation: narratorBlink 4.5s infinite;
    }

    @keyframes narratorBlink {
      0%, 95%, 98%, 100% { transform: scaleY(1); }
      96.5% { transform: scaleY(0.08); }
    }

    .narrator-controls-bar {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      margin-top: 0.4rem;
      width: 100%;
      justify-content: center;
    }

    .narrator-btn {
      background: var(--bg-canvas);
      border: 1px solid var(--border-strong);
      color: var(--text-secondary);
      font-family: var(--font-mono);
      font-size: 0.68rem;
      padding: 0.28rem 0.6rem;
      border-radius: 6px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 0.3rem;
      transition: all 0.15s ease;
    }

    .narrator-btn:hover {
      border-color: var(--cyan);
      color: var(--text-primary);
    }

    .briefing-with-narrator {
      display: grid;
      grid-template-columns: 145px 1fr;
      gap: 1.15rem;
      align-items: center;
    }

    @media (max-width: 680px) {
      .wt-narrator-layout, .briefing-with-narrator {
        grid-template-columns: 1fr;
        gap: 0.75rem;
      }
      .narrator-avatar-svg {
        width: 112px;
        height: 126px;
      }
    }
  `;
  document.head.appendChild(style);
}

function extractMainPointChunks(bodyEl) {
  if (!bodyEl) return [];

  const clone = bodyEl.cloneNode(true);
  clone.querySelectorAll(
    'small, .vocab-scale-note, .context-scale-note, .dimension-scale-note, .keep-learning-banner, .journey-grid, [style*="background"]'
  ).forEach(el => el.remove());

  const clean = normalizeTextForSpeech(clone.textContent || '');
  if (!clean) return [];

  return splitIntoSpeechChunks(clean);
}

function setMouthState(container, stateName) {
  if (!container) return;
  const openEl = container.querySelector('.mouth-open');
  const midEl = container.querySelector('.mouth-mid');
  const smileEl = container.querySelector('.mouth-smile');
  if (!openEl || !midEl || !smileEl) return;

  openEl.style.display = stateName === 'open' ? 'block' : 'none';
  midEl.style.display = stateName === 'mid' ? 'block' : 'none';
  smileEl.style.display = stateName === 'smile' ? 'block' : 'none';
}

function startLipSyncAnimation(stageEl) {
  stopLipSyncAnimation();
  if (!stageEl) return;
  const states = ['open', 'mid', 'open', 'smile', 'mid', 'open'];
  let idx = 0;
  setMouthState(stageEl, 'open');
  mouthFrameTimer = setInterval(() => {
    setMouthState(stageEl, states[idx % states.length]);
    idx++;
  }, 105);
}

function stopLipSyncAnimation() {
  if (mouthFrameTimer) {
    clearInterval(mouthFrameTimer);
    mouthFrameTimer = null;
  }
  document.querySelectorAll('.narrator-stage-col').forEach(el => {
    setMouthState(el, 'smile');
  });
}

export function stopNarration() {
  playbackAborted = true;
  if (sharedAudioPlayer) {
    try {
      sharedAudioPlayer.pause();
    } catch {}
  }
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
  isSpeaking = false;
  stopLipSyncAnimation();
}

function playPreloadedChunk(chunkText, stageEl, isFirstChunk) {
  return new Promise((resolve) => {
    if (playbackAborted || !sharedAudioPlayer) return resolve(true);

    preloadChunkAudio(chunkText);

    const url = buildGoogleTtsUrl(chunkText);
    sharedAudioPlayer.src = url;
    sharedAudioPlayer.defaultPlaybackRate = SPEECH_SPEED_RATE;
    sharedAudioPlayer.playbackRate = SPEECH_SPEED_RATE;

    let started = false;
    let settled = false;

    const finish = (ok) => {
      if (settled) return;
      settled = true;
      sharedAudioPlayer.onloadedmetadata = null;
      sharedAudioPlayer.onplaying = null;
      sharedAudioPlayer.onended = null;
      sharedAudioPlayer.onerror = null;
      resolve(ok);
    };

    const startTimeout = isFirstChunk
      ? setTimeout(() => {
          if (!started && !settled) {
            try { sharedAudioPlayer.pause(); } catch {}
            finish(false);
          }
        }, 550)
      : null;

    sharedAudioPlayer.onloadedmetadata = () => {
      sharedAudioPlayer.playbackRate = SPEECH_SPEED_RATE;
    };

    sharedAudioPlayer.onplaying = () => {
      started = true;
      sharedAudioPlayer.playbackRate = SPEECH_SPEED_RATE;
      if (startTimeout) clearTimeout(startTimeout);
      if (isFirstChunk) startLipSyncAnimation(stageEl);
    };

    sharedAudioPlayer.onended = () => {
      if (startTimeout) clearTimeout(startTimeout);
      finish(true);
    };

    sharedAudioPlayer.onerror = () => {
      if (startTimeout) clearTimeout(startTimeout);
      finish(false);
    };

    const playPromise = sharedAudioPlayer.play();
    if (playPromise !== undefined) {
      playPromise.catch(() => {
        if (startTimeout) clearTimeout(startTimeout);
        finish(false);
      });
    }
  });
}

function playInstantBrowserSpeechFallback(chunks, stageEl) {
  if (!('speechSynthesis' in window) || playbackAborted) {
    stopLipSyncAnimation();
    return;
  }
  window.speechSynthesis.cancel();
  const fullText = chunks.join(' ');
  const utter = new SpeechSynthesisUtterance(fullText);

  const voices = window.speechSynthesis.getVoices();
  const preferred = voices.find(v => /Natural|Aria|Jenny|Google US English|Samantha|Zira/i.test(v.name) && /^en/i.test(v.lang))
    || voices.find(v => /^en/i.test(v.lang));
  if (preferred) utter.voice = preferred;

  utter.pitch = 1.0;
  utter.rate = 1.18;

  utter.onstart = () => {
    if (!playbackAborted) startLipSyncAnimation(stageEl);
  };
  utter.onend = () => {
    stopLipSyncAnimation();
  };
  utter.onerror = () => {
    stopLipSyncAnimation();
  };

  window.speechSynthesis.speak(utter);
}

export async function speakMainPoint(bodyEl, stageEl) {
  stopNarration();
  if (isMuted) return;

  const chunks = extractMainPointChunks(bodyEl);
  if (!chunks || chunks.length === 0) return;

  playbackAborted = false;
  isSpeaking = true;

  chunks.forEach(ch => preloadChunkAudio(ch));

  for (let i = 0; i < chunks.length; i++) {
    if (playbackAborted) break;
    const ok = await playPreloadedChunk(chunks[i], stageEl, i === 0);
    if (!ok) {
      playInstantBrowserSpeechFallback(chunks.slice(i), stageEl);
      return;
    }
  }

  if (!playbackAborted) {
    isSpeaking = false;
    stopLipSyncAnimation();
  }
}

function setupWalkthroughModalNarrator() {
  const wtModal = document.getElementById('walkthrough-modal');
  if (!wtModal || wtModal.dataset.narratorBound === 'true') return;
  wtModal.dataset.narratorBound = 'true';

  const modalCard = wtModal.querySelector('.walkthrough-modal');
  const wtTitle = document.getElementById('wt-title');
  const wtVisual = document.getElementById('wt-visual');
  const wtBody = document.getElementById('wt-body');
  if (!modalCard || !wtTitle || !wtBody) return;

  modalCard.classList.add('with-narrator');

  const layoutWrap = document.createElement('div');
  layoutWrap.className = 'wt-narrator-layout';

  const stageCol = document.createElement('div');
  stageCol.className = 'narrator-stage-col';
  stageCol.id = 'wt-narrator-stage';
  stageCol.innerHTML = `
    ${getInstructorSvgHtml()}
    <div class="narrator-controls-bar">
      <button type="button" class="narrator-btn narrator-replay-btn">Replay</button>
      <button type="button" class="narrator-btn narrator-mute-btn">${isMuted ? 'Unmute' : 'Mute'}</button>
    </div>
  `;

  const contentCol = document.createElement('div');
  contentCol.style.display = 'flex';
  contentCol.style.flexDirection = 'column';
  contentCol.style.gap = '0.9rem';

  wtTitle.parentNode.insertBefore(layoutWrap, wtTitle);
  contentCol.appendChild(wtTitle);
  if (wtVisual) contentCol.appendChild(wtVisual);
  contentCol.appendChild(wtBody);

  layoutWrap.appendChild(stageCol);
  layoutWrap.appendChild(contentCol);

  const replayBtn = stageCol.querySelector('.narrator-replay-btn');
  const muteBtn = stageCol.querySelector('.narrator-mute-btn');

  replayBtn.addEventListener('click', () => {
    if (isMuted) {
      isMuted = false;
      localStorage.setItem(NARRATOR_MUTE_KEY, 'false');
      muteBtn.textContent = 'Mute';
    }
    speakMainPoint(wtBody, stageCol);
  });

  muteBtn.addEventListener('click', () => {
    isMuted = !isMuted;
    localStorage.setItem(NARRATOR_MUTE_KEY, String(isMuted));
    muteBtn.textContent = isMuted ? 'Unmute' : 'Mute';
    if (isMuted) {
      stopNarration();
    } else {
      speakMainPoint(wtBody, stageCol);
    }
  });

  const observer = new MutationObserver(() => {
    const isHidden = wtModal.classList.contains('hidden');
    if (!isHidden) {
      scrubDomMojibake(wtModal);
      speakMainPoint(wtBody, stageCol);
    } else {
      stopNarration();
    }
  });

  observer.observe(wtModal, { attributes: true, attributeFilter: ['class'] });
}

function setupLab05BriefingNarrator() {
  const briefingBox = document.querySelector('.briefing-box');
  if (!briefingBox || briefingBox.dataset.narratorBound === 'true') return;
  briefingBox.dataset.narratorBound = 'true';

  const existingChildren = Array.from(briefingBox.children);
  briefingBox.classList.add('briefing-with-narrator');

  const stageCol = document.createElement('div');
  stageCol.className = 'narrator-stage-col';
  stageCol.innerHTML = `
    ${getInstructorSvgHtml()}
    <div class="narrator-controls-bar">
      <button type="button" class="narrator-btn narrator-replay-btn">Replay</button>
      <button type="button" class="narrator-btn narrator-mute-btn">${isMuted ? 'Unmute' : 'Mute'}</button>
    </div>
  `;

  const textCol = document.createElement('div');
  textCol.style.display = 'flex';
  textCol.style.flexDirection = 'column';
  textCol.style.gap = '0.65rem';
  existingChildren.forEach(ch => textCol.appendChild(ch));

  briefingBox.innerHTML = '';
  briefingBox.appendChild(stageCol);
  briefingBox.appendChild(textCol);

  const firstParagraphEl = textCol.querySelector('p');
  if (firstParagraphEl) {
    extractMainPointChunks(firstParagraphEl).forEach(ch => preloadChunkAudio(ch));
  }

  const replayBtn = stageCol.querySelector('.narrator-replay-btn');
  const muteBtn = stageCol.querySelector('.narrator-mute-btn');

  replayBtn.addEventListener('click', () => {
    if (isMuted) {
      isMuted = false;
      localStorage.setItem(NARRATOR_MUTE_KEY, 'false');
      muteBtn.textContent = 'Mute';
    }
    speakMainPoint(firstParagraphEl, stageCol);
  });

  muteBtn.addEventListener('click', () => {
    isMuted = !isMuted;
    localStorage.setItem(NARRATOR_MUTE_KEY, String(isMuted));
    muteBtn.textContent = isMuted ? 'Unmute' : 'Mute';
    if (isMuted) stopNarration();
    else speakMainPoint(firstParagraphEl, stageCol);
  });

  const postGameSummary = document.getElementById('post-game-summary');
  if (postGameSummary) {
    const mainP = postGameSummary.querySelector('p');
    if (mainP) {
      extractMainPointChunks(mainP).forEach(ch => preloadChunkAudio(ch));
    }
    const sumObserver = new MutationObserver(() => {
      if (!postGameSummary.classList.contains('hidden')) {
        speakMainPoint(mainP, stageCol);
      }
    });
    sumObserver.observe(postGameSummary, { attributes: true, attributeFilter: ['class'] });
  }
}

export function initNarrator() {
  if (typeof document === 'undefined') return;
  setupGlobalMojibakeProtection();
  setupMobileAudioUnlocker();
  prewarmKnownScripts();
  injectNarratorStyles();
  setupWalkthroughModalNarrator();
  setupLab05BriefingNarrator();

  window.addEventListener('beforeunload', () => {
    stopNarration();
  });
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initNarrator);
  } else {
    initNarrator();
  }
}
