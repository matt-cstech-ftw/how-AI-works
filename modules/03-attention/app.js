import { completeActivity, saveQuizScore } from '../../assets/js/progress.js';

// ==========================================
// STAGE 1 DATA: THE PRONOUN DETECTIVE (WINOGRAD CASES)
// ==========================================
const DETECTIVE_CASES = [
  {
    roundTag: 'CASE 1 OF 3 // THE "TOO BIG" CLUE',
    title: 'What Was Too Big—The Trophy or The Suitcase?',
    words: ['The', 'trophy', "didn't", 'fit', 'in', 'the', 'suitcase', 'because', 'it', 'was', 'too', 'big.'],
    spotlightIdx: 8, // "it"
    clueIdx: 11,     // "big."
    correctIdx: 1,   // "trophy"
    wrongExplanations: {
      6: `<strong>Wait—think about the clue word <code>"big"</code>!</strong> If the <em>suitcase</em> were too big, the trophy would easily fit inside it! Because the sentence says <code>"too big"</code>, <strong>"it"</strong> must be the <code>"trophy"</code>!`,
      3: `<code>"fit"</code> is a verb! A pronoun like <strong>"it"</strong> is looking for the earlier <em>noun</em> that was too big.`
    },
    defaultWrong: `Not quite! Ask yourself: according to the clue word <code>"big."</code> at the end, which object was too large to fit inside the other?`,
    successHtml: `<strong>Case 1 Solved!</strong> Self-Attention fires a twin beam: <code>"it"</code> connects forward to the clue <code>"big."</code> (42% weight) and backward to <code>"trophy"</code> (58% weight). Now watch what happens when we change just ONE word at the end!`,
    walkthrough: null
  },
  {
    roundTag: 'CASE 2 OF 3 // ONE WORD FLIPS THE LASER!',
    title: 'Look! The Last Word Changed to "small." — Now What is "it"?',
    words: ['The', 'trophy', "didn't", 'fit', 'in', 'the', 'suitcase', 'because', 'it', 'was', 'too', 'small.'],
    spotlightIdx: 8, // "it"
    clueIdx: 11,     // "small."
    correctIdx: 6,   // "suitcase"
    wrongExplanations: {
      1: `<strong>Aha—you fell for the trap!</strong> In Case 1, the last word was <code>"big"</code>, so "it" was the trophy. Now the last word is <code>"small."</code>! If the trophy didn't fit because something was too <em>small</em>, which object was too small to hold it?`
    },
    defaultWrong: `Look at the yellow clue word <code>"small."</code> at the very end! Which of the two objects was too small for the other to fit inside?`,
    successHtml: `<strong>Mind-Blowing, Right?!</strong> Changing the final word from <code>"big"</code> to <code>"small"</code> caused the AI's attention beam to completely re-wire itself from <code>"trophy"</code> over to <code>"suitcase"</code>!`,
    walkthrough: {
      tag: 'LEARNING MOMENT • HOW SELF-ATTENTION WORKS',
      title: 'Why Changing One Word Rewired the Entire Sentence',
      svgHtml: `
        <svg width="360" height="92" viewBox="0 0 360 92" fill="none">
          <rect x="14" y="48" width="76" height="32" rx="6" fill="#18181b" stroke="#52525b" stroke-width="1.5"/>
          <text x="52" y="68" fill="#a1a1aa" font-family="JetBrains Mono" font-size="11" text-anchor="middle">trophy</text>

          <rect x="108" y="48" width="84" height="32" rx="6" fill="#063928" stroke="#10b981" stroke-width="2"/>
          <text x="150" y="68" fill="#d1fae5" font-family="JetBrains Mono" font-size="11" font-weight="bold" text-anchor="middle">suitcase</text>

          <rect x="210" y="48" width="52" height="32" rx="6" fill="#2e1045" stroke="#c084fc" stroke-width="2"/>
          <text x="236" y="68" fill="#f3e8ff" font-family="JetBrains Mono" font-size="12" font-weight="bold" text-anchor="middle">"it"</text>

          <rect x="280" y="48" width="66" height="32" rx="6" fill="#3d2206" stroke="#f59e0b" stroke-width="2"/>
          <text x="313" y="68" fill="#fef3c7" font-family="JetBrains Mono" font-size="11" font-weight="bold" text-anchor="middle">small.</text>

          <path d="M 236 48 Q 193 6 150 48" stroke="#10b981" stroke-width="3" fill="none"/>
          <path d="M 236 48 Q 274 14 313 48" stroke="#f59e0b" stroke-width="2.5" stroke-dasharray="4 4" fill="none"/>
        </svg>
      `,
      bodyHtml: `
        Old computer programs used a lazy rule: <em>"Always connect 'it' to the closest noun."</em> That rule fails half the time!<br><br>
        Modern Transformer AI uses <strong>Self-Attention</strong>: every word broadcasts a search query across the sentence. Because <code>"it"</code> sees <code>"small."</code> at the end, it automatically shifts its strongest connection beam over to <code>"suitcase"</code>!
      `
    }
  },
  {
    roundTag: 'CASE 3 OF 3 // TWO PEOPLE IN ONE SENTENCE',
    title: 'Who Earned the Promotion—Maya or Chloe?',
    words: ['Maya', 'congratulated', 'Chloe', 'because', 'she', 'had', 'earned', 'the', 'promotion.'],
    spotlightIdx: 4, // "she"
    clueIdx: 1,      // "congratulated"
    correctIdx: 2,   // "Chloe"
    wrongExplanations: {
      0: `<strong>Wait—look at the verb <code>"congratulated"</code>!</strong> Maya is the one doing the congratulating. Why would Maya congratulate Chloe if Maya was the one who got promoted?`
    },
    defaultWrong: `Think about the clue word <code>"congratulated"</code>! If Maya congratulated Chloe, who actually earned the promotion?`,
    successHtml: `<strong>3 for 3!</strong> By connecting <code>"she"</code> with both <code>"congratulated"</code> and <code>"earned"</code>, the AI knows with 94% attention weight that <strong>"she"</strong> refers to <code>"Chloe"</code>!`,
    walkthrough: null
  }
];

