import { AutoTokenizer, AutoModelForCausalLM, env, Tensor } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.3.3';

env.allowLocalModels = false;
env.useBrowserCache = true;

// State
let tokenizer = null;
let model = null;
let loadedModelId = null;
let currentInputIds = null;
let promptTokenLength = 0;
let tokenHistory = []; 
// Each entry: { tokenStr, tokenId, topLogits: [{id, token, rawLogit}], candidatePool, explanation, isDeviation, topCandidate, rollValue, fullInputIdsSnapshot }
let isPlaying = false;
let isBusy = false;
let shownMilestones = new Set();
let replayIndex = 0;
let selectedCandidateForFork = null;

// DOM Elements
const modal = document.getElementById("welcome-modal");
const btnModalAgree = document.getElementById("btn-modal-agree");
const modelSelect = document.getElementById("model-select");
const btnShare = document.getElementById("btn-share");
const promptInput = document.getElementById("prompt-input");
const tempSlider = document.getElementById("temp-slider");
const tempVal = document.getElementById("temp-val");
const tempExplainer = document.getElementById("temp-explainer");
const topkSlider = document.getElementById("topk-slider");
const topkVal = document.getElementById("topk-val");
const speedSelect = document.getElementById("speed-select");
const btnInit = document.getElementById("btn-init");
const btnStream = document.getElementById("btn-stream");
const btnReset = document.getElementById("btn-reset");
const liveText = document.getElementById("live-text");
const tokenChips = document.getElementById("token-chips");
const tokenCountBadge = document.getElementById("token-count-badge");
const probChart = document.getElementById("probability-chart");
const outputHint = document.getElementById("output-footer-hint");
const statusDot = document.getElementById("status-dot");
const statusText = document.getElementById("status-text");
const progressBarContainer = document.getElementById("download-progress-bar");
const progressFill = document.getElementById("progress-fill");
const progressStatus = document.getElementById("progress-status");
const progressPct = document.getElementById("progress-pct");

// Roulette Visualizer
const rouletteContainer = document.getElementById("roulette-container");
const rouletteStrip = document.getElementById("roulette-strip");
const rouletteNeedle = document.getElementById("roulette-needle");
const rouletteRollText = document.getElementById("roulette-roll-text");

// Fork Comparison Banner
const forkBanner = document.getElementById("fork-comparison-banner");
const forkOldText = document.getElementById("fork-old-text");

// Unified Explainer
const unifiedExplainer = document.getElementById("unified-explainer");
const explainerBadge = document.getElementById("explainer-badge");
const entropyReadout = document.getElementById("entropy-readout");
const explainerContent = document.getElementById("explainer-content");
const explainerActions = document.getElementById("explainer-actions");
const btnContinueMilestone = document.getElementById("btn-continue-milestone");
const btnForkSelection = document.getElementById("btn-fork-selection");

// Pipeline Stepper
const badgePrefill = document.getElementById("badge-prefill");
const badgeAttention = document.getElementById("badge-attention");
const badgeLogits = document.getElementById("badge-logits");
const badgeSample = document.getElementById("badge-sample");

// Completion & Replay
const completionSummary = document.getElementById("completion-summary");
const summaryNarrative = document.getElementById("summary-narrative");
const statTokens = document.getElementById("stat-tokens");
const statDeviations = document.getElementById("stat-deviations");
const statAvgConf = document.getElementById("stat-avg-conf");
const btnCopyReceipt = document.getElementById("btn-copy-receipt");
const replayControls = document.getElementById("replay-controls");
const btnReplayPrev = document.getElementById("btn-replay-prev");
const btnReplayNext = document.getElementById("btn-replay-next");
const replayStepIndicator = document.getElementById("replay-step-indicator");
const toast = document.getElementById("toast");

const ROULETTE_COLORS = ['#34d399', '#38bdf8', '#c084fc', '#fbbf24', '#f87171', '#a3e635', '#fb923c', '#818cf8', '#2dd4bf', '#e879f9'];

// URL Parameter Restoration
function loadUrlParams() {
  const params = new URLSearchParams(window.location.search);
  if (params.has("prompt")) promptInput.value = params.get("prompt");
  if (params.has("temp")) {
    tempSlider.value = params.get("temp");
    updateTemperatureUI(parseFloat(tempSlider.value));
  }
}
loadUrlParams();

