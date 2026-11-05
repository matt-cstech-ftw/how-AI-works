// ==========================================
// ON-SCREEN CHARACTER NARRATOR ENGINE ("ARIA")
// Uses Real Neural Female TTS Audio + Web Audio API Lip-Sync
// Reads ONLY the main point (skips black callout boxes / <small> notes)
// ==========================================

const NARRATOR_MUTE_KEY = 'ai_lab_narrator_muted_v1';

let isMuted = localStorage.getItem(NARRATOR_MUTE_KEY) === 'true';
let isSpeaking = false;
let playbackAborted = false;
let mouthFrameTimer = null;
let activeAudioCtx = null;
let activeSourceNode = null;
let activeAudioEl = null;

// In-memory cache so replaying or re-opening any popup is instant
const neuralAudioCache = new Map();

// Lazy-loaded local ONNX Neural TTS fallback (@huggingface/transformers SpeechT5)
let localTtsPromise = null;
const FEMALE_XVECTOR_URL = 'https://huggingface.co/datasets/Xenova/cmu-arctic-xvectors-extracted/resolve/main/cmu_us_slt_arctic-wav-arctic_a0001.bin';

// High-Detail Chibi Female Instructor SVG (Matches reference illustration)
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

      <!-- Bouncy Side Ponytail (Right Side) -->
      <path class="narrator-ponytail" d="M 158 58 C 195 45, 222 82, 206 126 C 198 110, 188 104, 175 102 C 166 90, 160 72, 158 58 Z" fill="url(#hairGrad)" />
      <!-- Ponytail Hair Tie -->
      <ellipse cx="161" cy="67" rx="6" ry="11" transform="rotate(-22 161 67)" fill="#4a2106"/>

      <!-- Outstretched Welcoming Left Arm & Hand -->
      <g class="narrator-arm-left">
        <path d="M 38 190 L 14 212 C 8 218, 12 226, 20 223 L 45 206 Z" fill="#fbd3b7"/>
        <path d="M 38 190 L 22 182 C 18 180, 16 184, 21 189 L 34 198 Z" fill="#fbd3b7"/>
        <rect x="41" y="185" width="9" height="19" rx="2" transform="rotate(14 41 185)" fill="#ffffff"/>
        <path d="M 88 162 L 47 184 L 52 204 L 92 184 Z" fill="url(#suitGrad)"/>
      </g>

      <!-- Outstretched Welcoming Right Arm & Hand -->
      <g class="narrator-arm-right">
        <path d="M 202 190 L 226 212 C 232 218, 228 226, 220 223 L 195 206 Z" fill="#fbd3b7"/>
        <path d="M 202 190 L 218 182 C 222 180, 224 184, 219 189 L 206 198 Z" fill="#fbd3b7"/>
        <rect x="190" y="185" width="9" height="19" rx="2" transform="rotate(-14 190 185)" fill="#ffffff"/>
        <path d="M 152 162 L 193 184 L 188 204 L 148 184 Z" fill="url(#suitGrad)"/>
      </g>

      <!-- Fitted Black Skirt -->
      <path d="M 88 216 L 152 216 L 158 268 L 82 268 Z" fill="#1e1f24"/>

      <!-- White V-Neck Blouse -->
      <path d="M 92 156 L 148 156 L 146 220 L 94 220 Z" fill="#f4f4f6"/>

      <!-- Neck & V-Neck Skin Triangle -->
      <rect x="111" y="134" width="18" height="24" rx="6" fill="#f3c3a4"/>
      <polygon points="106,154 134,154 120,182" fill="#fbd3b7"/>

      <!-- Tailored Grey Blazer Jacket -->
      <path d="M 86 155 L 106 154 L 114 218 L 82 222 C 79 200, 82 174, 86 155 Z" fill="url(#suitGrad)"/>
      <path d="M 154 155 L 134 154 L 126 218 L 158 222 C 161 200, 158 174, 154 155 Z" fill="url(#suitGrad)"/>

      <!-- Blazer Lapels -->
      <polygon points="106,154 95,162 111,196 114,186" fill="#6c6f78"/>
      <polygon points="134,154 145,162 129,196 126,186" fill="#6c6f78"/>

      <!-- Back Hair Layer -->
      <ellipse cx="120" cy="84" rx="54" ry="52" fill="url(#hairGrad)"/>

      <!-- Cute Ears & Pearl Earrings -->
      <ellipse cx="68" cy="98" rx="9" ry="13" fill="#f7c8aa"/>
      <ellipse cx="172" cy="98" rx="9" ry="13" fill="#f7c8aa"/>
      <circle cx="67" cy="108" r="2.2" fill="#ffffff"/>
      <circle cx="173" cy="108" r="2.2" fill="#ffffff"/>

      <!-- Chibi Head / Face Base -->
      <rect x="72" y="44" width="96" height="96" rx="46" fill="#fbd3b7"/>

      <!-- Rosy Cheeks -->
      <circle cx="88" cy="108" r="14" fill="url(#cheekGlow)"/>
      <circle cx="152" cy="108" r="14" fill="url(#cheekGlow)"/>

      <!-- Expressive Brown Eyes (Blinking Group) -->
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

      <!-- Animated Lip-Sync Mouth States -->
      <g class="narrator-mouth-group">
        <g class="mouth-state mouth-open">
          <path d="M 106 113 Q 120 116 134 113 C 134 128, 106 128, 106 113 Z" fill="#b92b4f"/>
          <path d="M 111 121 Q 120 116 129 121 C 127 127, 113 127, 111 121 Z" fill="#ff8fa3"/>
        </g>
        <g class="mouth-state mouth-mid" style="display:none;">
          <ellipse cx="120" cy="118" rx="8" ry="6.5" fill="#b92b4f"/>
          <ellipse cx="120" cy="121" rx="5.5" ry="3.5" fill="#ff8fa3"/>
        </g>
        <g class="mouth-state mouth-smile" style="display:none;">
          <path d="M 108 115 Q 120 124 132 115" stroke="#b92b4f" stroke-width="3" stroke-linecap="round" fill="none"/>
        </g>
      </g>

      <!-- Big Round Glasses -->
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
      max-width: 740px !important;
      overflow: visible !important;
    }

    .wt-narrator-layout {
      display: grid;
      grid-template-columns: 185px 1fr;
      gap: 1.25rem;
      align-items: center;
    }

    .narrator-stage-col {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: radial-gradient(circle at 50% 45%, rgba(56, 189, 248, 0.14), rgba(9, 9, 11, 0.4) 75%);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-md);
      padding: 0.65rem 0.4rem 0.5rem;
      position: relative;
    }

    .narrator-avatar-svg {
      width: 165px;
      height: 186px;
      overflow: visible;
      filter: drop-shadow(0 8px 18px rgba(0,0,0,0.45));
      animation: narratorFloat 3s ease-in-out infinite;
    }

    .narrator-stage-col.is-speaking .narrator-avatar-svg {
      animation: narratorTalkBounce 0.55s ease-in-out infinite alternate;
    }

    .narrator-stage-col.is-speaking .narrator-arm-left {
      transform-origin: 85px 175px;
      animation: armGestureLeft 0.7s ease-in-out infinite alternate;
    }

    .narrator-stage-col.is-speaking .narrator-arm-right {
      transform-origin: 155px 175px;
      animation: armGestureRight 0.7s ease-in-out infinite alternate;
    }

    .narrator-eyes {
      transform-origin: 120px 92px;
      animation: narratorBlink 4.2s infinite;
    }

    @keyframes narratorFloat {
      0%, 100% { transform: translateY(0px); }
      50% { transform: translateY(-4px); }
    }

    @keyframes narratorTalkBounce {
      0% { transform: translateY(0px) rotate(-0.8deg); }
      100% { transform: translateY(-4px) rotate(0.8deg); }
    }

    @keyframes armGestureLeft {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(6deg); }
    }

    @keyframes armGestureRight {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(-6deg); }
    }

    @keyframes narratorBlink {
      0%, 94%, 98%, 100% { transform: scaleY(1); }
      96% { transform: scaleY(0.08); }
    }

    .narrator-controls-bar {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      margin-top: 0.35rem;
      width: 100%;
      justify-content: center;
    }

    .narrator-btn {
      background: var(--bg-surface);
      border: 1px solid var(--border-strong);
      color: var(--text-secondary);
      font-family: var(--font-mono);
      font-size: 0.65rem;
      padding: 0.24rem 0.5rem;
      border-radius: 6px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      transition: all 0.15s ease;
    }

    .narrator-btn:hover {
      border-color: var(--cyan);
      color: var(--text-primary);
    }

    .narrator-btn.speaking-active {
      border-color: var(--emerald);
      color: var(--emerald);
      background: rgba(16, 185, 129, 0.1);
    }

    .briefing-with-narrator {
      display: grid;
      grid-template-columns: 155px 1fr;
      gap: 1.15rem;
      align-items: center;
    }

    @media (max-width: 680px) {
      .wt-narrator-layout, .briefing-with-narrator {
        grid-template-columns: 1fr;
      }
      .narrator-avatar-svg {
        width: 135px;
        height: 152px;
      }
    }
  `;
  document.head.appendChild(style);
}

// ==========================================
// EXTRACT ONLY THE MAIN POINT (SKIPS BLACK BOX / <small>)
// ==========================================
function extractMainPointOnly(titleEl, bodyEl) {
  const titleText = titleEl ? titleEl.textContent.trim() : '';
  if (!bodyEl) return titleText;

  // Clone the body container so we can strip out secondary black callout boxes and <small> notes
  const clone = bodyEl.cloneNode(true);
  clone.querySelectorAll(
    'small, .vocab-scale-note, .context-scale-note, .dimension-scale-note, .keep-learning-banner, .journey-grid, [style*="background"]'
  ).forEach(el => el.remove());

  let mainBody = clone.textContent || '';

  // Clean up technical formatting so speech flows naturally
  mainBody = mainBody
    .replace(/\([^)]*\)/g, '') // Remove parenthetical side-notes like (Technical term: Temperature)
    .replace(/#[0-9]+/g, '')     // Remove raw token ID numbers
    .replace(/•/g, '. ')
    .replace(/·/g, ' ')
    .replace(/—/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();

  const fullText = titleText ? `${titleText}. ${mainBody}` : mainBody;

  // Split into clean sentences under 220 chars each for neural synthesis
  const rawSentences = fullText.match(/[^.!?]+[.!?]+/g) || [fullText];
  return rawSentences.map(s => s.trim()).filter(s => s.length > 1);
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
  stageEl.classList.add('is-speaking');
  const states = ['open', 'mid', 'open', 'smile', 'mid'];
  let idx = 0;
  mouthFrameTimer = setInterval(() => {
    setMouthState(stageEl, states[idx % states.length]);
    idx++;
  }, 130);
}

function stopLipSyncAnimation() {
  if (mouthFrameTimer) {
    clearInterval(mouthFrameTimer);
    mouthFrameTimer = null;
  }
  document.querySelectorAll('.narrator-stage-col').forEach(el => {
    el.classList.remove('is-speaking');
    setMouthState(el, 'open');
  });
  document.querySelectorAll('.narrator-replay-btn').forEach(btn => {
    btn.classList.remove('speaking-active');
    btn.textContent = '🔊 Replay';
  });
}

export function stopNarration() {
  playbackAborted = true;
  if (activeAudioEl) {
    activeAudioEl.pause();
    activeAudioEl.src = '';
    activeAudioEl = null;
  }
  if (activeSourceNode) {
    try { activeSourceNode.stop(); } catch {}
    activeSourceNode = null;
  }
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
  isSpeaking = false;
  stopLipSyncAnimation();
}

// ==========================================
// TIER 1: CLOUD NEURAL FEMALE VOICE ("Jessie" en_us_001 / en_us_002)
// ==========================================
async function fetchCloudNeuralSentenceBase64(sentence) {
  const cacheKey = `cloud_${sentence}`;
  if (neuralAudioCache.has(cacheKey)) {
    return neuralAudioCache.get(cacheKey);
  }

  const endpoints = [
    {
      url: 'https://tiktok-tts.weilnet.workers.dev/api/generation',
      body: { text: sentence, voice: 'en_us_001' },
      extract: (json) => json?.data
    },
    {
      url: 'https://gesserit.co/api/tiktok-tts',
      body: { text: sentence, voice: 'en_us_001' },
      extract: (json) => json?.base64 || json?.data
    }
  ];

  for (const ep of endpoints) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3200);
      const res = await fetch(ep.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ep.body),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (res.ok) {
        const json = await res.json();
        const b64 = ep.extract(json);
        if (b64 && b64.length > 100) {
          const dataUri = b64.startsWith('data:') ? b64 : `data:audio/mp3;base64,${b64}`;
          neuralAudioCache.set(cacheKey, dataUri);
          return dataUri;
        }
      }
    } catch {
      // Try next neural endpoint
    }
  }
  return null;
}

// ==========================================
// TIER 2: IN-BROWSER ONNX NEURAL FEMALE TTS (SpeechT5 via Transformers.js)
// ==========================================
async function getLocalNeuralSynthesizer() {
  if (!localTtsPromise) {
    localTtsPromise = (async () => {
      const { pipeline, env } = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.3.3');
      env.allowLocalModels = false;
      env.useBrowserCache = true;
      return await pipeline('text-to-speech', 'Xenova/speecht5_tts', { dtype: 'fp32' });
    })();
  }
  return localTtsPromise;
}

async function playFloat32AudioBuffer(float32Data, sampleRate) {
  if (playbackAborted) return;
  if (!activeAudioCtx) {
    activeAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (activeAudioCtx.state === 'suspended') {
    await activeAudioCtx.resume();
  }

  return new Promise((resolve) => {
    const buffer = activeAudioCtx.createBuffer(1, float32Data.length, sampleRate);
    buffer.getChannelData(0).set(float32Data);

    const source = activeAudioCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(activeAudioCtx.destination);
    activeSourceNode = source;

    source.onended = () => {
      activeSourceNode = null;
      resolve();
    };
    source.start(0);
  });
}

function playAudioDataUri(dataUri) {
  return new Promise((resolve, reject) => {
    if (playbackAborted) return resolve();
    const audio = new Audio(dataUri);
    activeAudioEl = audio;
    audio.rate = 1.0;
    audio.onended = () => {
      activeAudioEl = null;
      resolve();
    };
    audio.onerror = (err) => {
      activeAudioEl = null;
      reject(err);
    };
    audio.play().catch(reject);
  });
}

// ==========================================
// MAIN NEURAL NARRATION ORCHESTRATOR
// ==========================================
export async function speakMainPoint(titleEl, bodyEl, stageEl) {
  stopNarration();
  if (isMuted) return;

  const sentences = extractMainPointOnly(titleEl, bodyEl);
  if (!sentences || sentences.length === 0) return;

  playbackAborted = false;
  isSpeaking = true;

  const replayBtn = stageEl?.querySelector('.narrator-replay-btn');
  if (replayBtn) {
    replayBtn.classList.add('speaking-active');
    replayBtn.textContent = '🎙️ Loading Voice...';
  }

  // Try Tier 1: Fetch sentence #1 from Cloud Neural Female Voice
  const firstCloudAudio = await fetchCloudNeuralSentenceBase64(sentences[0]);
  if (playbackAborted) return;

  if (firstCloudAudio) {
    // Cloud Neural Voice succeeded! Pre-fetch remaining sentences in parallel while playing sentence #1
    const remainingPromises = sentences.slice(1).map(s => fetchCloudNeuralSentenceBase64(s));
    if (replayBtn) replayBtn.textContent = '🔊 Speaking...';
    startLipSyncAnimation(stageEl);

    try {
      await playAudioDataUri(firstCloudAudio);
      for (const p of remainingPromises) {
        if (playbackAborted) break;
        const nextUri = await p;
        if (nextUri && !playbackAborted) {
          await playAudioDataUri(nextUri);
        }
      }
    } catch {
      // Ignore user navigation interruption
    } finally {
      if (!playbackAborted) {
        isSpeaking = false;
        stopLipSyncAnimation();
      }
    }
    return;
  }

  // Tier 2 Fallback: Local In-Browser ONNX Neural Female Voice (SpeechT5)
  try {
    const tts = await getLocalNeuralSynthesizer();
    if (playbackAborted) return;

    if (replayBtn) replayBtn.textContent = '🔊 Speaking...';
    startLipSyncAnimation(stageEl);

    for (const sentence of sentences) {
      if (playbackAborted) break;
      const cacheKey = `local_${sentence}`;
      let out = neuralAudioCache.get(cacheKey);
      if (!out) {
        out = await tts(sentence, { speaker_embeddings: FEMALE_XVECTOR_URL });
        neuralAudioCache.set(cacheKey, out);
      }
      if (playbackAborted) break;
      await playFloat32AudioBuffer(out.audio, out.sampling_rate);
    }
  } catch (err) {
    console.warn('Neural TTS fallback note:', err);
  } finally {
    if (!playbackAborted) {
      isSpeaking = false;
      stopLipSyncAnimation();
    }
  }
}

// Enhance any #walkthrough-modal with the On-Screen Character Narrator
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
    <span class="mono-tag" style="font-size:0.62rem; color:var(--cyan); border-color:rgba(56,189,248,0.3); margin-bottom:0.2rem;">AI LAB GUIDE</span>
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
    speakMainPoint(wtTitle, wtBody, stageCol);
  });

  muteBtn.addEventListener('click', () => {
    isMuted = !isMuted;
    localStorage.setItem(NARRATOR_MUTE_KEY, String(isMuted));
    muteBtn.textContent = isMuted ? '🔇 Unmute' : '🔈 Mute';
    if (isMuted) {
      stopNarration();
    } else {
      speakMainPoint(wtTitle, wtBody, stageCol);
    }
  });

  // Automatically narrate ONLY the main point whenever #walkthrough-modal opens
  const observer = new MutationObserver(() => {
    const isHidden = wtModal.classList.contains('hidden');
    if (!isHidden) {
      setTimeout(() => {
        speakMainPoint(wtTitle, wtBody, stageCol);
      }, 100);
    } else {
      stopNarration();
    }
  });

  observer.observe(wtModal, { attributes: true, attributeFilter: ['class'] });
}

// Enhance Lab 05 Briefing Box with the On-Screen Character Narrator
function setupLab05BriefingNarrator() {
  const briefingBox = document.querySelector('.briefing-box');
  if (!briefingBox || briefingBox.dataset.narratorBound === 'true') return;
  briefingBox.dataset.narratorBound = 'true';

  const existingChildren = Array.from(briefingBox.children);
  briefingBox.classList.add('briefing-with-narrator');

  const stageCol = document.createElement('div');
  stageCol.className = 'narrator-stage-col';
  stageCol.innerHTML = `
    <span class="mono-tag" style="font-size:0.62rem; color:var(--cyan); border-color:rgba(56,189,248,0.3); margin-bottom:0.2rem;">AI LAB GUIDE</span>
    ${getInstructorSvgHtml()}
    <div class="narrator-controls-bar">
      <button type="button" class="narrator-btn narrator-replay-btn">🔊 Listen</button>
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

  const headingEl = textCol.querySelector('h3');
  const firstParagraphEl = textCol.querySelector('p');

  const replayBtn = stageCol.querySelector('.narrator-replay-btn');
  const muteBtn = stageCol.querySelector('.narrator-mute-btn');

  replayBtn.addEventListener('click', () => {
    if (isMuted) {
      isMuted = false;
      localStorage.setItem(NARRATOR_MUTE_KEY, 'false');
      muteBtn.textContent = '🔈 Mute';
    }
    speakMainPoint(headingEl, firstParagraphEl, stageCol);
  });

  muteBtn.addEventListener('click', () => {
    isMuted = !isMuted;
    localStorage.setItem(NARRATOR_MUTE_KEY, String(isMuted));
    muteBtn.textContent = isMuted ? '🔇 Unmute' : '🔈 Mute';
    if (isMuted) stopNarration();
    else speakMainPoint(headingEl, firstParagraphEl, stageCol);
  });

  // Also narrate only the main headline & opening paragraph of the Post-Game Summary
  const postGameSummary = document.getElementById('post-game-summary');
  if (postGameSummary) {
    const sumObserver = new MutationObserver(() => {
      if (!postGameSummary.classList.contains('hidden')) {
        const h2 = postGameSummary.querySelector('h2');
        const mainP = postGameSummary.querySelector('p');
        speakMainPoint(h2, mainP, stageCol);
      }
    });
    sumObserver.observe(postGameSummary, { attributes: true, attributeFilter: ['class'] });
  }
}

export function initNarrator() {
  if (typeof document === 'undefined') return;
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
