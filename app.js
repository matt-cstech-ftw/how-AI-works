import { AutoTokenizer, AutoModelForCausalLM, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.3.3';

// Configure ONNX Web runtime
env.allowLocalModels = false;
env.useBrowserCache = true;

// State
let tokenizer = null;
let model = null;
let currentInputIds = null;
let currentAttentionMask = null;
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

if (btnModalAgree && modal) {
  btnModalAgree.addEventListener("click", () => {
    modal.classList.add("hidden");
  });
}

tempSlider.addEventListener("input", (e) => {
  tempVal.textContent = e.target.value;
});

topkSlider.addEventListener("input", (e) => {
  topkVal.textContent = e.target.value;
});

async function checkWebGPUSupport() {
  if (!navigator.gpu) return false;
  try {
    const adapter = await navigator.gpu.requestAdapter();
    return !!adapter;
  } catch (e) {
    return false;
  }
}

// Initialize engine
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

    tokenizer = await AutoTokenizer.from_pretrained(MODEL_ID, {
      progress_callback: progressCallback
    });

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

    explainerText.innerHTML = `<strong>Engine Ready!</strong> Running SmolLM2-135M on <strong>${targetDevice.toUpperCase()}</strong>. Type your prompt and click <strong>Step</strong>.`;

  } catch (err) {
    console.warn("Primary load failed, trying WASM CPU fallback:", err);
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

      explainerText.innerHTML = `<strong>Engine Ready!</strong> Running SmolLM2-135M via CPU WebAssembly. Type your prompt and click <strong>Step</strong>.`;
    } catch (fallbackErr) {
      console.error("Initialization error:", fallbackErr);
      statusText.textContent = "Initialization Failed";
      progressBarContainer.classList.add("hidden");
      explainerText.innerHTML = `<span style="color: #f85149;">Error initializing model: ${fallbackErr.message}</span>`;
      btnInit.disabled = false;
      btnInit.textContent = "Retry";
    }
  }
});

// Render token badges
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

// Compute Softmax probabilities over Top-K
function getTopKWithSoftmax(logitsSlice, topK, temperature) {
  const temp = Math.max(0.01, parseFloat(temperature));
  const indexed = [];

  for (let i = 0; i < logitsSlice.length; i++) {
    indexed.push({ id: i, logit: logitsSlice[i] });
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

// Render probability bars
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

// Single step prediction
async function stepModel() {
  if (!model || !tokenizer || isBusy) return;
  isBusy = true;

  try {
    // Fresh run: Tokenize user prompt
    if (!currentInputIds) {
      const text = promptInput.value;
      if (!text.trim()) {
        isBusy = false;
        return;
      }
      const encoded = await tokenizer(text);
      currentInputIds = encoded.input_ids;
      currentAttentionMask = encoded.attention_mask;
      generatedTokens = [];
      liveText.textContent = "";
    }

    const currentTokensArray = Array.from(currentInputIds.data).map(Number);
    renderTokens(currentTokensArray);

    // Call generate with full mask to get logits cleanly
    const genResult = await model.generate({
      input_ids: currentInputIds,
      attention_mask: currentAttentionMask,
      max_new_tokens: 1,
      return_dict_in_generate: true,
      output_logits: true
    });

    // Extract logits for candidate visualization
    const logitsTensor = genResult.logits ? genResult.logits[0] : null;
    let candidatePool = [];
    let selectedTokenId = null;

    if (logitsTensor) {
      const vocabSize = logitsTensor.dims[logitsTensor.dims.length - 1];
      const logitsData = logitsTensor.data.subarray(logitsTensor.data.length - vocabSize);
      const temp = parseFloat(tempSlider.value);
      const topK = parseInt(topkSlider.value, 10);
      candidatePool = getTopKWithSoftmax(logitsData, topK, temp);
    }

    // Determine chosen token from sequence output
    const allOutTokens = Array.from(genResult.sequences.data).map(Number);
    selectedTokenId = allOutTokens[allOutTokens.length - 1];
    const selectedTokenStr = tokenizer.decode([selectedTokenId]);

    // Update input_ids and attention_mask tensors for the next autoregressive cycle
    currentInputIds = genResult.sequences;
    const Tensor = currentInputIds.constructor;
    const newMaskData = new BigInt64Array(currentInputIds.dims[1]).fill(1n);
    currentAttentionMask = new Tensor('int64', newMaskData, [1, currentInputIds.dims[1]]);

    // Render candidate rankings
    if (candidatePool.length > 0) {
      renderProbabilities(candidatePool, selectedTokenId);
    }

    generatedTokens.push(selectedTokenStr);
    liveText.innerHTML = generatedTokens.map(t => `<span class="new-token">${t}</span>`).join("");

    const topWord = candidatePool.length > 0 ? candidatePool[0].token.replace(/\s/g, '·') : selectedTokenStr;
    const topPct = candidatePool.length > 0 ? (candidatePool[0].prob * 100).toFixed(1) : '100';

    explainerText.innerHTML = `
      <strong>Autoregressive Step Complete:</strong><br>
      The model processed all <code>${currentTokensArray.length}</code> tokens. 
      The highest-probability candidate was <code>"${topWord}"</code> (${topPct}%). 
      The model selected <code>"${selectedTokenStr.replace(/\s/g, '·')}"</code> and fed it back into context.
    `;

    renderTokens(Array.from(currentInputIds.data).map(Number));

  } catch (err) {
    console.error("Step execution error:", err);
    explainerText.innerHTML = `<span style="color: #f85149;">Error during inference: ${err.message}</span>`;
  } finally {
    isBusy = false;
  }
}

// Event bindings
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
  currentAttentionMask = null;
  generatedTokens = [];
  liveText.innerHTML = "";
  probChart.innerHTML = '<div class="empty-state">Inference reset. Ready for new prompt.</div>';
  explainerText.innerHTML = 'Prompt reset. Enter any question and click <strong>Step</strong> to run.';
  tokenChips.innerHTML = "";
});