function showToast(msg) {
  toast.textContent = msg;
  toast.classList.remove("hidden");
  setTimeout(() => toast.classList.add("hidden"), 2600);
}

// Dismiss Welcome Modal
if (btnModalAgree && modal) {
  btnModalAgree.addEventListener("click", () => modal.classList.add("hidden"));
}

// Preset Experiment Pills
document.querySelectorAll(".preset-pill").forEach(pill => {
  pill.addEventListener("click", () => {
    promptInput.value = pill.dataset.prompt;
    const presetTemp = parseFloat(pill.dataset.temp);
    tempSlider.value = presetTemp;
    updateTemperatureUI(presetTemp);
    resetState();
  });
});

// Live Temperature Slider & Real-Time Softmax Recalculation
function updateTemperatureUI(temp) {
  let label = "Balanced";
  let desc = "";

  if (temp <= 0.1) {
    label = "0.0 — Greedy Lock";
    desc = `<strong>Ice-Cold Deterministic:</strong> The #1 highest-scoring token captures ~100% of the odds. Zero randomness—identical to how coding & math models lock in facts.`;
  } else if (temp <= 0.5) {
    label = `${temp.toFixed(1)} — Focused`;
    desc = `<strong>Sharpened Curve:</strong> Divides logits by ${temp.toFixed(1)}, amplifying the gap between the front-runner and runner-ups. Safe and predictable.`;
  } else if (temp <= 0.9) {
    label = `${temp.toFixed(1)} — Balanced`;
    desc = `<strong>Default Chat Setting:</strong> The sweet spot used by ChatGPT & Gemini. The #1 word is favored, but strong runner-ups regularly win the dice roll.`;
  } else {
    label = `${temp.toFixed(1)} — Wild / Creative`;
    desc = `<strong>Flattened Distribution:</strong> Dividing logits by ${temp.toFixed(1)} compresses the lead, giving dark-horse tokens a huge chance to win. Increases creativity (and hallucinations!).`;
  }

  tempVal.textContent = label;
  tempExplainer.innerHTML = desc;

  // LIVE RECALCULATION: If inspecting a word, dynamically recompute Softmax on its raw logits!
  if (tokenHistory.length > 0 && tokenHistory[replayIndex]) {
    const step = tokenHistory[replayIndex];
    const topK = parseInt(topkSlider.value, 10);
    const recalcPool = computeSoftmaxFromRaw(step.topLogits, topK, temp);
    renderProbChart(recalcPool, step.tokenId, step.rollValue);
  }
}

tempSlider.addEventListener("input", (e) => {
  updateTemperatureUI(parseFloat(e.target.value));
});

topkSlider.addEventListener("input", (e) => {
  const k = parseInt(e.target.value, 10);
  topkVal.textContent = `Top ${k} Words`;
  if (tokenHistory.length > 0 && tokenHistory[replayIndex]) {
    const step = tokenHistory[replayIndex];
    const temp = parseFloat(tempSlider.value);
    const recalcPool = computeSoftmaxFromRaw(step.topLogits, k, temp);
    renderProbChart(recalcPool, step.tokenId, step.rollValue);
  }
});

// Handle Model Switching
modelSelect.addEventListener("change", () => {
  if (loadedModelId && loadedModelId !== modelSelect.value) {
    model = null;
    tokenizer = null;
    btnInit.style.display = "inline-flex";
    btnInit.disabled = false;
    btnInit.textContent = "⚡ Load Selected Model";
    btnStream.disabled = true;
    statusDot.classList.remove("ready");
    statusText.textContent = "Model Switched — Click Load";
  }
});

async function checkWebGPUSupport() {
  if (!navigator.gpu) return false;
  try {
    const adapter = await navigator.gpu.requestAdapter();
    return !!adapter;
  } catch {
    return false;
  }
}

