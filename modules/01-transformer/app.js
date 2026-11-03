import { AutoTokenizer, AutoModelForCausalLM, env, Tensor } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.3.3';
import { completeActivity, saveQuizScore } from '../../assets/js/progress.js';

env.allowLocalModels = false;
env.useBrowserCache = true;

const MODEL_ID = 'HuggingFaceTB/SmolLM2-135M-Instruct';
const TOP_K = 5;
const BAR_COLORS = ['#10b981', '#38bdf8', '#c084fc', '#f59e0b', '#ef4444'];

let tokenizer = null;
let model = null;
let currentInputIds = null;
let promptTokenLength = 0;
let tokenHistory = [];
let isPlaying = false;
let isBusy = false;
let replayIndex = 0;
let selectedCandidateForFork = null;

// Track which walkthrough popups have been shown so they only trigger ONCE per concept
const seenWalkthroughs = new Set();
let resumeAfterWalkthrough = false;

// Mission Tracking
const goals = { wake: false, stream: false, fork: false };

// DOM Elements
const cockpitGrid = document.getElementById('cockpit-grid');
const instrumentsPanel = document.getElementById('instruments-panel');
const initialGuideHint = document.getElementById('initial-guide-hint');
const thermalCard = document.getElementById('thermal-card');
const outputWrapper = document.getElementById('output-wrapper');

const btnInit = document.getElementById('btn-init');
const btnStream = document.getElementById('btn-stream');
const btnReset = document.getElementById('btn-reset');
const promptInput = document.getElementById('prompt-input');
const tempSlider = document.getElementById('temp-slider');
const tempBadge = document.getElementById('temp-badge');
const speedSelect = document.getElementById('speed-select');
const liveText = document.getElementById('live-text');
const statusText = document.getElementById('status-text');
const dlBanner = document.getElementById('dl-banner');
const dlFill = document.getElementById('dl-fill');
const dlPct = document.getElementById('dl-pct');

const speedoArc = document.getElementById('speedo-arc');
const speedoNeedle = document.getElementById('speedo-needle');
const speedoPct = document.getElementById('speedo-pct');
const speedoZone = document.getElementById('speedo-zone');

const explainerBadge = document.getElementById('explainer-badge');
const rollReadout = document.getElementById('roll-readout');
const explainerBody = document.getElementById('explainer-body');
const leaderboard = document.getElementById('leaderboard');
const btnFork = document.getElementById('btn-fork');
const btnForkText = document.getElementById('btn-fork-text');
const forkBanner = document.getElementById('fork-banner');
const forkOldText = document.getElementById('fork-old-text');

const tokenMatrix = document.getElementById('token-matrix');
const tokenCount = document.getElementById('token-count');
const stepCounter = document.getElementById('step-counter');
const btnPrev = document.getElementById('btn-prev');
const btnNext = document.getElementById('btn-next');

const goalWakeEl = document.getElementById('goal-wake');
const goalStreamEl = document.getElementById('goal-stream');
const goalForkEl = document.getElementById('goal-fork');

// Walkthrough Modal DOM
const wtModal = document.getElementById('walkthrough-modal');
const wtTag = document.getElementById('wt-tag');
const wtTitle = document.getElementById('wt-title');
const wtVisual = document.getElementById('wt-visual');
const wtBody = document.getElementById('wt-body');
const btnWtContinue = document.getElementById('btn-wt-continue');
const btnWtText = document.getElementById('btn-wt-text');

// Quiz Modal DOM
const quizModal = document.getElementById('quiz-modal');
const btnOpenQuiz = document.getElementById('btn-open-quiz');
const btnCloseQuiz = document.getElementById('btn-close-quiz');
const btnSubmitQuiz = document.getElementById('btn-submit-quiz');
const quizFeedback = document.getElementById('quiz-feedback');

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons();
}
refreshIcons();

// Check URL params if user clicked "Take Final Assessment" from Dashboard
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('quiz') === '1') {
  quizModal.classList.remove('hidden');
}

// Show Interactive Walkthrough Popup with Custom SVG Visual Aid
function triggerWalkthrough({ id, tag, title, svgHtml, bodyHtml, buttonLabel = 'Got It — Keep Watching', autoResume = true }) {
  if (seenWalkthroughs.has(id)) return false;
  seenWalkthroughs.add(id);

  isPlaying = false;
  resumeAfterWalkthrough = autoResume;

  wtTag.textContent = tag;
  wtTitle.textContent = title;
  wtVisual.innerHTML = svgHtml;
  wtBody.innerHTML = bodyHtml;
  btnWtText.textContent = buttonLabel;
  wtModal.classList.remove('hidden');
  refreshIcons();
  return true;
}

