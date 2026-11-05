import { getProgress, resetAllProgress } from './progress.js';

const PAYPAL_DONATE_URL = 'https://www.paypal.com/donate/?hosted_button_id=E5ZY9CWMAV9Z6';

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
    description: 'AI does not actually read whole words. It chops text into numbered chunks. Discover why words like "strawberry" or "adore" get split into pieces.',
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

// Inject Top-Right "Need Help?" and "Support" Buttons + Modals
function setupTopbarActionsAndModals() {
  if (document.getElementById('dashboard-extra-modals-style')) return;

  const style = document.createElement('style');
  style.id = 'dashboard-extra-modals-style';
  style.textContent = `
    .btn-support-top {
      display: inline-flex;
      align-items: center;
      gap: 0.45rem;
      background: #14161f;
      border: 1px solid #2a2e3d;
      color: #e2e8f0;
      padding: 0.38rem 0.85rem;
      border-radius: 8px;
      font-family: var(--font-sans);
      font-size: 0.8rem;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.18s ease;
    }
    .btn-support-top:hover {
      border-color: #ff3b5c;
      background: #1c1f2b;
      color: #ffffff;
      transform: translateY(-1px);
    }
    .btn-support-heart {
      color: #ff2a55;
      fill: #ff2a55;
      width: 15px;
      height: 15px;
      flex-shrink: 0;
    }
    .btn-help-top {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      color: var(--text-secondary);
      padding: 0.38rem 0.75rem;
      border-radius: 8px;
      font-family: var(--font-sans);
      font-size: 0.78rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.18s ease;
    }
    .btn-help-top:hover {
      border-color: var(--cyan);
      color: var(--text-primary);
    }

    /* Backdrop for Support & Help Modals */
    .dash-modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(9, 9, 11, 0.82);
      backdrop-filter: blur(8px);
      z-index: 300;
      display: grid;
      place-items: center;
      padding: 1rem;
      animation: dashFadeIn 0.2s ease;
    }
    .dash-modal-backdrop.hidden {
      display: none !important;
    }
    @keyframes dashFadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    /* PayPal Support Embed Window (Matches Reference Screenshot) */
    .paypal-embed-window {
      width: 100%;
      max-width: 420px;
      background: #ffffff;
      border-radius: 14px;
      overflow: hidden;
      box-shadow: 0 25px 70px rgba(0, 0, 0, 0.85);
      border: 1px solid rgba(255, 255, 255, 0.2);
      display: flex;
      flex-direction: column;
    }
    .paypal-window-bar {
      background: #f1f5f9;
      border-bottom: 1px solid #e2e8f0;
      padding: 0.65rem 0.9rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .paypal-window-dots {
      display: flex;
      gap: 6px;
      align-items: center;
    }
    .paypal-window-dots span {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #cbd5e1;
      display: inline-block;
    }
    .paypal-window-close {
      background: transparent;
      border: none;
      color: #64748b;
      font-size: 1.25rem;
      line-height: 1;
      cursor: pointer;
      padding: 2px 6px;
      border-radius: 4px;
    }
    .paypal-window-close:hover {
      background: #e2e8f0;
      color: #0f172a;
    }
    .paypal-iframe-container {
      width: 100%;
      height: 420px;
      background: #ffffff;
      position: relative;
    }
    .paypal-iframe-container iframe {
      width: 100%;
      height: 100%;
      border: none;
      display: block;
    }

    /* Need Help Modal */
    .help-modal-card {
      width: 100%;
      max-width: 520px;
      background: var(--bg-surface);
      border: 1px solid var(--cyan);
      border-radius: var(--radius-lg);
      padding: 1.75rem;
      display: flex;
      flex-direction: column;
      gap: 1.15rem;
      box-shadow: 0 25px 70px rgba(0, 0, 0, 0.85);
    }
    .help-steps-list {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }
    .help-step-item {
      background: var(--bg-canvas);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-md);
      padding: 0.85rem 1rem;
      display: flex;
      gap: 0.85rem;
      align-items: flex-start;
    }
    .help-step-num {
      width: 26px;
      height: 26px;
      border-radius: 6px;
      background: var(--cyan-dim);
      border: 1px solid var(--cyan);
      color: var(--cyan);
      font-family: var(--font-mono);
      font-size: 0.76rem;
      font-weight: 700;
      display: grid;
      place-items: center;
      flex-shrink: 0;
      margin-top: 1px;
    }
    .help-step-text strong {
      display: block;
      font-size: 0.88rem;
      color: var(--text-primary);
      margin-bottom: 0.15rem;
    }
    .help-step-text p {
      font-size: 0.8rem;
      color: var(--text-secondary);
      line-height: 1.45;
      margin: 0;
    }
  `;
  document.head.appendChild(style);

  // Add buttons to the topbar-stats container
  const topbarStats = document.querySelector('.topbar-stats');
  if (topbarStats) {
    const helpBtn = document.createElement('button');
    helpBtn.type = 'button';
    helpBtn.className = 'btn-help-top';
    helpBtn.id = 'btn-open-help';
    helpBtn.innerHTML = `
      <i data-lucide="help-circle" class="icon-xs text-cyan"></i>
      <span>Need Help?</span>
    `;

    const supportBtn = document.createElement('button');
    supportBtn.type = 'button';
    supportBtn.className = 'btn-support-top';
    supportBtn.id = 'btn-open-support';
    supportBtn.innerHTML = `
      <svg class="btn-support-heart" viewBox="0 0 24 24">
        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
      </svg>
      <span>Support</span>
    `;

    topbarStats.appendChild(helpBtn);
    topbarStats.appendChild(supportBtn);
  }

  // Create Support Modal & Need Help Modal in DOM
  const modalsWrapper = document.createElement('div');
  modalsWrapper.innerHTML = `
    <!-- PayPal Support Embed Modal -->
    <div id="support-modal" class="dash-modal-backdrop hidden">
      <div class="paypal-embed-window">
        <div class="paypal-window-bar">
          <div class="paypal-window-dots">
            <span></span><span></span><span></span>
          </div>
          <button type="button" class="paypal-window-close" id="btn-close-support" aria-label="Close">&times;</button>
        </div>
        <div class="paypal-iframe-container">
          <iframe src="${PAYPAL_DONATE_URL}" title="Donate with PayPal"></iframe>
        </div>
      </div>
    </div>

    <!-- Need Help? Guide Modal -->
    <div id="help-modal" class="dash-modal-backdrop hidden">
      <div class="help-modal-card">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span class="mono-tag" style="color:var(--cyan); border-color:var(--cyan);">QUICK START GUIDE</span>
          <button type="button" class="btn-outline btn-xs" id="btn-close-help">Close</button>
        </div>
        <div>
          <h3 style="font-size:1.25rem; font-weight:700; color:var(--text-primary);">How This Course Works</h3>
          <p style="font-size:0.84rem; color:var(--text-secondary); margin-top:0.2rem;">
            Follow these four simple steps to master the fundamentals of how modern AI works:
          </p>
        </div>
        <div class="help-steps-list">
          <div class="help-step-item">
            <span class="help-step-num">1</span>
            <div class="help-step-text">
              <strong>Complete Each Module in Order</strong>
              <p>Start with Lab 01 and work your way through Lab 05. Completing each interactive lab and its quiz unlocks the next module on your dashboard.</p>
            </div>
          </div>
          <div class="help-step-item">
            <span class="help-step-num">2</span>
            <div class="help-step-text">
              <strong>Pass the Module Quizzes</strong>
              <p>Each of the first four labs ends with a quick 3-question check to verify what you learned and award your module XP.</p>
            </div>
          </div>
          <div class="help-step-item">
            <span class="help-step-num">3</span>
            <div class="help-step-text">
              <strong>Beat the Platformer & Pass the Final Exam</strong>
              <p>Reach the Neural Core in Lab 05, then take the 10-question Final Examination covering all five modules. Score 70% or higher to pass!</p>
            </div>
          </div>
          <div class="help-step-item">
            <span class="help-step-num">4</span>
            <div class="help-step-text">
              <strong>Claim Your Official Certificate</strong>
              <p>Once you pass the Final Examination, enter your name to receive a personalized, printable Certificate of Completion to show you know a thing or two about AI!</p>
            </div>
          </div>
        </div>
        <div style="display:flex; justify-content:flex-end;">
          <button type="button" class="btn-primary" id="btn-got-it-help">Got It, Let's Go!</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modalsWrapper);

  // Wire Event Listeners
  const supportModal = document.getElementById('support-modal');
  const helpModal = document.getElementById('help-modal');

  document.getElementById('btn-open-support')?.addEventListener('click', () => {
    supportModal.classList.remove('hidden');
  });
  document.getElementById('btn-close-support')?.addEventListener('click', () => {
    supportModal.classList.add('hidden');
  });
  supportModal.addEventListener('click', (e) => {
    if (e.target === supportModal) supportModal.classList.add('hidden');
  });

  document.getElementById('btn-open-help')?.addEventListener('click', () => {
    helpModal.classList.remove('hidden');
  });
  document.getElementById('btn-close-help')?.addEventListener('click', () => {
    helpModal.classList.add('hidden');
  });
  document.getElementById('btn-got-it-help')?.addEventListener('click', () => {
    helpModal.classList.add('hidden');
  });
  helpModal.addEventListener('click', (e) => {
    if (e.target === helpModal) helpModal.classList.add('hidden');
  });
}

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
  setupTopbarActionsAndModals();

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
