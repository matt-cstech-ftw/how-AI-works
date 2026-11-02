import { AutoTokenizer, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.3.3';
import { completeActivity, saveQuizScore } from '../../assets/js/progress.js';

env.allowLocalModels = false;
env.useBrowserCache = true;

const MODEL_ID = 'HuggingFaceTB/SmolLM2-135M-Instruct';

let tokenizer = null;
const seenWalkthroughs = new Set();
const goals = { wake: false, strawberry: false, trap: false };

// DOM References
const cockpitGrid = document.getElementById('cockpit-grid');
const initialGuideHint = document.getElementById('initial-guide-hint');
const experimentsBar = document.getElementById('experiments-bar');
const initBar = document.getElementById('init-bar');
const btnInit = document.getElementById('btn-init');
const workbenchWrapper = document.getElementById('workbench-wrapper');
const instrumentsPanel = document.getElementById('instruments-panel');

const slicerInput = document.getElementById('slicer-input');
const slicerStage = document.getElementById('slicer-stage');
const statusText = document.getElementById('status-text');

const btnExpStrawberry = document.getElementById('btn-exp-strawberry');
const btnExpTrap = document.getElementById('btn-exp-trap');
const btnExpSmash = document.getElementById('btn-exp-smash');

const statChars = document.getElementById('stat-chars');
const statWords = document.getElementById('stat-words');
const statTokens = document.getElementById('stat-tokens');

const effArc = document.getElementById('eff-arc');
const effNeedle = document.getElementById('eff-needle');
const effRatio = document.getElementById('eff-ratio');
const effZone = document.getElementById('eff-zone');

const xrayNarrative = document.getElementById('xray-narrative');
const selectedTokenBadge = document.getElementById('selected-token-badge');
const xrText = document.getElementById('xr-text');
const xrId = document.getElementById('xr-id');
const xrSpace = document.getElementById('xr-space');
const xrLetters = document.getElementById('xr-letters');

const inflationBadge = document.getElementById('inflation-badge');
const barHuman = document.getElementById('bar-human');
const barAi = document.getElementById('bar-ai');
const lblHuman = document.getElementById('lbl-human');
const lblAi = document.getElementById('lbl-ai');

const goalWakeEl = document.getElementById('goal-wake');
const goalStrawberryEl = document.getElementById('goal-strawberry');
const goalTrapEl = document.getElementById('goal-trap');

// Walkthrough Modal DOM
const wtModal = document.getElementById('walkthrough-modal');
const wtTag = document.getElementById('wt-tag');
const wtTitle = document.getElementById('wt-title');
const wtVisual = document.getElementById('wt-visual');
const wtBody = document.getElementById('wt-body');
const btnWtContinue = document.getElementById('btn-wt-continue');
const btnWtText = document.getElementById('btn-wt-text');

// Quiz Modal DOM
const quizModal = document.getElementById('quiz-modal');
const btnOpenQuiz = document.getElementById('btn-open-quiz');
const btnCloseQuiz = document.getElementById('btn-close-quiz');
const btnSubmitQuiz = document.getElementById('btn-submit-quiz');
const quizFeedback = document.getElementById('quiz-feedback');

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons();
}
refreshIcons();

// Open Quiz directly if linked from Dashboard with ?quiz=1
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('quiz') === '1') {
  quizModal.classList.remove('hidden');
}

function triggerWalkthrough({ id, tag, title, svgHtml, bodyHtml, buttonLabel = 'Got It — Continue' }) {
  if (seenWalkthroughs.has(id)) return;
  seenWalkthroughs.add(id);

  wtTag.textContent = tag;
  wtTitle.textContent = title;
  wtVisual.innerHTML = svgHtml;
  wtBody.innerHTML = bodyHtml;
  btnWtText.textContent = buttonLabel;
  wtModal.classList.remove('hidden');
  refreshIcons();
}

btnWtContinue.addEventListener('click', () => {
  wtModal.classList.add('hidden');
});

function markGoalDone(key, el, nextEl = null) {
  goals[key] = true;
  el.classList.remove('active-goal');
  el.classList.add('done');
  const label = el.querySelector('span')?.textContent || el.textContent.trim();
  el.innerHTML = `<i data-lucide="check-circle-2" class="icon-xs"></i><span>${label}</span>`;
  if (nextEl) nextEl.classList.add('active-goal');
  refreshIcons();

  if (goals.wake && goals.strawberry && goals.trap) {
    completeActivity('mod-02', 100);
    btnOpenQuiz.classList.add('btn-pulse-emerald');
  }
}