btnWtContinue.addEventListener('click', () => {
  wtModal.classList.add('hidden');
  if (resumeAfterWalkthrough) {
    resumeAfterWalkthrough = false;
    startStreamingLoop();
  }
});

function markGoalDone(key, el, nextEl = null) {
  goals[key] = true;
  el.classList.remove('active-goal');
  el.classList.add('done');
  const cleanLabel = el.querySelector('span')?.textContent || el.textContent.trim();
  el.innerHTML = `<i data-lucide="check-circle-2" class="icon-xs"></i><span>${cleanLabel}</span>`;
  if (nextEl) nextEl.classList.add('active-goal');
  refreshIcons();

  if (goals.wake && goals.stream) {
    completeActivity('mod-01', 150);
  }
}

// Radial Certainty Speedometer Math
function updateSpeedometer(prob) {
  const pct = Math.round(prob * 100);
  const arcLen = 188.5;
  const offset = arcLen - prob * arcLen;
  const deg = -90 + prob * 180;

  speedoArc.style.strokeDashoffset = offset;
  speedoNeedle.style.transform = `rotate(${deg}deg)`;
  speedoPct.textContent = `${pct}%`;

  if (pct >= 85) {
    speedoArc.style.stroke = '#10b981';
    speedoZone.textContent = 'LOCKED IN (OBVIOUS)';
    speedoZone.style.color = '#10b981';
  } else if (pct >= 40) {
    speedoArc.style.stroke = '#38bdf8';
    speedoZone.textContent = 'COMPETITIVE';
    speedoZone.style.color = '#38bdf8';
  } else {
    speedoArc.style.stroke = '#f59e0b';
    speedoZone.textContent = 'HIGH DILEMMA (SPLIT)';
    speedoZone.style.color = '#f59e0b';
  }
}

// Render 20-Segment Neon Power Meters
function renderLeaderboard(pool, chosenId) {
  leaderboard.innerHTML = '';
  btnFork.classList.add('hidden');
  selectedCandidateForFork = null;

  pool.forEach((cand, idx) => {
    const pct = (cand.prob * 100).toFixed(1);
    const activeCells = Math.round(cand.prob * 20);
    const color = BAR_COLORS[idx % BAR_COLORS.length];
    const isChosen = cand.id === chosenId;

    const row = document.createElement('div');
    row.className = 'candidate-row';

    let cellsHtml = '';
    for (let i = 0; i < 20; i++) {
      const lit = i < activeCells;
      cellsHtml += `<div class="seg-cell" style="background:${lit ? color : '#1f1f23'}; opacity:${isChosen || lit ? 1 : 0.4}"></div>`;
    }

    row.innerHTML = `
      <div class="cand-word" style="color:${isChosen ? '#fafafa' : '#a1a1aa'}; font-weight:${isChosen ? '700' : '400'}">
        ${isChosen ? '▶ ' : ''}${cand.token.replace(/\s/g, '·')}
      </div>
      <div class="segmented-meter">${cellsHtml}</div>
      <div class="cand-pct">${pct}%</div>
    `;

    row.addEventListener('click', () => {
      document.querySelectorAll('.candidate-row').forEach(r => r.classList.remove('selected-fork'));
      row.classList.add('selected-fork');
      selectedCandidateForFork = cand;
      btnFork.classList.remove('hidden');
      btnForkText.textContent = `Force "${cand.token.trim() || 'space'}" Instead`;
    });

    leaderboard.appendChild(row);
  });
}

function renderTokenMatrix(ids) {
  tokenMatrix.innerHTML = '';
  const slice = ids.slice(Math.max(0, promptTokenLength - 10));
  let count = 0;

  slice.forEach(id => {
    const str = tokenizer.decode([id]);
    if (str.includes('<|im_') || str === 'ass' || str === 'istant') return;
    count++;
    const chip = document.createElement('div');
    chip.className = 'puzzle-chip';
    chip.innerHTML = `<span>${str.replace(/\s/g, '·')}</span><span class="puzzle-id">#${id}</span>`;
    tokenMatrix.appendChild(chip);
  });
  tokenCount.textContent = `${count} Tokens`;
}

