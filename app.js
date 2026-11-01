import { AutoTokenizer, AutoModelForCausalLM, env, Tensor } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.3.3';

env.allowLocalModels = false;
env.useBrowserCache = true;

const TOP_K_COUNT = 5; // Fixed to Top 5 contenders for clean, beginner-friendly visual clarity

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
const speedSelect = document.getElementById("speed-select");
const btnInit = document.getElementById("btn-init");
const startHereBeacon = document.getElementById("start-here-beacon");
const step2Beacon = document.getElementById("step2-beacon");
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

const ROULETTE_COLORS = ['#34d399', '#38bdf8', '#c084fc', '#fbbf24', '#f87171'];

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
    cpTempPreview.textContent = `Creativity: ${tempSlider.value}`;
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

// RAM & Cache Lifecycle Management
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
  statusText.textContent = "AI Brain: Sleeping";
  btnUnloadRam.classList.add("hidden");
  btnInit.style.display = "inline-flex";
  btnInit.disabled = false;
  btnInit.textContent = "⚡ Step 1: Wake Up AI Brain";
  startHereBeacon.classList.remove("hidden");
  step2Beacon.classList.add("hidden");
  btnStream.disabled = true;

  if (reason === "auto") {
    showToast("💤 AI Brain went to sleep to save your device's memory.");
  } else {
    showToast("🧹 Turned off AI Brain and freed memory!");
  }
}