// Initialize Neural Engine
btnInit.addEventListener("click", async () => {
  if (model) return;

  const MODEL_ID = modelSelect.value;
  btnInit.disabled = true;
  btnInit.textContent = "⏳ Loading Neural Weights...";
  progressBarContainer.classList.remove("hidden");
  statusText.textContent = "Detecting WebGPU / WASM...";

  const progressCallback = (info) => {
    if (info.status === 'progress' && info.total) {
      const pct = Math.round((info.loaded / info.total) * 100);
      progressFill.style.width = `${pct}%`;
      progressPct.textContent = `${pct}%`;
      progressStatus.textContent = `Downloading ${info.file || 'weights'}...`;
    }
  };

  try {
    const hasWebGPU = await checkWebGPUSupport();
    const targetDevice = hasWebGPU ? 'webgpu' : 'wasm';
    statusText.textContent = `Compiling on ${targetDevice.toUpperCase()}...`;

    tokenizer = await AutoTokenizer.from_pretrained(MODEL_ID, { progress_callback: progressCallback });
    model = await AutoModelForCausalLM.from_pretrained(MODEL_ID, {
      dtype: 'q4',
      device: targetDevice,
      progress_callback: progressCallback
    });

    loadedModelId = MODEL_ID;
    onEngineReady(targetDevice);
  } catch (err) {
    console.warn("WebGPU load failed, falling back to CPU WASM:", err);
    try {
      statusText.textContent = "Falling back to CPU WASM...";
      tokenizer = await AutoTokenizer.from_pretrained(MODEL_ID, { progress_callback: progressCallback });
      model = await AutoModelForCausalLM.from_pretrained(MODEL_ID, {
        dtype: 'q4',
        device: 'wasm',
        progress_callback: progressCallback
      });
      loadedModelId = MODEL_ID;
      onEngineReady('wasm');
    } catch (fallbackErr) {
      statusText.textContent = "Load Error";
      explainerContent.innerHTML = `<span style="color: #f87171;">Failed to initialize model: ${fallbackErr.message}</span>`;
      btnInit.disabled = false;
      btnInit.textContent = "Retry Initialization";
    }
  }
});

function onEngineReady(device) {
  statusDot.classList.add("ready");
  const shortName = modelSelect.value.includes("360M") ? "SmolLM2-360M" : "SmolLM2-135M";
  statusText.textContent = `${shortName} (${device.toUpperCase()})`;
  progressBarContainer.classList.add("hidden");
  btnInit.style.display = "none";
  btnStream.disabled = false;

  explainerBadge.textContent = "Engine Online";
  explainerBadge.className = "badge badge-success";
  explainerContent.innerHTML = `<strong>Neural Network Ready!</strong> Pick an experiment pill on the left or type your own prompt, then click <strong>▶ Run Guided Walkthrough</strong>.`;
}

function formatChatPrompt(userText) {
  return `<|im_start|>system\nYou are a clear, concise, and intelligent AI assistant. Answer the user's prompt directly in 2 to 3 complete, engaging sentences.<|im_end|>\n<|im_start|>user\n${userText}<|im_end|>\n<|im_start|>assistant\n`;
}

