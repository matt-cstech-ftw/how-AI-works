import { AutoTokenizer, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.3.3';
import { completeActivity, saveQuizScore } from '../../assets/js/progress.js';

env.allowLocalModels = false;
env.useBrowserCache = true;

const MODEL_ID = 'HuggingFaceTB/SmolLM2-135M-Instruct';
const COLORS = ['piece-cyan', 'piece-emerald', 'piece-violet', 'piece-amber'];

// ==========================================
// STAGE 1 PUZZLE DEFINITIONS
// Exact splits & IDs are populated dynamically from the real SmolLM2 tokenizer!
// ==========================================
const JIGSAW_PUZZLES = [
  {
    targetWord: 'unbelievable',
    roundTag: 'PUZZLE 1 OF 2 // SUBWORD ASSEMBLY',
    title: 'Build "unbelievable" Out of Real AI Puzzle Pieces',
    instructions: 'The AI does not store every long English word as a single piece. Click the jigsaw pieces in left-to-right order to snap "unbelievable" together—and watch what happens if you click a wrong piece or a decoy!',
    // Real SmolLM2 tokens for "unbelievable": ["un", "believ", "able"]
    solutionChunks: ['un', 'believ', 'able'],
    solutionIds: [403, 18341, 1094],
    decoys: [
      { chunk: 'believe', id: 4812, reason: 'Notice the silent "e" at the end of "believe"! If you use "believe" + "able", it spells "believeable" with an extra E. The AI uses the root piece "believ" (#18341) instead!' },
      { chunk: 'ing', id: 289, reason: '"ing" is a real suffix token (#289), but "unbelievable" ends with "able", not "ing"!' }
    ],
    successHtml: `<strong>Exact Match!</strong> You snapped <code>[un] (#403)</code> + <code>[believ] (#18341)</code> + <code>[able] (#1094)</code> together. Because the AI drops the silent "e" on <code>[believ]</code>, it can reuse that exact same puzzle piece for <em>believing</em>, <em>believer</em>, and <em>unbelievable</em>!`,
    walkthrough: null
  },
  {
    targetWord: 'strawberry',
    roundTag: 'PUZZLE 2 OF 2 // THE STRAWBERRY MYSTERY',
    title: 'Snap "strawberry" Together (Exact SmolLM2 Split!)',
    instructions: 'Here is a surprise: SmolLM2 actually slices "strawberry" into THREE puzzle pieces! Try clicking the 2-piece decoys first to see why they fail, then snap the 3 real pieces together.',
    // Real SmolLM2 tokens for "strawberry": ["st", "raw", "berry"] -> #302, #1709, #9500
    solutionChunks: ['st', 'raw', 'berry'],
    solutionIds: [302, 1709, 9500],
    decoys: [
      { chunk: 'straw', id: 20412, reason: 'Good guess! While "·straw" (with a leading space) exists in the dictionary, when "strawberry" is typed without a leading space, SmolLM2 actually slices the front into TWO smaller pieces: [st] (#302) + [raw] (#1709)!' },
      { chunk: 'awberry', id: 99901, reason: '"awberry" is a fake decoy—it does not exist in the AI\'s 49,152-piece dictionary! Remove it and build the word using [st] + [raw] + [berry].' }
    ],
    successHtml: `<strong>Mystery Solved!</strong> Look at the Assembly Track now: we flipped the pieces into <strong>AI Vision Mode</strong>. Whether a model splits strawberry into 2 pieces or 3 pieces (<code>#302</code>, <code>#1709</code>, <code>#9500</code>), the AI <strong>never sees the individual letters s-t-r-a-w-b-e-r-r-y</strong>!`,
    walkthrough: {
      tag: 'LEARNING MOMENT • THE STRAWBERRY MYSTERY SOLVED!',
      title: 'Why AI Cannot Count the Letters Inside a Word',
      svgHtml: `
        <svg width="360" height="86" viewBox="0 0 360 86" fill="none">
          <rect x="10" y="14" width="95" height="58" rx="8" fill="#18181b" stroke="#38bdf8" stroke-width="2"/>
          <text x="57" y="38" fill="#38bdf8" font-family="JetBrains Mono" font-size="14" font-weight="bold" text-anchor="middle">ID #302</text>
          <text x="57" y="56" fill="#71717a" font-family="JetBrains Mono" font-size="10" text-anchor="middle">(hides "st")</text>

          <text x="118" y="48" fill="#fafafa" font-family="JetBrains Mono" font-size="16" font-weight="bold" text-anchor="middle">+</text>

          <rect x="132" y="14" width="95" height="58" rx="8" fill="#18181b" stroke="#10b981" stroke-width="2"/>
          <text x="179" y="38" fill="#10b981" font-family="JetBrains Mono" font-size="14" font-weight="bold" text-anchor="middle">ID #1709</text>
          <text x="179" y="56" fill="#71717a" font-family="JetBrains Mono" font-size="10" text-anchor="middle">(hides "raw")</text>

          <text x="240" y="48" fill="#fafafa" font-family="JetBrains Mono" font-size="16" font-weight="bold" text-anchor="middle">+</text>

          <rect x="254" y="14" width="96" height="58" rx="8" fill="#18181b" stroke="#c084fc" stroke-width="2"/>
          <text x="302" y="38" fill="#c084fc" font-family="JetBrains Mono" font-size="14" font-weight="bold" text-anchor="middle">ID #9500</text>
          <text x="302" y="56" fill="#71717a" font-family="JetBrains Mono" font-size="10" text-anchor="middle">(hides "berry")</text>
        </svg>
      `,
      bodyHtml: `
        The moment you typed <strong>"strawberry"</strong>, the tokenizer threw the letters away and handed the AI brain three solid ID numbers: <strong>#302</strong>, <strong>#1709</strong>, and <strong>#9500</strong>.<br><br>
        Now you can see in Stage 1 AND Stage 3 that they match 100%! Asking an AI to count the "r"s inside those ID numbers is like handing someone three sealed shipping crates with barcodes on the outside and asking how many red marbles are glued inside.
      `
    }
  }
];

// ==========================================
// STAGE 2 DATA: LASER SLICER CHALLENGES
// ==========================================
const LASER_CHALLENGES = [
  {
    word: 'adores',
    hint: 'Hint: SmolLM2 slices "adores" into 2 pieces! Place 1 laser cut where you saw it split in Lab 01.',
    aiActualSplit: ['ad', 'ores'],
    aiIds: ['#329', '#2479'],
    explanation: `Exact match! SmolLM2 slices <strong>"adores"</strong> right after the first two letters: <code>[ad] (#329)</code> + <code>[ores] (#2479)</code>.`
  },
  {
    word: 'smartphones',
    hint: 'Hint: This compound word is made of two everyday words glued together! Place 1 laser cut at the seam.',
    aiActualSplit: ['smart', 'phones'],
    aiIds: ['#15082', '#17408'],
    explanation: `Bullseye! The AI slices compound words cleanly at the seam: <code>[smart] (#15082)</code> + <code>[phones] (#17408)</code>.`
  }
];

// State
let currentPuzzleIdx = 0;
let assembledPieces = [];
let isBlindfolded = false;

let currentLaserIdx = 0;
let activeCutIndices = new Set();

let solvedCount = 0;
let tokenizer = null;

// DOM Elements
const progressReadout = document.getElementById('progress-readout');
const tabStage1 = document.getElementById('tab-stage-1');
const tabStage2 = document.getElementById('tab-stage-2');
const tabStage3 = document.getElementById('tab-stage-3');

const stage1Panel = document.getElementById('stage-1-panel');
const stage2Panel = document.getElementById('stage-2-panel');
const stage3Panel = document.getElementById('stage-3-panel');

// Stage 1 DOM
const puzzleRoundTag = document.getElementById('puzzle-round-tag');
const puzzleTitle = document.getElementById('puzzle-title');
const puzzleInstructions = document.getElementById('puzzle-instructions');
const targetWordText = document.getElementById('target-word-text');
const assemblyZone = document.getElementById('assembly-zone');
const assemblyPlaceholder = document.getElementById('assembly-placeholder');
const assembledRow = document.getElementById('assembled-row');
const jigsawTray = document.getElementById('jigsaw-tray');
const btnClearAssembly = document.getElementById('btn-clear-assembly');
const btnToggleBlindfold = document.getElementById('btn-toggle-blindfold');
const stage1Diagnostic = document.getElementById('stage1-diagnostic');
const stage1DiagText = document.getElementById('stage1-diag-text');
const btnStage1Next = document.getElementById('btn-stage1-next');

// Stage 2 DOM
const laserRoundTag = document.getElementById('laser-round-tag');
const laserHint = document.getElementById('laser-hint');
const laserWordRow = document.getElementById('laser-word-row');
const btnClearCuts = document.getElementById('btn-clear-cuts');
const btnFireLaser = document.getElementById('btn-fire-laser');
const laserDiagnostic = document.getElementById('laser-diagnostic');
const laserDiagText = document.getElementById('laser-diag-text');
const btnLaserNext = document.getElementById('btn-laser-next');

// Stage 3 DOM
const forgeInput = document.getElementById('forge-input');
const forgeStage = document.getElementById('forge-stage');
const btnForgeQuiz = document.getElementById('btn-forge-quiz');

// Modals
const wtModal = document.getElementById('walkthrough-modal');
const wtTag = document.getElementById('wt-tag');
const wtTitle = document.getElementById('wt-title');
const wtVisual = document.getElementById('wt-visual');
const wtBody = document.getElementById('wt-body');
const btnWtClose = document.getElementById('btn-wt-close');

const quizModal = document.getElementById('quiz-modal');
const btnOpenQuiz = document.getElementById('btn-open-quiz');
const btnCloseQuiz = document.getElementById('btn-close-quiz');
const btnSubmitQuiz = document.getElementById('btn-submit-quiz');
const quizFeedback = document.getElementById('quiz-feedback');

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons();
}
refreshIcons();

