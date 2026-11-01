import { AutoTokenizer, AutoModelForCausalLM, env, Tensor } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.3.3';

env.allowLocalModels = false;
env.useBrowserCache = true;

// State
let tokenizer = null;
let model = null;
let currentInputIds = null;
let tokenHistory = []; // { tokenStr, tokenId, candidatePool, explanation, rationale, isDeviation, topCandidate }
let isPlaying = false;
let isBusy = false;
let shownMilestones = new Set();
let replayIndex = 0;

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
const statusDot = document.getElementById("status-dot");
const statusText = document.getElementById("status-text");
const progressBarContainer = document.getElementById("download-progress-bar");
const progressFill = document.getElementById("progress-fill");
const progressStatus = document.getElementById("progress-status");

// Single Unified Explainer Elements
const unifiedExplainer = document.getElementById("unified-explainer");
const explainerBadge = document.getElementById("explainer-badge");
const explainerContent = document.getElementById("explainer-content");
const explainerActions = document.getElementById("explainer-actions");
const btnContinueMilestone = document.getElementById("btn-continue-milestone");

// Flow stepper badges
const badgePrefill = document.getElementById("badge-prefill");
const badgeAttention = document.getElementById("badge-attention");
const badgeLogits = document.getElementById("badge-logits");
const badgeSample = document.getElementById("badge-sample");

// Debrief & Replay Elements
const debriefOverlay = document.getElementById("debrief-overlay");
const statTotalTokens = document.getElementById("stat-total-tokens");
const statDeviations = document.getElementById("stat-deviations");
const statAvgConfidence = document.getElementById("stat-avg-confidence");
const minigameQuestion = document.getElementById("minigame-question");
const minigameOptions = document.getElementById("minigame-options");
const minigameResult = document.getElementById("minigame-result");
const btnCloseDebrief = document.getElementById("btn-close-debrief");
const btnRestartApp = document.getElementById("btn-restart-app");
const replayControls = document.getElementById("replay-controls");
const btnReplayPrev = document.getElementById("btn-replay-prev");
const btnReplayNext = document.getElementById("btn-replay-next");
const replayStepIndicator = document.getElementById("replay-step-indicator");

// Dismiss Welcome Modal
if (btnModalAgree && modal) {
  btnModalAgree.addEventListener("click", () => modal.classList.add("hidden"));
}

tempSlider.addEventListener("input", (e) => { tempVal.textContent = e.target.value; });
topkSlider.addEventListener("input", (e) => { topkVal.textContent = e.target.value; });

// WebGPU Detection
async function checkWebGPUSupport() {
  if (!navigator.gpu) return false;
  try {
    const adapter = await navigator.gpu.requestAdapter();
    return !!adapter;
  } catch (e) {
    return false;
  }
}

// Engine Initialization
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
  explainerContent.innerHTML = `<strong>Engine Ready!</strong> Type any prompt and click <strong>Run Guided Walkthrough</strong> to watch the model write and explain its internal mechanics.`;
}

// Format prompt for instruction tuning
function formatChatPrompt(userText) {
  return `<|im_start|>user\n${userText}<|im_end|>\n<|im_start|>assistant\n`;
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

// Display conversational tokens (filter structural chat template tokens)
function renderCleanTokens(tokenIds) {
  tokenChips.innerHTML = "";
  
  // Find start of assistant response to filter prompt metadata
  let startIndex = 0;
  for (let i = tokenIds.length - 1; i >= 0; i--) {
    const str = tokenizer.decode([tokenIds[i]]);
    if (str.includes("assistant")) {
      startIndex = i + 1;
      break;
    }
  }

  const visibleIds = tokenIds.slice(Math.max(0, startIndex - 8));

  visibleIds.forEach(id => {
    const textChunk = tokenizer.decode([id]);
    if (textChunk.includes("<|im_start|>") || textChunk.includes("<|im_end|>")) return;

    const chip = document.createElement("div");
    chip.className = "token-chip";
    chip.innerHTML = `<span>${textChunk.replace(/\s/g, "·")}</span><span class="tok-id">#${id}</span>`;
    tokenChips.appendChild(chip);
  });
}

// Render candidate probability bars
function renderProbChart(candidatePool, chosenId) {
  probChart.innerHTML = "";

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
    probChart.appendChild(row);
  });
}