function extractTopRawLogits(logitsSlice, maxPool = 10) {
  const indexed = [];
  for (let i = 0; i < logitsSlice.length; i++) {
    indexed.push({ id: i, rawLogit: logitsSlice[i] });
  }
  indexed.sort((a, b) => b.rawLogit - a.rawLogit);
  return indexed.slice(0, maxPool).map(item => ({
    id: item.id,
    token: tokenizer.decode([item.id]),
    rawLogit: item.rawLogit
  }));
}

function computeSoftmax(topRawLogits, topK, temperature) {
  const sliced = topRawLogits.slice(0, topK);
  const temp = Math.max(0.02, parseFloat(temperature));
  const scaled = sliced.map(c => c.rawLogit / temp);
  const maxScaled = Math.max(...scaled);
  const exps = scaled.map(s => Math.exp(s - maxScaled));
  const sumExp = exps.reduce((a, b) => a + b, 0);

  return sliced.map((c, i) => ({
    ...c,
    prob: exps[i] / sumExp
  }));
}

// Finish generation cleanly after 1 concise sentence
function finishGenerationCleanly() {
  isPlaying = false;
  btnStream.innerHTML = `<i data-lucide="play" class="icon-xs"></i><span>Watch Again</span>`;
  refreshIcons();

  if (!goals.fork) {
    triggerWalkthrough({
      id: 'wt_try_fork',
      tag: 'FINAL LAB CHALLENGE',
      title: 'Now Step In and Change History!',
      svgHtml: `
        <svg width="300" height="75" viewBox="0 0 300 75" fill="none">
          <circle cx="40" cy="38" r="8" fill="#10b981"/>
          <path d="M48 38 H120" stroke="#10b981" stroke-width="3"/>
          <circle cx="120" cy="38" r="8" fill="#fafafa"/>
          <path d="M128 38 L220 18" stroke="#71717a" stroke-width="2" stroke-dasharray="4 4"/>
          <path d="M128 38 L220 58" stroke="#c084fc" stroke-width="3"/>
          <rect x="220" y="46" width="70" height="24" rx="4" fill="#c084fc"/>
          <text x="255" y="62" fill="#09090b" font-family="JetBrains Mono" font-size="10" font-weight="bold" text-anchor="middle">New Ending</text>
        </svg>
      `,
      bodyHtml: `
        The AI finished its sentence! Now for the coolest part:<br><br>
        1. Click <strong>any colored word</strong> in the output box on the left.<br>
        2. Click one of the <strong>runner-up bars (#2 or #3)</strong> in the Word Election Leaderboard.<br>
        3. Press the purple <strong>Force This Word Instead</strong> button to watch the AI write a brand-new ending!
      `,
      buttonLabel: 'Let Me Try It!',
      autoResume: false
    });
  }
}

