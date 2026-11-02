import { AutoTokenizer, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.3.3';
import { completeActivity, saveQuizScore } from '../../assets/js/progress.js';

env.allowLocalModels = false;
env.useBrowserCache = true;

const MODEL_ID = 'HuggingFaceTB/SmolLM2-135M-Instruct';
const COLORS = ['piece-cyan', 'piece-emerald', 'piece-violet', 'piece-amber'];

// ==========================================
// STAGE 1 DATA: JIGSAW WORD BUILDER PUZZLES
// ==========================================
const JIGSAW_PUZZLES = [
  {
    targetWord: 'unbelievable',
    roundTag: 'PUZZLE 1 OF 2 // 3-PIECE SUBWORD SNAP',
    title: 'Build "unbelievable" Out of AI Puzzle Pieces',
    instructions: 'The AI does not waste dictionary space storing every prefix and suffix combination. Click the 3 correct jigsaw pieces in order to snap "unbelievable" together!',
    solution: ['un', 'believ', 'able'],
    trayPieces: [
      { chunk: 'believ', id: 18341, color: 'piece-emerald' },
      { chunk: 'un', id: 403, color: 'piece-cyan' },
      { chunk: 'believe', id: 4812, color: 'piece-amber' }, // Decoy!
      { chunk: 'able', id: 1094, color: 'piece-violet' },
      { chunk: 'ing', id: 289, color: 'piece-cyan' } // Decoy!
    ],
    successHtml: `<strong>Nailed It!</strong> Notice how the AI dropped the silent "e" and snapped <code>[un]</code> + <code>[believ]</code> + <code>[able]</code> together. That way, it can reuse <code>[believ]</code> for <em>believing</em>, <em>believer</em>, and <em>believable</em>!`,
    walkthrough: null
  },
  {
    targetWord: 'strawberry',
    roundTag: 'PUZZLE 2 OF 2 // THE STRAWBERRY MYSTERY',
    title: 'Snap "strawberry" Together (And See Why AI Goes Blind!)',
    instructions: 'Why did giant AI models famously insist there are only two "r"s in strawberry? Snap the two correct pieces together to trigger AI Vision mode!',
    solution: ['straw', 'berry'],
    trayPieces: [
      { chunk: 'berry', id: 11951, color: 'piece-emerald' },
      { chunk: 'straw', id: 20412, color: 'piece-cyan' },
      { chunk: 'str', id: 912, color: 'piece-violet' }, // Decoy
      { chunk: 'awberry', id: 44102, color: 'piece-amber' } // Decoy
    ],
    successHtml: `<strong>Look at the Assembly Track now!</strong> We just flipped the pieces into <strong>AI Vision Mode</strong>. The AI never sees the letters <code>s-t-r-a-w-b-e-r-r-y</code>—it only sees <code>#20412</code> and <code>#11951</code>!`,
    walkthrough: {
      tag: 'LEARNING MOMENT • THE STRAWBERRY MYSTERY SOLVED!',
      title: 'Why AI Cannot Count the Letters Inside a Word',
      svgHtml: `
        <svg width="340" height="86" viewBox="0 0 340 86" fill="none">
          <rect x="20" y="14" width="125" height="58" rx="8" fill="#18181b" stroke="#38bdf8" stroke-width="2"/>
          <text x="82" y="38" fill="#38bdf8" font-family="JetBrains Mono" font-size="15" font-weight="bold" text-anchor="middle">ID #20412</text>
          <text x="82" y="56" fill="#71717a" font-family="JetBrains Mono" font-size="10" text-anchor="middle">(hides "straw")</text>
          <text x="170" y="48" fill="#fafafa" font-family="JetBrains Mono" font-size="18" font-weight="bold" text-anchor="middle">+</text>
          <rect x="195" y="14" width="125" height="58" rx="8" fill="#18181b" stroke="#10b981" stroke-width="2"/>
          <text x="257" y="38" fill="#10b981" font-family="JetBrains Mono" font-size="15" font-weight="bold" text-anchor="middle">ID #11951</text>
          <text x="257" y="56" fill="#71717a" font-family="JetBrains Mono" font-size="10" text-anchor="middle">(hides "berry")</text>
        </svg>
      `,
      bodyHtml: `
        The moment you snapped <code>[straw]</code> and <code>[berry]</code> together, the Word Slicer threw the letters away and handed the AI brain two solid numbers: <strong>#20412</strong> and <strong>#11951</strong>.<br><br>
        Asking an AI to count the "r"s inside <strong>#20412</strong> is like handing someone a sealed shipping crate with a barcode on the outside and asking how many red marbles are glued inside!
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
    hint: 'Hint: Think about how "adore" was split in Lab 01, plus its plural ending! Place 1 or 2 cuts.',
    validSplits: [
      ['ad', 'ores'],
      ['adore', 's'],
      ['ad', 'ore', 's']
    ],
    aiActualSplit: ['ad', 'ores'],
    aiIds: ['#329', '#7985'],
    explanation: `The real SmolLM2 tokenizer slices <strong>"adores"</strong> right after the first two letters: <code>[ad]</code> (<code>#329</code>) + <code>[ores]</code> (<code>#7985</code>)!`
  },
  {
    word: 'smartphones',
    hint: 'Hint: This compound word is made of two everyday words glued together! Click 1 gap to slice it.',
    validSplits: [
      ['smart', 'phones'],
      ['smart', 'phone', 's']
    ],
    aiActualSplit: ['smart', 'phones'],
    aiIds: ['#15082', '#17408'],
    explanation: `Bullseye! The AI slices compound words cleanly at the seam: <code>[smart]</code> (<code>#15082</code>) + <code>[phones]</code> (<code>#17408</code>).`
  }
];

// State
let currentPuzzleIdx = 0;
let assembledPieces = [];
let isBlindfolded = false;

let currentLaserIdx = 0;
let activeCutIndices = new Set(); // Cut index i means cut between char i and i+1

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
const stage1Feedback = document.getElementById('stage1-feedback');
const stage1FeedbackText = document.getElementById('stage1-feedback-text');
const btnStage1Next = document.getElementById('btn-stage1-next');

// Stage 2 DOM
const laserRoundTag = document.getElementById('laser-round-tag');
const laserHint = document.getElementById('laser-hint');
const laserWordRow = document.getElementById('laser-word-row');
const btnClearCuts = document.getElementById('btn-clear-cuts');
const btnFireLaser = document.getElementById('btn-fire-laser');
const laserFeedback = document.getElementById('laser-feedback');
const laserFeedbackText = document.getElementById('laser-feedback-text');
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

// Open Quiz directly if linked with ?quiz=1
if (new URLSearchParams(window.location.search).get('quiz') === '1') {
  quizModal.classList.remove('hidden');
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
function loadJigsawPuzzle(idx) {
  currentPuzzleIdx = idx;
  const p = JIGSAW_PUZZLES[idx];
  assembledPieces = [];
  isBlindfolded = false;

  puzzleRoundTag.textContent = p.roundTag;
  puzzleTitle.textContent = p.title;
  puzzleInstructions.textContent = p.instructions;
  targetWordText.textContent = p.targetWord;

  assemblyZone.classList.remove('solved');
  stage1Feedback.classList.add('hidden');
  btnToggleBlindfold.classList.add('hidden');

  renderStage1();
}

function createJigsawElement(pieceObj, hasRightTab = false, blindfold = false) {
  const el = document.createElement('div');
  el.className = `puzzle-piece ${pieceObj.color} ${hasRightTab ? 'has-right-tab' : ''} ${blindfold ? 'blindfolded' : ''}`;
  el.innerHTML = `
    <span class="pp-chunk">${pieceObj.chunk}</span>
    <span class="pp-id">#${pieceObj.id}</span>
  `;
  return el;
}

function renderStage1() {
  const p = JIGSAW_PUZZLES[currentPuzzleIdx];

  // Render Assembled Track
  assembledRow.innerHTML = '';
  assemblyPlaceholder.classList.toggle('hidden', assembledPieces.length > 0);

  assembledPieces.forEach((piece, i) => {
    const hasRightTab = i < assembledPieces.length - 1;
    const el = createJigsawElement(piece, hasRightTab, isBlindfolded);
    el.title = 'Click to remove from track';
    el.addEventListener('click', () => {
      assembledPieces.splice(i, 1);
      assemblyZone.classList.remove('solved');
      stage1Feedback.classList.add('hidden');
      renderStage1();
    });
    assembledRow.appendChild(el);
  });

  // Render Tray
  jigsawTray.innerHTML = '';
  p.trayPieces.forEach((piece) => {
    const alreadyUsed = assembledPieces.includes(piece);
    if (alreadyUsed) return;

    const el = createJigsawElement(piece, true, false);
    el.addEventListener('click', () => {
      assembledPieces.push(piece);
      checkStage1Solution();
      renderStage1();
    });
    jigsawTray.appendChild(el);
  });
}

function checkStage1Solution() {
  const p = JIGSAW_PUZZLES[currentPuzzleIdx];
  const currentChunks = assembledPieces.map(item => item.chunk);

  const isExactMatch =
    currentChunks.length === p.solution.length &&
    currentChunks.every((val, index) => val === p.solution[index]);

  if (isExactMatch) {
    assemblyZone.classList.add('solved');
    stage1Feedback.classList.remove('hidden');
    stage1FeedbackText.innerHTML = p.successHtml;
    btnToggleBlindfold.classList.remove('hidden');

    if (currentPuzzleIdx === 0) {
      updateSolvedCounter(1);
      btnStage1Next.innerHTML = `<span>Next Puzzle: The Strawberry Mystery</span><i data-lucide="arrow-right" class="icon-xs"></i>`;
    } else {
      updateSolvedCounter(2);
      tabStage1.classList.add('completed');
      isBlindfolded = true; // Automatically flip into AI Vision mode for Strawberry!
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
  }
}

btnClearAssembly.addEventListener('click', () => {
  assembledPieces = [];
  isBlindfolded = false;
  assemblyZone.classList.remove('solved');
  stage1Feedback.classList.add('hidden');
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
  laserFeedback.classList.add('hidden');

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

    // Add clickable laser cut slot between characters
    if (i < chars.length - 1) {
      const slot = document.createElement('div');
      slot.className = `cut-slot ${activeCutIndices.has(i) ? 'active-cut' : ''}`;
      slot.title = 'Click to place or remove a laser cut here';
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
  laserFeedback.classList.add('hidden');
  renderLaserWord();
});

btnFireLaser.addEventListener('click', () => {
  const c = LASER_CHALLENGES[currentLaserIdx];
  if (activeCutIndices.size === 0) {
    alert('Click between the letters first to place at least one laser cut!');
    return;
  }

  // Slice word based on user's cut indices
  const sortedCuts = Array.from(activeCutIndices).sort((a, b) => a - b);
  const userChunks = [];
  let start = 0;
  sortedCuts.forEach(cutIdx => {
    userChunks.push(c.word.slice(start, cutIdx + 1));
    start = cutIdx + 1;
  });
  userChunks.push(c.word.slice(start));

  // Build visual jigsaw pieces of the AI's actual split
  const piecesHtml = c.aiActualSplit.map((chunk, i) => `
    <span style="display:inline-flex; align-items:center; gap:4px; background:#063928; border:1px solid #10b981; color:#d1fae5; font-family:var(--font-mono); padding:2px 8px; border-radius:6px; margin:0 3px;">
      <strong>${chunk}</strong> <small style="opacity:0.75">${c.aiIds[i]}</small>
    </span>
  `).join('+');

  laserFeedback.classList.remove('hidden');
  laserFeedbackText.innerHTML = `
    <div style="margin-bottom:0.35rem;"><strong>Your Cut:</strong> <code>${userChunks.join(' | ')}</code></div>
    <div>${c.explanation} ${piecesHtml}</div>
  `;

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
    forgeStage.innerHTML = `<span style="color:var(--cyan); font-family:var(--font-mono); font-size:0.85rem;">Waking up real SmolLM2 Tokenizer...</span>`;
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
    const el = createJigsawElement(piece, i < ids.length - 1, false);
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
// QUIZ MODAL LOGIC
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
    alert('Please answer all 3 questions.');
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
    quizFeedback.innerHTML = `<strong>3/3 Correct! (+200 XP)</strong> Returning to your Dashboard...`;
    setTimeout(() => { window.location.href = '../../index.html'; }, 1300);
  } else {
    quizFeedback.style.background = 'rgba(239, 68, 68, 0.15)';
    quizFeedback.style.color = '#ef4444';
    quizFeedback.textContent = `You got ${correct} out of 3 right. Check your choices and try again!`;
  }
});

// Initialize Stage 1 on load
loadJigsawPuzzle(0);