// ==========================================
// STAGE 2 DATA: CHAMELEON WORD TUNER
// ==========================================
const CHAMELEON_EXPERIMENTS = [
  {
    roundTag: 'EXPERIMENT 1 OF 2 // CHAMELEON WORD: "BANK"',
    title: 'Wire the Clues Into "bank" (River vs. Money)',
    words: ['The', 'fisherman', 'sat', 'on', 'the', 'muddy', 'bank', 'by', 'the', 'river.'],
    chameleonIdx: 6, // "bank"
    clueIndices: [1, 5, 9], // "fisherman", "muddy", "river."
    targetSide: 'left', // River / Nature
    leftLabel: 'RIVER EDGE',
    rightLabel: 'MONEY VAULT',
    successHtml: `<strong>Context Locked (98% River Edge)!</strong> Even though <code>"bank"</code> uses the exact same token ID as a financial bank, wiring in <code>"fisherman"</code>, <code>"muddy"</code>, and <code>"river."</code> pulled its vector meaning almost 100% to the water side!`
  },
  {
    roundTag: 'EXPERIMENT 2 OF 2 // SAME TOKEN ID, OPPOSITE MEANING!',
    title: 'Now Flip the Exact Same Token "bank" to the Money Side!',
    words: ['The', 'guard', 'locked', 'the', 'gold', 'inside', 'the', 'bank', 'vault.'],
    chameleonIdx: 7, // "bank"
    clueIndices: [1, 4, 8], // "guard", "gold", "vault."
    targetSide: 'right', // Money / Finance
    leftLabel: 'RIVER EDGE',
    rightLabel: 'MONEY VAULT',
    successHtml: `<strong>Context Flipped (99% Money Vault)!</strong> It is the exact same token ID for <code>"bank"</code>, but Self-Attention blended the surrounding words (<code>"guard"</code>, <code>"gold"</code>, <code>"vault."</code>) into it so the AI knows it means a financial building!`
  }
];

