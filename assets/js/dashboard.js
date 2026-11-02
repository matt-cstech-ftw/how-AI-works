import { getProgress, resetAllProgress } from './progress.js';

const MODULES_CATALOG = [
  {
    id: 'mod-01',
    number: 'LAB 01',
    title: 'How AI Guesses the Next Word',
    description: 'Watch a real AI hold a word-guessing contest in slow motion. Step in and force a runner-up word to win to see how the whole sentence changes.',
    conceptTaught: 'Teaches: Next-Word Prediction & Word Probabilities (Logits)',
    xp: 250,
    url: 'modules/01-transformer/index.html'
  },
  {
    id: 'mod-02',
    number: 'LAB 02',
    title: 'How AI Cuts Words into Puzzle Pieces',
    description: 'AI does not actually read whole words—it chops text into numbered chunks. Discover why words like "strawberry" trip up giant models.',
    conceptTaught: 'Teaches: Tokens & Subword Slicing (Tokenization)',
    xp: 200,
    url: '#'
  },
  {
    id: 'mod-03',
    number: 'LAB 03',
    title: 'How Words Look for Clues',
    description: 'See how the AI connects pronouns and topics across a sentence so it remembers what you asked at the beginning.',
    conceptTaught: 'Teaches: Context & Word Connections (Self-Attention)',
    xp: 250,
    url: '#'
  },
  {
    id: 'mod-04',
    number: 'LAB 04',
    title: 'The AI Creativity Dial',
    description: 'Turn the dial from strict robot mode (0.0) to wild brainstorm mode (1.5) and watch how the weighted dice roll changes.',
    conceptTaught: 'Teaches: Temperature & Weighted Dice Rolls (Sampling)',
    xp: 200,
    url: '#'
  },
  {
    id: 'mod-05',
    number: 'LAB 05',
    title: 'Why AI Sometimes Makes Things Up',
    description: 'Test situations where the AI sounds 99% confident on the speedometer while inventing a completely fake fact.',
    conceptTaught: 'Teaches: Confidence vs. Truth (Hallucinations)',
    xp: 300,
    url: '#'
  }
];

const modulesGrid = document.getElementById('modules-grid');
const navCompleted = document.getElementById('nav-completed');
const navXp = document.getElementById('nav-xp');
const masteryArc = document.getElementById('mastery-arc');
const masteryPctBadge = document.getElementById('mastery-pct-badge');
const gaugeBigNum = document.getElementById('gauge-big-num');
const heroCtaText = document.getElementById('hero-cta-text');
const btnReset = document.getElementById('btn-reset-progress');

function renderDashboard() {
  const state = getProgress();
  const totalCount = MODULES_CATALOG.length;
  let completedCount = 0;

  modulesGrid.innerHTML = '';

  MODULES_CATALOG.forEach((mod) => {
    const modState = state.modules[mod.id] || { completed: false, unlocked: false };
    const isDone = modState.completed && modState.quizPassed;
    const isStarted = modState.completed && !modState.quizPassed;
    if (isDone) completedCount++;

    const card = document.createElement('article');
    card.className = `module-card ${isDone ? 'completed' : ''} ${!modState.unlocked ? 'locked' : ''}`;

    let statusPillHtml = '';
    if (isDone) {
      statusPillHtml = `<span class="mod-status-pill done"><i data-lucide="check" class="icon-xs"></i> Completed</span>`;
    } else if (isStarted) {
      statusPillHtml = `<span class="mod-status-pill ready"><i data-lucide="award" class="icon-xs"></i> Lab Done • Quiz Ready</span>`;
    } else if (modState.unlocked) {
      statusPillHtml = `<span class="mod-status-pill ready"><i data-lucide="play" class="icon-xs"></i> Ready to Start</span>`;
    } else {
      statusPillHtml = `<span class="mod-status-pill"><i data-lucide="lock" class="icon-xs"></i> Finish Previous Lab</span>`;
    }

    let actionBtnHtml = '';
    if (mod.id === 'mod-01') {
      actionBtnHtml = `
        <a href="${mod.url}" class="${isDone ? 'btn-secondary' : 'btn-primary'} btn-xs">
          <span>${isDone ? 'Replay Lab 01' : (isStarted ? 'Take Final Quiz' : 'Launch Lab')}</span>
          <i data-lucide="arrow-up-right" class="icon-xs"></i>
        </a>
      `;
    } else if (modState.unlocked) {
      actionBtnHtml = `
        <button class="btn-secondary btn-xs" onclick="alert('Lab 02 unlocks next in our build!')">
          <span>Unlocked • Coming Next</span>
        </button>
      `;
    } else {
      actionBtnHtml = `
        <button class="btn-outline btn-xs" disabled>
          <i data-lucide="lock" class="icon-xs"></i>
          <span>Locked</span>
        </button>
      `;
    }

    card.innerHTML = `
      <div>
        <div class="mod-top">
          <span class="mod-num">${mod.number}</span>
          ${statusPillHtml}
        </div>
        <div class="mod-body" style="margin-top: 0.75rem;">
          <h3>${mod.title}</h3>
          <p>${mod.description}</p>
          <div class="mod-concept-tag">
            <i data-lucide="book-open" class="icon-xs"></i>
            <span>${mod.conceptTaught}</span>
          </div>
        </div>
      </div>
      <div class="mod-footer">
        <span class="mod-xp">+${mod.xp} XP</span>
        ${actionBtnHtml}
      </div>
    `;

    modulesGrid.appendChild(card);
  });

  // Update Topbar & Radial Mastery Gauge
  navCompleted.textContent = `${completedCount}/${totalCount}`;
  navXp.textContent = state.xp;
  gaugeBigNum.textContent = `${completedCount}/${totalCount}`;

  const pct = Math.round((completedCount / totalCount) * 100);
  masteryPctBadge.textContent = `${pct}%`;

  const arcLength = 141.37;
  const offset = arcLength - (pct / 100) * arcLength;
  masteryArc.style.strokeDashoffset = offset;

  if (state.modules['mod-01']?.completed && state.modules['mod-01']?.quizPassed) {
    heroCtaText.textContent = 'Lab 01 Mastered — Replay Anytime';
  }

  if (window.lucide) window.lucide.createIcons();
}

btnReset.addEventListener('click', () => {
  if (confirm('Reset your XP and lab completion progress?')) {
    resetAllProgress();
  }
});

window.addEventListener('progress-updated', renderDashboard);
renderDashboard();