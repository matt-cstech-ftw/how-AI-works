import { AutoTokenizer, AutoModelForCausalLM, env, Tensor } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.3.3';

env.allowLocalModels = false;
env.useBrowserCache = true;

// State
let tokenizer = null;
let model = null;
let currentInputIds = null;
let tokenHistory = []; // { tokenStr, tokenId, candidatePool, explanation, isDeviation, topCandidate, fullInputIdsSnapshot }
let isPlaying = false;
let isBusy = false;
let shownMilestones = new Set();
let replayIndex = 0;
let selectedCandidateForFork = null;

// DOM Elements
const modal = document.getElementById("welcome-modal");
const btnModalAgree = document.getElementById("btn-modal-agree");
const promptInput = document.getElementById("prompt-input");
const tempSlider = document.getElementById("temp-slider");
const tempVal = document.getElementById("temp-val");
const topkSlider = document.getElementById("topk-slider");
const topkVal = document.getElementById("topk-val");
const btnInit = document.getElementById("btn-init");
const btnStream = document.getElementById("btn-stream");
const btnReset = document.getElementById("btn-reset");
const liveText = document.getElementById("live-text");
const tokenChips = document.getElementById("token-chips");
const probChart = document.getElementById("probability-chart");
const outputHint = document.getElementById("output-hint");
const statusDot = document.getElementById("status-dot");
const statusText = document.getElementById("status-text");
const progressBarContainer = document.getElementById("download-progress-bar");
const progressFill = document.getElementById("progress-fill");
const progressStatus = document.getElementById("progress-status");

// Unified Explainer Elements
const unifiedExplainer = document.getElementById("unified-explainer");
const explainerBadge = document.getElementById("explainer-badge");
const explainerContent = document.getElementById("explainer-content");
const explainerActions = document.getElementById("explainer-actions");
const btnContinueMilestone = document.getElementById("btn-continue-milestone");
const btnForkSelection = document.getElementById("btn-fork-selection");

// Flow badges
const badgePrefill = document.getElementById("badge-prefill");
const badgeAttention = document.getElementById("badge-attention");
const badgeLogits = document.getElementById("badge-logits");
const badgeSample = document.getElementById("badge-sample");

// Summary & Replay Elements
const completionSummary = document.getElementById("completion-summary");
const summaryNarrative = document.getElementById("summary-narrative");
const statTokens = document.getElementById("stat-tokens");
const statDeviations = document.getElementById("stat-deviations");
const statAvgConf = document.getElementById("stat-avg-conf");
const replayControls = document.getElementById("replay-controls");
const btnReplayPrev = document.getElementById("btn-replay-prev");
const btnReplayNext = document.getElementById("btn-replay-next");
const replayStepIndicator = document.getElementById("replay-step-indicator");

// Dismiss Modal
if (btnModalAgree && modal) {
  btnModalAgree.addEventListener("click", () => modal.classList.add("hidden"));
}

tempSlider.addEventListener("input", (e) => { tempVal.textContent = e.target.value; });
topkSlider.addEventListener("input", (e) => { topkVal.textContent = e.target.value; });

async function checkWebGPUSupport() {
  if (!navigator.gpu) return false;
  try {
    const adapter = await navigator.gpu.requestAdapter();
    return !!adapter;
  } catch (e) {
    return false;
  }
}