// ==========================================
// STAGE 3 DATA: LIVE SELF-ATTENTION RADAR
// ==========================================
const RADAR_SENTENCES = [
  {
    words: ['The', 'exhausted', 'pilot', 'landed', 'the', 'jet', 'safely', 'during', 'the', 'storm.'],
    connections: {
      0: [{ to: 2, w: 78 }],
      1: [{ to: 2, w: 86 }],
      2: [{ to: 1, w: 48 }, { to: 3, w: 38 }, { to: 5, w: 14 }],
      3: [{ to: 2, w: 44 }, { to: 5, w: 36 }, { to: 6, w: 20 }],
      4: [{ to: 5, w: 82 }],
      5: [{ to: 3, w: 52 }, { to: 2, w: 31 }],
      6: [{ to: 3, w: 68 }, { to: 9, w: 32 }],
      7: [{ to: 9, w: 74 }, { to: 3, w: 26 }],
      8: [{ to: 9, w: 85 }],
      9: [{ to: 3, w: 45 }, { to: 6, w: 35 }, { to: 2, w: 20 }]
    }
  },
  {
    words: ['The', 'dog', 'chased', 'the', 'squirrel', 'until', 'it', 'climbed', 'up', 'the', 'tree.'],
    connections: {
      0: [{ to: 1, w: 84 }],
      1: [{ to: 2, w: 62 }, { to: 4, w: 38 }],
      2: [{ to: 1, w: 51 }, { to: 4, w: 49 }],
      3: [{ to: 4, w: 88 }],
      4: [{ to: 2, w: 45 }, { to: 6, w: 55 }],
      5: [{ to: 2, w: 42 }, { to: 7, w: 58 }],
      6: [{ to: 4, w: 64 }, { to: 7, w: 24 }, { to: 10, w: 12 }], // "it" -> squirrel (64%), climbed (24%), tree (12%)
      7: [{ to: 6, w: 48 }, { to: 10, w: 52 }],
      8: [{ to: 7, w: 55 }, { to: 10, w: 45 }],
      9: [{ to: 10, w: 89 }],
      10: [{ to: 7, w: 58 }, { to: 4, w: 42 }]
    }
  }
];

// State
let currentCaseIdx = 0;
let currentChameleonIdx = 0;
let activatedClues = new Set();
let currentRadarIdx = 0;
let activeRadarWordIdx = 6;
let solvedTotal = 0;

// DOM Elements
const progressReadout = document.getElementById('progress-readout');
const tabStage1 = document.getElementById('tab-stage-1');
const tabStage2 = document.getElementById('tab-stage-2');
const tabStage3 = document.getElementById('tab-stage-3');

const stage1Panel = document.getElementById('stage-1-panel');
const stage2Panel = document.getElementById('stage-2-panel');
const stage3Panel = document.getElementById('stage-3-panel');

// Stage 1 DOM
const detectiveRoundTag = document.getElementById('detective-round-tag');
const detectiveTitle = document.getElementById('detective-title');
const s1Board = document.getElementById('s1-board');
const s1Svg = document.getElementById('s1-svg');
const s1WordsRow = document.getElementById('s1-words-row');
const s1Diagnostic = document.getElementById('s1-diagnostic');
const s1DiagText = document.getElementById('s1-diag-text');
const btnS1Next = document.getElementById('btn-s1-next');

// Stage 2 DOM
const chameleonRoundTag = document.getElementById('chameleon-round-tag');
const chameleonTitle = document.getElementById('chameleon-title');
const tugLabelLeft = document.getElementById('tug-label-left');
const tugLabelRight = document.getElementById('tug-label-right');
const tugStatusBadge = document.getElementById('tug-status-badge');
const tugBarLeft = document.getElementById('tug-bar-left');
const tugBarRight = document.getElementById('tug-bar-right');
const s2Board = document.getElementById('s2-board');
const s2Svg = document.getElementById('s2-svg');
const s2WordsRow = document.getElementById('s2-words-row');
const s2Diagnostic = document.getElementById('s2-diagnostic');
const s2DiagText = document.getElementById('s2-diag-text');
const btnS2Next = document.getElementById('btn-s2-next');

// Stage 3 DOM
const s3Board = document.getElementById('s3-board');
const s3Svg = document.getElementById('s3-svg');
const s3WordsRow = document.getElementById('s3-words-row');
const s3DiagText = document.getElementById('s3-diag-text');
const btnRadarQuiz = document.getElementById('btn-radar-quiz');

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

function updateSolvedCount(val) {
  solvedTotal = Math.max(solvedTotal, val);
  progressReadout.innerHTML = `Cases Solved: <strong>${solvedTotal} / 5</strong>`;
  if (solvedTotal >= 5) {
    completeActivity('mod-03', 150);
    btnOpenQuiz.classList.add('btn-primary');
  }
}

