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
let isPlaying = false;
let isBusy = false;
let shownMilestones = new Set();
let replayIndex = 0;
let selectedCandidateForFork = null;
let idleRamTimer = null;

// DOM Elements
const modal = document.getElementById("welcome-modal");
const btnModalAgree = document.getElementById("btn-modal-agree");
const modelSelect = document.getElementById("model-select");
const btnUnloadRam = document.getElementById("btn-unload-ram");
const btnClearCache = document.getElementById("btn-clear-cache");
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
const tokenAccordion = document.getElementById("token-accordion");
const tokenCountBadge = document.getElementById("token-count-badge");
const probChart = document.getElementById("probability-chart");
const outputHint = document.getElementById("output-footer-hint");
const statusDot = document.getElementById("status-dot");
const statusText = document.getElementById("status-text");
const progressBarContainer = document.getElementById("download-progress-bar");
const progressFill = document.getElementById("progress-fill");
const progressStatus = document.getElementById("progress-status");
const progressPct = document.getElementById("progress-pct");

// Collapsible Mobile Theater Mode Drawer
const setupDrawer = document.getElementById("setup-drawer");
const btnToggleDrawer = document.getElementById("btn-toggle-drawer");
const collapsedPromptBar = document.getElementById("collapsed-prompt-bar");
const cpPromptPreview = document.getElementById("cp-prompt-preview");
const cpTempPreview = document.getElementById("cp-temp-preview");
const liveStageAnchor = document.getElementById("live-stage-anchor");

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

// Collapse Token Accordion by default on narrow phone screens
if (window.innerWidth < 768 && tokenAccordion) {
  tokenAccordion.removeAttribute("open");
}

function showToast(msg) {
  toast.textContent = msg;
  toast.classList.remove("hidden");
  setTimeout(() => toast.classList.add("hidden"), 2800);
}

// Collapse/Expand Setup Drawer for clean mobile focus
function setDrawerCollapsed(collapse) {
  if (collapse) {
    setupDrawer.classList.add("collapsed");
    btnToggleDrawer.classList.remove("hidden");
    collapsedPromptBar.classList.remove("hidden");
    cpPromptPreview.textContent = `"${promptInput.value.trim()}"`;
    cpTempPreview.textContent = `Temp: ${tempSlider.value}`;
  } else {
    setupDrawer.classList.remove("collapsed");
    btnToggleDrawer.classList.add("hidden");
    collapsedPromptBar.classList.add("hidden");
  }
}

btnToggleDrawer.addEventListener("click", () => {
  const isCollapsed = setupDrawer.classList.contains("collapsed");
  setDrawerCollapsed(!isCollapsed);
});

collapsedPromptBar.addEventListener("click", () => setDrawerCollapsed(false));

// RAM & Cache Lifecycle Management (Auto-Sleep after 3 mins hidden or 5 mins idle)
async function unloadModelFromRAM(reason = "manual") {
  if (!model) return;
  isPlaying = false;
  try {
    if (typeof model.dispose === "function") {
      await model.dispose();
    }
  } catch (e) {
    console.warn("Dispose warning:", e);
  }
  model = null;
  tokenizer = null;
  loadedModelId = null;

  statusDot.classList.remove("ready");
  statusText.textContent = "Slept (0 MB RAM)";
  btnUnloadRam.classList.add("hidden");
  btnInit.style.display = "inline-flex";
  btnInit.disabled = false;
  btnInit.textContent = "⚡ Wake Neural Engine";
  btnStream.disabled = true;

  if (reason === "auto") {
    showToast("💤 Model auto-unloaded from RAM due to inactivity.");
  } else {
    showToast("🧹 Freed model weights from active RAM!");
  }
}

function resetIdleTimer() {
  if (idleRamTimer) clearTimeout(idleRamTimer);
  if (model) {
    // Auto-free RAM after 5 minutes of total inactivity
    idleRamTimer = setTimeout(() => {
      if (!isPlaying && model) unloadModelFromRAM("auto");
    }, 5 * 60 * 1000);
  }
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden && model) {
    if (idleRamTimer) clearTimeout(idleRamTimer);
    // If tab is left in background on phone for 3 minutes, free RAM automatically
    idleRamTimer = setTimeout(() => {
      if (document.hidden && model) unloadModelFromRAM("auto");
    }, 3 * 60 * 1000);
  } else {
    resetIdleTimer();
  }
});