function highlightStepper(stage) {
  [badgePrefill, badgeAttention, badgeLogits, badgeSample].forEach(b => b.classList.remove("highlight"));
  if (stage === "prefill") badgePrefill.classList.add("highlight");
  if (stage === "attention") badgeAttention.classList.add("highlight");
  if (stage === "logits") badgeLogits.classList.add("highlight");
  if (stage === "sample") badgeSample.classList.add("highlight");
}

// Milestone Handler: smoothly pauses playback and displays teaching moment in unified box
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

// Explain generation mechanics dynamically
function analyzeTokenGeneration(selectedToken, candidatePool, stepIndex, userPrompt) {
  const clean = selectedToken.trim().toLowerCase();
  const topCandidate = candidatePool[0];
  const isTopChoice = selectedToken === topCandidate.token;
  const isDeviation = !isTopChoice;

  let rationale = "";

  if (stepIndex === 0) {
    rationale = `
      <strong>How the First Thought Began (The "Prefill" Phase):</strong><br>
      The model converted your entire prompt into spatial vectors. In its training data, 
      questions like yours correlate heavily with starting candidate words like <code>"${candidatePool[0].token.replace(/\s/g, '·')}"</code> 
      (${ (candidatePool[0].prob * 100).toFixed(1) }%).
    `;
  } else if (isDeviation) {
    rationale = `
      <strong>🎲 The Randomness Dial (Temperature in Action):</strong><br>
      The #1 statistical candidate was <code>"${topCandidate.token.replace(/\s/g, '·')}"</code> (${(topCandidate.prob * 100).toFixed(1)}%). 
      However, temperature sampling chose runner-up <code>"${selectedToken.replace(/\s/g, '·')}"</code>, steering the reply onto a fresh path.
    `;
  } else if (['blue', 'green', 'red', 'purple', 'black', 'yellow', 'cyan', 'orange'].includes(clean)) {
    rationale = `
      <strong>Training Data Associations:</strong><br>
      The model has no personal opinions. In billions of training documents, questions asking about colors 
      correlate statistically with common color tokens. Attention heads activated these semantic weights.
    `;
  } else if (['because', 'as', 'since', 'reminds', 'feels', 'symbolizes'].includes(clean)) {
    rationale = `
      <strong>Answering Prompt Constraints:</strong><br>
      Because your prompt asked for reasoning (<em>"why"</em>), the self-attention mechanism elevated causal conjunctions 
      like <code>"${clean}"</code> to link into an explanation.
    `;
  } else if (['.', ',', ';'].includes(clean)) {
    rationale = `
      <strong>Grammatical Cadence & Boundaries:</strong><br>
      The preceding tokens completed a grammatical clause. Punctuation probability spiked to close the phrase.
    `;
  } else {
    rationale = `
      <strong>Autoregressive Prediction:</strong><br>
      <code>"${selectedToken.replace(/\s/g, '·')}"</code> won this slot with 
      <strong>${(candidatePool.find(c => c.id === candidatePool[0].id)?.prob * 100).toFixed(1)}%</strong> probability mass. 
      It is now appended to the prompt for the next pass.
    `;
  }

  return { rationale, isDeviation, topCandidate };
}

// Conclude Generation and launch Debrief Overlay
function concludeGeneration() {
  isPlaying = false;
  btnStream.textContent = "▶ Run Guided Walkthrough";
  replayControls.classList.remove("hidden");

  const totalTokens = tokenHistory.length;
  const deviations = tokenHistory.filter(t => t.isDeviation).length;
  const avgConf = (tokenHistory.reduce((acc, t) => {
    const winnerItem = t.candidatePool.find(c => c.id === t.tokenId);
    return acc + (winnerItem ? winnerItem.prob : 0.5);
  }, 0) / (totalTokens || 1) * 100).toFixed(1);

  statTotalTokens.textContent = totalTokens;
  statDeviations.textContent = deviations;
  statAvgConfidence.textContent = `${avgConf}%`;

  replayIndex = totalTokens - 1;
  updateReplayDisplay();

  setupMiniGame();

  // Show the debrief overlay
  debriefOverlay.classList.remove("hidden");
}