function switchStage(num) {
  [stage1Panel, stage2Panel, stage3Panel].forEach((p, i) => {
    p.classList.toggle('hidden', i + 1 !== num);
  });
  [tabStage1, tabStage2, tabStage3].forEach((t, i) => {
    t.classList.toggle('active', i + 1 === num);
  });

  if (num === 1) loadDetectiveCase(currentCaseIdx);
  if (num === 2) loadChameleonExperiment(currentChameleonIdx);
  if (num === 3) {
    tabStage3.classList.add('completed');
    loadRadarSentence(currentRadarIdx);
  }
}

tabStage1.addEventListener('click', () => switchStage(1));
tabStage2.addEventListener('click', () => switchStage(2));
tabStage3.addEventListener('click', () => switchStage(3));

// ==========================================
// SVG BÉZIER ARC DRAWING UTILITY
// ==========================================
function drawLaserArcBetweenElements(svgEl, boardEl, fromNode, toNode, color = '#10b981', strokeWidth = 3, dashed = false) {
  if (!fromNode || !toNode) return;
  const boardRect = boardEl.getBoundingClientRect();
  const r1 = fromNode.getBoundingClientRect();
  const r2 = toNode.getBoundingClientRect();

  const x1 = r1.left - boardRect.left + r1.width / 2;
  const y1 = r1.top - boardRect.top + 4;
  const x2 = r2.left - boardRect.left + r2.width / 2;
  const y2 = r2.top - boardRect.top + 4;

  const dist = Math.abs(x2 - x1);
  const arcHeight = Math.min(72, Math.max(28, dist * 0.24));
  const midX = (x1 + x2) / 2;
  const ctrlY = Math.min(y1, y2) - arcHeight;

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', `M ${x1} ${y1} Q ${midX} ${ctrlY} ${x2} ${y2}`);
  path.setAttribute('stroke', color);
  path.setAttribute('stroke-width', strokeWidth);
  if (dashed) {
    path.setAttribute('stroke-dasharray', '5 5');
    path.setAttribute('fill', 'none');
  } else {
    path.setAttribute('class', 'laser-arc-path');
  }
  svgEl.appendChild(path);

  // Endpoint glow circles
  [ [x1, y1], [x2, y2] ].forEach(([cx, cy]) => {
    const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    dot.setAttribute('cx', cx);
    dot.setAttribute('cy', cy);
    dot.setAttribute('r', '4');
    dot.setAttribute('fill', color);
    svgEl.appendChild(dot);
  });
}

// ==========================================
// STAGE 1 LOGIC: PRONOUN DETECTIVE
// ==========================================
function loadDetectiveCase(idx) {
  currentCaseIdx = idx;
  const c = DETECTIVE_CASES[idx];

  detectiveRoundTag.textContent = c.roundTag;
  detectiveTitle.textContent = c.title;
  s1Board.className = 'switchboard-box';
  s1Svg.innerHTML = '';
  s1WordsRow.innerHTML = '';
  btnS1Next.classList.add('hidden');

  s1Diagnostic.className = 'diagnostic-bar status-neutral';
  s1DiagText.innerHTML = `<strong>Click the noun</strong> in the sentence above that the purple word <code>"${c.words[c.spotlightIdx]}"</code> refers to!`;

  c.words.forEach((word, wIdx) => {
    const node = document.createElement('div');
    node.className = 'word-node';
    node.dataset.idx = wIdx;
    node.textContent = word;

    if (wIdx === c.spotlightIdx) {
      node.classList.add('spotlight-word');
    } else if (wIdx === c.clueIdx) {
      node.classList.add('clue-beacon');
    }

    node.addEventListener('click', () => handleStage1WordClick(wIdx, node));
    s1WordsRow.appendChild(node);
  });

  // Draw subtle dashed clue arc between spotlight pronoun and the yellow clue word
  setTimeout(() => {
    const nodes = s1WordsRow.querySelectorAll('.word-node');
    drawLaserArcBetweenElements(s1Svg, s1Board, nodes[c.spotlightIdx], nodes[c.clueIdx], '#f59e0b', 2, true);
  }, 50);
}