// STEP 1: Wake Up AI Brain & Reveal Cockpit
btnInit.addEventListener('click', async () => {
  if (model) return;
  btnInit.disabled = true;
  btnInit.classList.remove('btn-pulse-emerald');
  dlBanner.classList.remove('hidden');
  statusText.textContent = 'Waking Up AI...';

  const progressCallback = (info) => {
    if (info.status === 'progress' && info.total) {
      const pct = Math.round((info.loaded / info.total) * 100);
      dlFill.style.width = `${pct}%`;
      dlPct.textContent = `${pct}%`;
    }
  };

  try {
    let device = 'wasm';
    if (navigator.gpu) {
      const adapter = await navigator.gpu.requestAdapter();
      if (adapter) device = 'webgpu';
    }

    tokenizer = await AutoTokenizer.from_pretrained(MODEL_ID, { progress_callback: progressCallback });
    model = await AutoModelForCausalLM.from_pretrained(MODEL_ID, {
      dtype: 'q4',
      device,
      progress_callback: progressCallback
    });

    dlBanner.classList.add('hidden');
    statusText.textContent = 'AI Brain: Awake';
    btnInit.classList.add('hidden');

    // Progressive Reveal: Expand layout from single card to full cockpit
    cockpitGrid.classList.remove('stage-initial');
    initialGuideHint.classList.add('hidden');
    thermalCard.classList.remove('hidden');
    outputWrapper.classList.remove('hidden');
    instrumentsPanel.classList.remove('hidden');
    instrumentsPanel.classList.add('reveal-enter');

    // Show Step 2 button with cyan pulse beacon
    btnStream.classList.remove('hidden');
    btnStream.disabled = false;
    btnStream.classList.add('btn-pulse-cyan');
    speedSelect.classList.remove('hidden');
    btnReset.classList.remove('hidden');

    markGoalDone('wake', goalWakeEl, goalStreamEl);

    // Walkthrough #1: Explain what just loaded + compare 49k vs ChatGPT/Gemini/Claude
    triggerWalkthrough({
      id: 'wt_awake',
      tag: 'STEP 1 COMPLETE • AI BRAIN AWAKE',
      title: 'The AI Brain is Now Inside Your Browser!',
      svgHtml: `
        <svg width="320" height="80" viewBox="0 0 320 80" fill="none">
          <rect x="10" y="18" width="90" height="44" rx="6" fill="#18181b" stroke="#38bdf8" stroke-width="1.5"/>
          <text x="55" y="44" fill="#fafafa" font-family="JetBrains Mono" font-size="11" text-anchor="middle">Your Prompt</text>
          <path d="M105 40 H135" stroke="#71717a" stroke-width="2" stroke-dasharray="4 4"/>
          <rect x="140" y="12" width="80" height="56" rx="8" fill="#052e16" stroke="#10b981" stroke-width="2"/>
          <text x="180" y="37" fill="#10b981" font-family="JetBrains Mono" font-size="11" font-weight="bold" text-anchor="middle">AI Brain</text>
          <text x="180" y="52" fill="#a7f3d0" font-family="JetBrains Mono" font-size="9" text-anchor="middle">49k–256k Pieces</text>
          <path d="M225 40 H255" stroke="#71717a" stroke-width="2" stroke-dasharray="4 4"/>
          <rect x="260" y="18" width="50" height="44" rx="6" fill="#18181b" stroke="#c084fc" stroke-width="1.5"/>
          <text x="285" y="44" fill="#d8b4fe" font-family="JetBrains Mono" font-size="11" text-anchor="middle">1 Piece</text>
        </svg>
      `,
      bodyHtml: `
        We just unlocked the <strong>Inside the AI's Head</strong> panel on the right.<br><br>
        Unlike a human, this AI doesn't know what it's going to say at the end of a sentence. It holds an election across its dictionary to pick strictly <em>one word piece at a time</em>.<br><br>
        <small style="color:var(--text-secondary); display:block; background:var(--bg-canvas); padding:0.55rem 0.7rem; border-radius:6px; border:1px solid var(--border-subtle); line-height:1.45;">
          <strong>Pocket AI vs. Big Cloud AI:</strong> This miniature browser AI has a dictionary of <strong>49,152 word pieces</strong>. Giant cloud models use much larger dictionaries—<strong>Claude</strong> uses ~<strong>100,000+</strong> pieces, <strong>ChatGPT (GPT-4o)</strong> uses <strong>200,000</strong> pieces, and <strong>Google Gemini</strong> uses <strong>256,000</strong> pieces!
        </small>
      `,
      buttonLabel: 'Got It — Let’s Watch It Think',
      autoResume: false
    });
  } catch (err) {
    statusText.textContent = 'Load Error';
    btnInit.disabled = false;
  }
});

