import { AutoTokenizer, AutoModelForCausalLM, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.3.3';

// Configure ONNX Web runtime paths and fallbacks
env.allowLocalModels = false;
env.useBrowserCache = true;

// State
let tokenizer = null;
let model = null;
let currentInputIds = null;
let generatedTokens = [];
let isStreaming = false;
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

// Modal Dismiss
if (btnModalAgree && modal) {
  btnModalAgree.addEventListener("click", () => {
    modal.classList.add("hidden");
  });
}

// Sliders
tempSlider.addEventListener("input", (e) => {
  tempVal.textContent = e.target.value;
});

topkSlider.addEventListener("input", (e) => {
  topkVal.textContent = e.target.value;
});

// Helper: Check if WebGPU is genuinely accessible
async function checkWebGPUSupport() {
  if (!navigator.gpu) return false;
  try {
    const adapter = await navigator.gpu.requestAdapter();
    return !!adapter;
  } catch (e) {
    return false;
  }
}

// Initialize engine with dynamic device detection
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
      progressStatus.textContent = `Downloading ${info.file || 'weights'}: ${pct}%`;
    } else if (info.status === 'done') {
      progressStatus.textContent = `Loaded ${info.file || 'file'}`;
    }
  };

  try {
    const hasWebGPU = await checkWebGPUSupport();
    const targetDevice = hasWebGPU ? 'webgpu' : 'wasm';
    
    statusText.textContent = `Loading on ${targetDevice.toUpperCase()}...`;

    // 1. Load Tokenizer
    tokenizer = await AutoTokenizer.from_pretrained(MODEL_ID, {
      progress_callback: progressCallback
    });

    // 2. Load Model (WebGPU if supported, otherwise pure WebAssembly)
    model = await AutoModelForCausalLM.from_pretrained(MODEL_ID, {
      dtype: 'q4',
      device: targetDevice,
      progress_callback: progressCallback
    });

    statusDot.classList.add("ready");
    statusText.textContent = `Ready (${targetDevice.toUpperCase()} Engine)`;
    progressBarContainer.classList.add("hidden");
    btnInit.style.display = "none";
    btnStep.disabled = false;
    btnStream.disabled = false;

    explainerText.innerHTML = `<strong>Engine Ready!</strong> Running SmolLM2-135M via <strong>${targetDevice.toUpperCase()}</strong>. Type your prompt and click <strong>Step</strong> to run.`;

  } catch (err) {
    console.warn("Primary load failed, forcing fallback to CPU WASM:", err);
    try {
      statusText.textContent = "Retrying in safe CPU (WASM) mode...";
      
      tokenizer = await AutoTokenizer.from_pretrained(MODEL_ID, {
        progress_callback: progressCallback
      });

      model = await AutoModelForCausalLM.from_pretrained(MODEL_ID, {
        dtype: 'q4',
        device: 'wasm',
        progress_callback: progressCallback
      });

      statusDot.classList.add("ready");
      statusText.textContent = "Ready (CPU WASM Engine)";
      progressBarContainer.classList.add("hidden");
      btnInit.style.display = "none";
      btnStep.disabled = false;
      btnStream.disabled = false;

      explainerText.innerHTML = `<strong>Engine Ready!</strong> Running SmolLM2-135M via CPU WebAssembly. Type your prompt and click <strong>Step</strong> to inspect.`;
    } catch (fallbackErr) {
      console.error("Fatal initialization error:", fallbackErr);
      statusText.textContent = "Initialization Failed";
      progressBarContainer.classList.add("hidden");
      explainerText.innerHTML = `<span style="color: #f85149;">Failed to initialize model: ${fallbackErr.message}</span>`;
      btnInit.disabled = false;
      btnInit.textContent = "Retry";
    }
  }
});

// Render token chips
function renderTokens(tokenIds) {
  tokenChips.innerHTML = "";
  for (let i = 0; i < tokenIds.length; i++) {
    const id = Number(tokenIds[i]);
    const textChunk = tokenizer.decode([id]);
    const chip = document.createElement("div");
    chip.className = "token-chip";
    chip.innerHTML = `<span>${textChunk.replace(/\s/g, "·")}</span><span class="tok-id">#${id}</span>`;
    tokenChips.appendChild(chip);
  }
}

// Compute Softmax over top-K logits
function getTopKWithSoftmax(logitsArray, topK, temperature) {
  const temp = Math.max(0.01, parseFloat(temperature));
  
  const indexed = [];
  for (let i = 0; i < logitsArray.length; i++) {
    indexed.push({ id: i, logit: logitsArray[i] });
  }

  indexed.sort((a, b) => b.logit - a.logit);
  const candidates = indexed.slice(0, topK);

  const scaled = candidates.map(c => c.logit / temp);
  const maxScaled = Math.max(...scaled);
  const exps = scaled.map(s => Math.exp(s - maxScaled));
  const sumExp = exps.reduce((a, b) => a + b, 0);

  return candidates.map((c, idx) => ({
    id: c.id,
    token: tokenizer.decode([c.id]),
    prob: exps[idx] / sumExp
  }));
}