function handleStage1WordClick(clickedIdx, clickedNode) {
  const c = DETECTIVE_CASES[currentCaseIdx];
  if (clickedIdx === c.spotlightIdx) return;

  const nodes = s1WordsRow.querySelectorAll('.word-node');
  nodes.forEach(n => n.classList.remove('target-correct', 'target-wrong'));
  s1Svg.innerHTML = '';

  // Keep the clue arc visible
  drawLaserArcBetweenElements(s1Svg, s1Board, nodes[c.spotlightIdx], nodes[c.clueIdx], '#f59e0b', 2, true);

  if (clickedIdx === c.correctIdx) {
    clickedNode.classList.add('target-correct');
    s1Board.className = 'switchboard-box solved';
    drawLaserArcBetweenElements(s1Svg, s1Board, nodes[c.spotlightIdx], clickedNode, '#10b981', 3.5, false);

    s1Diagnostic.className = 'diagnostic-bar status-solved';
    s1DiagText.innerHTML = c.successHtml;
    btnS1Next.classList.remove('hidden');

    updateSolvedCount(currentCaseIdx + 1);

    if (currentCaseIdx < DETECTIVE_CASES.length - 1) {
      btnS1Next.innerHTML = `<span>Next Case</span><i data-lucide="arrow-right" class="icon-xs"></i>`;
    } else {
      tabStage1.classList.add('completed');
      btnS1Next.innerHTML = `<span>Go to Stage 2: Chameleon Word Tuner</span><i data-lucide="sparkles" class="icon-xs"></i>`;
    }

    if (c.walkthrough) {
      wtTag.textContent = c.walkthrough.tag;
      wtTitle.textContent = c.walkthrough.title;
      wtVisual.innerHTML = c.walkthrough.svgHtml;
      wtBody.innerHTML = c.walkthrough.bodyHtml;
      wtModal.classList.remove('hidden');
    }
    refreshIcons();
  } else {
    clickedNode.classList.add('target-wrong');
    s1Board.classList.remove('error-shake');
    void s1Board.offsetWidth;
    s1Board.classList.add('error-shake');

    drawLaserArcBetweenElements(s1Svg, s1Board, nodes[c.spotlightIdx], clickedNode, '#ef4444', 2.5, false);

    const specificReason = c.wrongExplanations[clickedIdx] || c.defaultWrong;
    s1Diagnostic.className = 'diagnostic-bar status-error';
    s1DiagText.innerHTML = specificReason;
  }
}

btnS1Next.addEventListener('click', () => {
  if (currentCaseIdx < DETECTIVE_CASES.length - 1) {
    loadDetectiveCase(currentCaseIdx + 1);
  } else {
    switchStage(2);
  }
});

btnWtClose.addEventListener('click', () => wtModal.classList.add('hidden'));

// ==========================================
// STAGE 2 LOGIC: CHAMELEON WORD TUNER
// ==========================================
function loadChameleonExperiment(idx) {
  currentChameleonIdx = idx;
  activatedClues.clear();
  const exp = CHAMELEON_EXPERIMENTS[idx];

  chameleonRoundTag.textContent = exp.roundTag;
  chameleonTitle.textContent = exp.title;
  s2Board.className = 'switchboard-box';
  s2Svg.innerHTML = '';
  s2WordsRow.innerHTML = '';
  btnS2Next.classList.add('hidden');

  updateTugMeter(50, exp);

  s2Diagnostic.className = 'diagnostic-bar status-neutral';
  s2DiagText.innerHTML = `<strong>Click at least 2 context clue words</strong> in the sentence above that tell the AI what kind of <code>"${exp.words[exp.chameleonIdx]}"</code> this is!`;

  exp.words.forEach((w, wIdx) => {
    const node = document.createElement('div');
    node.className = 'word-node';
    node.textContent = w;

    if (wIdx === exp.chameleonIdx) {
      node.classList.add('spotlight-word');
    }

    node.addEventListener('click', () => handleChameleonClick(wIdx, node));
    s2WordsRow.appendChild(node);
  });
}

function updateTugMeter(leftPct, exp) {
  const rightPct = 100 - leftPct;
  tugBarLeft.style.width = `${leftPct}%`;
  tugBarRight.style.width = `${rightPct}%`;
  tugLabelLeft.textContent = `${exp.leftLabel}: ${leftPct}%`;
  tugLabelRight.textContent = `${exp.rightLabel}: ${rightPct}%`;

  if (leftPct >= 85) {
    tugStatusBadge.textContent = `LOCKED: ${exp.leftLabel}`;
    tugStatusBadge.style.color = '#38bdf8';
  } else if (rightPct >= 85) {
    tugStatusBadge.textContent = `LOCKED: ${exp.rightLabel}`;
    tugStatusBadge.style.color = '#10b981';
  } else {
    tugStatusBadge.textContent = `SHIFTING (${leftPct} / ${rightPct})`;
    tugStatusBadge.style.color = '#a1a1aa';
  }
}