function resetIdleTimer() {
  if (idleRamTimer) clearTimeout(idleRamTimer);
  if (model) {
    idleRamTimer = setTimeout(() => {
      if (!isPlaying && model) unloadModelFromRAM("auto");
    }, 5 * 60 * 1000);
  }
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden && model) {
    if (idleRamTimer) clearTimeout(idleRamTimer);
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
  showToast("🗑️ Deleted saved AI files from your browser!");
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

// Plain-English Creativity ("Temperature") Slider & Live Bar Recalculation
function updateTemperatureUI(temp) {
  let label = "Balanced";
  let desc = "";

  if (temp <= 0.1) {
    label = "0.0 — Robot Mode (Strict)";
    desc = `<strong>🧊 Zero Randomness:</strong> The AI is forced to pick the #1 most obvious word 100% of the time. Great for math or facts, but sounds robotic and repetitive.`;
  } else if (temp <= 0.5) {
    label = `${temp.toFixed(1)} — Playing It Safe`;
    desc = `<strong>🎯 Focused & Predictable:</strong> The #1 favorite word gets a huge boost in the contest, so the AI rarely takes risks.`;
  } else if (temp <= 0.9) {
    label = `${temp.toFixed(1)} — Balanced`;
    desc = `<strong>⚖️ Normal Chat Setting:</strong> This is how ChatGPT and Gemini usually run! The #1 word is favored, but runner-up words can still win the dice roll to keep sentences natural.`;
  } else {
    label = `${temp.toFixed(1)} — Wild & Creative`;
    desc = `<strong>🔥 High Risk / High Creativity:</strong> Shrinks the gap between the #1 word and the underdogs, giving surprise words a huge chance to win! (Too high makes AI ramble or make things up).`;
  }

  tempVal.textContent = label;
  tempExplainer.innerHTML = desc;

  if (tokenHistory.length > 0 && tokenHistory[replayIndex]) {
    const step = tokenHistory[replayIndex];
    const recalcPool = computeSoftmaxFromRaw(step.topLogits, TOP_K_COUNT, temp);
    renderProbChart(recalcPool, step.tokenId, step.rollValue);
  }
}

tempSlider.addEventListener("input", (e) => {
  updateTemperatureUI(parseFloat(e.target.value));
});

modelSelect.addEventListener("change", async () => {
  if (loadedModelId && loadedModelId !== modelSelect.value) {
    await unloadModelFromRAM("manual");
    btnInit.textContent = "⚡ Step 1: Load Selected AI Brain";
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

// Initialize AI Brain
btnInit.addEventListener("click", async () => {
  if (model) return;

  const MODEL_ID = modelSelect.value;
  btnInit.disabled = true;
  startHereBeacon.classList.add("hidden");
  btnInit.textContent = "⏳ Waking Up AI Brain...";
  progressBarContainer.classList.remove("hidden");
  statusText.textContent = "Loading AI...";

  const progressCallback = (info) => {
    if (info.status === 'progress' && info.total) {
      const pct = Math.round((info.loaded / info.total) * 100);
      progressFill.style.width = `${pct}%`;
      progressPct.textContent = `${pct}%`;
      progressStatus.textContent = `Downloading miniature AI brain (saves in browser for instant use next time)...`;
    }
  };

  try {
    const hasWebGPU = await checkWebGPUSupport();
    const targetDevice = hasWebGPU ? 'webgpu' : 'wasm';

    tokenizer = await AutoTokenizer.from_pretrained(MODEL_ID, { progress_callback: progressCallback });
    model = await AutoModelForCausalLM.from_pretrained(MODEL_ID, {
      dtype: 'q4',
      device: targetDevice,
      progress_callback: progressCallback
    });

    loadedModelId = MODEL_ID;
    onEngineReady();
  } catch (err) {
    console.warn("WebGPU load failed, using standard CPU mode:", err);
    try {
      tokenizer = await AutoTokenizer.from_pretrained(MODEL_ID, { progress_callback: progressCallback });
      model = await AutoModelForCausalLM.from_pretrained(MODEL_ID, {
        dtype: 'q4',
        device: 'wasm',
        progress_callback: progressCallback
      });
      loadedModelId = MODEL_ID;
      onEngineReady();
    } catch (fallbackErr) {
      statusText.textContent = "Load Error";
      explainerContent.innerHTML = `<span style="color: #f87171;">Couldn't load the AI brain: ${fallbackErr.message}</span>`;
      btnInit.disabled = false;
      btnInit.textContent = "Retry Turning On AI";
      startHereBeacon.classList.remove("hidden");
    }
  }
});

function onEngineReady() {
  statusDot.classList.add("ready");
  statusText.textContent = `AI Brain: Ready!`;
  progressBarContainer.classList.add("hidden");
  btnInit.style.display = "none";
  startHereBeacon.classList.add("hidden");
  step2Beacon.classList.remove("hidden");
  btnUnloadRam.classList.remove("hidden");
  btnStream.disabled = false;
  resetIdleTimer();

  explainerBadge.textContent = "AI Brain Ready!";
  explainerBadge.className = "badge badge-success";
  explainerContent.innerHTML = `<strong>Awesome, the AI is awake!</strong> Now click the blue <strong>▶ Step 2: Watch It Think</strong> button to watch how it builds an answer one word at a time.`;
}

function formatChatPrompt(userText) {
  return `<|im_start|>system\nYou are a friendly, clear AI assistant. Answer the user's question in 1 or 2 simple, complete sentences.<|im_end|>\n<|im_start|>user\n${userText}<|im_end|>\n<|im_start|>assistant\n`;
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
  let count = 0;

  userAndGeneratedIds.forEach(id => {
    const textChunk = tokenizer.decode([id]);
    if (
      textChunk.includes("<|im_start|>") ||
      textChunk.includes("<|im_end|>") ||
      textChunk === "ass" ||
      textChunk === "istant" ||
      textChunk === "user"
    ) return;

    count++;
    const chip = document.createElement("div");
    chip.className = "token-chip";
    chip.innerHTML = `<span>${textChunk.replace(/\s/g, "·")}</span><span class="tok-id">#${id}</span>`;
    tokenChips.appendChild(chip);
  });

  tokenCountBadge.textContent = `${count} Pieces`;
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
      <div class="prob-label" title="Click to force the AI to pick this word instead!">
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
      btnForkSelection.textContent = `🔀 Use "${item.token.trim() || 'space'}" Instead!`;
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
    rouletteRollText.textContent = `Dice Landed On: ${(rollValue * 100).toFixed(0)}%`;
  }
}

// Friendly, Everyday-English Explanations
function analyzeTokenGeneration(selected, candidatePool, stepIndex, temp, rollValue) {
  const top1 = candidatePool[0];
  const top2 = candidatePool[1] || { prob: 0, token: "" };
  const isDeviation = selected.id !== top1.id;
  const margin = top1.prob - top2.prob;
  const cleanTok = selected.token.replace(/\s/g, "·");

  let stateTag = "";
  let rationale = "";

  if (stepIndex === 0) {
    stateTag = "Starting the Answer";
    rationale = `
      <strong>How the AI Picks Word #1:</strong><br>
      The AI just read your question and looked at how millions of helpful answers usually begin. It gave <code>"${top1.token.replace(/\s/g, '·')}"</code> the highest score (<strong>${(top1.prob * 100).toFixed(0)}% chance</strong>) to kick off the sentence!
    `;
  } else if (isDeviation) {
    stateTag = "🎲 Surprise Runner-Up Won!";
    rationale = `
      <strong>A Twist of the Dice!</strong><br>
      Look at the bars below: <code>"${top1.token.replace(/\s/g, '·')}"</code> was actually the #1 favorite at <strong>${(top1.prob * 100).toFixed(0)}%</strong>. But because your Creativity Dial is turned up, the dice roll landed on runner-up <code>"${cleanTok}"</code> (<strong>${(selected.prob * 100).toFixed(0)}%</strong>) instead! That one surprise word changes the rest of the sentence.
    `;
  } else if (top1.prob >= 0.82) {
    stateTag = "🔒 No-Brainer Pick";
    rationale = `
      <strong>An Obvious Next Word:</strong><br>
      <code>"${cleanTok}"</code> had a massive <strong>${(top1.prob * 100).toFixed(0)}% chance</strong> of winning here, beating <code>"${top2.token.replace(/\s/g, '·')}"</code> (${(top2.prob * 100).toFixed(0)}%). Because of basic English grammar or a common phrase, the AI was almost 100% sure what word belonged next.
    `;
  } else if (margin < 0.14) {
    stateTag = "⚖️ Close Toss-Up";
    rationale = `
      <strong>Two Good Options:</strong><br>
      The AI was nearly split 50/50! <code>"${top1.token.replace(/\s/g, '·')}"</code> (<strong>${(top1.prob * 100).toFixed(0)}%</strong>) barely beat <code>"${top2.token.replace(/\s/g, '·')}"</code> (<strong>${(top2.prob * 100).toFixed(0)}%</strong>). <em>Tip: Click the #2 bar below if you want to see what happens if the other word won!</em>
    `;
  } else {
    stateTag = "📊 Building the Sentence";
    rationale = `
      <strong>Guessing the Next Piece:</strong><br>
      Reading everything written so far, the AI gave <code>"${cleanTok}"</code> a <strong>${(selected.prob * 100).toFixed(0)}% chance</strong>, beating <code>"${top2.token.replace(/\s/g, '·')}"</code> (${(top2.prob * 100).toFixed(0)}%). Now it glues <code>"${cleanTok}"</code> onto the sentence and repeats the whole contest for the next word!
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
  btnStream.textContent = "⏩ Keep Watching";

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
  const candidatePool = computeSoftmaxFromRaw(oldStepData.topLogits, TOP_K_COUNT, temp);

  const forcedRationale = `
    <strong>🔀 You Changed the Word!</strong><br>
    You stepped in and forced the AI to use <code>"${chosenCandidate.token.replace(/\s/g, '·')}"</code>. Watch how changing just one word makes the AI write a completely different ending!
  `;

  tokenHistory.push({
    tokenStr: chosenCandidate.token,
    tokenId: chosenCandidate.id,
    topLogits: oldStepData.topLogits,
    candidatePool,
    explanation: forcedRationale,
    stateTag: "🔀 Your Custom Pick",
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

// Single Word Step
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

    const topRawLogits = extractTopRawLogits(logitsSlice, 10);
    const temp = parseFloat(tempSlider.value);
    const candidatePool = computeSoftmaxFromRaw(topRawLogits, TOP_K_COUNT, temp);

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
      concludeGeneration();
      isBusy = false;
      return;
    }

    renderProbChart(candidatePool, selected.id, rand);

    const stepIdx = tokenHistory.length;
    const { rationale, isDeviation, topCandidate, stateTag } = analyzeTokenGeneration(selected, candidatePool, stepIdx, temp, rand);

    explainerBadge.textContent = `Word #${stepIdx + 1} • ${stateTag}`;
    explainerBadge.className = isDeviation ? "badge badge-purple" : "badge";
    entropyReadout.textContent = `#1 Favorite: ${(topCandidate.prob * 100).toFixed(0)}%`;
    explainerContent.innerHTML = rationale;

    const pace = parseInt(speedSelect.value, 10);
    if (pace >= 300) {
      if (stepIdx === 0 && !shownMilestones.has("m_first")) {
        shownMilestones.add("m_first");
        showMilestone(
          " Pause & Look: Word #1!",
          `Look at the bar chart below! Just like ChatGPT or Gemini, this AI <strong>never plans a full sentence ahead</strong>. It just held a contest for the very first word, and <code>"${selected.token.replace(/\s/g, '·')}"</code> won!`
        );
      } else if (isDeviation && !shownMilestones.has("m_upset")) {
        shownMilestones.add("m_upset");
        showMilestone(
          "🎲 Pause & Look: A Surprise Pick!",
          `Look at the <strong>Dice Roll strip</strong> below! Even though <code>"${topCandidate.token.replace(/\s/g, '·')}"</code> was the #1 favorite (${(topCandidate.prob * 100).toFixed(0)}%), the random pointer landed on runner-up <code>"${selected.token.replace(/\s/g, '·')}"</code>! This is why AI gives a slightly different answer every time you ask.`
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
    explainerContent.innerHTML = `<span style="color: #f87171;">Oops, something hiccuped: ${err.message}</span>`;
  } finally {
    isBusy = false;
  }
}

function concludeGeneration() {
  isPlaying = false;
  btnStream.textContent = "▶ Watch It Think Again";
  unifiedExplainer.classList.remove("milestone");
  explainerActions.classList.add("hidden");

  const totalTokens = tokenHistory.length;
  const deviations = tokenHistory.filter(t => t.isDeviation).length;
  const avgConf = (tokenHistory.reduce((acc, t) => {
    const w = t.candidatePool.find(c => c.id === t.tokenId);
    return acc + (w ? w.prob : 0.5);
  }, 0) / (totalTokens || 1) * 100).toFixed(0);

  statTokens.textContent = totalTokens;
  statDeviations.textContent = deviations;
  statAvgConf.textContent = `${avgConf}%`;

  summaryNarrative.innerHTML = `
    The AI finished its thought! To write this answer, it played <strong>${totalTokens}</strong> separate word-guessing contests in a row, and the dice roll picked a surprise runner-up word <strong>${deviations}</strong> times. 
    <strong>Click any colored word in the answer box</strong> to see what other words almost won!
  `;

  completionSummary.classList.remove("hidden");
}

function inspectHistoryStep(index) {
  const step = tokenHistory[index];
  if (!step) return;

  replayIndex = index;
  replayStepIndicator.textContent = `Word ${index + 1} / ${tokenHistory.length}`;

  const temp = parseFloat(tempSlider.value);
  const livePool = computeSoftmaxFromRaw(step.topLogits, TOP_K_COUNT, temp);

  renderProbChart(livePool, step.tokenId, step.rollValue);
  explainerBadge.textContent = `Rewinding: Word #${index + 1} • ${step.stateTag}`;
  explainerBadge.className = step.isDeviation ? "badge badge-purple" : "badge";
  entropyReadout.textContent = `Dice Roll: ${(step.rollValue * 100).toFixed(0)}%`;
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
  btnStream.textContent = "▶ Step 2: Watch It Think";
  if (model) step2Beacon.classList.remove("hidden");
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
  probChart.innerHTML = '<div class="empty-placeholder">The top 5 competing words and their percentage odds will appear here as the AI writes.</div>';
  explainerBadge.textContent = model ? "AI Brain Ready" : "Waiting to Start";
  explainerBadge.className = "badge badge-success";
  entropyReadout.textContent = "";
  explainerContent.innerHTML = model
    ? 'Question ready! Click <strong>▶ Step 2: Watch It Think</strong> to watch how the AI guesses each word.'
    : 'Click the green <strong>⚡ Step 1: Turn On AI Brain</strong> button on the left to start!';
  tokenChips.innerHTML = '<div class="empty-placeholder">Numbered word pieces will appear here once the AI starts reading.</div>';
  tokenCountBadge.textContent = "0 Pieces";
  [badgePrefill, badgeAttention, badgeLogits, badgeSample].forEach(b => b.classList.remove("highlight"));
}

btnStream.addEventListener("click", async () => {
  step2Beacon.classList.add("hidden");

  if (isPlaying) {
    isPlaying = false;
    btnStream.textContent = "▶ Keep Watching";
    return;
  }

  if (!completionSummary.classList.contains("hidden")) {
    resetState();
    step2Beacon.classList.add("hidden");
  }

  setDrawerCollapsed(true);
  if (window.innerWidth < 960) {
    setTimeout(() => {
      liveStageAnchor.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  }

  isPlaying = true;
  btnStream.textContent = "⏸ Pause";

  for (let i = 0; i < 70; i++) {
    if (!isPlaying) break;
    await stepModel();
    const delay = parseInt(speedSelect.value, 10);
    await new Promise(r => setTimeout(r, delay));
  }

  if (isPlaying) {
    concludeGeneration();
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
  showToast("🔗 Link copied! Send it to a friend to try.");
});

btnCopyReceipt.addEventListener("click", () => {
  const outputStr = tokenHistory.map(t => t.tokenStr).join("");
  const receipt = `⚡ How AI Actually Works — My Experiment\nQuestion: "${promptInput.value.trim()}"\nAI Answer: "${outputStr.trim()}"\nWords Guessed: ${statTokens.textContent} | Surprise Dice Rolls: ${statDeviations.textContent} | Avg Certainty: ${statAvgConf.textContent}\nSee inside the AI yourself: ${window.location.origin}${window.location.pathname}`;
  navigator.clipboard.writeText(receipt);
  showToast("📋 Summary copied to clipboard!");
});