// Radial Packing Efficiency Speedometer (Chars per Token)
function updateEfficiencyDial(charsPerToken) {
  // Typical range: 1.0 (terrible, 1 char per token) to 5.0 (high compression)
  const clamped = Math.min(5.0, Math.max(0.5, charsPerToken));
  const norm = (clamped - 0.5) / 4.5; // 0..1
  const arcLen = 188.5;
  const offset = arcLen - norm * arcLen;
  const deg = -90 + norm * 180;

  effArc.style.strokeDashoffset = offset;
  effNeedle.style.transform = `rotate(${deg}deg)`;
  effRatio.textContent = charsPerToken.toFixed(1);

  if (charsPerToken >= 3.8) {
    effArc.style.stroke = '#10b981';
    effZone.textContent = 'SMOOTH WHOLE WORDS';
    effZone.style.color = '#10b981';
  } else if (charsPerToken >= 2.5) {
    effArc.style.stroke = '#38bdf8';
    effZone.textContent = 'MIXED SUBWORDS';
    effZone.style.color = '#38bdf8';
  } else {
    effArc.style.stroke = '#f59e0b';
    effZone.textContent = 'SHATTERED CHUNKS';
    effZone.style.color = '#f59e0b';
  }
}

function inspectTokenPiece(pieceObj, index, total) {
  document.querySelectorAll('.token-block').forEach((el, i) => {
    el.classList.toggle('active-token', i === index);
  });

  const hasLeadingSpace = /^\s/.test(pieceObj.rawText);
  const cleanStr = pieceObj.rawText.replace(/\s/g, '·');
  const letters = pieceObj.rawText.trim().split('').join(' - ') || '(space)';

  selectedTokenBadge.textContent = `Piece ${index + 1} of ${total}`;
  xrText.textContent = `"${cleanStr}"`;
  xrId.textContent = `#${pieceObj.id}`;
  xrSpace.textContent = hasLeadingSpace ? 'Yes (Glued to front)' : 'No (Glues to previous piece)';
  xrLetters.textContent = `${pieceObj.rawText.length} chars: ${letters}`;

  xrayNarrative.innerHTML = `
    When you type <code>"${cleanStr}"</code>, the AI never sees the letters <strong>${letters}</strong>! It only receives the single integer <code>#${pieceObj.id}</code>.
  `;
}

// Live Token Slicing Engine
async function sliceCurrentInput() {
  if (!tokenizer) return;
  const text = slicerInput.value;

  if (!text) {
    slicerStage.innerHTML = '<span style="color:var(--text-muted); font-size:0.82rem;">Type something above to see live token puzzle pieces...</span>';
    statChars.textContent = '0';
    statWords.textContent = '0';
    statTokens.textContent = '0';
    updateEfficiencyDial(0);
    return;
  }

  const encoded = await tokenizer(text, { add_special_tokens: false });
  const ids = Array.from(encoded.input_ids.data).map(Number);

  const pieces = ids.map((id, idx) => ({
    id,
    rawText: tokenizer.decode([id]),
    colorClass: `t-color-${idx % 5}`
  }));

  slicerStage.innerHTML = '';
  pieces.forEach((p, idx) => {
    const block = document.createElement('div');
    block.className = `token-block ${p.colorClass}`;
    const displayStr = p.rawText.replace(/ /g, '·');
    block.innerHTML = `
      <span class="tb-text">${displayStr}</span>
      <span class="tb-id">#${p.id}</span>
    `;
    block.addEventListener('click', () => inspectTokenPiece(p, idx, pieces.length));
    slicerStage.appendChild(block);
  });

  // Update Metrics
  const charCount = text.length;
  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
  const tokenLen = pieces.length;

  statChars.textContent = charCount;
  statWords.textContent = wordCount;
  statTokens.textContent = tokenLen;

  const charsPerTok = tokenLen > 0 ? charCount / tokenLen : 0;
  updateEfficiencyDial(charsPerTok);

  // Update Comparison Bars
  const maxBar = Math.max(wordCount, tokenLen, 1);
  barHuman.style.width = `${Math.round((wordCount / maxBar) * 100)}%`;
  barAi.style.width = `${Math.round((tokenLen / maxBar) * 100)}%`;
  lblHuman.textContent = `${wordCount}`;
  lblAi.textContent = `${tokenLen}`;

  const ratio = wordCount > 0 ? (tokenLen / wordCount).toFixed(1) : '1.0';
  inflationBadge.textContent = `${ratio}x Tokens per Word`;

  // Auto-inspect the last piece or "berry" if strawberry is present
  const berryIdx = pieces.findIndex(p => p.rawText.toLowerCase().includes('berry'));
  const targetIdx = berryIdx !== -1 ? berryIdx : 0;
  if (pieces[targetIdx]) {
    inspectTokenPiece(pieces[targetIdx], targetIdx, pieces.length);
  }
}