async function stepGeneration() {
  if (!model || !tokenizer || isBusy) return;
  isBusy = true;

  try {
    if (!currentInputIds) {
      // Ultra-concise system instruction for 1 short sentence
      const chatPrompt = `<|im_start|>system\nYou are a concise AI assistant. Reply in ONE short sentence under 15 words. Stop immediately after the first period.<|im_end|>\n<|im_start|>user\n${promptInput.value.trim()}<|im_end|>\n<|im_start|>assistant\n`;
      const encoded = await tokenizer(chatPrompt);
      currentInputIds = encoded.input_ids;
      promptTokenLength = currentInputIds.dims[1];
      tokenHistory = [];
      liveText.innerHTML = '';
    }

    const seqLen = currentInputIds.dims[1];
    const mask = new Tensor('int64', new BigInt64Array(seqLen).fill(1n), [1, seqLen]);
    const output = await model({ input_ids: currentInputIds, attention_mask: mask });

    const vocabSize = output.logits.dims[2];
    const lastOffset = (seqLen - 1) * vocabSize;
    const logitsSlice = output.logits.data.subarray(lastOffset, lastOffset + vocabSize);

    const topRawLogits = extractTopRawLogits(logitsSlice, 10);
    const temp = parseFloat(tempSlider.value);
    const pool = computeSoftmax(topRawLogits, TOP_K, temp);

    const rand = temp <= 0.05 ? 0 : Math.random();
    let cum = 0;
    let selected = pool[0];
    for (const item of pool) {
      cum += item.prob;
      if (rand <= cum) { selected = item; break; }
    }

    if (selected.token.includes('<|im_end|>') || selected.id === 2 || selected.id === 0) {
      finishGenerationCleanly();
      isBusy = false;
      return;
    }

    const isUpset = selected.id !== pool[0].id;
    const stepIdx = tokenHistory.length;
    const currentSnapshot = Array.from(currentInputIds.data).map(Number);

    // Check if this token is a SUBWORD SPLIT (e.g., "ad" + "ore" -> no leading space, alphabetical continuation)
    const prevTokenObj = stepIdx > 0 ? tokenHistory[stepIdx - 1] : null;
    const isSubwordContinuation = prevTokenObj &&
      !/^\s/.test(selected.token) &&
      /^[a-zA-Z]{2,}$/.test(selected.token) &&
      /[a-zA-Z]$/.test(prevTokenObj.tokenStr);

    let explanation = '';
    if (isSubwordContinuation) {
      const cleanPrev = prevTokenObj.tokenStr.trim();
      explanation = `<strong>Subword Puzzle Piece!</strong> Notice how <code>"${cleanPrev}"</code> and <code>"${selected.token}"</code> glued together to form <strong>"${cleanPrev}${selected.token}"</strong>! AI chops less-common words into smaller reusable pieces called <em>tokens</em>.`;
    } else if (isUpset) {
      explanation = `<strong>Surprise Runner-Up Won!</strong> Even though <code>"${pool[0].token.replace(/\s/g, '·')}"</code> was the #1 favorite (${(pool[0].prob * 100).toFixed(0)}%), the weighted dice roll landed on <code>"${selected.token.replace(/\s/g, '·')}"</code>!`;
    } else {
      explanation = `<strong>Piece #${stepIdx + 1} Elected:</strong> The AI scored its dictionary and gave <code>"${selected.token.replace(/\s/g, '·')}"</code> a <strong>${(selected.prob * 100).toFixed(0)}%</strong> chance to come next.`;
    }

    tokenHistory.push({
      tokenStr: selected.token,
      tokenId: selected.id,
      topLogits: topRawLogits,
      pool,
      prob: selected.prob,
      isUpset,
      roll: rand,
      explanation,
      snapshot: currentSnapshot
    });

    appendTokenSpan(selected.token, stepIdx, isUpset, selected.prob);
    inspectStep(stepIdx);

    if (stepIdx >= 3 && !goals.stream) {
      markGoalDone('stream', goalStreamEl, goalForkEl);
    }

    const nextIds = new BigInt64Array(currentSnapshot.length + 1);
    currentSnapshot.forEach((v, i) => { nextIds[i] = BigInt(v); });
    nextIds[currentSnapshot.length] = BigInt(selected.id);
    currentInputIds = new Tensor('int64', nextIds, [1, nextIds.length]);

    renderTokenMatrix(Array.from(nextIds).map(Number));

    // Check if the AI just completed its first sentence naturally (after at least 6 pieces)
    const endsSentence = /[.!?]\s*$/.test(selected.token);
    if (stepIdx >= 5 && endsSentence) {
      finishGenerationCleanly();
      isBusy = false;
      return;
    }

    // LEARNING MOMENT #1: Pause on Word #1 to explain the Speedometer & Leaderboard
    if (stepIdx === 0) {
      const topWord = pool[0].token.replace(/\s/g, '·');
      const topPct = (pool[0].prob * 100).toFixed(0);
      const paused = triggerWalkthrough({
        id: 'wt_first_word',
        tag: 'LEARNING MOMENT • THE WORD CONTEST',
        title: `How the AI Just Picked Piece #1: "${selected.token.trim() || topWord}"`,
        svgHtml: `
          <svg width="320" height="86" viewBox="0 0 320 86" fill="none">
            <rect x="12" y="12" width="190" height="16" rx="3" fill="#10b981"/>
            <text x="210" y="24" fill="#10b981" font-family="JetBrains Mono" font-size="11" font-weight="bold">#1 "${topWord}" (${topPct}%)</text>
            <rect x="12" y="36" width="75" height="16" rx="3" fill="#38bdf8"/>
            <text x="95" y="48" fill="#a1a1aa" font-family="JetBrains Mono" font-size="10">#2 Runner-Up</text>
            <rect x="12" y="60" width="35" height="16" rx="3" fill="#c084fc"/>
            <text x="55" y="72" fill="#71717a" font-family="JetBrains Mono" font-size="10">#3 Runner-Up</text>
          </svg>
        `,
        bodyHtml: `
          The AI just read your question and scored every piece in its dictionary (called <strong>Logits</strong>).<br><br>
          • Look at the <strong>Word Election Leaderboard</strong> on the right: <code>"${topWord}"</code> got the highest score at <strong>${topPct}%</strong>.<br>
          • Look at the <strong>Certainty Meter</strong> dial: it swings higher when the #1 choice is an obvious slam-dunk, and drops when the AI is torn between options.<br><br>
          Now it glues this piece onto your sentence and repeats the contest!
        `,
        buttonLabel: 'Makes Sense — Keep Watching',
        autoResume: true
      });
      if (paused) { isBusy = false; return; }
    }

    // LEARNING MOMENT #2: Pause the first time a Word is Split into Subword Tokens (e.g., ad + ore)
    if (isSubwordContinuation) {
      const part1 = prevTokenObj.tokenStr.trim();
      const part2 = selected.token;
      const combined = `${part1}${part2}`;

      const paused = triggerWalkthrough({
        id: 'wt_subword_split',
        tag: 'LEARNING MOMENT • SUBWORD PUZZLE PIECES',
        title: `Wait—Why Did "${combined}" Arrive in Two Pieces?`,
        svgHtml: `
          <svg width="320" height="76" viewBox="0 0 320 76" fill="none">
            <rect x="25" y="18" width="95" height="38" rx="6" fill="#18181b" stroke="#38bdf8" stroke-width="2"/>
            <text x="72" y="41" fill="#38bdf8" font-family="JetBrains Mono" font-size="13" font-weight="bold" text-anchor="middle">"${part1}"</text>
            <text x="138" y="42" fill="#fafafa" font-family="JetBrains Mono" font-size="16" font-weight="bold" text-anchor="middle">+</text>
            <rect x="155" y="18" width="95" height="38" rx="6" fill="#18181b" stroke="#10b981" stroke-width="2"/>
            <text x="202" y="41" fill="#10b981" font-family="JetBrains Mono" font-size="13" font-weight="bold" text-anchor="middle">"${part2}"</text>
            <text x="275" y="41" fill="#a1a1aa" font-family="JetBrains Mono" font-size="11" text-anchor="middle">= ${combined}</text>
          </svg>
        `,
        bodyHtml: `
          You just caught one of the biggest secrets of AI!<br><br>
          AI doesn't actually read or write whole English words—it uses numbered puzzle pieces called <strong>Tokens</strong>.<br><br>
          Common words like <code>"blue"</code> get their own single token, but longer or less-common words like <strong>"${combined}"</strong> get built on the fly by gluing smaller pieces (<code>"${part1}"</code> + <code>"${part2}"</code>) together!
        `,
        buttonLabel: 'Aha! Keep Watching',
        autoResume: true
      });
      if (paused) { isBusy = false; return; }
    }

    // LEARNING MOMENT #3: Pause the first time a Surprise Upset happens!
    if (isUpset) {
      const favWord = pool[0].token.replace(/\s/g, '·');
      const favPct = (pool[0].prob * 100).toFixed(0);
      const winWord = selected.token.replace(/\s/g, '·');
      const winPct = (selected.prob * 100).toFixed(0);

      const paused = triggerWalkthrough({
        id: 'wt_upset',
        tag: 'LEARNING MOMENT • SURPRISE DICE ROLL!',
        title: `Plot Twist! A Runner-Up Piece Just Beat #1`,
        svgHtml: `
          <svg width="320" height="75" viewBox="0 0 320 75" fill="none">
            <rect x="15" y="25" width="180" height="22" rx="4" fill="#10b981" opacity="0.35"/>
            <rect x="195" y="25" width="75" height="22" rx="4" fill="#c084fc"/>
            <rect x="270" y="25" width="35" height="22" rx="4" fill="#38bdf8" opacity="0.35"/>
            <path d="M232 8 L232 23" stroke="#fafafa" stroke-width="2.5"/>
            <circle cx="232" cy="8" r="4" fill="#c084fc"/>
            <text x="232" y="64" fill="#d8b4fe" font-family="JetBrains Mono" font-size="10" font-weight="bold" text-anchor="middle">Dice Landed Here! (${winPct}%)</text>
          </svg>
        `,
        bodyHtml: `
          Notice how that piece turned <strong>purple</strong> in the output box!<br><br>
          Even though <code>"${favWord}"</code> was the #1 favorite (${favPct}%), the AI didn't pick it. Because your <strong>Creativity Dial (Temperature)</strong> is turned above 0, the AI rolls a weighted die.<br><br>
          This time, the roll landed on underdog <code>"${winWord}"</code> (${winPct}%)! That's why ChatGPT gives slightly different answers every time you ask the same question.
        `,
        buttonLabel: 'Cool! Keep Watching',
        autoResume: true
      });
      if (paused) { isBusy = false; return; }
    }

    await new Promise(r => setTimeout(r, parseInt(speedSelect.value, 10)));
  } finally {
    isBusy = false;
  }
}