if (new URLSearchParams(window.location.search).get('quiz') === '1') {
  quizModal.classList.remove('hidden');
}

// Preload the real SmolLM2 Tokenizer on startup and sync exact IDs across all stages!
async function syncRealTokenizerIds() {
  try {
    tokenizer = await AutoTokenizer.from_pretrained(MODEL_ID);

    // Sync Stage 1 puzzles with exact live tokenizer output
    for (const p of JIGSAW_PUZZLES) {
      const enc = await tokenizer(p.targetWord, { add_special_tokens: false });
      const ids = Array.from(enc.input_ids.data).map(Number);
      p.solutionIds = ids;
      p.solutionChunks = ids.map(id => tokenizer.decode([id]));
    }

    // Sync Stage 2 laser challenges with exact live tokenizer output
    for (const c of LASER_CHALLENGES) {
      const enc = await tokenizer(c.word, { add_special_tokens: false });
      const ids = Array.from(enc.input_ids.data).map(Number);
      c.aiActualSplit = ids.map(id => tokenizer.decode([id]));
      c.aiIds = ids.map(id => `#${id}`);
    }

    loadJigsawPuzzle(currentPuzzleIdx);
  } catch (e) {
    console.warn('Fallback to pre-verified SmolLM2 IDs:', e);
    loadJigsawPuzzle(currentPuzzleIdx);
  }
}