// STEP 1: Wake Up Tokenizer & Reveal Workbench
btnInit.addEventListener('click', async () => {
  if (tokenizer) return;
  btnInit.disabled = true;
  btnInit.classList.remove('btn-pulse-emerald');
  statusText.textContent = 'Loading Slicer...';

  try {
    tokenizer = await AutoTokenizer.from_pretrained(MODEL_ID);

    statusText.textContent = 'Word Slicer: Active';
    initBar.classList.add('hidden');
    initialGuideHint.classList.add('hidden');

    // Progressive Reveal
    cockpitGrid.classList.remove('stage-initial');
    experimentsBar.classList.remove('hidden');
    workbenchWrapper.classList.remove('hidden');
    instrumentsPanel.classList.remove('hidden');
    instrumentsPanel.classList.add('reveal-enter');

    // Highlight Experiment A button
    btnExpStrawberry.classList.add('btn-pulse-cyan');

    markGoalDone('wake', goalWakeEl, goalStrawberryEl);
    await sliceCurrentInput();

    // Walkthrough #1: How the Dictionary Works
    triggerWalkthrough({
      id: 'wt_slicer_awake',
      tag: 'STEP 1 COMPLETE • WORD SLICER ACTIVE',
      title: 'Secret #1: AI Cannot Read Letters!',
      svgHtml: `
        <svg width="320" height="78" viewBox="0 0 320 78" fill="none">
          <rect x="14" y="18" width="96" height="42" rx="6" fill="#18181b" stroke="#38bdf8" stroke-width="1.5"/>
          <text x="62" y="37" fill="#38bdf8" font-family="JetBrains Mono" font-size="12" font-weight="bold" text-anchor="middle">"·fresh"</text>
          <text x="62" y="52" fill="#a1a1aa" font-family="JetBrains Mono" font-size="9" text-anchor="middle">ID #6193</text>

          <rect x="122" y="18" width="84" height="42" rx="6" fill="#18181b" stroke="#10b981" stroke-width="1.5"/>
          <text x="164" y="37" fill="#10b981" font-family="JetBrains Mono" font-size="12" font-weight="bold" text-anchor="middle">"·straw"</text>
          <text x="164" y="52" fill="#a1a1aa" font-family="JetBrains Mono" font-size="9" text-anchor="middle">ID #20412</text>

          <rect x="218" y="18" width="88" height="42" rx="6" fill="#18181b" stroke="#c084fc" stroke-width="1.5"/>
          <text x="262" y="37" fill="#c084fc" font-family="JetBrains Mono" font-size="12" font-weight="bold" text-anchor="middle">"berries"</text>
          <text x="262" y="52" fill="#a1a1aa" font-family="JetBrains Mono" font-size="9" text-anchor="middle">ID #19055</text>
        </svg>
      `,
      bodyHtml: `
        Look at the colored blocks that just appeared on the left!<br><br>
        Before an AI brain can think, this <strong>Word Slicer (Tokenizer)</strong> chops your sentence into puzzle pieces from a fixed list of <strong>49,152 pieces</strong>.<br><br>
        • Common words stay whole (<code>"·fresh"</code>).<br>
        • Longer words get sliced in half (<code>"·straw"</code> + <code>"berries"</code>).<br><br>
        Next, click the glowing blue <strong>Experiment A: The "Strawberry" Mystery</strong> button!
      `,
      buttonLabel: 'Got It — Let’s Test Strawberry!'
    });
  } catch (err) {
    statusText.textContent = 'Load Error';
    btnInit.disabled = false;
  }
});

slicerInput.addEventListener('input', () => {
  sliceCurrentInput();
});

// EXPERIMENT A: The Strawberry Mystery
btnExpStrawberry.addEventListener('click', async () => {
  btnExpStrawberry.classList.remove('btn-pulse-cyan');
  slicerInput.value = btnExpStrawberry.dataset.text;
  await sliceCurrentInput();

  if (!goals.strawberry) {
    markGoalDone('strawberry', goalStrawberryEl, goalTrapEl);
    btnExpTrap.classList.add('btn-pulse-cyan');
  }

  triggerWalkthrough({
    id: 'wt_strawberry_mystery',
    tag: 'EXPERIMENT A • THE STRAWBERRY MYSTERY SOLVED',
    title: 'Why AI Struggles to Count the "R"s in Strawberry',
    svgHtml: `
      <svg width="330" height="84" viewBox="0 0 330 84" fill="none">
        <rect x="20" y="14" width="120" height="54" rx="8" fill="#18181b" stroke="#38bdf8" stroke-width="2"/>
        <text x="80" y="38" fill="#38bdf8" font-family="JetBrains Mono" font-size="14" font-weight="bold" text-anchor="middle">#20412</text>
        <text x="80" y="56" fill="#71717a" font-family="JetBrains Mono" font-size="10" text-anchor="middle">(hides "·straw")</text>

        <text x="165" y="45" fill="#fafafa" font-family="JetBrains Mono" font-size="18" font-weight="bold" text-anchor="middle">+</text>

        <rect x="190" y="14" width="120" height="54" rx="8" fill="#18181b" stroke="#10b981" stroke-width="2"/>
        <text x="250" y="38" fill="#10b981" font-family="JetBrains Mono" font-size="14" font-weight="bold" text-anchor="middle">#11951</text>
        <text x="250" y="56" fill="#71717a" font-family="JetBrains Mono" font-size="10" text-anchor="middle">(hides "berry")</text>
      </svg>
    `,
    bodyHtml: `
      Remember when everyone online laughed at AI for saying <strong>"strawberry"</strong> only had two R's?<br><br>
      Look at the puzzle pieces: the AI <strong>never sees the word "s-t-r-a-w-b-e-r-r-y"</strong>! It only receives two ID numbers: <code>#20412</code> and <code>#11951</code>.<br><br>
      Asking an AI to count letters inside a token is like handing you a closed cardboard box labeled <strong>#11951</strong> and asking how many letters are painted inside!
    `,
    buttonLabel: 'Mind Blown — Next Experiment!'
  });
});

