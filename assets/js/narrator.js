// ==========================================
// ON-SCREEN CHARACTER NARRATOR ENGINE
// - Instant playback (pre-loads audio on page load, zero "Loading Voice..." wait)
// - Reads ONLY the main point (skips black callout boxes / <small> notes)
// - Pronounces "AI" clearly as "A. I." (never "ay")
// - Static character with arms resting down at her sides, transparent background,
//   lip-sync mouth animation, and Replay / Mute buttons below
// ==========================================

const NARRATOR_MUTE_KEY = 'ai_lab_narrator_muted_v1';

let isMuted = localStorage.getItem(NARRATOR_MUTE_KEY) === 'true';
let isSpeaking = false;
let playbackAborted = false;
let mouthFrameTimer = null;
let activeAudioEl = null;

// Pre-loaded Audio element cache keyed by sentence text
const preloadedAudioMap = new Map();

// Ensure no-referrer meta tag is present so Google Neural TTS streams load with 200 OK
function ensureNoReferrerMeta() {
  if (typeof document === 'undefined') return;
  if (!document.querySelector('meta[name="referrer"]')) {
    const meta = document.createElement('meta');
    meta.name = 'referrer';
    meta.content = 'no-referrer';
    document.head.appendChild(meta);
  }
}

// Clean & normalize text for natural educational pronunciation ("AI" -> "A. I.")
function normalizeTextForSpeech(rawText) {
  return rawText
    .replace(/\([^)]*\)/g, '')           // Strip parenthetical side-notes
    .replace(/\bAI's\b/g, "A. I.'s")     // Pronounce AI's as A. I.'s
    .replace(/\bAI\b/g, 'A. I.')         // Pronounce AI as A. I. (never "ay")
    .replace(/#1\b/g, 'number one')
    .replace(/#2\b/g, 'number two')
    .replace(/#3\b/g, 'number three')
    .replace(/#[0-9]+/g, '')
    .replace(/SmolLM2/gi, 'Small L. M. 2')
    .replace(/Logits/gi, 'low-jits')
    .replace(/[•·]/g, ' ')
    .replace(/—/g, ', ')
    .replace(/["“”`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Split normalized text into short <175-char chunks for instant TTS streaming
function splitIntoSpeechChunks(cleanText) {
  const rawSentences = cleanText.match(/[^.!?]+[.!?]+/g) || [cleanText];
  const chunks = [];

  for (const s of rawSentences) {
    const trimmed = s.trim();
    if (!trimmed) continue;
    if (trimmed.length <= 175) {
      chunks.push(trimmed);
    } else {
      // Split long sentences on commas or conjunctions
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

// Pre-create and buffer an Audio element in memory so .play() is 0ms instant
function preloadChunkAudio(chunkText) {
  if (preloadedAudioMap.has(chunkText)) {
    return preloadedAudioMap.get(chunkText);
  }
  ensureNoReferrerMeta();
  const audio = new Audio();
  audio.preload = 'auto';
  audio.src = buildGoogleTtsUrl(chunkText);
  audio.load();
  preloadedAudioMap.set(chunkText, audio);
  return audio;
}

// Pre-warm all known course Learning Moment scripts in the background on page load!
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

// Static Chibi Female Instructor SVG with Arms Resting Down at Her Sides
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

      <!-- Side Ponytail -->
      <path d="M 158 58 C 195 45, 222 82, 206 126 C 198 110, 188 104, 175 102 C 166 90, 160 72, 158 58 Z" fill="url(#hairGrad)" />
      <ellipse cx="161" cy="67" rx="6" ry="11" transform="rotate(-22 161 67)" fill="#4a2106"/>

      <!-- Fitted Black Skirt -->
      <path d="M 88 216 L 152 216 L 158 266 L 82 266 Z" fill="#1e1f24"/>

      <!-- White V-Neck Blouse -->
      <path d="M 92 156 L 148 156 L 146 220 L 94 220 Z" fill="#f4f4f6"/>

      <!-- Neck & V-Neck Skin Triangle -->
      <rect x="111" y="134" width="18" height="24" rx="6" fill="#f3c3a4"/>
      <polygon points="106,154 134,154 120,182" fill="#fbd3b7"/>

      <!-- Left Arm & Hand Resting Down at Her Side -->
      <g class="narrator-arm-left-down">
        <!-- Left Hand at Side -->
        <rect x="69" y="224" width="12" height="17" rx="6" fill="#fbd3b7"/>
        <!-- White Shirt Cuff -->
        <rect x="69" y="218" width="13" height="7" rx="2" fill="#ffffff"/>
        <!-- Left Suit Sleeve Straight Down -->
        <path d="M 86 155 C 76 158, 71 170, 68 219 L 83 219 L 88 168 Z" fill="url(#suitGrad)"/>
      </g>

      <!-- Right Arm & Hand Resting Down at Her Side -->
      <g class="narrator-arm-right-down">
        <!-- Right Hand at Side -->
        <rect x="159" y="224" width="12" height="17" rx="6" fill="#fbd3b7"/>
        <!-- White Shirt Cuff -->
        <rect x="158" y="218" width="13" height="7" rx="2" fill="#ffffff"/>
        <!-- Right Suit Sleeve Straight Down -->
        <path d="M 154 155 C 164 158, 169 170, 172 219 L 157 219 L 152 168 Z" fill="url(#suitGrad)"/>
      </g>

      <!-- Tailored Grey Blazer Jacket Torso -->
      <path d="M 86 155 L 106 154 L 114 218 L 82 222 C 79 200, 82 174, 86 155 Z" fill="url(#suitGrad)"/>
      <path d="M 154 155 L 134 154 L 126 218 L 158 222 C 161 200, 158 174, 154 155 Z" fill="url(#suitGrad)"/>

      <!-- Blazer Lapels -->
      <polygon points="106,154 95,162 111,196 114,186" fill="#6c6f78"/>
      <polygon points="134,154 145,162 129,196 126,186" fill="#6c6f78"/>

      <!-- Back Hair Layer -->
      <ellipse cx="120" cy="84" rx="54" ry="52" fill="url(#hairGrad)"/>

      <!-- Ears & Pearl Earrings -->
      <ellipse cx="68" cy="98" rx="9" ry="13" fill="#f7c8aa"/>
      <ellipse cx="172" cy="98" rx="9" ry="13" fill="#f7c8aa"/>
      <circle cx="67" cy="108" r="2.2" fill="#ffffff"/>
      <circle cx="173" cy="108" r="2.2" fill="#ffffff"/>

      <!-- Head / Face Base -->
      <rect x="72" y="44" width="96" height="96" rx="46" fill="#fbd3b7"/>

      <!-- Rosy Cheeks -->
      <circle cx="88" cy="108" r="14" fill="url(#cheekGlow)"/>
      <circle cx="152" cy="108" r="14" fill="url(#cheekGlow)"/>

      <!-- Expressive Brown Eyes -->
      <g class="narrator-eyes">
        <ellipse cx="98" cy="92" rx="7.5" ry="11.5" fill="#43230f"/>
        <ellipse cx="98" cy="95" rx="6" ry="7" fill="#7c431e"/>
        <circle cx="96" cy="87" r="2.8" fill="#ffffff"/>
        <ellipse cx="142" cy="92" rx="7.5" ry="11.5" fill="#43230f"/>
        <ellipse cx="142" cy="95" rx="6" ry="7" fill="#7c431e"/>
        <circle cx="140" cy="87" r="2.8" fill="#ffffff"/>
      </g>

      <!-- Eyebrows -->
      <path d="M 88 74 Q 98 69 107 74" stroke="#5c2c0c" stroke-width="2.5" stroke-linecap="round"/>
      <path d="M 133 74 Q 142 69 152 74" stroke="#5c2c0c" stroke-width="2.5" stroke-linecap="round"/>

      <!-- Nose -->
      <ellipse cx="120" cy="103" rx="2.5" ry="1.8" fill="#e5b293"/>

      <!-- Lip-Sync Mouth States (Idle = Closed Smile; Speaking = Alternating Open/Mid/Smile) -->
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

      <!-- Round Glasses -->
      <g class="narrator-glasses">
        <circle cx="96" cy="92" r="21" fill="rgba(255,255,255,0.12)" stroke="#8c867e" stroke-width="3.2"/>
        <circle cx="144" cy="92" r="21" fill="rgba(255,255,255,0.12)" stroke="#8c867e" stroke-width="3.2"/>
        <path d="M 117 92 Q 120 89 123 92" stroke="#8c867e" stroke-width="3.2" fill="none"/>
        <path d="M 83 80 L 90 75" stroke="rgba(255,255,255,0.6)" stroke-width="2.2" stroke-linecap="round"/>
        <path d="M 131 80 L 138 75" stroke="rgba(255,255,255,0.6)" stroke-width="2.2" stroke-linecap="round"/>
      </g>

      <!-- Front Sweeping Bangs -->
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
      overflow: visible !important;
    }

    .wt-narrator-layout {
      display: grid;
      grid-template-columns: 165px 1fr;
      gap: 1.25rem;
      align-items: center;
    }

    /* Completely transparent background, no border, no floating animation */
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
      }
      .narrator-avatar-svg {
        width: 130px;
        height: 148px;
      }
    }
  `;
  document.head.appendChild(style);
}

// ==========================================
// EXTRACT ONLY THE MAIN POINT (SKIPS BLACK BOX / <small> & SKIPS TITLE)
// ==========================================
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
  }, 125);
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
  if (activeAudioEl) {
    activeAudioEl.pause();
    activeAudioEl.currentTime = 0;
    activeAudioEl = null;
  }
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
  isSpeaking = false;
  stopLipSyncAnimation();
}

// Play a single pre-loaded Google Neural TTS chunk (resolves true if played, false if blocked/offline)
function playPreloadedChunk(chunkText, stageEl, isFirstChunk) {
  return new Promise((resolve) => {
    if (playbackAborted) return resolve(true);

    const audio = preloadChunkAudio(chunkText);
    activeAudioEl = audio;
    audio.currentTime = 0;
    audio.playbackRate = 1.06; // Crisp, natural educational cadence

    let started = false;
    let settled = false;

    const finish = (ok) => {
      if (settled) return;
      settled = true;
      audio.onplaying = null;
      audio.onended = null;
      audio.onerror = null;
      resolve(ok);
    };

    // If first chunk doesn't start playing within 450ms (e.g., offline), fall back immediately
    const startTimeout = isFirstChunk
      ? setTimeout(() => {
          if (!started && !settled) {
            try { audio.pause(); } catch {}
            finish(false);
          }
        }, 450)
      : null;

    audio.onplaying = () => {
      started = true;
      if (startTimeout) clearTimeout(startTimeout);
      if (isFirstChunk) startLipSyncAnimation(stageEl);
    };

    audio.onended = () => {
      if (startTimeout) clearTimeout(startTimeout);
      activeAudioEl = null;
      finish(true);
    };

    audio.onerror = () => {
      if (startTimeout) clearTimeout(startTimeout);
      activeAudioEl = null;
      finish(false);
    };

    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise.catch(() => {
        if (startTimeout) clearTimeout(startTimeout);
        finish(false);
      });
    }
  });
}

// Instant Web Speech fallback at natural 1.0 pitch (only used if offline / Google TTS blocked)
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

  // Keep pitch strictly at 1.0 so the browser never applies robotic pitch-shifting distortion
  utter.pitch = 1.0;
  utter.rate = 1.02;

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

// ==========================================
// MAIN INSTANT NARRATION ORCHESTRATOR
// ==========================================
export async function speakMainPoint(bodyEl, stageEl) {
  stopNarration();
  if (isMuted) return;

  const chunks = extractMainPointChunks(bodyEl);
  if (!chunks || chunks.length === 0) return;

  playbackAborted = false;
  isSpeaking = true;

  // Pre-buffer all chunks for this popup immediately
  chunks.forEach(ch => preloadChunkAudio(ch));

  for (let i = 0; i < chunks.length; i++) {
    if (playbackAborted) break;
    const ok = await playPreloadedChunk(chunks[i], stageEl, i === 0);
    if (!ok) {
      // Offline or blocked -> switch to instant 0ms fallback for remaining chunks
      playInstantBrowserSpeechFallback(chunks.slice(i), stageEl);
      return;
    }
  }

  if (!playbackAborted) {
    isSpeaking = false;
    stopLipSyncAnimation();
  }
}

// Enhance any #walkthrough-modal with the Static Character Narrator
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
      <button type="button" class="narrator-btn narrator-replay-btn">🔊 Replay</button>
      <button type="button" class="narrator-btn narrator-mute-btn">${isMuted ? '🔇 Unmute' : '🔈 Mute'}</button>
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
      muteBtn.textContent = '🔈 Mute';
    }
    speakMainPoint(wtBody, stageCol);
  });

  muteBtn.addEventListener('click', () => {
    isMuted = !isMuted;
    localStorage.setItem(NARRATOR_MUTE_KEY, String(isMuted));
    muteBtn.textContent = isMuted ? '🔇 Unmute' : '🔈 Mute';
    if (isMuted) {
      stopNarration();
    } else {
      speakMainPoint(wtBody, stageCol);
    }
  });

  // Begin reading the main point INSTANTLY when #walkthrough-modal opens!
  const observer = new MutationObserver(() => {
    const isHidden = wtModal.classList.contains('hidden');
    if (!isHidden) {
      speakMainPoint(wtBody, stageCol);
    } else {
      stopNarration();
    }
  });

  observer.observe(wtModal, { attributes: true, attributeFilter: ['class'] });
}

// Enhance Lab 05 Briefing Box with the Static Character Narrator
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
      <button type="button" class="narrator-btn narrator-replay-btn">🔊 Replay</button>
      <button type="button" class="narrator-btn narrator-mute-btn">${isMuted ? '🔇 Unmute' : '🔈 Mute'}</button>
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
    // Preload Lab 05 briefing main point immediately
    extractMainPointChunks(firstParagraphEl).forEach(ch => preloadChunkAudio(ch));
  }

  const replayBtn = stageCol.querySelector('.narrator-replay-btn');
  const muteBtn = stageCol.querySelector('.narrator-mute-btn');

  replayBtn.addEventListener('click', () => {
    if (isMuted) {
      isMuted = false;
      localStorage.setItem(NARRATOR_MUTE_KEY, 'false');
      muteBtn.textContent = '🔈 Mute';
    }
    speakMainPoint(firstParagraphEl, stageCol);
  });

  muteBtn.addEventListener('click', () => {
    isMuted = !isMuted;
    localStorage.setItem(NARRATOR_MUTE_KEY, String(isMuted));
    muteBtn.textContent = isMuted ? '🔇 Unmute' : '🔈 Mute';
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