function updateSolvedCounter(count) {
  solvedCount = Math.max(solvedCount, count);
  progressReadout.innerHTML = `Puzzles Solved: <strong>${solvedCount} / 4</strong>`;
  if (solvedCount >= 4) {
    completeActivity('mod-02', 100);
    btnOpenQuiz.classList.add('btn-primary');
  }
}

function switchStage(stageNum) {
  [stage1Panel, stage2Panel, stage3Panel].forEach((p, idx) => {
    p.classList.toggle('hidden', idx + 1 !== stageNum);
  });
  [tabStage1, tabStage2, tabStage3].forEach((t, idx) => {
    t.classList.toggle('active', idx + 1 === stageNum);
  });

  if (stageNum === 2) loadLaserChallenge(currentLaserIdx);
  if (stageNum === 3) initLiveForge();
}

tabStage1.addEventListener('click', () => switchStage(1));
tabStage2.addEventListener('click', () => switchStage(2));
tabStage3.addEventListener('click', () => switchStage(3));

// ==========================================
// STAGE 1 LOGIC: SNAP THE JIGSAW PIECES
// ==========================================
function buildTrayListForPuzzle(p) {
  const realPieces = p.solutionChunks.map((chunk, i) => ({
    chunk,
    id: p.solutionIds[i],
    color: COLORS[i % COLORS.length],
    isDecoy: false
  }));

  const decoyPieces = p.decoys.map((d, i) => ({
    chunk: d.chunk,
    id: d.id,
    color: COLORS[(i + 2) % COLORS.length],
    isDecoy: true,
    reason: d.reason
  }));

  // Deterministic shuffle so pieces aren't already in order
  const combined = [...realPieces, ...decoyPieces];
  return combined.sort((a, b) => a.chunk.localeCompare(b.chunk));
}