btnUnloadRam.addEventListener("click", () => unloadModelFromRAM("manual"));

btnClearCache.addEventListener("click", async () => {
  await unloadModelFromRAM("manual");
  if ("caches" in window) {
    const keys = await caches.keys();
    for (const key of keys) {
      if (key.includes("transformers")) await caches.delete(key);
    }
  }
  showToast("🗑️ Deleted cached model weights from browser storage!");
});

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
    desc = `<strong>Ice-Cold Deterministic:</strong> The #1 highest-scoring token captures ~100% of the odds. Zero randomness.`;
  } else if (temp <= 0.5) {
    label = `${temp.toFixed(1)} — Focused`;
    desc = `<strong>Sharpened Curve:</strong> Divides logits by ${temp.toFixed(1)}, amplifying the gap between the front-runner and runner-ups.`;
  } else if (temp <= 0.9) {
    label = `${temp.toFixed(1)} — Balanced`;
    desc = `<strong>Default Chat Setting:</strong> The sweet spot used by ChatGPT & Gemini. #1 is favored, but runner-ups can win the dice roll.`;
  } else {
    label = `${temp.toFixed(1)} — Wild / Creative`;
    desc = `<strong>Flattened Distribution:</strong> Dividing logits by ${temp.toFixed(1)} compresses the lead, giving dark-horse tokens a big chance to win!`;
  }

  tempVal.textContent = label;
  tempExplainer.innerHTML = desc;

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