// Extract top 15 raw logits so the user can dynamically drag Top-K and Temperature anytime
function extractTopRawLogits(logitsSlice, maxPool = 15) {
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

// Compute Softmax probabilities from raw logits given Temperature and Top-K
function computeSoftmaxFromRaw(topRawLogits, topK, temperature) {
  const sliced = topRawLogits.slice(0, topK);
  const temp = Math.max(0.02, parseFloat(temperature));

  const scaled = sliced.map(c => c.rawLogit / temp);
  const maxScaled = Math.max(...scaled);
  const exps = scaled.map(s => Math.exp(s - maxScaled));
  const sumExp = exps.reduce((a, b) => a + b, 0);

  return sliced.map((c, idx) => ({
    id: c.id,
    token: c.token,
    rawLogit: c.rawLogit,
    prob: exps[idx] / sumExp
  }));
}

// Render Clean Context Tokens using exact slice index (Prevents "ass" + "istant" subword leakage)
function renderCleanTokens(tokenIds) {
  tokenChips.innerHTML = "";
  const userAndGeneratedIds = tokenIds.slice(Math.max(0, promptTokenLength - 12));
  let visibleCount = 0;

  userAndGeneratedIds.forEach(id => {
    const textChunk = tokenizer.decode([id]);
    if (
      textChunk.includes("<|im_start|>") ||
      textChunk.includes("<|im_end|>") ||
      textChunk === "ass" ||
      textChunk === "istant" ||
      textChunk === "user"
    ) return;

    visibleCount++;
    const chip = document.createElement("div");
    chip.className = "token-chip";
    chip.innerHTML = `<span>${textChunk.replace(/\s/g, "·")}</span><span class="tok-id">#${id}</span>`;
    tokenChips.appendChild(chip);
  });

  tokenCountBadge.textContent = `${tokenIds.length} Context Tokens`;
  tokenChips.scrollTop = tokenChips.scrollHeight;
}

// Render Candidate Chart + Roulette Strip
function renderProbChart(candidatePool, chosenId, rollValue = null) {
  probChart.innerHTML = "";
  rouletteStrip.innerHTML = "";
  btnForkSelection.classList.add("hidden");
  selectedCandidateForFork = null;

  const topId = candidatePool[0]?.id;

  candidatePool.forEach((item, idx) => {
    const pct = (item.prob * 100).toFixed(1);
    const row = document.createElement("div");
    row.className = "prob-row";
    const isWinner = item.id === chosenId;
    const isUpset = isWinner && chosenId !== topId;

    const color = ROULETTE_COLORS[idx % ROULETTE_COLORS.length];

    row.innerHTML = `
      <div class="prob-label" title="Token ID #${item.id} (Raw Logit: ${item.rawLogit.toFixed(2)})">
        <span style="color:${color}">●</span> ${item.token.replace(/\s/g, "·")}
      </div>
      <div class="prob-bar-track">
        <div class="prob-bar-fill ${isUpset ? 'upset-winner' : (isWinner ? 'selected' : '')}" style="width: ${pct}%; background: ${isWinner ? '' : color}"></div>
      </div>
      <div>${pct}%</div>
    `;

    row.addEventListener("click", () => {
      document.querySelectorAll(".prob-row").forEach(r => r.classList.remove("candidate-selected"));
      row.classList.add("candidate-selected");
      selectedCandidateForFork = item;
      btnForkSelection.classList.remove("hidden");
      btnForkSelection.textContent = `🔀 Force "${item.token.trim() || 'space'}" & Fork Timeline`;
    });

    probChart.appendChild(row);

    // Add segment to Roulette Strip
    const seg = document.createElement("div");
    seg.className = "roulette-seg";
    seg.style.width = `${item.prob * 100}%`;
    seg.style.background = color;
    seg.title = `${item.token}: ${pct}%`;
    rouletteStrip.appendChild(seg);
  });

  if (rollValue !== null) {
    rouletteContainer.classList.remove("hidden");
    rouletteNeedle.style.left = `${Math.min(99, Math.max(1, rollValue * 100))}%`;
    rouletteRollText.textContent = `Dice Spin: ${(rollValue * 100).toFixed(1)}%`;
  }
}

// Entropy / Margin-based Dynamic Narrative Engine (Zero repetitive boilerplate)
function analyzeTokenGeneration(selected, candidatePool, stepIndex, temp, rollValue) {
  const top1 = candidatePool[0];
  const top2 = candidatePool[1] || { prob: 0, token: "" };
  const isDeviation = selected.id !== top1.id;
  const margin = top1.prob - top2.prob;
  const cleanTok = selected.token.replace(/\s/g, "·");

  let stateTag = "";
  let rationale = "";

  if (stepIndex === 0) {
    stateTag = "Stage 1: Prompt Prefill";
    rationale = `
      <strong>How the Model "Starts Thinking":</strong><br>
      Before generating word #1, the model processed all your prompt tokens in parallel. Self-attention layers linked your question structure to conversational openings, giving <code>"${top1.token.replace(/\s/g, '·')}"</code> (${(top1.prob * 100).toFixed(1)}%) the early lead.
    `;
  } else if (isDeviation) {
    stateTag = "🎲 Temperature Upset!";
    rationale = `
      <strong>Why Did the Runner-Up Win?</strong><br>
      The #1 favorite was actually <code>"${top1.token.replace(/\s/g, '·')}"</code> at <strong>${(top1.prob * 100).toFixed(1)}%</strong>. However, the sampling roulette spun <strong>${(rollValue * 100).toFixed(1)}%</strong>, landing inside the bucket for <code>"${cleanTok}"</code> (${(selected.prob * 100).toFixed(1)}%). This single dice roll permanently alters every word that follows!
    `;
  } else if (top1.prob >= 0.82) {
    stateTag = "🔒 High-Certainty Lock-In";
    rationale = `
      <strong>Syntactic & Idiomatic Gravity:</strong><br>
      Notice how <code>"${cleanTok}"</code> captured <strong>${(top1.prob * 100).toFixed(1)}%</strong> of the probability mass, leaving almost zero room for alternatives like <code>"${top2.token.replace(/\s/g, '·')}"</code> (${(top2.prob * 100).toFixed(1)}%). Grammar rules and training data idioms heavily locked this slot in place.
    `;
  } else if (margin < 0.14) {
    stateTag = "⚖️ Tight 50/50 Crossroads";
    rationale = `
      <strong>Competing Semantic Paths:</strong><br>
      The neural network was genuinely split here! <code>"${top1.token.replace(/\s/g, '·')}"</code> (${(top1.prob * 100).toFixed(1)}%) barely edged out <code>"${top2.token.replace(/\s/g, '·')}"</code> (${(top2.prob * 100).toFixed(1)}%). Click the runner-up bar below to see how choosing the other word changes the rest of the answer.
    `;
  } else {
    stateTag = "📊 Standard Logit Election";
    rationale = `
      <strong>Contextual Progression:</strong><br>
      Scanning the active context window, self-attention favored <code>"${cleanTok}"</code> at <strong>${(selected.prob * 100).toFixed(1)}%</strong> over <code>"${top2.token.replace(/\s/g, '·')}"</code> (${(top2.prob * 100).toFixed(1)}%). The winning token is now glued onto the prompt buffer for step #${stepIndex + 2}.
    `;
  }

  return { rationale, isDeviation, topCandidate: top1, stateTag };
}

function highlightStepper(stage) {
  [badgePrefill, badgeAttention, badgeLogits, badgeSample].forEach(b => b.classList.remove("highlight"));
  if (stage === "prefill") badgePrefill.classList.add("highlight");
  if (stage === "attention") badgeAttention.classList.add("highlight");
  if (stage === "logits") badgeLogits.classList.add("highlight");
  if (stage === "sample") badgeSample.classList.add("highlight");
}

function showMilestone(badgeText, htmlContent) {
  isPlaying = false;
  btnStream.textContent = "⏩ Resume Walkthrough";

  unifiedExplainer.classList.add("milestone");
  explainerBadge.textContent = badgeText;
  explainerBadge.className = "badge badge-purple";
  explainerContent.innerHTML = htmlContent;
  explainerActions.classList.remove("hidden");
}

btnContinueMilestone.addEventListener("click", () => {
  explainerActions.classList.add("hidden");
  unifiedExplainer.classList.remove("milestone");
  if (!isPlaying) btnStream.click();
});

// Create Interactive Token Span in Output Box
function createTokenSpan(tokenStr, stepIdx, isDeviation, prob) {
  const span = document.createElement("span");
  let colorClass = "tok-comp";
  if (isDeviation) colorClass = "tok-upset";
  else if (prob >= 0.75) colorClass = "tok-lock";

  span.className = `new-token ${colorClass}`;
  span.textContent = tokenStr;
  span.title = isDeviation ? `🎲 Temperature Upset (${(prob * 100).toFixed(1)}%) — Click to inspect` : `Probability: ${(prob * 100).toFixed(1)}% — Click to inspect`;
  span.addEventListener("click", () => inspectHistoryStep(stepIdx));
  return span;
}

// Timeline Forking Handler (Properly synchronizes tokenHistory & compares timelines)
btnForkSelection.addEventListener("click", async () => {
  if (!selectedCandidateForFork || isBusy) return;

  isPlaying = false;
  const targetStep = replayIndex;
  const chosenCandidate = selectedCandidateForFork;
  const oldStepData = tokenHistory[targetStep];

  // Save old full text for side-by-side comparison banner
  const previousFullText = tokenHistory.map(t => t.tokenStr).join("");
  forkOldText.textContent = previousFullText;
  forkBanner.classList.remove("hidden");

  // Truncate history prior to targetStep
  const baseInputArray = oldStepData.fullInputIdsSnapshot;
  tokenHistory = tokenHistory.slice(0, targetStep);

  // Record the manually forced token as the new entry at targetStep
  const temp = parseFloat(tempSlider.value);
  const topK = parseInt(topkSlider.value, 10);
  const candidatePool = computeSoftmaxFromRaw(oldStepData.topLogits, topK, temp);

  const forcedRationale = `
    <strong>🔀 Manual Timeline Fork:</strong><br>
    You overrode the model's original choice and forced <code>"${chosenCandidate.token.replace(/\s/g, '·')}"</code> (${(chosenCandidate.prob * 100).toFixed(1)}%). Watch how every subsequent word adapts to your new reality!
  `;

  tokenHistory.push({
    tokenStr: chosenCandidate.token,
    tokenId: chosenCandidate.id,
    topLogits: oldStepData.topLogits,
    candidatePool,
    explanation: forcedRationale,
    stateTag: "🔀 User Forked Token",
    isDeviation: chosenCandidate.id !== candidatePool[0].id,
    topCandidate: candidatePool[0],
    rollValue: 0.5,
    fullInputIdsSnapshot: baseInputArray
  });

  // Rebuild DOM Output Spans
  liveText.innerHTML = "";
  tokenHistory.forEach((t, idx) => {
    const winnerProb = t.candidatePool.find(c => c.id === t.tokenId)?.prob || 0.5;
    liveText.appendChild(createTokenSpan(t.tokenStr, idx, t.isDeviation, winnerProb));
  });

  // Update Tensor with forced token appended
  const nextArr = new BigInt64Array(baseInputArray.length + 1);
  for (let i = 0; i < baseInputArray.length; i++) {
    nextArr[i] = BigInt(baseInputArray[i]);
  }
  nextArr[baseInputArray.length] = BigInt(chosenCandidate.id);
  currentInputIds = new Tensor('int64', nextArr, [1, nextArr.length]);

  btnForkSelection.classList.add("hidden");
  completionSummary.classList.add("hidden");

  // Resume generation down the new branch
  btnStream.click();
});

// Single Autoregressive Step
async function stepModel() {
  if (!model || !tokenizer || isBusy) return;
  isBusy = true;

  try {
    const rawPrompt = promptInput.value.trim();
    if (!rawPrompt) {
      isBusy = false;
      return;
    }

    if (!currentInputIds) {
      highlightStepper("prefill");
      const formatted = formatChatPrompt(rawPrompt);
      const encoded = await tokenizer(formatted);
      currentInputIds = encoded.input_ids;
      promptTokenLength = currentInputIds.dims[1];
      tokenHistory = [];
      liveText.innerHTML = "";
      shownMilestones.clear();
      replayControls.classList.add("hidden");
      completionSummary.classList.add("hidden");
      outputHint.classList.add("hidden");
    }

    const currentTokensArray = Array.from(currentInputIds.data).map(Number);
    renderCleanTokens(currentTokensArray);

    highlightStepper("attention");

    const seqLength = currentInputIds.dims[1];
    const maskData = new BigInt64Array(seqLength).fill(1n);
    const attentionMask = new Tensor('int64', maskData, [1, seqLength]);

    const output = await model({
      input_ids: currentInputIds,
      attention_mask: attentionMask
    });

    highlightStepper("logits");

    const vocabSize = output.logits.dims[2];
    const lastOffset = (seqLength - 1) * vocabSize;
    const logitsSlice = output.logits.data.subarray(lastOffset, lastOffset + vocabSize);

    const topRawLogits = extractTopRawLogits(logitsSlice, 15);
    const temp = parseFloat(tempSlider.value);
    const topK = parseInt(topkSlider.value, 10);
    const candidatePool = computeSoftmaxFromRaw(topRawLogits, topK, temp);

    highlightStepper("sample");

    // Roulette Wheel Selection
    const rand = temp <= 0.05 ? 0.0 : Math.random();
    let cumulative = 0;
    let selected = candidatePool[0];

    for (const item of candidatePool) {
      cumulative += item.prob;
      if (rand <= cumulative) {
        selected = item;
        break;
      }
    }

    // Check for End-of-Sequence token
    if (selected.token.includes("<|im_end|>") || selected.id === 2 || selected.id === 0) {
      concludeGeneration("eos");
      isBusy = false;
      return;
    }

    renderProbChart(candidatePool, selected.id, rand);

    const stepIdx = tokenHistory.length;
    const { rationale, isDeviation, topCandidate, stateTag } = analyzeTokenGeneration(selected, candidatePool, stepIdx, temp, rand);

    explainerBadge.textContent = `Word #${stepIdx + 1} • ${stateTag}`;
    explainerBadge.className = isDeviation ? "badge badge-purple" : "badge";
    entropyReadout.textContent = `Top Odds: ${(topCandidate.prob * 100).toFixed(1)}%`;
    explainerContent.innerHTML = rationale;

    // Educational Milestones (Only pause on Slow/Normal pace)
    const pace = parseInt(speedSelect.value, 10);
    if (pace >= 300) {
      if (stepIdx === 0 && !shownMilestones.has("m_first")) {
        shownMilestones.add("m_first");
        showMilestone(
          "Milestone 1: Prompt Prefill & First Election",
          `Look at the probability chart below! Just like ChatGPT or Gemini, this model never plans a full sentence in advance. It translated your prompt into vectors and scored its dictionary for slot #1. <code>"${selected.token.replace(/\s/g, '·')}"</code> won the opening election.`
        );
      } else if (isDeviation && !shownMilestones.has("m_upset")) {
        shownMilestones.add("m_upset");
        showMilestone(
          "Milestone 2: Temperature Upset!",
          `Look at the <strong>Sampling Roulette Strip</strong> below! Even though <code>"${topCandidate.token.replace(/\s/g, '·')}"</code> was the #1 favorite (${(topCandidate.prob * 100).toFixed(1)}%), the random needle landed on runner-up <code>"${selected.token.replace(/\s/g, '·')}"</code>. Try dragging the <strong>Temperature slider</strong> right now to see how it reshapes the candidate bars!`
        );
      }
    }

    tokenHistory.push({
      tokenStr: selected.token,
      tokenId: selected.id,
      topLogits: topRawLogits,
      candidatePool,
      explanation: rationale,
      stateTag,
      isDeviation,
      topCandidate,
      rollValue: rand,
      fullInputIdsSnapshot: currentTokensArray
    });

    replayIndex = stepIdx;
    replayControls.classList.remove("hidden");
    outputHint.classList.remove("hidden");
    replayStepIndicator.textContent = `Word ${stepIdx + 1} / ${tokenHistory.length}`;

    liveText.appendChild(createTokenSpan(selected.token, stepIdx, isDeviation, selected.prob));
    liveText.scrollTop = liveText.scrollHeight;

    // Append chosen token back into input_ids for next pass
    const nextArr = new BigInt64Array(currentTokensArray.length + 1);
    for (let i = 0; i < currentTokensArray.length; i++) {
      nextArr[i] = BigInt(currentTokensArray[i]);
    }
    nextArr[currentTokensArray.length] = BigInt(selected.id);

    currentInputIds = new Tensor('int64', nextArr, [1, currentTokensArray.length + 1]);
    renderCleanTokens(Array.from(nextArr).map(Number));

  } catch (err) {
    console.error("Inference error:", err);
    explainerContent.innerHTML = `<span style="color: #f87171;">Inference error: ${err.message}</span>`;
  } finally {
    isBusy = false;
  }
}

function concludeGeneration(reason = "eos") {
  isPlaying = false;
  btnStream.textContent = "▶ Run Guided Walkthrough";
  unifiedExplainer.classList.remove("milestone");
  explainerActions.classList.add("hidden");

  const totalTokens = tokenHistory.length;
  const deviations = tokenHistory.filter(t => t.isDeviation).length;
  const avgConf = (tokenHistory.reduce((acc, t) => {
    const w = t.candidatePool.find(c => c.id === t.tokenId);
    return acc + (w ? w.prob : 0.5);
  }, 0) / (totalTokens || 1) * 100).toFixed(1);

  statTokens.textContent = totalTokens;
  statDeviations.textContent = deviations;
  statAvgConf.textContent = `${avgConf}%`;

  summaryNarrative.innerHTML = `
    The model finished its response (${reason === 'eos' ? 'emitted its End-of-Sequence token' : 'reached token cap'}). 
    Across <strong>${totalTokens}</strong> autoregressive passes, Temperature caused <strong>${deviations}</strong> runner-up upsets. 
    <strong>Click any colored word in the output box</strong> to inspect its candidate election or fork the timeline!
  `;

  completionSummary.classList.remove("hidden");
}

function inspectHistoryStep(index) {
  const step = tokenHistory[index];
  if (!step) return;

  replayIndex = index;
  replayStepIndicator.textContent = `Word ${index + 1} / ${tokenHistory.length}`;

  const temp = parseFloat(tempSlider.value);
  const topK = parseInt(topkSlider.value, 10);
  const livePool = computeSoftmaxFromRaw(step.topLogits, topK, temp);

  renderProbChart(livePool, step.tokenId, step.rollValue);
  explainerBadge.textContent = `Inspecting Word #${index + 1} • ${step.stateTag}`;
  explainerBadge.className = step.isDeviation ? "badge badge-purple" : "badge";
  entropyReadout.textContent = `Rolled: ${(step.rollValue * 100).toFixed(1)}%`;
  explainerContent.innerHTML = step.explanation;

  const allSpans = liveText.querySelectorAll('.new-token');
  allSpans.forEach((span, i) => {
    span.classList.toggle('active-inspect', i === index);
  });
}

btnReplayPrev.addEventListener("click", () => {
  if (replayIndex > 0) inspectHistoryStep(replayIndex - 1);
});

btnReplayNext.addEventListener("click", () => {
  if (replayIndex < tokenHistory.length - 1) inspectHistoryStep(replayIndex + 1);
});

function resetState() {
  isPlaying = false;
  isBusy = false;
  btnStream.textContent = "▶ Run Guided Walkthrough";
  currentInputIds = null;
  tokenHistory = [];
  shownMilestones.clear();
  completionSummary.classList.add("hidden");
  replayControls.classList.add("hidden");
  rouletteContainer.classList.add("hidden");
  forkBanner.classList.add("hidden");
  outputHint.classList.add("hidden");
  explainerActions.classList.add("hidden");
  btnForkSelection.classList.add("hidden");
  unifiedExplainer.classList.remove("milestone");
  liveText.innerHTML = "";
  probChart.innerHTML = '<div class="empty-placeholder">Candidate leaderboard will animate here during generation.</div>';
  explainerBadge.textContent = model ? "Ready to Run" : "Waiting for Engine";
  explainerBadge.className = "badge badge-success";
  entropyReadout.textContent = "";
  explainerContent.innerHTML = 'Prompt ready. Click <strong>▶ Run Guided Walkthrough</strong> to trace every token election.';
  tokenChips.innerHTML = '<div class="empty-placeholder">Token IDs will populate here once inference begins.</div>';
  tokenCountBadge.textContent = "0 Tokens";
  [badgePrefill, badgeAttention, badgeLogits, badgeSample].forEach(b => b.classList.remove("highlight"));
}

btnStream.addEventListener("click", async () => {
  if (isPlaying) {
    isPlaying = false;
    btnStream.textContent = "▶ Resume Walkthrough";
    return;
  }

  // If previous run finished, reset before starting fresh
  if (!completionSummary.classList.contains("hidden")) {
    resetState();
  }

  isPlaying = true;
  btnStream.textContent = "⏸ Pause Walkthrough";

  for (let i = 0; i < 85; i++) {
    if (!isPlaying) break;
    await stepModel();
    const delay = parseInt(speedSelect.value, 10);
    await new Promise(r => setTimeout(r, delay));
  }

  if (isPlaying) {
    concludeGeneration("limit");
  }
});

btnReset.addEventListener("click", () => {
  resetState();
  promptInput.focus();
});

// Share Permalink Button
btnShare.addEventListener("click", () => {
  const url = new URL(window.location.href);
  url.searchParams.set("prompt", promptInput.value.trim());
  url.searchParams.set("temp", tempSlider.value);
  navigator.clipboard.writeText(url.toString());
  showToast("🔗 Shareable experiment link copied to clipboard!");
});

// Copy Telemetry Receipt
btnCopyReceipt.addEventListener("click", () => {
  const outputStr = tokenHistory.map(t => t.tokenStr).join("");
  const receipt = `⚡ Inside The Transformer — Neural Telemetry Receipt\nPrompt: "${promptInput.value.trim()}"\nOutput: "${outputStr.trim()}"\nTokens: ${statTokens.textContent} | Temp Upsets: ${statDeviations.textContent} | Avg Confidence: ${statAvgConf.textContent}\nTry it live: ${window.location.origin}${window.location.pathname}`;
  navigator.clipboard.writeText(receipt);
  showToast("📋 Neural Receipt copied to clipboard!");
});