function loadJigsawPuzzle(idx) {
  currentPuzzleIdx = idx;
  const p = JIGSAW_PUZZLES[idx];
  p.trayPieces = buildTrayListForPuzzle(p);
  assembledPieces = [];
  isBlindfolded = false;

  puzzleRoundTag.textContent = p.roundTag;
  puzzleTitle.textContent = p.title;
  puzzleInstructions.textContent = p.instructions;

  assemblyZone.className = 'assembly-zone';
  btnToggleBlindfold.classList.add('hidden');
  btnStage1Next.classList.add('hidden');

  setStage1Diagnostic('status-neutral', `<strong>Ready:</strong> Click the puzzle piece below that matches the start of <code>"${p.targetWord}"</code>!`);
  renderStage1();
}

function setStage1Diagnostic(statusClass, html) {
  stage1Diagnostic.className = `diagnostic-bar ${statusClass}`;
  stage1DiagText.innerHTML = html;
}

function triggerTrackShake(type = 'error-shake') {
  assemblyZone.classList.remove('error-shake', 'warn-shake');
  void assemblyZone.offsetWidth; // Force reflow to restart animation
  assemblyZone.classList.add(type);
}

function renderTargetWordProgress(p) {
  const builtStr = assembledPieces.map(item => item.chunk).join('');
  const target = p.targetWord;

  let html = '';
  for (let i = 0; i < target.length; i++) {
    if (i < builtStr.length && builtStr[i] === target[i]) {
      html += `<span class="char-matched">${target[i]}</span>`;
    } else {
      html += `<span class="char-pending">${target[i]}</span>`;
    }
  }
  targetWordText.innerHTML = html;
}

function createJigsawElement(pieceObj, hasRightTab = false, blindfold = false, isWrong = false) {
  const el = document.createElement('div');
  el.className = `puzzle-piece ${pieceObj.color} ${hasRightTab ? 'has-right-tab' : ''} ${blindfold ? 'blindfolded' : ''} ${isWrong ? 'piece-wrong' : ''}`;
  el.innerHTML = `
    <span class="pp-chunk">${pieceObj.chunk}</span>
    <span class="pp-id">#${pieceObj.id}</span>
  `;
  return el;
}

function renderStage1() {
  const p = JIGSAW_PUZZLES[currentPuzzleIdx];
  renderTargetWordProgress(p);

  assembledRow.innerHTML = '';
  assemblyPlaceholder.classList.toggle('hidden', assembledPieces.length > 0);

  assembledPieces.forEach((piece, i) => {
    const expectedChunk = p.solutionChunks[i];
    const isPieceWrongHere = piece.chunk !== expectedChunk;
    const hasRightTab = i < assembledPieces.length - 1;

    const el = createJigsawElement(piece, hasRightTab, isBlindfolded, isPieceWrongHere);
    el.title = 'Click to remove this piece from the track';
    el.addEventListener('click', () => {
      assembledPieces.splice(i, 1);
      assemblyZone.className = 'assembly-zone';
      btnStage1Next.classList.add('hidden');
      evaluateStage1State();
      renderStage1();
    });
    assembledRow.appendChild(el);
  });

  // Render Available Tray
  jigsawTray.innerHTML = '';
  p.trayPieces.forEach((piece) => {
    if (assembledPieces.includes(piece)) return;

    const el = createJigsawElement(piece, true, false, false);
    el.addEventListener('click', () => {
      assembledPieces.push(piece);
      evaluateStage1State(piece);
      renderStage1();
    });
    jigsawTray.appendChild(el);
  });
}