modelSelect.addEventListener("change", async () => {
  if (loadedModelId && loadedModelId !== modelSelect.value) {
    await unloadModelFromRAM("manual");
    btnInit.textContent = "⚡ Load Selected Model";
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
  statusText.textContent = "Initializing...";

  const progressCallback = (info) => {
    if (info.status === 'progress' && info.total) {
      const pct = Math.round((info.loaded / info.total) * 100);
      progressFill.style.width = `${pct}%`;
      progressPct.textContent = `${pct}%`;
      progressStatus.textContent = `Caching ${info.file || 'weights'} (0 MB data on next visit)...`;
    }
  };

  try {
    const hasWebGPU = await checkWebGPUSupport();
    const targetDevice = hasWebGPU ? 'webgpu' : 'wasm';
    statusText.textContent = `Loading (${targetDevice.toUpperCase()})...`;

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
      statusText.textContent = "Loading CPU WASM...";
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
  const shortName = modelSelect.value.includes("360M") ? "360M" : "135M";
  statusText.textContent = `Active (${shortName} ${device.toUpperCase()})`;
  progressBarContainer.classList.add("hidden");
  btnInit.style.display = "none";
  btnUnloadRam.classList.remove("hidden");
  btnStream.disabled = false;
  resetIdleTimer();

  explainerBadge.textContent = "Engine Online";
  explainerBadge.className = "badge badge-success";
  explainerContent.innerHTML = `<strong>Neural Network Active in RAM!</strong> Tap <strong>▶ Run Guided Walkthrough</strong> to watch your prompt turn into probabilities and words.`;
}

function formatChatPrompt(userText) {
  return `<|im_start|>system\nYou are a concise, friendly AI assistant. Answer the user's question clearly in 1 or 2 short sentences.<|im_end|>\n<|im_start|>user\n${userText}<|im_end|>\n<|im_start|>assistant\n`;
}

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

function renderCleanTokens(tokenIds) {
  tokenChips.innerHTML = "";
  const userAndGeneratedIds = tokenIds.slice(Math.max(0, promptTokenLength - 12));

  userAndGeneratedIds.forEach(id => {
    const textChunk = tokenizer.decode([id]);
    if (
      textChunk.includes("<|im_start|>") ||
      textChunk.includes("<|im_end|>") ||
      textChunk === "ass" ||
      textChunk === "istant" ||
      textChunk === "user"
    ) return;

    const chip = document.createElement("div");
    chip.className = "token-chip";
    chip.innerHTML = `<span>${textChunk.replace(/\s/g, "·")}</span><span class="tok-id">#${id}</span>`;
    tokenChips.appendChild(chip);
  });

  tokenCountBadge.textContent = `${tokenIds.length} Tokens`;
  tokenChips.scrollTop = tokenChips.scrollHeight;
}

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
      <div class="prob-label" title="Token ID #${item.id}">
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
      btnForkSelection.textContent = `🔀 Force "${item.token.trim() || 'space'}" & Fork`;
    });

    probChart.appendChild(row);

    const seg = document.createElement("div");
    seg.className = "roulette-seg";
    seg.style.width = `${item.prob * 100}%`;
    seg.style.background = color;
    rouletteStrip.appendChild(seg);
  });

  if (rollValue !== null) {
    rouletteContainer.classList.remove("hidden");
    rouletteNeedle.style.left = `${Math.min(99, Math.max(1, rollValue * 100))}%`;
    rouletteRollText.textContent = `Dice Spin: ${(rollValue * 100).toFixed(1)}%`;
  }
}

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
      Before generating word #1, the model processed your entire prompt in parallel. Self-attention linked your question structure to conversational openings, giving <code>"${top1.token.replace(/\s/g, '·')}"</code> (${(top1.prob * 100).toFixed(1)}%) the early lead.
    `;
  } else if (isDeviation) {
    stateTag = "🎲 Temperature Upset!";
    rationale = `
      <strong>Why Did the Runner-Up Win?</strong><br>
      The #1 favorite was <code>"${top1.token.replace(/\s/g, '·')}"</code> (${(top1.prob * 100).toFixed(1)}%). However, the roulette needle spun <strong>${(rollValue * 100).toFixed(1)}%</strong>, landing inside <code>"${cleanTok}"</code> (${(selected.prob * 100).toFixed(1)}%). This single dice roll permanently alters every word that follows!
    `;
  } else if (top1.prob >= 0.82) {
    stateTag = "🔒 High-Certainty Lock-In";
    rationale = `
      <strong>Syntactic & Idiomatic Gravity:</strong><br>
      <code>"${cleanTok}"</code> captured <strong>${(top1.prob * 100).toFixed(1)}%</strong> of the odds, leaving almost zero room for <code>"${top2.token.replace(/\s/g, '·')}"</code> (${(top2.prob * 100).toFixed(1)}%). Grammar rules and training patterns locked this word in place.
    `;
  } else if (margin < 0.14) {
    stateTag = "⚖️ Tight 50/50 Crossroads";
    rationale = `
      <strong>Competing Semantic Paths:</strong><br>
      The network was genuinely split! <code>"${top1.token.replace(/\s/g, '·')}"</code> (${(top1.prob * 100).toFixed(1)}%) barely beat <code>"${top2.token.replace(/\s/g, '·')}"</code> (${(top2.prob * 100).toFixed(1)}%). Tap a runner-up bar below to fork the timeline!
    `;
  } else {
    stateTag = "📊 Standard Logit Election";
    rationale = `
      <strong>Contextual Progression:</strong><br>
      Self-attention favored <code>"${cleanTok}"</code> at <strong>${(selected.prob * 100).toFixed(1)}%</strong> over <code>"${top2.token.replace(/\s/g, '·')}"</code> (${(top2.prob * 100).toFixed(1)}%). The winning token is now glued onto the prompt buffer for step #${stepIndex + 2}.
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