// Engine Init
btnInit.addEventListener("click", async () => {
  if (model) return;

  btnInit.disabled = true;
  btnInit.textContent = "Loading Engine...";
  progressBarContainer.classList.remove("hidden");
  statusText.textContent = "Detecting device hardware...";

  const MODEL_ID = 'HuggingFaceTB/SmolLM2-135M-Instruct';

  const progressCallback = (info) => {
    if (info.status === 'progress' && info.total) {
      const pct = Math.round((info.loaded / info.total) * 100);
      progressFill.style.width = `${pct}%`;
      progressStatus.textContent = `Downloading ${info.file || 'weights'}: ${pct}%`;
    }
  };

  try {
    const hasWebGPU = await checkWebGPUSupport();
    const targetDevice = hasWebGPU ? 'webgpu' : 'wasm';
    statusText.textContent = `Loading on ${targetDevice.toUpperCase()}...`;

    tokenizer = await AutoTokenizer.from_pretrained(MODEL_ID, { progress_callback: progressCallback });
    model = await AutoModelForCausalLM.from_pretrained(MODEL_ID, {
      dtype: 'q4',
      device: targetDevice,
      progress_callback: progressCallback
    });

    onEngineReady(targetDevice);
  } catch (err) {
    console.warn("Falling back to CPU WASM:", err);
    try {
      statusText.textContent = "Retrying in safe CPU WASM mode...";
      tokenizer = await AutoTokenizer.from_pretrained(MODEL_ID, { progress_callback: progressCallback });
      model = await AutoModelForCausalLM.from_pretrained(MODEL_ID, {
        dtype: 'q4',
        device: 'wasm',
        progress_callback: progressCallback
      });
      onEngineReady('wasm');
    } catch (fallbackErr) {
      statusText.textContent = "Initialization Failed";
      explainerContent.innerHTML = `<span style="color: #f85149;">Error initializing model: ${fallbackErr.message}</span>`;
      btnInit.disabled = false;
      btnInit.textContent = "Retry";
    }
  }
});

function onEngineReady(device) {
  statusDot.classList.add("ready");
  statusText.textContent = `Ready (${device.toUpperCase()} Engine)`;
  progressBarContainer.classList.add("hidden");
  btnInit.style.display = "none";
  btnStream.disabled = false;

  explainerBadge.textContent = "Ready to Begin";
  explainerBadge.className = "badge badge-success";
  explainerContent.innerHTML = `<strong>Engine Loaded!</strong> Type any prompt on the left and click <strong>Run Guided Walkthrough</strong> to watch the model write and explain its internal mechanics.`;
}

// System prompt ensures the assistant behaves as an AI and finishes thoughts coherently
function formatChatPrompt(userText) {
  return `<|im_start|>system\nYou are a concise, helpful AI assistant. Answer clearly in complete sentences.<|im_end|>\n<|im_start|>user\n${userText}<|im_end|>\n<|im_start|>assistant\n`;
}

// Compute Softmax across candidate logits
function getTopKSoftmax(logitsSlice, topK, temperature) {
  const temp = Math.max(0.01, parseFloat(temperature));
  const indexed = [];

  for (let i = 0; i < logitsSlice.length; i++) {
    indexed.push({ id: i, logit: logitsSlice[i] });
  }

  indexed.sort((a, b) => b.logit - a.logit);
  const topCandidates = indexed.slice(0, topK);

  const scaled = topCandidates.map(c => c.logit / temp);
  const maxScaled = Math.max(...scaled);
  const exps = scaled.map(s => Math.exp(s - maxScaled));
  const sumExp = exps.reduce((a, b) => a + b, 0);

  return topCandidates.map((c, idx) => ({
    id: c.id,
    token: tokenizer.decode([c.id]),
    prob: exps[idx] / sumExp
  }));
}

// Render clean user/assistant tokens, skipping system boilerplate
function renderCleanTokens(tokenIds) {
  tokenChips.innerHTML = "";
  
  let userStartIndex = 0;
  for (let i = 0; i < tokenIds.length; i++) {
    const str = tokenizer.decode([tokenIds[i]]);
    if (str.includes("user")) {
      userStartIndex = i + 1;
      break;
    }
  }

  const visibleIds = tokenIds.slice(userStartIndex);

  visibleIds.forEach(id => {
    const textChunk = tokenizer.decode([id]);
    if (textChunk.includes("<|im_start|>") || textChunk.includes("<|im_end|>") || textChunk.includes("assistant")) return;

    const chip = document.createElement("div");
    chip.className = "token-chip";
    chip.innerHTML = `<span>${textChunk.replace(/\s/g, "·")}</span><span class="tok-id">#${id}</span>`;
    tokenChips.appendChild(chip);
  });
}