// Evaluates EVERY click and gives immediate visual & explanatory feedback!
function evaluateStage1State(lastClickedPiece = null) {
  const p = JIGSAW_PUZZLES[currentPuzzleIdx];
  const currentChunks = assembledPieces.map(item => item.chunk);
  const builtStr = currentChunks.join('');

  if (assembledPieces.length === 0) {
    setStage1Diagnostic('status-neutral', `<strong>Track cleared:</strong> Click the piece that starts <code>"${p.targetWord}"</code>.`);
    return;
  }

  // Case 1: Exact Solution Match!
  const isExactMatch =
    currentChunks.length === p.solutionChunks.length &&
    currentChunks.every((val, idx) => val === p.solutionChunks[idx]);

  if (isExactMatch) {
    assemblyZone.className = 'assembly-zone solved';
    setStage1Diagnostic('status-solved', p.successHtml);
    btnStage1Next.classList.remove('hidden');
    btnToggleBlindfold.classList.remove('hidden');

    if (currentPuzzleIdx === 0) {
      updateSolvedCounter(1);
      btnStage1Next.innerHTML = `<span>Next Puzzle: The Strawberry Mystery</span><i data-lucide="arrow-right" class="icon-xs"></i>`;
    } else {
      updateSolvedCounter(2);
      tabStage1.classList.add('completed');
      isBlindfolded = true;
      btnStage1Next.innerHTML = `<span>Go to Stage 2: The Laser Slicer Game</span><i data-lucide="scissors" class="icon-xs"></i>`;

      if (p.walkthrough) {
        wtTag.textContent = p.walkthrough.tag;
        wtTitle.textContent = p.walkthrough.title;
        wtVisual.innerHTML = p.walkthrough.svgHtml;
        wtBody.innerHTML = p.walkthrough.bodyHtml;
        wtModal.classList.remove('hidden');
      }
    }
    refreshIcons();
    return;
  }

  // Case 2: Did the user click a DECOY piece? Explain specifically why that decoy fails!
  if (lastClickedPiece && lastClickedPiece.isDecoy) {
    triggerTrackShake('warn-shake');
    setStage1Diagnostic(
      'status-warn',
      `<strong>Subword Trap Triggered (<code>${lastClickedPiece.chunk}</code>):</strong> ${lastClickedPiece.reason} <em>(Click the highlighted red piece in the track to remove it!)</em>`
    );
    return;
  }

  // Case 3: Did the user click a real piece, but in the WRONG ORDER (e.g., [able] first)?
  if (!p.targetWord.startsWith(builtStr)) {
    triggerTrackShake('error-shake');
    const stepPos = assembledPieces.length - 1;
    const expectedPiece = p.solutionChunks[stepPos] || p.solutionChunks[0];
    setStage1Diagnostic(
      'status-error',
      `<strong>Wrong Order!</strong> Your track currently spells <code>"${builtStr}"</code>, which doesn't match <code>"${p.targetWord}"</code>. Click the red piece in the track to remove it, and look for <code>[${expectedPiece}]</code>!`
    );
    return;
  }

  // Case 4: Correct prefix so far! Encourage the next piece.
  const remainingWord = p.targetWord.slice(builtStr.length);
  setStage1Diagnostic(
    'status-good',
    `<strong>Good snap!</strong> You built <code>"${builtStr}"</code> so far. Now find the next puzzle piece to match <code>"${remainingWord}"</code>!`
  );
}

btnClearAssembly.addEventListener('click', () => {
  assembledPieces = [];
  isBlindfolded = false;
  assemblyZone.className = 'assembly-zone';
  btnStage1Next.classList.add('hidden');
  evaluateStage1State();
  renderStage1();
});

btnToggleBlindfold.addEventListener('click', () => {
  isBlindfolded = !isBlindfolded;
  renderStage1();
});

btnStage1Next.addEventListener('click', () => {
  if (currentPuzzleIdx < JIGSAW_PUZZLES.length - 1) {
    loadJigsawPuzzle(currentPuzzleIdx + 1);
  } else {
    switchStage(2);
  }
});