function createTokenSpan(tokenStr, stepIdx, isDeviation, prob) {
  const span = document.createElement("span");
  let colorClass = "tok-comp";
  if (isDeviation) colorClass = "tok-upset";
  else if (prob >= 0.75) colorClass = "tok-lock";

  span.className = `new-token ${colorClass}`;
  span.textContent = tokenStr;
  span.addEventListener("click", () => {
    inspectHistoryStep(stepIdx);
    if (window.innerWidth < 960) {
      unifiedExplainer.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  });
  return span;
}

btnForkSelection.addEventListener("click", async () => {
  if (!selectedCandidateForFork || isBusy) return;

  isPlaying = false;
  const targetStep = replayIndex;
  const chosenCandidate = selectedCandidateForFork;
  const oldStepData = tokenHistory[targetStep];

  const previousFullText = tokenHistory.map(t => t.tokenStr).join("");
  forkOldText.textContent = previousFullText;
  forkBanner.classList.remove("hidden");

  const baseInputArray = oldStepData.fullInputIdsSnapshot;
  tokenHistory = tokenHistory.slice(0, targetStep);

  const temp = parseFloat(tempSlider.value);
  const topK = parseInt(topkSlider.value, 10);
  const candidatePool = computeSoftmaxFromRaw(oldStepData.topLogits, topK, temp);

  const forcedRationale = `
    <strong>🔀 Manual Timeline Fork:</strong><br>
    You overrode the model's choice and forced <code>"${chosenCandidate.token.replace(/\s/g, '·')}"</code> (${(chosenCandidate.prob * 100).toFixed(1)}%). Watch how every subsequent word adapts to your new reality!
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

  liveText.innerHTML = "";
  tokenHistory.forEach((t, idx) => {
    const winnerProb = t.candidatePool.find(c => c.id === t.tokenId)?.prob || 0.5;
    liveText.appendChild(createTokenSpan(t.tokenStr, idx, t.isDeviation, winnerProb));
  });

  const nextArr = new BigInt64Array(baseInputArray.length + 1);
  for (let i = 0; i < baseInputArray.length; i++) {
    nextArr[i] = BigInt(baseInputArray[i]);
  }
  nextArr[baseInputArray.length] = BigInt(chosenCandidate.id);
  currentInputIds = new Tensor('int64', nextArr, [1, nextArr.length]);

  btnForkSelection.classList.add("hidden");
  completionSummary.classList.add("hidden");

  btnStream.click();
});

// Single Autoregressive Step
async function stepModel() {
  if (!model || !tokenizer || isBusy) return;
  isBusy = true;
  resetIdleTimer();

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

    const pace = parseInt(speedSelect.value, 10);
    if (pace >= 300) {
      if (stepIdx === 0 && !shownMilestones.has("m_first")) {
        shownMilestones.add("m_first");
        showMilestone(
          "Milestone 1: Prompt Prefill & First Election",
          `Look at the probability chart below! Just like ChatGPT or Gemini, this model never plans a full sentence ahead. It scored its dictionary for slot #1, and <code>"${selected.token.replace(/\s/g, '·')}"</code> won the opening election.`
        );
      } else if (isDeviation && !shownMilestones.has("m_upset")) {
        shownMilestones.add("m_upset");
        showMilestone(
          "Milestone 2: Temperature Upset!",
          `Look at the <strong>Sampling Roulette Strip</strong> below! Even though <code>"${topCandidate.token.replace(/\s/g, '·')}"</code> was the #1 favorite (${(topCandidate.prob * 100).toFixed(1)}%), the random needle landed on runner-up <code>"${selected.token.replace(/\s/g, '·')}"</code>!`
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
    Response complete! Across <strong>${totalTokens}</strong> single-token elections, Temperature caused <strong>${deviations}</strong> runner-up upsets. 
    <strong>Tap any colored word in the output box</strong> to inspect its candidate odds or fork the timeline!
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
  setDrawerCollapsed(false);
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
  explainerContent.innerHTML = 'Prompt ready. Tap <strong>▶ Run Guided Walkthrough</strong> to trace every token election.';
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

  if (!completionSummary.classList.contains("hidden")) {
    resetState();
  }

  // Collapse setup drawer automatically and scroll into Theater Mode so mobile users see both output & telemetry
  setDrawerCollapsed(true);
  if (window.innerWidth < 960) {
    setTimeout(() => {
      liveStageAnchor.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  }

  isPlaying = true;
  btnStream.textContent = "⏸ Pause Walkthrough";

  for (let i = 0; i < 75; i++) {
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

btnShare.addEventListener("click", () => {
  const url = new URL(window.location.href);
  url.searchParams.set("prompt", promptInput.value.trim());
  url.searchParams.set("temp", tempSlider.value);
  navigator.clipboard.writeText(url.toString());
  showToast("🔗 Shareable experiment link copied!");
});

btnCopyReceipt.addEventListener("click", () => {
  const outputStr = tokenHistory.map(t => t.tokenStr).join("");
  const receipt = `⚡ Inside The Transformer — Neural Telemetry Receipt\nPrompt: "${promptInput.value.trim()}"\nOutput: "${outputStr.trim()}"\nTokens: ${statTokens.textContent} | Temp Upsets: ${statDeviations.textContent} | Avg Confidence: ${statAvgConf.textContent}\nTry it live: ${window.location.origin}${window.location.pathname}`;
  navigator.clipboard.writeText(receipt);
  showToast("📋 Neural Receipt copied!");
});