function handleChameleonClick(wIdx, node) {
  const exp = CHAMELEON_EXPERIMENTS[currentChameleonIdx];
  if (wIdx === exp.chameleonIdx) return;

  const nodes = s2WordsRow.querySelectorAll('.word-node');

  if (exp.clueIndices.includes(wIdx)) {
    activatedClues.add(wIdx);
    node.classList.add('clue-activated');

    // Redraw all activated clue beams
    s2Svg.innerHTML = '';
    activatedClues.forEach(cIdx => {
      const beamColor = exp.targetSide === 'left' ? '#38bdf8' : '#10b981';
      drawLaserArcBetweenElements(s2Svg, s2Board, nodes[exp.chameleonIdx], nodes[cIdx], beamColor, 3, false);
    });

    const count = activatedClues.size;
    const shiftAmount = count === 1 ? 28 : 48;
    const newLeftPct = exp.targetSide === 'left' ? 50 + shiftAmount : 50 - shiftAmount;
    updateTugMeter(newLeftPct, exp);

    if (count >= 2) {
      s2Board.className = 'switchboard-box solved';
      s2Diagnostic.className = 'diagnostic-bar status-solved';
      s2DiagText.innerHTML = exp.successHtml;
      btnS2Next.classList.remove('hidden');

      updateSolvedCount(3 + currentChameleonIdx + 1);

      if (currentChameleonIdx < CHAMELEON_EXPERIMENTS.length - 1) {
        btnS2Next.innerHTML = `<span>Next Experiment: Flip It Back!</span><i data-lucide="arrow-right" class="icon-xs"></i>`;
      } else {
        tabStage2.classList.add('completed');
        btnS2Next.innerHTML = `<span>Unlock Stage 3: Live Attention Radar</span><i data-lucide="sparkles" class="icon-xs"></i>`;
      }
      refreshIcons();
    } else {
      s2Diagnostic.className = 'diagnostic-bar status-good';
      s2DiagText.innerHTML = `<strong>Great clue!</strong> Wiring in <code>"${exp.words[wIdx]}"</code> shifted the meaning meter to 78%. Click <strong>one more clue word</strong> to lock it in!`;
    }
  } else {
    s2Board.classList.remove('error-shake');
    void s2Board.offsetWidth;
    s2Board.classList.add('error-shake');
    s2Diagnostic.className = 'diagnostic-bar status-error';
    s2DiagText.innerHTML = `<code>"${exp.words[wIdx]}"</code> is a generic grammar word—it doesn't tell us whether <strong>"bank"</strong> means a river or a vault! Click a descriptive noun or adjective instead.`;
  }
}

btnS2Next.addEventListener('click', () => {
  if (currentChameleonIdx < CHAMELEON_EXPERIMENTS.length - 1) {
    loadChameleonExperiment(currentChameleonIdx + 1);
  } else {
    switchStage(3);
  }
});

// ==========================================
// STAGE 3 LOGIC: LIVE SELF-ATTENTION RADAR
// ==========================================
function loadRadarSentence(sIdx) {
  currentRadarIdx = sIdx;
  const sent = RADAR_SENTENCES[sIdx];
  s3WordsRow.innerHTML = '';
  s3Svg.innerHTML = '';

  sent.words.forEach((w, idx) => {
    const node = document.createElement('div');
    node.className = 'word-node';
    node.textContent = w;
    node.addEventListener('click', () => inspectRadarWord(idx));
    node.addEventListener('mouseenter', () => inspectRadarWord(idx));
    s3WordsRow.appendChild(node);
  });

  setTimeout(() => inspectRadarWord(sIdx === 1 ? 6 : 2), 60);
}