// EXPERIMENT B: The Space & CAPS Trap
btnExpTrap.addEventListener('click', async () => {
  btnExpTrap.classList.remove('btn-pulse-cyan');
  slicerInput.value = btnExpTrap.dataset.text;
  await sliceCurrentInput();

  if (!goals.trap) {
    markGoalDone('trap', goalTrapEl);
  }

  triggerWalkthrough({
    id: 'wt_space_trap',
    tag: 'EXPERIMENT B • THE SPACE & CAPS TRAP',
    title: 'Why "cat", "·cat", and "CAT" Are Totally Different to AI',
    svgHtml: `
      <svg width="330" height="82" viewBox="0 0 330 82" fill="none">
        <rect x="10" y="16" width="88" height="48" rx="6" fill="#18181b" stroke="#38bdf8" stroke-width="1.5"/>
        <text x="54" y="37" fill="#38bdf8" font-family="JetBrains Mono" font-size="12" font-weight="bold" text-anchor="middle">"cat"</text>
        <text x="54" y="53" fill="#a1a1aa" font-family="JetBrains Mono" font-size="9" text-anchor="middle">1 Piece</text>

        <rect x="112" y="16" width="88" height="48" rx="6" fill="#18181b" stroke="#10b981" stroke-width="1.5"/>
        <text x="156" y="37" fill="#10b981" font-family="JetBrains Mono" font-size="12" font-weight="bold" text-anchor="middle">"·cat"</text>
        <text x="156" y="53" fill="#a1a1aa" font-family="JetBrains Mono" font-size="9" text-anchor="middle">Different ID!</text>

        <rect x="214" y="16" width="104" height="48" rx="6" fill="#18181b" stroke="#f59e0b" stroke-width="1.5"/>
        <text x="266" y="37" fill="#f59e0b" font-family="JetBrains Mono" font-size="12" font-weight="bold" text-anchor="middle">"·C" + "AT"</text>
        <text x="266" y="53" fill="#a1a1aa" font-family="JetBrains Mono" font-size="9" text-anchor="middle">Split in 2!</text>
      </svg>
    `,
    bodyHtml: `
      Look closely at the workbench:<br><br>
      1. <code>"cat"</code> at the very start of a sentence has <strong>no space</strong> in front, so it gets its own ID.<br>
      2. <code>"·cat"</code> in the middle of a sentence has a <strong>leading space glued to it</strong>—giving it a completely different ID number!<br>
      3. Typing in ALL CAPS (<code>"·CAT"</code>) or hyphens (<code>"c-a-t"</code>) shatters a 1-piece word into multiple pieces.<br><br>
      <strong>You finished all 3 Lab Goals!</strong> Click the glowing green <strong>Take Lab 02 Quiz</strong> button in the top right whenever you're ready!
    `,
    buttonLabel: 'Awesome — Let Me Explore!'
  });
});

// EXPERIMENT C: Giant Compound Words
btnExpSmash.addEventListener('click', async () => {
  slicerInput.value = btnExpSmash.dataset.text;
  await sliceCurrentInput();
});

// Quiz Modal Logic
btnOpenQuiz.addEventListener('click', () => quizModal.classList.remove('hidden'));
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
    quizFeedback.innerHTML = `<strong>3/3 Correct! (+200 Total XP)</strong> Unlocking Lab 03 and returning to your Dashboard...`;
    setTimeout(() => { window.location.href = '../../index.html'; }, 1400);
  } else {
    quizFeedback.style.background = 'rgba(239, 68, 68, 0.15)';
    quizFeedback.style.color = '#ef4444';
    quizFeedback.textContent = `You got ${correct} out of 3 right. Check your answers and try again!`;
  }
});