btnWtClose.addEventListener('click', () => {
  wtModal.classList.add('hidden');
});

// ==========================================
// STAGE 2 LOGIC: THE LASER SLICER GAME
// ==========================================
function loadLaserChallenge(idx) {
  currentLaserIdx = idx;
  activeCutIndices.clear();
  const c = LASER_CHALLENGES[idx];

  laserRoundTag.textContent = `CHALLENGE ${idx + 1} OF ${LASER_CHALLENGES.length} // PREDICT THE CUT`;
  laserHint.textContent = c.hint;
  laserDiagnostic.className = 'diagnostic-bar status-neutral';
  laserDiagText.innerHTML = `Click between the letters above to aim the laser, then press <strong>Fire Laser & Check Cut</strong>.`;
  btnLaserNext.classList.add('hidden');

  renderLaserWord();
}

function renderLaserWord() {
  const c = LASER_CHALLENGES[currentLaserIdx];
  laserWordRow.innerHTML = '';

  const chars = c.word.split('');
  chars.forEach((ch, i) => {
    const charSpan = document.createElement('span');
    charSpan.className = 'laser-char';
    charSpan.textContent = ch;
    laserWordRow.appendChild(charSpan);

    if (i < chars.length - 1) {
      const slot = document.createElement('div');
      slot.className = `cut-slot ${activeCutIndices.has(i) ? 'active-cut' : ''}`;
      slot.title = 'Click to toggle laser cut here';
      slot.addEventListener('click', () => {
        if (activeCutIndices.has(i)) activeCutIndices.delete(i);
        else activeCutIndices.add(i);
        renderLaserWord();
      });
      laserWordRow.appendChild(slot);
    }
  });
}

btnClearCuts.addEventListener('click', () => {
  activeCutIndices.clear();
  btnLaserNext.classList.add('hidden');
  laserDiagnostic.className = 'diagnostic-bar status-neutral';
  laserDiagText.innerHTML = 'Cuts cleared. Click between the letters to place a new laser cut!';
  renderLaserWord();
});

btnFireLaser.addEventListener('click', () => {
  const c = LASER_CHALLENGES[currentLaserIdx];
  if (activeCutIndices.size === 0) {
    laserDiagnostic.className = 'diagnostic-bar status-warn';
    laserDiagText.innerHTML = `<strong>No laser cuts placed yet!</strong> Click the vertical slot between the letters where you think the AI slices <code>"${c.word}"</code>.`;
    return;
  }

  const sortedCuts = Array.from(activeCutIndices).sort((a, b) => a - b);
  const userChunks = [];
  let start = 0;
  sortedCuts.forEach(cutIdx => {
    userChunks.push(c.word.slice(start, cutIdx + 1));
    start = cutIdx + 1;
  });
  userChunks.push(c.word.slice(start));

  // Verify if user's cut matches the real SmolLM2 split
  const isExactCut =
    userChunks.length === c.aiActualSplit.length &&
    userChunks.every((chunk, idx) => chunk === c.aiActualSplit[idx]);

  if (!isExactCut) {
    laserDiagnostic.className = 'diagnostic-bar status-error';
    laserDiagText.innerHTML = `
      <strong>Not quite!</strong> Your laser sliced <code>[${userChunks.join('] + [')}]</code>, but SmolLM2 doesn't slice it there. 
      <em>Tip: ${c.hint} Adjust your red laser cut above and fire again!</em>
    `;
    return;
  }

  const piecesHtml = c.aiActualSplit.map((chunk, i) => `
    <span style="display:inline-flex; align-items:center; gap:4px; background:#063928; border:1px solid #10b981; color:#d1fae5; font-family:var(--font-mono); padding:2px 8px; border-radius:6px; margin:0 3px;">
      <strong>${chunk}</strong> <small style="opacity:0.8">${c.aiIds[i]}</small>
    </span>
  `).join('+');

  laserDiagnostic.className = 'diagnostic-bar status-solved';
  laserDiagText.innerHTML = `${c.explanation} ${piecesHtml}`;
  btnLaserNext.classList.remove('hidden');

  if (currentLaserIdx === 0) {
    updateSolvedCounter(3);
    btnLaserNext.innerHTML = `<span>Next Word Challenge</span><i data-lucide="arrow-right" class="icon-xs"></i>`;
  } else {
    updateSolvedCounter(4);
    tabStage2.classList.add('completed');
    btnLaserNext.innerHTML = `<span>Unlock Stage 3: Live Jigsaw Forge</span><i data-lucide="sparkles" class="icon-xs"></i>`;
  }
  refreshIcons();
});