// Render candidate probability bars and enable fork selection
function renderProbChart(candidatePool, chosenId) {
  probChart.innerHTML = "";
  btnForkSelection.classList.add("hidden");
  selectedCandidateForFork = null;

  candidatePool.forEach(item => {
    const pct = (item.prob * 100).toFixed(1);
    const row = document.createElement("div");
    row.className = "prob-row";
    const isWinner = item.id === chosenId;

    row.innerHTML = `
      <div class="prob-label" title="${item.token}">${item.token.replace(/\s/g, "·")}</div>
      <div class="prob-bar-track">
        <div class="prob-bar-fill ${isWinner ? 'selected' : ''}" style="width: ${pct}%"></div>
      </div>
      <div>${pct}%</div>
    `;

    // Clicking a candidate bar lets the user fork generation down that path
    row.addEventListener("click", () => {
      document.querySelectorAll(".prob-row").forEach(r => r.classList.remove("candidate-selected"));
      row.classList.add("candidate-selected");
      selectedCandidateForFork = item;
      btnForkSelection.classList.remove("hidden");
      btnForkSelection.textContent = `🔀 Pick "${item.token.trim()}" & Fork Timeline`;
    });

    probChart.appendChild(row);
  });
}

// Fork execution from an alternative candidate token
btnForkSelection.addEventListener("click", () => {
  if (!selectedCandidateForFork || isBusy) return;

  const targetStep = replayIndex;
  const chosenCandidate = selectedCandidateForFork;

  // Truncate history to this fork point
  tokenHistory = tokenHistory.slice(0, targetStep);
  
  // Rebuild input IDs up to this point
  const previousTokens = targetStep === 0 
    ? Array.from(tokenHistory[0]?.fullInputIdsSnapshot || currentInputIds.data).map(Number)
    : Array.from(tokenHistory[targetStep - 1].fullInputIdsSnapshot).map(Number);

  const nextBigInt = BigInt(chosenCandidate.id);
  const newArr = new BigInt64Array(previousTokens.length + 1);
  for (let i = 0; i < previousTokens.length; i++) {
    newArr[i] = BigInt(previousTokens[i]);
  }
  newArr[previousTokens.length] = nextBigInt;

  const Tensor = currentInputIds.constructor;
  currentInputIds = new Tensor('int64', newArr, [1, newArr.length]);

  // Rebuild UI text
  liveText.innerHTML = "";
  tokenHistory.forEach((t, idx) => {
    const span = document.createElement("span");
    span.className = "new-token";
    span.textContent = t.tokenStr;
    span.addEventListener("click", () => inspectHistoryStep(idx));
    liveText.appendChild(span);
  });

  // Append newly forked token
  const span = document.createElement("span");
  span.className = "new-token active-inspect";
  span.textContent = chosenCandidate.token;
  liveText.appendChild(span);

  btnForkSelection.classList.add("hidden");
  completionSummary.classList.add("hidden");

  // Resume streaming from this new branch
  btnStream.click();
});

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
  if (!isPlaying) {
    btnStream.click();
  }
});

function analyzeTokenGeneration(selectedToken, candidatePool, stepIndex, userPrompt) {
  const clean = selectedToken.trim().toLowerCase();
  const topCandidate = candidatePool[0];
  const isTopChoice = selectedToken === topCandidate.token;
  const isDeviation = !isTopChoice;

  let rationale = "";

  if (stepIndex === 0) {
    rationale = `
      <strong>The First Token:</strong><br>
      The model converted your entire prompt into vector coordinates. Based on conversational patterns 
      in its pretraining data, candidate tokens like <code>"${candidatePool[0].token.replace(/\s/g, '·')}"</code> 
      took the statistical lead to begin an assistant-style response.
    `;
  } else if (isDeviation) {
    rationale = `
      <strong>🎲 Temperature in Action:</strong><br>
      The #1 statistical candidate was <code>"${topCandidate.token.replace(/\s/g, '·')}"</code> (${(topCandidate.prob * 100).toFixed(1)}%). 
      However, temperature sampling selected runner-up <code>"${selectedToken.replace(/\s/g, '·')}"</code>, steering downstream probabilities onto a fresh branch.
    `;
  } else if (['ai', 'assistant', 'language', 'model', 'computer'].includes(clean)) {
    rationale = `
      <strong>Self-Identity Conditioning:</strong><br>
      Attention layers connected back to your query (<em>"Who are you"</em>) and the system prompt. The model elevated identity tokens 
      like <code>"${clean}"</code> because they match how language models define themselves in structured instruction datasets.
    `;
  } else if (['help', 'assist', 'answer', 'solve', 'tasks'].includes(clean)) {
    rationale = `
      <strong>Function & Purpose Weights:</strong><br>
      Notice how <code>"${clean}"</code> won. Grammar and semantics link identity directly to capability verbs, making helpfulness tokens dominate the election.
    `;
  } else if (['.', ',', ';', '!'].includes(clean)) {
    rationale = `
      <strong>Boundary Completion:</strong><br>
      A complete grammatical thought just finished. Punctuation probability spiked to close the phrase naturally before generating the next idea.
    `;
  } else {
    rationale = `
      <strong>Autoregressive Next-Token Election:</strong><br>
      Given all preceding words, <code>"${selectedToken.replace(/\s/g, '·')}"</code> received 
      <strong>${(candidatePool.find(c => c.id === candidatePool[0].id)?.prob * 100).toFixed(1)}%</strong> probability mass. 
      It is now appended to the working memory for the next calculation.
    `;
  }

  return { rationale, isDeviation, topCandidate };
}

