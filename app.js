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
const btnStep = document.getElementById("btn-step");
const btnStream = document.getElementById("btn-stream");
const btnReset = document.getElementById("btn-reset");
const liveText = document.getElementById("live-text");
const tokenChips = document.getElementById("token-chips");
const probChart = document.getElementById("probability-chart");
const explainerText = document.getElementById("explainer-text");
const statusDot = document.getElementById("status-dot");
const statusText = document.getElementById("status-text");
const progressBarContainer = document.getElementById("download-progress-bar");
const progressFill = document.getElementById("progress-fill");
const progressStatus = document.getElementById("progress-status");

// Tour Elements
const tourCard = document.getElementById("tour-card");
const tourStepBadge = document.getElementById("tour-step-badge");
const tourTitle = document.getElementById("tour-title");
const tourBody = document.getElementById("tour-body");
const btnCloseTour = document.getElementById("btn-close-tour");
const btnContinueTour = document.getElementById("btn-continue-tour");

// Flow badges
const badgePrefill = document.getElementById("badge-prefill");
const badgeAttention = document.getElementById("badge-attention");
const badgeLogits = document.getElementById("badge-logits");
const badgeSample = document.getElementById("badge-sample");

// Debrief & Replay Elements
const debriefPanel = document.getElementById("debrief-panel");
const statTotalTokens = document.getElementById("stat-total-tokens");
const statDeviations = document.getElementById("stat-deviations");
const statAvgConfidence = document.getElementById("stat-avg-confidence");
const minigameQuestion = document.getElementById("minigame-question");
const minigameOptions = document.getElementById("minigame-options");
const minigameResult = document.getElementById("minigame-result");
const btnRestartApp = document.getElementById("btn-restart-app");
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

// Check WebGPU availability
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
      explainerText.innerHTML = `<span style="color: #f85149;">Error initializing model: ${fallbackErr.message}</span>`;
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
  btnStep.disabled = false;
  btnStream.disabled = false;

  explainerText.innerHTML = `<strong>Engine Ready!</strong> Type any prompt and click <strong>Guided Auto Play</strong> to watch the model write and explain its internal mechanics.`;
}

// Chat formatting
function formatChatPrompt(userText) {
  return `<|im_start|>user\n${userText}<|im_end|>\n<|im_start|>assistant\n`;
}

// Compute Softmax across top candidates
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

// Show Tour Popover (Safely anchored top-right without covering the chart)
function triggerTourMilestone(stepKey, title, badge, contentHtml) {
  if (shownMilestones.has(stepKey)) return;
  shownMilestones.add(stepKey);

  tourStepBadge.textContent = badge;
  tourTitle.textContent = title;
  tourBody.innerHTML = contentHtml;
  tourCard.classList.remove("hidden");

  if (isPlaying) {
    isPlaying = false;
    btnStream.textContent = "⏩ Resume Auto Play";
  }
}

btnCloseTour.addEventListener("click", () => tourCard.classList.add("hidden"));
btnContinueTour.addEventListener("click", () => {
  tourCard.classList.add("hidden");
  if (!isPlaying) {
    btnStream.click();
  }
});

// Render token chips
function renderTokens(tokenIds) {
  tokenChips.innerHTML = "";
  tokenIds.forEach(id => {
    const textChunk = tokenizer.decode([id]);
    const chip = document.createElement("div");
    chip.className = "token-chip";
    chip.innerHTML = `<span>${textChunk.replace(/\s/g, "·")}</span><span class="tok-id">#${id}</span>`;
    tokenChips.appendChild(chip);
  });
}

// Render probability bars
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

