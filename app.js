import { AutoTokenizer, AutoModelForCausalLM, env, Tensor } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.3.3';

env.allowLocalModels = false;
env.useBrowserCache = true;

// State
let tokenizer = null;
let model = null;
let tokenHistory = []; // { tokenStr, tokenId, candidatePool, explanation, contextLength }
let currentInputIds = null;
let isPlaying = false;
let isBusy = false;

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

// Modal
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

// Engine Setup
btnInit.addEventListener("click", async () => {
  if (model) return;

  btnInit.disabled = true;
  btnInit.textContent = "Loading Engine...";
  progressBarContainer.classList.remove("hidden");
  statusText.textContent = "Checking hardware acceleration...";

  const MODEL_ID = 'HuggingFaceTB/SmolLM2-135M-Instruct';

  const progressCallback = (info) => {
    if (info.status === 'progress' && info.total) {
      const pct = Math.round((info.loaded / info.total) * 100);
      progressFill.style.width = `${pct}%`;
      progressStatus.textContent = `Downloading ${info.file || 'model'}: ${pct}%`;
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
    console.warn("Falling back to CPU WebAssembly:", err);
    try {
      statusText.textContent = "Retrying with CPU WASM...";
      tokenizer = await AutoTokenizer.from_pretrained(MODEL_ID, { progress_callback: progressCallback });
      model = await AutoModelForCausalLM.from_pretrained(MODEL_ID, {
        dtype: 'q4',
        device: 'wasm',
        progress_callback: progressCallback
      });
      onEngineReady('wasm');
    } catch (fallbackErr) {
      statusText.textContent = "Initialization Failed";
      explainerText.innerHTML = `<span style="color: #f85149;">Error: ${fallbackErr.message}</span>`;
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

  explainerText.innerHTML = `<strong>Engine Loaded!</strong> Type a prompt and click <strong>Step</strong> or <strong>Auto Play</strong> to inspect the model's live calculations.`;
}

// Format prompt using SmolLM chat template so structural tokens don't leak
function formatChatPrompt(userText) {
  return `<|im_start|>user\n${userText}<|im_end|>\n<|im_start|>assistant\n`;
}

// Compute Softmax across Top-K logits
function getTopKSoftmax(logitsSlice, topK, temperature) {
  const temp = Math.max(0.01, parseFloat(temperature));
  
  // Find top K without sorting entire 49,152 vocab array
  const indexed = [];
  for (let i = 0; i < logitsSlice.length; i++) {
    indexed.push({ id: i, logit: logitsSlice[i] });
  }

  indexed.sort((a, b) => b.logit - a.logit);
  const topCandidates = indexed.slice(0, topK);

  // Softmax with temperature
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

// Generate contextual educational explanations
function buildEducationalExplanation(selectedTokenStr, candidatePool, promptContext, stepNumber) {
  const cleanToken = selectedTokenStr.trim();
  const topCandidate = candidatePool[0];
  const topTokenClean = topCandidate.token.trim();
  const isTopChoice = selectedTokenStr === topCandidate.token;
  const runnerUps = candidatePool.slice(1, 4).map(c => `<code>"${c.token.replace(/\s/g, '·')}"</code> (${(c.prob * 100).toFixed(1)}%)`).join(', ');

  let rationale = "";

  // Conceptual color tokens
  if (['blue', 'green', 'red', 'purple', 'black', 'yellow'].includes(cleanToken.toLowerCase())) {
    rationale = `
      <strong>Why "${cleanToken}"?</strong><br>
      The model does not have personal eyes or feelings. In millions of conversations, books, and web pages in its training data, 
      questions asking about <em>"favorite color"</em> are statistically answered with <em>"${cleanToken}"</em>, <em>"green"</em>, or <em>"red"</em>. 
      The self-attention layers linked the word <code>favorite</code> and <code>color</code> directly to color names, giving them the highest probability.
    `;
  } 
  // Reasoning & conjunctions
  else if (['because', 'as', 'since', 'due'].includes(cleanToken.toLowerCase())) {
    rationale = `
      <strong>Syntactic Pattern Recognition:</strong><br>
      Notice how the prompt asked <em>"...and why?"</em>. The attention mechanism kept track of that question mark and the word <code>why</code>. 
      In natural English grammar, answers immediately transition with <code>${cleanToken}</code> to satisfy the prompt's instruction.
    `;
  }
  // Punctuation and sentence breaks
  else if (['.', ',', '!', '?'].includes(cleanToken)) {
    rationale = `
      <strong>Cadence & Boundary Completion:</strong><br>
      The preceding tokens completed an independent clause. The model's weights strongly favor punctuation here to maintain grammatical rhythm before moving to the next thought.
    `;
  }
  // Generic tokens
  else {
    rationale = `
      <strong>Next-Token Election:</strong><br>
      Based on the preceding ${stepNumber} tokens, the network calculated likelihoods across its entire 49,000-token dictionary. 
      ${isTopChoice 
        ? `<code>"${selectedTokenStr.replace(/\s/g, '·')}"</code> was the statistical front-runner at <strong>${(topCandidate.prob * 100).toFixed(1)}%</strong>.` 
        : `Even though <code>"${topTokenClean}"</code> was leading (${(topCandidate.prob * 100).toFixed(1)}%), temperature sampling chose runner-up <code>"${selectedTokenStr.replace(/\s/g, '·')}"</code>.`}
      <br>Other top contenders were: ${runnerUps}.
    `;
  }

  return rationale;
}

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

// Render Probability Bar Chart
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

// Replay an earlier step when user clicks a word
function inspectTokenStep(index) {
  const step = tokenHistory[index];
  if (!step) return;

  renderProbChart(step.candidatePool, step.tokenId);
  explainerText.innerHTML = step.explanation;

  // Highlight selected chip
  const allSpans = liveText.querySelectorAll('.new-token');
  allSpans.forEach((span, i) => {
    span.style.outline = (i === index) ? '2px solid #58a6ff' : 'none';
  });
}

// Single Autoregressive Step
async function stepModel() {
  if (!model || !tokenizer || isBusy) return;
  isBusy = true;

  try {
    // Initial prompt setup
    if (!currentInputIds) {
      const rawText = promptInput.value.trim();
      if (!rawText) {
        isBusy = false;
        return;
      }

      const formatted = formatChatPrompt(rawText);
      const encoded = await tokenizer(formatted);
      currentInputIds = encoded.input_ids;
      tokenHistory = [];
      liveText.innerHTML = "";
    }

    const currentArray = Array.from(currentInputIds.data).map(Number);
    renderTokens(currentArray);

    // Create explicit attention mask for all active tokens
    const seqLength = currentInputIds.dims[1];
    const maskData = new BigInt64Array(seqLength).fill(1n);
    const attentionMask = new Tensor('int64', maskData, [1, seqLength]);

    // Forward pass
    const output = await model({
      input_ids: currentInputIds,
      attention_mask: attentionMask
    });

    // Extract logits for the final token position
    const vocabSize = output.logits.dims[2];
    const lastOffset = (seqLength - 1) * vocabSize;
    const logitsSlice = output.logits.data.subarray(lastOffset, lastOffset + vocabSize);

    const temp = parseFloat(tempSlider.value);
    const topK = parseInt(topkSlider.value, 10);
    const candidatePool = getTopKSoftmax(logitsSlice, topK, temp);

    // Roulette sampling
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

    // Stop if End-of-Sequence token is hit
    if (selected.token.includes("<|im_end|>") || selected.id === 2 || selected.id === 0) {
      explainerText.innerHTML = `<strong>Generation Finished:</strong> The model predicted the End-of-Sequence token (<code>&lt;|im_end|&gt;</code>), signaling that the answer is complete.`;
      isStreaming = false;
      isPlaying = false;
      btnStream.textContent = "⏩ Auto Play";
      isBusy = false;
      return;
    }

    // Render bar chart
    renderProbChart(candidatePool, selected.id);

    // Build plain-English educational explanation
    const explanation = buildEducationalExplanation(selected.token, candidatePool, promptInput.value, tokenHistory.length + 1);
    explainerText.innerHTML = explanation;

    // Save step to history for interactive clicking
    const stepIdx = tokenHistory.length;
    tokenHistory.push({
      tokenStr: selected.token,
      tokenId: selected.id,
      candidatePool: candidatePool,
      explanation: explanation
    });

    // Append to live text box with click listener
    const span = document.createElement("span");
    span.className = "new-token";
    span.style.cursor = "pointer";
    span.title = "Click to see why AI wrote this word";
    span.textContent = selected.token;
    span.addEventListener("click", () => inspectTokenStep(stepIdx));
    liveText.appendChild(span);

    // Append to tensor for the next autoregressive iteration
    const nextBigInt = BigInt(selected.id);
    const nextArr = new BigInt64Array(currentArray.length + 1);
    for (let i = 0; i < currentArray.length; i++) {
      nextArr[i] = BigInt(currentArray[i]);
    }
    nextArr[currentArray.length] = nextBigInt;

    currentInputIds = new Tensor('int64', nextArr, [1, currentArray.length + 1]);
    renderTokens(Array.from(nextArr).map(Number));

  } catch (err) {
    console.error("Step execution error:", err);
    explainerText.innerHTML = `<span style="color: #f85149;">Inference error: ${err.message}</span>`;
  } finally {
    isBusy = false;
  }
}

// Event Bindings
btnStep.addEventListener("click", () => {
  stepModel();
});

btnStream.addEventListener("click", async () => {
  if (isPlaying) {
    isPlaying = false;
    btnStream.textContent = "⏩ Auto Play";
    return;
  }

  isPlaying = true;
  btnStream.textContent = "⏸ Pause";

  for (let i = 0; i < 35; i++) {
    if (!isPlaying) break;
    await stepModel();
    // 500ms delay gives users time to watch probabilities shift
    await new Promise(r => setTimeout(r, 500));
  }

  isPlaying = false;
  btnStream.textContent = "⏩ Auto Play";
});

btnReset.addEventListener("click", () => {
  isPlaying = false;
  isBusy = false;
  btnStream.textContent = "⏩ Auto Play";
  currentInputIds = null;
  tokenHistory = [];
  liveText.innerHTML = "";
  probChart.innerHTML = '<div class="empty-state">Inference reset. Ready for a new prompt.</div>';
  explainerText.innerHTML = 'Prompt reset. Enter any prompt and click <strong>Step</strong> or <strong>Auto Play</strong>.';
  tokenChips.innerHTML = '<div class="empty-state">Context tokens will appear here.</div>';
});