btnLaserNext.addEventListener('click', () => {
  if (currentLaserIdx < LASER_CHALLENGES.length - 1) {
    loadLaserChallenge(currentLaserIdx + 1);
  } else {
    switchStage(3);
  }
});

// ==========================================
// STAGE 3 LOGIC: LIVE JIGSAW FORGE
// ==========================================
async function initLiveForge() {
  tabStage3.classList.add('completed');
  if (!tokenizer) {
    forgeStage.innerHTML = `<span style="color:var(--cyan); font-family:var(--font-mono); font-size:0.85rem;">Loading SmolLM2 Tokenizer...</span>`;
    tokenizer = await AutoTokenizer.from_pretrained(MODEL_ID);
  }
  renderLiveForge();
}

async function renderLiveForge() {
  if (!tokenizer) return;
  const text = forgeInput.value;
  if (!text) {
    forgeStage.innerHTML = '<span style="color:var(--text-muted);">Type any word above to forge jigsaw pieces...</span>';
    return;
  }

  const encoded = await tokenizer(text, { add_special_tokens: false });
  const ids = Array.from(encoded.input_ids.data).map(Number);

  forgeStage.innerHTML = '';
  ids.forEach((id, i) => {
    const rawStr = tokenizer.decode([id]).replace(/ /g, '·');
    const piece = {
      chunk: rawStr,
      id,
      color: COLORS[i % COLORS.length]
    };
    const el = createJigsawElement(piece, i < ids.length - 1, false, false);
    forgeStage.appendChild(el);
  });
}

forgeInput.addEventListener('input', renderLiveForge);

document.querySelectorAll('.forge-preset').forEach(btn => {
  btn.addEventListener('click', () => {
    forgeInput.value = btn.dataset.text;
    renderLiveForge();
  });
});

// ==========================================
// QUIZ MODAL LOGIC (4 Rigorous Options per Question)
// ==========================================
btnOpenQuiz.addEventListener('click', () => quizModal.classList.remove('hidden'));
btnForgeQuiz.addEventListener('click', () => quizModal.classList.remove('hidden'));
btnCloseQuiz.addEventListener('click', () => quizModal.classList.add('hidden'));

document.querySelectorAll('.quiz-opt').forEach(opt => {
  opt.addEventListener('click', () => {
    const parent = opt.closest('.quiz-q');
    parent.querySelectorAll('.quiz-opt').forEach(o => o.classList.remove('selected'));
    opt.classList.add('selected');
  });
});

btnSubmitQuiz.addEventListener('click', () => {
  const selected = document.querySelectorAll('.quiz-opt.selected');
  if (selected.length < 3) {
    alert('Please select an answer for all 3 questions.');
    return;
  }

  let correct = 0;
  selected.forEach(s => { if (s.dataset.correct === 'true') correct++; });

  quizFeedback.classList.remove('hidden');
  if (correct === 3) {
    completeActivity('mod-02', 100);
    saveQuizScore('mod-02', 100, 100);
    quizFeedback.style.background = 'var(--emerald-dim)';
    quizFeedback.style.color = 'var(--emerald)';
    quizFeedback.innerHTML = `<strong>3/3 Mastery Verified! (+200 XP)</strong> Unlocking Lab 03 and returning to your Dashboard...`;
    setTimeout(() => { window.location.href = '../../index.html'; }, 1400);
  } else {
    quizFeedback.style.background = 'rgba(239, 68, 68, 0.15)';
    quizFeedback.style.color = '#fca5a5';
    quizFeedback.innerHTML = `<strong>You scored ${correct} out of 3.</strong> Review the highlighted concepts: remember that AI uses a fixed subword vocabulary table, receives integer IDs instead of individual letters, and attaches leading whitespace directly to token entries.`;
  }
});

// Boot with live tokenizer sync
syncRealTokenizerIds();