// Mini Game Setup
function setupMiniGame() {
  minigameResult.classList.add("hidden");
  minigameOptions.innerHTML = "";

  const interestingStep = tokenHistory.find(t => t.candidatePool.length >= 3 && t.candidatePool[0].prob < 0.75) || tokenHistory[1];
  if (!interestingStep) {
    minigameQuestion.textContent = "The model predicted each token with high certainty.";
    return;
  }

  const stepNum = tokenHistory.indexOf(interestingStep) + 1;
  const winner = interestingStep.tokenStr.trim();
  const topOdds = interestingStep.topCandidate.token.trim();

  minigameQuestion.innerHTML = `At word #${stepNum}, which candidate word had the highest statistical probability?`;

  const choices = interestingStep.candidatePool.slice(0, 3).map(c => c.token.trim());
  choices.sort(() => Math.random() - 0.5);

  choices.forEach(choice => {
    const btn = document.createElement("button");
    btn.className = "btn-game-opt";
    btn.textContent = `"${choice}"`;
    btn.addEventListener("click", () => {
      minigameResult.classList.remove("hidden");
      if (choice === topOdds) {
        minigameResult.innerHTML = `🎉 <strong>Correct!</strong> <code>"${topOdds}"</code> was the favorite at ${(interestingStep.topCandidate.prob * 100).toFixed(1)}% odds. The model selected <code>"${winner}"</code>.`;
      } else {
        minigameResult.innerHTML = `❌ <strong>Not quite!</strong> The #1 favorite was <code>"${topOdds}"</code> (${(interestingStep.topCandidate.prob * 100).toFixed(1)}%).`;
      }
    });
    minigameOptions.appendChild(btn);
  });
}

btnCloseDebrief.addEventListener("click", () => {
  debriefOverlay.classList.add("hidden");
});

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
      debriefOverlay.classList.add("hidden");
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

    // Check for EOS
    if (selected.token.includes("<|im_end|>") || selected.id === 2 || selected.id === 0) {
      concludeGeneration();
      isBusy = false;
      return;
    }

    renderProbChart(candidatePool, selected.id);

    const stepIdx = tokenHistory.length;
    const { rationale, isDeviation, topCandidate } = analyzeTokenGeneration(selected.token, candidatePool, stepIdx, rawPrompt);

    // Update standard explainer
    explainerBadge.textContent = `Word #${stepIdx + 1} Prediction`;
    explainerBadge.className = "badge";
    explainerContent.innerHTML = rationale;

    // Check for educational milestones to pause and highlight
    if (stepIdx === 0 && !shownMilestones.has("milestone_first")) {
      shownMilestones.add("milestone_first");
      showMilestone(
        "Key Concept: The First Token",
        `Notice the bar chart below! Language models do not plan complete sentences in advance. The model evaluated its dictionary for slot #1. Based on your prompt framing, <code>"${selected.token.replace(/\s/g, '·')}"</code> took the lead and was selected.`
      );
    } else if (isDeviation && !shownMilestones.has("milestone_deviation")) {
      shownMilestones.add("milestone_deviation");
      showMilestone(
        "Key Concept: Temperature Sampling",
        `Look at the probability bars! The #1 candidate was actually <strong>"${topCandidate.token.replace(/\s/g, '·')}"</strong> (${(topCandidate.prob * 100).toFixed(1)}%). Because your Temperature is set to <strong>${temp}</strong>, the model rolled the dice and selected runner-up <strong>"${selected.token.replace(/\s/g, '·')}"</strong>. This is how LLMs introduce variety and creativity.`
      );
    } else if (['blue', 'green', 'red', 'purple', 'because'].includes(selected.token.trim().toLowerCase()) && !shownMilestones.has("milestone_semantic")) {
      shownMilestones.add("milestone_semantic");
      showMilestone(
        "Key Concept: Training Data Patterns",
        `Where did <code>"${selected.token.trim()}"</code> come from? The model has no feelings or memories. During pretraining across billions of web pages and books, prompts asking about favorite colors overwhelmingly associate with color words. Multi-head attention activated those statistical pathways.`
      );
    }

    tokenHistory.push({
      tokenStr: selected.token,
      tokenId: selected.id,
      candidatePool: candidatePool,
      explanation: rationale,
      isDeviation: isDeviation,
      topCandidate: topCandidate
    });

    const span = document.createElement("span");
    span.className = "new-token";
    span.title = "Click to inspect this token's probability leaderboard";
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
  debriefOverlay.classList.add("hidden");
  replayControls.classList.add("hidden");
  explainerActions.classList.add("hidden");
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

  for (let i = 0; i < 35; i++) {
    if (!isPlaying) break;
    await stepModel();
    await new Promise(r => setTimeout(r, 600));
  }

  if (isPlaying) {
    concludeGeneration();
  }
});

btnReset.addEventListener("click", resetState);
btnRestartApp.addEventListener("click", () => {
  resetState();
  promptInput.focus();
});