// Conclude Generation with clean inline debrief
function concludeGeneration(reason = "eos") {
  isPlaying = false;
  btnStream.textContent = "▶ Run Guided Walkthrough";
  replayControls.classList.remove("hidden");
  outputHint.classList.remove("hidden");
  unifiedExplainer.classList.remove("milestone");
  explainerActions.classList.add("hidden");

  const totalTokens = tokenHistory.length;
  const deviations = tokenHistory.filter(t => t.isDeviation).length;
  const avgConf = (tokenHistory.reduce((acc, t) => {
    const winnerItem = t.candidatePool.find(c => c.id === t.tokenId);
    return acc + (winnerItem ? winnerItem.prob : 0.5);
  }, 0) / (totalTokens || 1) * 100).toFixed(1);

  statTokens.textContent = totalTokens;
  statDeviations.textContent = deviations;
  statAvgConf.textContent = `${avgConf}%`;

  summaryNarrative.innerHTML = `
    The model completed its thought ${reason === 'eos' ? 'and emitted an End-of-Sequence token' : 'within the allotted length'}. 
    It calculated <strong>${totalTokens}</strong> individual logit elections. Temperature sampling shifted the choice <strong>${deviations}</strong> times. 
    Click any word in the text above to inspect candidate odds or fork into a new timeline.
  `;

  completionSummary.classList.remove("hidden");

  replayIndex = totalTokens - 1;
  updateReplayDisplay();
}

// Replay navigation
function updateReplayDisplay() {
  if (tokenHistory.length === 0) return;
  replayStepIndicator.textContent = `${replayIndex + 1}/${tokenHistory.length}`;
  inspectHistoryStep(replayIndex);
}

btnReplayPrev.addEventListener("click", () => {
  if (replayIndex > 0) {
    replayIndex--;
    updateReplayDisplay();
  }
});

