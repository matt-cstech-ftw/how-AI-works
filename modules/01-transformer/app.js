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

// Mission Tracking
const goals = { wake: false, stream: false, fork: false };

// DOM Elements
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

const quizModal = document.getElementById('quiz-modal');
const btnOpenQuiz = document.getElementById('btn-open-quiz');
const btnCloseQuiz = document.getElementById('btn-close-quiz');
const btnSubmitQuiz = document.getElementById('btn-submit-quiz');
const quizFeedback = document.getElementById('quiz-feedback');

if (window.lucide) window.lucide.createIcons();

function markGoalDone(key, el) {
  goals[key] = true;
  el.classList.add('done');
  el.innerHTML = `<i data-lucide="check-circle-2" class="icon-xs"></i><span>${el.textContent.trim()}</span>`;
  if (window.lucide) window.lucide.createIcons();

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

// Wake Up AI Brain
btnInit.addEventListener('click', async () => {
  if (model) return;
  btnInit.disabled = true;
  dlBanner.classList.remove('hidden');
  statusText.textContent = 'Loading AI...';

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
    statusText.textContent = 'AI Brain: Ready';
    btnInit.classList.add('hidden');
    btnStream.disabled = false;
    markGoalDone('wake', goalWakeEl);
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
      const chatPrompt = `<|im_start|>system\nYou are a helpful AI assistant. Answer in 1 or 2 clear sentences.<|im_end|>\n<|im_start|>user\n${promptInput.value.trim()}<|im_end|>\n<|im_start|>assistant\n`;
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
      isPlaying = false;
      btnStream.innerHTML = `<i data-lucide="play" class="icon-xs"></i><span>Watch Again</span>`;
      if (window.lucide) window.lucide.createIcons();
      isBusy = false;
      return;
    }

    const isUpset = selected.id !== pool[0].id;
    const stepIdx = tokenHistory.length;
    const currentSnapshot = Array.from(currentInputIds.data).map(Number);

    const explanation = isUpset
      ? `<strong>Surprise Runner-Up Won!</strong> Even though <code>"${pool[0].token.replace(/\s/g, '·')}"</code> was the #1 favorite (${(pool[0].prob * 100).toFixed(0)}%), the weighted dice roll landed on <code>"${selected.token.replace(/\s/g, '·')}"</code>!`
      : `<strong>Word #${stepIdx + 1} Elected:</strong> The AI scored its dictionary and gave <code>"${selected.token.replace(/\s/g, '·')}"</code> a <strong>${(selected.prob * 100).toFixed(0)}%</strong> chance to come next.`;

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
      markGoalDone('stream', goalStreamEl);
    }

    const nextIds = new BigInt64Array(currentSnapshot.length + 1);
    currentSnapshot.forEach((v, i) => { nextIds[i] = BigInt(v); });
    nextIds[currentSnapshot.length] = BigInt(selected.id);
    currentInputIds = new Tensor('int64', nextIds, [1, nextIds.length]);

    renderTokenMatrix(Array.from(nextIds).map(Number));
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

  stepCounter.textContent = `Word ${idx + 1} / ${tokenHistory.length}`;
  btnPrev.disabled = idx <= 0;
  btnNext.disabled = idx >= tokenHistory.length - 1;

  explainerBadge.textContent = item.isUpset ? 'RUNNER-UP UPSET' : `WORD #${idx + 1}`;
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
  btnStream.click();
});

btnStream.addEventListener('click', async () => {
  if (isPlaying) {
    isPlaying = false;
    btnStream.innerHTML = `<i data-lucide="play" class="icon-xs"></i><span>Continue</span>`;
    if (window.lucide) window.lucide.createIcons();
    return;
  }

  isPlaying = true;
  btnStream.innerHTML = `<i data-lucide="pause" class="icon-xs"></i><span>Pause</span>`;
  if (window.lucide) window.lucide.createIcons();

  for (let i = 0; i < 60; i++) {
    if (!isPlaying) break;
    await stepGeneration();
  }
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
  if (window.lucide) window.lucide.createIcons();
});

// Quiz Modal Logic
btnOpenQuiz.addEventListener('click', () => quizModal.classList.remove('hidden'));
btnCloseQuiz.addEventListener('click', () => quizModal.classList.add('hidden'));

document.querySelectorAll('.quiz-opt').forEach(opt => {
  opt.addEventListener('click', () => {
    const parent = opt.closest('.quiz-q');
    parent.querySelectorAll('.quiz-opt').forEach(o => o.classList.remove('selected'));
    opt.classList.add('selected');
  });
});

btnSubmitQuiz.addEventListener('click', () => {
  const selected = document.querySelectorAll('.quiz-opt.selected');
  if (selected.length < 2) {
    alert('Please select an answer for both questions.');
    return;
  }

  let correct = 0;
  selected.forEach(s => { if (s.dataset.correct === 'true') correct++; });

  quizFeedback.classList.remove('hidden');
  if (correct === 2) {
    completeActivity('mod-01', 150);
    saveQuizScore('mod-01', 100, 100);
    quizFeedback.style.background = 'var(--emerald-dim)';
    quizFeedback.style.color = 'var(--emerald)';
    quizFeedback.innerHTML = `<strong>100% Correct! (+250 Total XP)</strong> Redirecting to your updated Dashboard...`;
    setTimeout(() => { window.location.href = '../../index.html'; }, 1400);
  } else {
    quizFeedback.style.background = 'rgba(239, 68, 68, 0.15)';
    quizFeedback.style.color = '#ef4444';
    quizFeedback.textContent = 'Not quite! Review both answers and try again.';
  }
});