function appendTokenSpan(str, idx, isUpset, prob) {
  const span = document.createElement('span');
  const cls = isUpset ? 'upset' : (prob >= 0.8 ? 'lock' : 'comp');
  span.className = `tok-span ${cls}`;
  span.textContent = str;
  span.addEventListener('click', () => inspectStep(idx));
  liveText.appendChild(span);
}

function inspectStep(idx) {
  const item = tokenHistory[idx];
  if (!item) return;
  replayIndex = idx;

  const livePool = computeSoftmax(item.topLogits, TOP_K, parseFloat(tempSlider.value));
  updateSpeedometer(livePool[0].prob);
  renderLeaderboard(livePool, item.tokenId);

  stepCounter.textContent = `Piece ${idx + 1} / ${tokenHistory.length}`;
  btnPrev.disabled = idx <= 0;
  btnNext.disabled = idx >= tokenHistory.length - 1;

  explainerBadge.textContent = item.isUpset ? 'RUNNER-UP UPSET' : `PIECE #${idx + 1}`;
  rollReadout.textContent = `Dice Roll: ${(item.roll * 100).toFixed(0)}%`;
  explainerBody.innerHTML = item.explanation;

  liveText.querySelectorAll('.tok-span').forEach((s, i) => s.classList.toggle('active', i === idx));
}