btnReplayNext.addEventListener("click", () => {
  if (replayIndex < tokenHistory.length - 1) {
    replayIndex++;
    updateReplayDisplay();
  }
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

    const temp = parseFloat(tempSlider.value);
    const topK = parseInt(topkSlider.value, 10);
    const candidatePool = getTopKSoftmax(logitsSlice, topK, temp);

    highlightStepper("sample");

    const rand = Math.random();
    let cumulative = 0;
    let selected = candidatePool[0];

    for (const item of candidatePool) {
      cumulative += item.prob;
      if (rand <= cumulative) {
        selected = item;
        break;
      }
    }

    // Check for EOS token
    if (selected.token.includes("<|im_end|>") || selected.id === 2 || selected.id === 0) {
      concludeGeneration("eos");
      isBusy = false;
      return;
    }

    renderProbChart(candidatePool, selected.id);

    const stepIdx = tokenHistory.length;
    const { rationale, isDeviation, topCandidate } = analyzeTokenGeneration(selected.token, candidatePool, stepIdx, rawPrompt);

    explainerBadge.textContent = `Word #${stepIdx + 1} Prediction`;
    explainerBadge.className = "badge";
    explainerContent.innerHTML = rationale;

    // Milestone highlights
    if (stepIdx === 0 && !shownMilestones.has("milestone_first")) {
      shownMilestones.add("milestone_first");
      showMilestone(
        "Key Concept: Ingestion & First Token",
        `Notice the bar chart below! Language models do not write complete thoughts at once. The model translated your prompt into spatial vectors, attended to key words, and calculated probability odds across its dictionary to pick word #1.`
      );
    } else if (isDeviation && !shownMilestones.has("milestone_deviation")) {
      shownMilestones.add("milestone_deviation");
      showMilestone(
        "Key Concept: Temperature Sampling",
        `Look at the probability bars! The #1 candidate was actually <strong>"${topCandidate.token.replace(/\s/g, '·')}"</strong> (${(topCandidate.prob * 100).toFixed(1)}%). Because your Temperature is <strong>${temp}</strong>, the model rolled the dice and chose runner-up <strong>"${selected.token.replace(/\s/g, '·')}"</strong>. This is how LLMs introduce variety.`
      );
    }

    tokenHistory.push({
      tokenStr: selected.token,
      tokenId: selected.id,
      candidatePool: candidatePool,
      explanation: rationale,
      isDeviation: isDeviation,
      topCandidate: topCandidate,
      fullInputIdsSnapshot: currentTokensArray
    });

    const span = document.createElement("span");
    span.className = "new-token";
    span.textContent = selected.token;
    span.addEventListener("click", () => inspectHistoryStep(stepIdx));
    liveText.appendChild(span);

    const nextBigInt = BigInt(selected.id);
    const nextArr = new BigInt64Array(currentTokensArray.length + 1);
    for (let i = 0; i < currentTokensArray.length; i++) {
      nextArr[i] = BigInt(currentTokensArray[i]);
    }
    nextArr[currentTokensArray.length] = nextBigInt;

    currentInputIds = new Tensor('int64', nextArr, [1, currentTokensArray.length + 1]);
    renderCleanTokens(Array.from(nextArr).map(Number));

  } catch (err) {
    console.error("Step execution error:", err);
    explainerContent.innerHTML = `<span style="color: #f85149;">Inference error: ${err.message}</span>`;
  } finally {
    isBusy = false;
  }
}

function inspectHistoryStep(index) {
  const step = tokenHistory[index];
  if (!step) return;

  replayIndex = index;
  replayStepIndicator.textContent = `${index + 1}/${tokenHistory.length}`;

  renderProbChart(step.candidatePool, step.tokenId);
  explainerBadge.textContent = `Inspecting Word #${index + 1}`;
  explainerBadge.className = "badge";
  explainerContent.innerHTML = step.explanation;

  const allSpans = liveText.querySelectorAll('.new-token');
  allSpans.forEach((span, i) => {
    span.classList.toggle('active-inspect', i === index);
  });
}

function resetState() {
  isPlaying = false;
  isBusy = false;
  btnStream.textContent = "▶ Run Guided Walkthrough";
  currentInputIds = null;
  tokenHistory = [];
  shownMilestones.clear();
  completionSummary.classList.add("hidden");
  replayControls.classList.add("hidden");
  outputHint.classList.add("hidden");
  explainerActions.classList.add("hidden");
  btnForkSelection.classList.add("hidden");
  unifiedExplainer.classList.remove("milestone");
  liveText.innerHTML = "";
  probChart.innerHTML = '<div class="empty-state">Leaderboard probabilities will appear here during generation.</div>';
  explainerBadge.textContent = "Ready to Begin";
  explainerBadge.className = "badge badge-success";
  explainerContent.innerHTML = 'Prompt reset. Enter any prompt and click <strong>Run Guided Walkthrough</strong>.';
  tokenChips.innerHTML = '<div class="empty-state">Tokens will appear here once inference begins.</div>';
  [badgePrefill, badgeAttention, badgeLogits, badgeSample].forEach(b => b.classList.remove("highlight"));
}

// Event Bindings
btnStream.addEventListener("click", async () => {
  if (isPlaying) {
    isPlaying = false;
    btnStream.textContent = "▶ Resume Walkthrough";
    return;
  }

  isPlaying = true;
  btnStream.textContent = "⏸ Pause Walkthrough";

  // Generates up to 60 tokens, stopping naturally at sentence boundaries/EOS
  for (let i = 0; i < 60; i++) {
    if (!isPlaying) break;
    await stepModel();
    await new Promise(r => setTimeout(r, 450));
  }

  if (isPlaying) {
    concludeGeneration("limit");
  }
});

btnReset.addEventListener("click", () => {
  resetState();
  promptInput.focus();
});