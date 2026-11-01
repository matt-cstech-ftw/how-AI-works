// Vocabulary pool used to construct realistic candidate logits
const SIMULATED_CANDIDATES = {
  default: [
    { token: " dog", weight: 35 },
    { token: " cat", weight: 20 },
    { token: " hound", weight: 15 },
    { token: " fence", weight: 12 },
    { token: " sleeping", weight: 8 },
    { token: " puddle", weight: 6 },
    { token: " lawn", weight: 4 }
  ],
  general: [
    { token: " and", weight: 22 },
    { token: " the", weight: 18 },
    { token: " but", weight: 14 },
    { token: " with", weight: 12 },
    { token: " then", weight: 11 },
    { token: " when", weight: 9 },
    { token: " because", weight: 8 },
    { token: " while", weight: 6 }
  ]
};

// State
let prompt = "";
let generatedTokens = [];
let isStreaming = false;

// DOM Elements
const modal = document.getElementById("welcome-modal");
const btnModalAgree = document.getElementById("btn-modal-agree");
const promptInput = document.getElementById("prompt-input");
const tempSlider = document.getElementById("temp-slider");
const tempVal = document.getElementById("temp-val");
const topkSlider = document.getElementById("topk-slider");
const topkVal = document.getElementById("topk-val");
const btnStep = document.getElementById("btn-step");
const btnStream = document.getElementById("btn-stream");
const btnReset = document.getElementById("btn-reset");
const liveText = document.getElementById("live-text");
const tokenChips = document.getElementById("token-chips");
const probChart = document.getElementById("probability-chart");
const explainerText = document.getElementById("explainer-text");

// Handle Modal Dismissal
btnModalAgree.addEventListener("click", () => {
  modal.classList.add("hidden");
});

// Slider bindings
tempSlider.addEventListener("input", (e) => {
  tempVal.textContent = e.target.value;
});

topkSlider.addEventListener("input", (e) => {
  topkVal.textContent = e.target.value;
});

// Simulated sub-word tokenizer using a simple hash identifier
function pseudoTokenize(text) {
  const words = text.match(/\S+|\s+/g) || [];
  return words.map((chunk) => {
    let hash = 0;
    for (let i = 0; i < chunk.length; i++) {
      hash = (hash << 5) - hash + chunk.charCodeAt(i);
      hash |= 0;
    }
    return {
      text: chunk,
      id: Math.abs(hash % 32000)
    };
  });
}

// Compute Softmax probabilities with Temperature
function applyTemperatureAndSoftmax(candidates, temperature) {
  const temp = Math.max(0.01, parseFloat(temperature));
  
  // Scale logits by temperature: z_i / T
  const scaled = candidates.map(c => Math.log(c.weight + 0.1) / temp);
  const maxScaled = Math.max(...scaled);
  
  // Exponentiate with numerical stability
  const expValues = scaled.map(s => Math.exp(s - maxScaled));
  const sumExp = expValues.reduce((a, b) => a + b, 0);

  return candidates.map((c, i) => ({
    token: c.token,
    prob: expValues[i] / sumExp
  })).sort((a, b) => b.prob - a.prob);
}

// Render token visualization
function updateTokenDisplay(fullText) {
  const tokens = pseudoTokenize(fullText);
  tokenChips.innerHTML = "";
  tokens.forEach(t => {
    const chip = document.createElement("div");
    chip.className = "token-chip";
    chip.innerHTML = `<span>${t.text.replace(/\s/g, "·")}</span><span class="tok-id">#${t.id}</span>`;
    tokenChips.appendChild(chip);
  });
}

// Render top-k probabilities
function renderProbabilities(probabilities, topK, chosenToken) {
  probChart.innerHTML = "";
  const sliced = probabilities.slice(0, topK);

  sliced.forEach((item) => {
    const pct = (item.prob * 100).toFixed(1);
    const row = document.createElement("div");
    row.className = "prob-row";

    const isWinner = item.token === chosenToken;
    row.innerHTML = `
      <div class="prob-label" title="${item.token}">${item.token}</div>
      <div class="prob-bar-track">
        <div class="prob-bar-fill ${isWinner ? 'selected' : ''}" style="width: ${pct}%"></div>
      </div>
      <div>${pct}%</div>
    `;
    probChart.appendChild(row);
  });
}

// Run single autoregressive step
function stepInference() {
  if (!prompt) {
    prompt = promptInput.value.trim();
  }

  const fullSequence = prompt + generatedTokens.join("");
  updateTokenDisplay(fullSequence);

  // Generate simulated candidate distribution based on last word
  const pool = generatedTokens.length === 0 ? SIMULATED_CANDIDATES.default : SIMULATED_CANDIDATES.general;
  const temp = parseFloat(tempSlider.value);
  const topK = parseInt(topkSlider.value, 10);

  const probDist = applyTemperatureAndSoftmax(pool, temp);
  const candidatePool = probDist.slice(0, topK);

  // Sample token based on probabilities (Roulette-wheel selection)
  const rand = Math.random();
  let cumulative = 0;
  let selected = candidatePool[0].token;

  // Normalize candidate pool sum
  const poolSum = candidatePool.reduce((acc, cur) => acc + cur.prob, 0);
  for (const item of candidatePool) {
    cumulative += (item.prob / poolSum);
    if (rand <= cumulative) {
      selected = item.token;
      break;
    }
  }

  // Record token and render
  generatedTokens.push(selected);
  renderProbabilities(probDist, topK, selected);

  // Update plain-English explanation
  explainerText.innerHTML = `
    <strong>Prediction Step Complete:</strong><br>
    The model evaluated its vocabulary for the next slot. With temperature at <strong>${temp}</strong>, 
    the top choice was <code>"${candidatePool[0].token}"</code> (${(candidatePool[0].prob * 100).toFixed(1)}%). 
    The sampling engine picked <code>"${selected}"</code> and appended it back into the prompt buffer.
  `;

  // Update text box
  liveText.innerHTML = prompt + generatedTokens.map(t => `<span class="new-token">${t}</span>`).join("");
}

// Event Listeners
btnStep.addEventListener("click", () => {
  stepInference();
});

btnStream.addEventListener("click", async () => {
  if (isStreaming) {
    isStreaming = false;
    btnStream.textContent = "⏩ Auto Generate";
    return;
  }

  isStreaming = true;
  btnStream.textContent = "⏹ Stop Generation";

  for (let i = 0; i < 15; i++) {
    if (!isStreaming) break;
    stepInference();
    await new Promise(r => setTimeout(r, 600));
  }

  isStreaming = false;
  btnStream.textContent = "⏩ Auto Generate";
});

btnReset.addEventListener("click", () => {
  isStreaming = false;
  btnStream.textContent = "⏩ Auto Generate";
  prompt = "";
  generatedTokens = [];
  liveText.innerHTML = "";
  probChart.innerHTML = '<div class="empty-state">No inference run yet.</div>';
  explainerText.innerHTML = 'Click <strong>Step</strong> to execute one cycle of the transformer loop and inspect candidate logits.';
  updateTokenDisplay(promptInput.value);
});

// Initial load
updateTokenDisplay(promptInput.value);