function analyzeTokenGeneration(selectedToken, candidatePool, stepIndex, userPrompt) {
  const clean = selectedToken.trim().toLowerCase();
  const topCandidate = candidatePool[0];
  const isTopChoice = selectedToken === topCandidate.token;
  const isDeviation = !isTopChoice;

  let rationale = "";

  if (stepIndex === 0) {
    rationale = `
      <strong>How the First Thought Began (The "Prefill" Phase):</strong><br>
      When you click submit, the model doesn't start typing immediately. It first ingests your entire prompt simultaneously. 
      Because your prompt begins with <em>"What is..."</em>, conversation pairs in the pre-training data taught the model 
      that answers should start from the speaker's perspective. That is why candidate tokens like <code>"I"</code>, <code>"My"</code>, 
      or <code>"As"</code> dominated the probability leaderboard.
    `;
  } else if (isDeviation) {
    rationale = `
      <strong>🎲 The Randomness Dial (Temperature in Action):</strong><br>
      Notice the leaderboard below! The statistical favorite was actually <code>"${topCandidate.token.replace(/\s/g, '·')}"</code> (${(topCandidate.prob * 100).toFixed(1)}%). 
      However, because temperature is set above 0.0, the model deliberately rolled a die across the candidates instead of greedily picking #1. 
      It selected runner-up <code>"${selectedToken.replace(/\s/g, '·')}"</code>, which shifts the rest of the sentence onto a fresh trajectory!
    `;
  } else if (['blue', 'green', 'red', 'purple', 'black', 'yellow', 'cyan', 'orange'].includes(clean)) {
    rationale = `
      <strong>Where Did the Knowledge Come From?</strong><br>
      The model doesn't have a personal favorite color. In pre-training text (web scrapes, Wikipedia, books), questions asking 
      <em>"What is your favorite color"</em> correlate overwhelmingly with popular color tokens like <code>"${clean}"</code> and <code>"green"</code>. 
      The multi-head attention spotlight linked back to the word <code>color</code> in your prompt, activating the weights for this specific answer.
    `;
  } else if (['because', 'as', 'since', 'reminds', 'feels', 'symbolizes'].includes(clean)) {
    rationale = `
      <strong>Answering the "Why" Constraint:</strong><br>
      The model maintains attention on every preceding token. Because your prompt contained the instruction <em>"...and why?"</em>, 
      the model's grammar weights heavily elevate causal conjunctions like <code>"${clean}"</code> to bridge into an explanation.
    `;
  } else if (['.', ',', ';'].includes(clean)) {
    rationale = `
      <strong>Grammatical Cadence & Completion:</strong><br>
      The model detected that a complete grammatical clause just finished. Punctuation tokens spiked in probability to close the thought before generating the next idea.
    `;
  } else {
    rationale = `
      <strong>Autoregressive Prediction:</strong><br>
      The model evaluated its vocabulary given all previous words. <code>"${selectedToken.replace(/\s/g, '·')}"</code> won this slot with 
      <strong>${(candidatePool.find(c => c.id === candidatePool[0].id)?.prob * 100).toFixed(1)}%</strong> of the probability mass. 
      This word is now appended to the prompt, and the loop repeats from scratch.
    `;
  }

  return { rationale, isDeviation, topCandidate };
}

// Complete the run and show the debrief panel
function concludeGeneration() {
  isPlaying = false;
  btnStream.textContent = "⏩ Guided Auto Play";
  tourCard.classList.add("hidden");
  debriefPanel.classList.remove("hidden");
  replayControls.classList.remove("hidden");

  // Calculate telemetry stats
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

  // Setup Mini-Game
  setupMiniGame();

  explainerText.innerHTML = `
    <strong>Generation Finished!</strong><br>
    The model has reached an end boundary. Review the summary metrics below or use the <strong>Replay (◀ / ▶)</strong> controls at the top right to walk through the model's choices token-by-token.
  `;
}

// Setup the "Guess the Model Choice" mini-game
function setupMiniGame() {
  minigameResult.classList.add("hidden");
  minigameOptions.innerHTML = "";

  // Find a step where candidate pool had a competitive race
  const interestingStep = tokenHistory.find(t => t.candidatePool.length >= 3 && t.candidatePool[0].prob < 0.7) || tokenHistory[1];
  if (!interestingStep) {
    minigameQuestion.textContent = "The model generated its thoughts cleanly with high confidence across all tokens.";
    return;
  }

  const stepNum = tokenHistory.indexOf(interestingStep) + 1;
  const winner = interestingStep.tokenStr.trim();
  const topOdds = interestingStep.topCandidate.token.trim();

  minigameQuestion.innerHTML = `At word #${stepNum}, which token was the #1 statistical choice before sampling?`;

  // Create choices from candidate pool
  const choices = interestingStep.candidatePool.slice(0, 3).map(c => c.token.trim());
  // Shuffle
  choices.sort(() => Math.random() - 0.5);

  choices.forEach(choice => {
    const btn = document.createElement("button");
    btn.className = "btn-game-opt";
    btn.textContent = `"${choice}"`;
    btn.addEventListener("click", () => {
      minigameResult.classList.remove("hidden");
      if (choice === topOdds) {
        minigameResult.innerHTML = `🎉 <strong>Correct!</strong> <code>"${topOdds}"</code> was the favorite at ${(interestingStep.topCandidate.prob * 100).toFixed(1)}% odds. The model ended up selecting <code>"${winner}"</code>.`;
      } else {
        minigameResult.innerHTML = `❌ <strong>Not quite!</strong> The actual #1 statistical favorite was <code>"${topOdds}"</code> (${(interestingStep.topCandidate.prob * 100).toFixed(1)}%).`;
      }
    });
    minigameOptions.appendChild(btn);
  });
}