function inspectRadarWord(wIdx) {
  activeRadarWordIdx = wIdx;
  const sent = RADAR_SENTENCES[currentRadarIdx];
  const nodes = s3WordsRow.querySelectorAll('.word-node');

  nodes.forEach((n, i) => {
    n.classList.toggle('spotlight-word', i === wIdx);
    n.classList.remove('clue-activated');
    const oldPill = n.querySelector('.weight-pill');
    if (oldPill) oldPill.remove();
  });

  s3Svg.innerHTML = '';
  const links = sent.connections[wIdx] || [];

  links.forEach(link => {
    const targetNode = nodes[link.to];
    if (!targetNode) return;
    targetNode.classList.add('clue-activated');

    const pill = document.createElement('span');
    pill.className = 'weight-pill';
    pill.textContent = `${link.w}%`;
    targetNode.appendChild(pill);

    const thickness = Math.max(1.5, (link.w / 100) * 5.5);
    drawLaserArcBetweenElements(s3Svg, s3Board, nodes[wIdx], targetNode, '#38bdf8', thickness, false);
  });

  const summaryParts = links.map(l => `<code>"${sent.words[l.to]}"</code> (<strong>${l.w}%</strong>)`).join(', ');
  s3DiagText.innerHTML = `<strong>Inspecting <code>"${sent.words[wIdx]}"</code>:</strong> Fires its strongest self-attention beams to ${summaryParts}.`;
}

document.querySelectorAll('.radar-preset').forEach(btn => {
  btn.addEventListener('click', () => loadRadarSentence(parseInt(btn.dataset.idx, 10)));
});

window.addEventListener('resize', () => {
  if (!stage3Panel.classList.contains('hidden')) inspectRadarWord(activeRadarWordIdx);
});

// ==========================================
// QUIZ MODAL LOGIC (Visual Per-Option Highlighting)
// ==========================================
btnOpenQuiz.addEventListener('click', () => quizModal.classList.remove('hidden'));
btnRadarQuiz.addEventListener('click', () => quizModal.classList.remove('hidden'));
btnCloseQuiz.addEventListener('click', () => quizModal.classList.add('hidden'));

document.querySelectorAll('.quiz-opt').forEach(opt => {
  opt.addEventListener('click', () => {
    const parent = opt.closest('.quiz-q');
    parent.querySelectorAll('.quiz-opt').forEach(o => {
      o.classList.remove('selected', 'ans-correct', 'ans-wrong');
      const oldTag = o.querySelector('.quiz-status-tag');
      if (oldTag) oldTag.remove();
    });
    const oldHint = parent.querySelector('.q-inline-hint');
    if (oldHint) oldHint.remove();

    opt.classList.add('selected');
  });
});

btnSubmitQuiz.addEventListener('click', () => {
  const questions = document.querySelectorAll('.quiz-q');
  const selected = document.querySelectorAll('.quiz-opt.selected');
  if (selected.length < questions.length) {
    alert('Please select an answer for all 3 questions.');
    return;
  }

  let correct = 0;
  questions.forEach(q => {
    const chosen = q.querySelector('.quiz-opt.selected');
    const oldTag = chosen.querySelector('.quiz-status-tag');
    if (oldTag) oldTag.remove();
    const oldHint = q.querySelector('.q-inline-hint');
    if (oldHint) oldHint.remove();

    const isRight = chosen.dataset.correct === 'true';
    const tag = document.createElement('span');
    tag.className = 'quiz-status-tag';

    if (isRight) {
      correct++;
      chosen.classList.add('ans-correct');
      tag.textContent = '✔ CORRECT';
      chosen.appendChild(tag);
    } else {
      chosen.classList.add('ans-wrong');
      tag.textContent = '✖ NOT QUITE';
      chosen.appendChild(tag);

      if (q.dataset.hint) {
        const hintEl = document.createElement('div');
        hintEl.className = 'q-inline-hint';
        hintEl.innerHTML = `<strong>Hint:</strong> ${q.dataset.hint}`;
        q.appendChild(hintEl);
      }
    }
  });

  quizFeedback.classList.remove('hidden');
  if (correct === 3) {
    completeActivity('mod-03', 150);
    saveQuizScore('mod-03', 100, 100);
    quizFeedback.style.background = 'var(--emerald-dim)';
    quizFeedback.style.color = 'var(--emerald)';
    quizFeedback.innerHTML = `<strong>3/3 Mastery Verified! (+250 XP)</strong> Unlocking Lab 04 and returning to your Dashboard...`;
    setTimeout(() => { window.location.href = '../../index.html'; }, 1400);
  } else {
    quizFeedback.style.background = 'rgba(239, 68, 68, 0.15)';
    quizFeedback.style.color = '#fca5a5';
    quizFeedback.innerHTML = `<strong>You scored ${correct} out of 3.</strong> Check the red answer(s) and hint above, pick a new option, and verify again!`;
  }
});

// Boot Stage 1 on load
loadDetectiveCase(0);