// Timeline Forking
btnFork.addEventListener('click', () => {
  if (!selectedCandidateForFork || isBusy) return;
  isPlaying = false;

  const targetStep = replayIndex;
  const oldStep = tokenHistory[targetStep];
  forkOldText.textContent = tokenHistory.map(t => t.tokenStr).join('');
  forkBanner.classList.remove('hidden');

  const baseSnapshot = oldStep.snapshot;
  tokenHistory = tokenHistory.slice(0, targetStep);

  const pool = computeSoftmax(oldStep.topLogits, TOP_K, parseFloat(tempSlider.value));
  tokenHistory.push({
    tokenStr: selectedCandidateForFork.token,
    tokenId: selectedCandidateForFork.id,
    topLogits: oldStep.topLogits,
    pool,
    prob: selectedCandidateForFork.prob,
    isUpset: true,
    roll: 0.5,
    explanation: `<strong>You Changed History!</strong> You forced the AI to pick <code>"${selectedCandidateForFork.token.replace(/\s/g, '·')}"</code>. Watch how every word after this adapts to your choice!`,
    snapshot: baseSnapshot
  });

  liveText.innerHTML = '';
  tokenHistory.forEach((t, i) => appendTokenSpan(t.tokenStr, i, t.isUpset, t.prob));

  const nextIds = new BigInt64Array(baseSnapshot.length + 1);
  baseSnapshot.forEach((v, i) => { nextIds[i] = BigInt(v); });
  nextIds[baseSnapshot.length] = BigInt(selectedCandidateForFork.id);
  currentInputIds = new Tensor('int64', nextIds, [1, nextIds.length]);

  markGoalDone('fork', goalForkEl);
  btnOpenQuiz.classList.add('btn-pulse-emerald');
  startStreamingLoop();
});

async function startStreamingLoop() {
  btnStream.classList.remove('btn-pulse-cyan');
  isPlaying = true;
  btnStream.innerHTML = `<i data-lucide="pause" class="icon-xs"></i><span>Pause</span>`;
  refreshIcons();

  // Capped at 28 tokens max (and stops earlier at first period!)
  for (let i = 0; i < 28; i++) {
    if (!isPlaying) break;
    await stepGeneration();
  }

  if (isPlaying) {
    finishGenerationCleanly();
  }
}