// Render candidate probabilities chart
function renderProbabilities(candidates, chosenTokenId) {
  probChart.innerHTML = "";
  candidates.forEach(item => {
    const pct = (item.prob * 100).toFixed(1);
    const row = document.createElement("div");
    row.className = "prob-row";
    const isWinner = item.id === chosenTokenId;

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

// Predict one token using the real model
async function stepModel() {
  if (!model || !tokenizer || isBusy) return;
  isBusy = true;

  try {
    if (!currentInputIds) {
      const text = promptInput.value;
      if (!text.trim()) {
        isBusy = false;
        return;
      }
      const encoded = await tokenizer(text);
      currentInputIds = encoded.input_ids;
      generatedTokens = [];
      liveText.textContent = "";
    }

    const currentTokensArray = Array.from(currentInputIds.data).map(Number);
    renderTokens(currentTokensArray);

    // Forward pass
    const output = await model({ input_ids: currentInputIds });
    
    const seqLength = currentInputIds.dims[1];
    const vocabSize = output.logits.dims[2];
    
    const lastTokenLogitsOffset = (seqLength - 1) * vocabSize;
    const logitsSlice = output.logits.data.subarray(lastTokenLogitsOffset, lastTokenLogitsOffset + vocabSize);

    const temp = parseFloat(tempSlider.value);
    const topK = parseInt(topkSlider.value, 10);
    const candidatePool = getTopKWithSoftmax(logitsSlice, topK, temp);

    // Roulette-wheel sampling
    const rand = Math.random();
    let cumulative = 0;
    let selectedItem = candidatePool[0];

    for (const item of candidatePool) {
      cumulative += item.prob;
      if (rand <= cumulative) {
        selectedItem = item;
        break;
      }
    }

    renderProbabilities(candidatePool, selectedItem.id);

    // Concatenate new token to input tensor
    const nextId = BigInt(selectedItem.id);
    const newLength = currentTokensArray.length + 1;
    const newBigIntArray = new BigInt64Array(newLength);
    for (let i = 0; i < currentTokensArray.length; i++) {
      newBigIntArray[i] = BigInt(currentTokensArray[i]);
    }
    newBigIntArray[newLength - 1] = nextId;

    const Tensor = currentInputIds.constructor;
    currentInputIds = new Tensor('int64', newBigIntArray, [1, newLength]);

    // Update text
    generatedTokens.push(selectedItem.token);
    liveText.innerHTML = generatedTokens.map(t => `<span class="new-token">${t}</span>`).join("");

    explainerText.innerHTML = `
      <strong>Autoregressive Step Complete:</strong><br>
      The network scanned all <code>${currentTokensArray.length}</code> tokens in memory. Its #1 calculated 
      candidate was <code>"${candidatePool[0].token.replace(/\s/g, '·')}"</code> (${(candidatePool[0].prob * 100).toFixed(1)}%). 
      With temperature at <strong>${temp}</strong>, it sampled <code>"${selectedItem.token.replace(/\s/g, '·')}"</code> 
      and appended it to the prompt.
    `;

    renderTokens(Array.from(newBigIntArray).map(Number));

  } catch (err) {
    console.error("Inference step error:", err);
    explainerText.innerHTML = `<span style="color: #f85149;">Error during inference: ${err.message}</span>`;
  } finally {
    isBusy = false;
  }
}

// Event Listeners
btnStep.addEventListener("click", () => {
  stepModel();
});

btnStream.addEventListener("click", async () => {
  if (isStreaming) {
    isStreaming = false;
    btnStream.textContent = "⏩ Auto Generate";
    return;
  }

  isStreaming = true;
  btnStream.textContent = "⏹ Stop Generation";

  for (let i = 0; i < 25; i++) {
    if (!isStreaming) break;
    await stepModel();
    await new Promise(r => setTimeout(r, 60));
  }

  isStreaming = false;
  btnStream.textContent = "⏩ Auto Generate";
});

btnReset.addEventListener("click", () => {
  isStreaming = false;
  isBusy = false;
  btnStream.textContent = "⏩ Auto Generate";
  currentInputIds = null;
  generatedTokens = [];
  liveText.innerHTML = "";
  probChart.innerHTML = '<div class="empty-state">Inference reset. Ready for new prompt.</div>';
  explainerText.innerHTML = 'Prompt reset. Enter any question and click <strong>Step</strong> to run.';
  tokenChips.innerHTML = "";
});