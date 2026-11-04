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
    title: 'How Words Look for Clues',
    description: 'See how the AI connects pronouns and topics across a sentence so it remembers what you asked at the beginning.',
    conceptTaught: 'Teaches: Context & Word Connections (Self-Attention)',
    xp: 250,
    url: 'modules/03-attention/index.html'
  },
  {
    id: 'mod-03',
    number: 'LAB 03',
    title: 'How AI Understands What You Mean',
    description: 'Explore a deep-space star map where words live as glowing coordinates. Connect constellations and do Star Math to see how AI forms a thought.',
    conceptTaught: 'Teaches: Meaning Maps & Word Coordinates (Embeddings)',
    xp: 250,
    url: 'modules/04-entropy/index.html'
  },
  {
    id: 'mod-04',
    number: 'LAB 04',
    title: 'How AI Cuts Words into Puzzle Pieces',
    description: 'AI does not actually read whole words—it chops text into numbered chunks. Discover why words like "strawberry" or "adore" get split into pieces.',
    conceptTaught: 'Teaches: Tokens & Subword Slicing (Tokenization)',
    xp: 200,
    url: 'modules/02-tokens/index.html'
  },
  {
    id: 'mod-05',
    number: 'LAB 05',
    title: 'Where AI Knowledge Comes From (The Data Diet)',
    description: 'Collect clean training data, grab power-ups, and blast glitch monsters in a procedural side-scrolling platformer, then take the Final Examination.',
    conceptTaught: 'Teaches: Training Datasets, Data Filtering & Model Bias',
    xp: 300,
    url: 'modules/05-hallucinations/index.html'
  }
];

const modulesGrid = document.getElementById('modules-grid');
const navCompleted = document.getElementById('nav-completed');
const navXp = document.getElementById('nav-xp');
const masteryArc = document.getElementById('mastery-arc');
const masteryPctBadge = document.getElementById('mastery-pct-badge');
const gaugeBigNum = document.getElementById('gauge-big-num');
const heroCta = document.getElementById('hero-cta');
const heroCtaText = document.getElementById('hero-cta-text');
const btnReset = document.getElementById('btn-reset-progress');

function updateHeroButton(state) {
  for (const mod of MODULES_CATALOG) {
    const modState = state.modules[mod.id] || { completed: false, quizPassed: false, unlocked: false };

    if (!modState.completed) {
      heroCta.href = mod.url;
      heroCtaText.textContent = `Start ${mod.number}: ${mod.title}`;
      return;
    }

    if (modState.completed && !modState.quizPassed) {
      if (mod.id === 'mod-05') {
        heroCta.href = 'modules/final-exam/index.html';
        heroCtaText.textContent = 'Take Final Examination & Earn Certificate';
      } else {
        heroCta.href = `${mod.url}?quiz=1`;
        heroCtaText.textContent = `Take ${mod.number} Final Assessment: ${mod.title}`;
      }
      return;
    }
  }

  heroCta.href = 'modules/final-exam/index.html?view=cert';
  heroCtaText.textContent = 'Course Complete! View & Print Your Certificate';
}

function renderDashboard() {
  const state = getProgress();
  const totalCount = MODULES_CATALOG.length;
  let completedCount = 0;

  modulesGrid.innerHTML = '';

  MODULES_CATALOG.forEach((mod) => {
    const modState = state.modules[mod.id] || { completed: false, quizPassed: false, unlocked: false };
    const isDone = modState.completed && modState.quizPassed;
    const isQuizReady = modState.completed && !modState.quizPassed;
    if (isDone) completedCount++;

    const card = document.createElement('article');
    card.className = `module-card ${isDone ? 'completed' : ''} ${!modState.unlocked ? 'locked' : ''}`;

    let statusPillHtml = '';
    if (isDone) {
      statusPillHtml = `<span class="mod-status-pill done"><i data-lucide="check" class="icon-xs"></i> Completed</span>`;
    } else if (isQuizReady) {
      statusPillHtml = `<span class="mod-status-pill ready"><i data-lucide="award" class="icon-xs"></i> ${mod.id === 'mod-05' ? 'Final Exam Ready' : 'Lab Done • Quiz Ready'}</span>`;
    } else if (modState.unlocked) {
      statusPillHtml = `<span class="mod-status-pill ready"><i data-lucide="play" class="icon-xs"></i> Ready to Start</span>`;
    } else {
      statusPillHtml = `<span class="mod-status-pill"><i data-lucide="lock" class="icon-xs"></i> Finish Previous Lab</span>`;
    }

    let actionBtnHtml = '';
    if (modState.unlocked) {
      if (mod.id === 'mod-05' && isDone) {
        actionBtnHtml = `
          <div style="display:flex; gap:0.45rem; flex-wrap:wrap;">
            <a href="modules/final-exam/index.html?view=cert" class="btn-primary btn-xs">
              <i data-lucide="award" class="icon-xs"></i>
              <span>View Certificate</span>
            </a>
            <a href="${mod.url}" class="btn-secondary btn-xs">
              <span>Replay Lab 05</span>
            </a>
          </div>
        `;
      } else {
        const targetHref = isQuizReady
          ? (mod.id === 'mod-05' ? 'modules/final-exam/index.html' : `${mod.url}?quiz=1`)
          : mod.url;
        const btnLabel = isDone
          ? `Replay ${mod.number}`
          : (isQuizReady ? (mod.id === 'mod-05' ? 'Take Final Exam' : 'Take Final Quiz') : `Launch ${mod.number}`);
        actionBtnHtml = `
          <a href="${targetHref}" class="${isDone ? 'btn-secondary' : 'btn-primary'} btn-xs">
            <span>${btnLabel}</span>
            <i data-lucide="arrow-up-right" class="icon-xs"></i>
          </a>
        `;
      }
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

  navCompleted.textContent = `${completedCount}/${totalCount}`;
  navXp.textContent = state.xp;
  gaugeBigNum.textContent = `${completedCount}/${totalCount}`;

  const pct = Math.round((completedCount / totalCount) * 100);
  masteryPctBadge.textContent = `${pct}%`;

  const arcLength = 141.37;
  const offset = arcLength - (pct / 100) * arcLength;
  masteryArc.style.strokeDashoffset = offset;

  updateHeroButton(state);

  if (window.lucide) window.lucide.createIcons();
}

btnReset.addEventListener('click', () => {
  if (confirm('Reset your XP and lab completion progress?')) {
    localStorage.removeItem('ai_course_certificate_v1');
    resetAllProgress();
  }
});

window.addEventListener('progress-updated', renderDashboard);
renderDashboard();