// Step replay controls
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

// Single Autoregressive Inference Step
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
      debriefPanel.classList.add("hidden");
      replayControls.classList.add("hidden");

      triggerTourMilestone(
        "prefill",
        "The 'Thinking' Phase: Prompt Prefill",
        "Prefill Phase",
        `Before an AI generates word #1, it doesn't plan sentences. It translates your entire prompt into token numbers, loads them into high-dimensional vector space, and runs self-attention to see how words relate. Watch how it predicts its very first token!`
      );
    }

    const currentTokensArray = Array.from(currentInputIds.data).map(Number);
    renderTokens(currentTokensArray);

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
      concludeGeneration();
      isBusy = false;
      return;
    }

    renderProbChart(candidatePool, selected.id);

    const stepIdx = tokenHistory.length;
    const { rationale, isDeviation, topCandidate } = analyzeTokenGeneration(selected.token, candidatePool, stepIdx, rawPrompt);
    explainerText.innerHTML = rationale;

    // Tour callouts
    if (stepIdx === 0) {
      triggerTourMilestone(
        "first_word",
        "How the First Token is Decided",
        "The Probability Election",
        `Look at the probability bars in the bottom right! The model didn't pick <code>"${selected.token.replace(/\s/g, '·')}"</code> out of thin air. It evaluated every possible word in its vocabulary. Because questions like <em>"What is..."</em> usually start with <em>"I"</em> or <em>"My"</em>, those candidates received the highest mathematical probability.`
      );
    } else if (isDeviation && !shownMilestones.has("sampling_deviation")) {
      triggerTourMilestone(
        "sampling_deviation",
        "A Temperature Surprise (Sampling in Action)",
        "Creativity & Randomness",
        `Notice the leaderboard! The #1 predicted word was actually <strong>"${candidatePool[0].token.replace(/\s/g, '·')}"</strong>, but your temperature setting caused the model to pick runner-up <strong>"${selected.token.replace(/\s/g, '·')}"</strong> instead. This is how LLMs produce different answers every time you ask the exact same question!`
      );
    } else if (['blue', 'green', 'red', 'purple', 'because'].includes(selected.token.trim().toLowerCase()) && !shownMilestones.has("semantic_choice")) {
      triggerTourMilestone(
        "semantic_choice",
        "Where the Concept Came From",
        "Training Associations",
        `Why did the model pick <code>"${selected.token.trim()}"</code>? The model has no personal feelings. In its training data of billions of web pages and books, discussions about <em>"favorite colors"</em> repeatedly feature these specific words. Attention layers linked your prompt directly to these semantic weights.`
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
    renderTokens(Array.from(nextArr).map(Number));

  } catch (err) {
    console.error("Step execution error:", err);
    explainerText.innerHTML = `<span style="color: #f85149;">Inference error: ${err.message}</span>`;
  } finally {
    isBusy = false;
  }
}

function inspectHistoryStep(index) {
  const step = tokenHistory[index];
  if (!step) return;

  renderProbChart(step.candidatePool, step.tokenId);
  explainerText.innerHTML = step.explanation;

  const allSpans = liveText.querySelectorAll('.new-token');
  allSpans.forEach((span, i) => {
    span.classList.toggle('active-inspect', i === index);
  });
}

// Reset Handler
function resetState() {
  isPlaying = false;
  isBusy = false;
  btnStream.textContent = "⏩ Guided Auto Play";
  currentInputIds = null;
  tokenHistory = [];
  shownMilestones.clear();
  tourCard.classList.add("hidden");
  debriefPanel.classList.add("hidden");
  replayControls.classList.add("hidden");
  liveText.innerHTML = "";
  probChart.innerHTML = '<div class="empty-state">Inference reset. Ready for a new prompt.</div>';
  explainerText.innerHTML = 'Prompt reset. Enter any prompt and click <strong>Step</strong> or <strong>Guided Auto Play</strong>.';
  tokenChips.innerHTML = '<div class="empty-state">Context tokens will appear here after starting.</div>';
  [badgePrefill, badgeAttention, badgeLogits, badgeSample].forEach(b => b.classList.remove("highlight"));
}

// Event Bindings
btnStep.addEventListener("click", () => {
  stepModel();
});

btnStream.addEventListener("click", async () => {
  if (isPlaying) {
    isPlaying = false;
    btnStream.textContent = "⏩ Guided Auto Play";
    return;
  }

  isPlaying = true;
  btnStream.textContent = "⏸ Pause Playback";

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
btnRestartApp.addEventListener("click", resetState);