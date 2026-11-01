import { AutoTokenizer, AutoModelForCausalLM } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.3.3';

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
btnModalAgree.addEventListener("click", () => {
  modal.classList.add("hidden");
});

// Slider inputs
tempSlider.addEventListener("input", (e) => {
  tempVal.textContent = e.target.value;
});

topkSlider.addEventListener("input", (e) => {
  topkVal.textContent = e.target.value;
});

// Initialize real in-browser SmolLM2 engine
btnInit.addEventListener("click", async () => {
  if (model) return;

  btnInit.disabled = true;
  btnInit.textContent = "Loading Engine...";
  progressBarContainer.classList.remove("hidden");
  statusText.textContent = "Downloading model weights...";

  try {
    const MODEL_ID = 'HuggingFaceTB/SmolLM2-135M-Instruct';

    const progressCallback = (info) => {
      if (info.status === 'progress' && info.total) {
        const pct = Math.round((info.loaded / info.total) * 100);
        progressFill.style.width = `${pct}%`;
        progressStatus.textContent = `Downloading ${info.file}: ${pct}%`;
      } else if (info.status === 'done') {
        progressStatus.textContent = `Loaded ${info.file}`;
      }
    };

    // Load Tokenizer
    tokenizer = await AutoTokenizer.from_pretrained(MODEL_ID, {
      progress_callback: progressCallback
    });

    // Load quantized ONNX weights (runs via WebGPU or WASM)
    model = await AutoModelForCausalLM.from_pretrained(MODEL_ID, {
      dtype: 'q4',
      device: 'webgpu',
      progress_callback: progressCallback
    });

    statusDot.classList.add("ready");
    statusText.textContent = "Engine Ready (SmolLM2-135M)";
    progressBarContainer.classList.add("hidden");
    btnInit.style.display = "none";
    btnStep.disabled = false;
    btnStream.disabled = false;

    explainerText.innerHTML = `<strong>Engine Loaded!</strong> Type anything in the box and click <strong>Step</strong> to see the model calculate real word predictions.`;
  } catch (err) {
    console.warn("WebGPU not available or download failed, falling back to WASM:", err);
    try {
      const MODEL_ID = 'HuggingFaceTB/SmolLM2-135M-Instruct';
      model = await AutoModelForCausalLM.from_pretrained(MODEL_ID, {
        dtype: 'q4',
        device: 'wasm'
      });
      statusDot.classList.add("ready");
      statusText.textContent = "Engine Ready (WASM CPU Mode)";
      progressBarContainer.classList.add("hidden");
      btnInit.style.display = "none";
      btnStep.disabled = false;
      btnStream.disabled = false;
    } catch (fallbackErr) {
      statusText.textContent = "Failed to load model";
      explainerText.innerHTML = `<span style="color: #f85149;">Error loading model: ${fallbackErr.message}</span>`;
      btnInit.disabled = false;
      btnInit.textContent = "Retry";
    }
  }
});

// Render token chips
function renderTokens(tokenIds) {
  tokenChips.innerHTML = "";
  for (let i = 0; i < tokenIds.length; i++) {
    const id = tokenIds[i];
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
  
  // Create indexed list of [id, logit]
  const indexed = [];
  for (let i = 0; i < logitsArray.length; i++) {
    indexed.push({ id: i, logit: logitsArray[i] });
  }

  // Sort descending
  indexed.sort((a, b) => b.logit - a.logit);
  const candidates = indexed.slice(0, topK);

  // Softmax with temperature scaling
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
    // If starting a fresh run, tokenize the user prompt
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

    const currentTokensArray = Array.from(currentInputIds.data);
    renderTokens(currentTokensArray);

    // Forward pass through transformer
    const output = await model({ input_ids: currentInputIds });
    
    // Output logits shape: [batch, sequence_length, vocab_size]
    const seqLength = currentInputIds.dims[1];
    const vocabSize = output.logits.dims[2];
    
    // Extract logits for the very last token position
    const lastTokenLogitsOffset = (seqLength - 1) * vocabSize;
    const logitsSlice = output.logits.data.subarray(lastTokenLogitsOffset, lastTokenLogitsOffset + vocabSize);

    const temp = parseFloat(tempSlider.value);
    const topK = parseInt(topkSlider.value, 10);
    const candidatePool = getTopKWithSoftmax(logitsSlice, topK, temp);

    // Sample next token (Roulette-wheel)
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

    // Append chosen token
    renderProbabilities(candidatePool, selectedItem.id);

    // Concat to input_ids for autoregression
    const nextId = BigInt(selectedItem.id);
    const newLength = currentTokensArray.length + 1;
    const newBigIntArray = new BigInt64Array(newLength);
    for (let i = 0; i < currentTokensArray.length; i++) {
      newBigIntArray[i] = BigInt(currentTokensArray[i]);
    }
    newBigIntArray[newLength - 1] = nextId;

    // Update tensor
    const Tensor = currentInputIds.constructor;
    currentInputIds = new Tensor('int64', newBigIntArray, [1, newLength]);

    // Update UI
    generatedTokens.push(selectedItem.token);
    liveText.innerHTML = generatedTokens.map(t => `<span class="new-token">${t}</span>`).join("");

    explainerText.innerHTML = `
      <strong>Step Generated:</strong><br>
      The model read all <code>${currentTokensArray.length}</code> preceding tokens. Based on context, 
      its top prediction was <code>"${candidatePool[0].token.replace(/\s/g, '·')}"</code> (${(candidatePool[0].prob * 100).toFixed(1)}%). 
      With temperature at <strong>${temp}</strong>, it sampled <code>"${selectedItem.token.replace(/\s/g, '·')}"</code> and fed it back into the context buffer.
    `;

    // Re-render chips to show the appended token
    renderTokens(Array.from(newBigIntArray));

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

  // Run up to 25 autoregressive iterations
  for (let i = 0; i < 25; i++) {
    if (!isStreaming) break;
    await stepModel();
    // Allow UI to breathe
    await new Promise(r => setTimeout(r, 100));
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