btnStream.addEventListener('click', async () => {
  if (isPlaying) {
    isPlaying = false;
    btnStream.innerHTML = `<i data-lucide="play" class="icon-xs"></i><span>Continue</span>`;
    refreshIcons();
    return;
  }
  await startStreamingLoop();
});

tempSlider.addEventListener('input', (e) => {
  const v = parseFloat(e.target.value);
  tempBadge.textContent = v === 0 ? '0.0 — Strict Robot' : (v <= 0.8 ? `${v.toFixed(1)} — Balanced` : `${v.toFixed(1)} — Wild`);
  if (tokenHistory[replayIndex]) inspectStep(replayIndex);
});

document.querySelectorAll('.preset-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    promptInput.value = btn.dataset.prompt;
    tempSlider.value = btn.dataset.temp;
    tempSlider.dispatchEvent(new Event('input'));
    btnReset.click();
  });
});

btnPrev.addEventListener('click', () => { if (replayIndex > 0) inspectStep(replayIndex - 1); });
btnNext.addEventListener('click', () => { if (replayIndex < tokenHistory.length - 1) inspectStep(replayIndex + 1); });

btnReset.addEventListener('click', () => {
  isPlaying = false;
  currentInputIds = null;
  tokenHistory = [];
  liveText.innerHTML = '';
  forkBanner.classList.add('hidden');
  updateSpeedometer(0);
  speedoPct.textContent = '--%';
  btnStream.innerHTML = `<i data-lucide="play" class="icon-xs"></i><span>Step 2: Watch It Think</span>`;
  refreshIcons();
});

// Quiz Modal Logic with Visual Per-Option Grading
btnOpenQuiz.addEventListener('click', () => quizModal.classList.remove('hidden'));
btnCloseQuiz.addEventListener('click', () => quizModal.classList.add('hidden'));

document.querySelectorAll('.quiz-opt').forEach(opt => {
  opt.addEventListener('click', () => {
    const parent = opt.closest('.quiz-q');
    parent.querySelectorAll('.quiz-opt').forEach(o => {
      o.classList.remove('selected', 'ans-correct', 'ans-wrong');
      const oldTag = o.querySelector('.quiz-status-tag');
      if (oldTag) oldTag.remove();
    });
    const oldHint = parent.querySelector('.q-inline-hint');
    if (oldHint) oldHint.remove();

    opt.classList.add('selected');
  });
});

btnSubmitQuiz.addEventListener('click', () => {
  const questions = document.querySelectorAll('.quiz-q');
  const selected = document.querySelectorAll('.quiz-opt.selected');
  if (selected.length < questions.length) {
    alert('Please select an answer for all 3 questions.');
    return;
  }

  let correct = 0;
  questions.forEach(q => {
    const chosen = q.querySelector('.quiz-opt.selected');
    const oldTag = chosen.querySelector('.quiz-status-tag');
    if (oldTag) oldTag.remove();
    const oldHint = q.querySelector('.q-inline-hint');
    if (oldHint) oldHint.remove();

    const isRight = chosen.dataset.correct === 'true';
    const tag = document.createElement('span');
    tag.className = 'quiz-status-tag';

    if (isRight) {
      correct++;
      chosen.classList.add('ans-correct');
      tag.textContent = '✔ CORRECT';
      chosen.appendChild(tag);
    } else {
      chosen.classList.add('ans-wrong');
      tag.textContent = '✖ NOT QUITE';
      chosen.appendChild(tag);

      if (q.dataset.hint) {
        const hintEl = document.createElement('div');
        hintEl.className = 'q-inline-hint';
        hintEl.innerHTML = `<strong>Hint:</strong> ${q.dataset.hint}`;
        q.appendChild(hintEl);
      }
    }
  });

  quizFeedback.classList.remove('hidden');
  if (correct === 3) {
    completeActivity('mod-01', 150);
    saveQuizScore('mod-01', 100, 100);
    quizFeedback.style.background = 'var(--emerald-dim)';
    quizFeedback.style.color = 'var(--emerald)';
    quizFeedback.innerHTML = `<strong>3/3 Correct! (+250 Total XP)</strong> Unlocking Lab 02 and returning to your Dashboard...`;
    setTimeout(() => { window.location.href = '../../index.html'; }, 1400);
  } else {
    quizFeedback.style.background = 'rgba(239, 68, 68, 0.15)';
    quizFeedback.style.color = '#fca5a5';
    quizFeedback.innerHTML = `<strong>You got ${correct} out of 3 right.</strong> The red answer(s) above need another look—check the inline hint and click a new choice!`;
  }
});