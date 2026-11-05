import './narrator.js';

const STORAGE_KEY = 'how_ai_works_progress_v1';

const DEFAULT_STATE = {
  xp: 0,
  modules: {
    'mod-01': { completed: false, quizPassed: false, unlocked: true, score: 0 },
    'mod-02': { completed: false, quizPassed: false, unlocked: false, score: 0 },
    'mod-03': { completed: false, quizPassed: false, unlocked: false, score: 0 },
    'mod-04': { completed: false, quizPassed: false, unlocked: false, score: 0 },
    'mod-05': { completed: false, quizPassed: false, unlocked: false, score: 0 }
  }
};

export function getProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_STATE);
    const parsed = JSON.parse(raw);
    return {
      xp: typeof parsed.xp === 'number' ? parsed.xp : 0,
      modules: { ...structuredClone(DEFAULT_STATE.modules), ...(parsed.modules || {}) }
    };
  } catch {
    return structuredClone(DEFAULT_STATE);
  }
}

function saveProgress(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  window.dispatchEvent(new Event('progress-updated'));
}

export function completeActivity(modId, xpReward = 150) {
  const state = getProgress();
  if (!state.modules[modId]) {
    state.modules[modId] = { completed: false, quizPassed: false, unlocked: true, score: 0 };
  }
  if (!state.modules[modId].completed) {
    state.modules[modId].completed = true;
    state.xp += xpReward;
    saveProgress(state);
  }
}

export function saveQuizScore(modId, scorePct, passThreshold = 70) {
  const state = getProgress();
  if (!state.modules[modId]) {
    state.modules[modId] = { completed: true, quizPassed: false, unlocked: true, score: 0 };
  }
  state.modules[modId].score = Math.max(state.modules[modId].score || 0, scorePct);

  if (scorePct >= passThreshold && !state.modules[modId].quizPassed) {
    state.modules[modId].quizPassed = true;
    state.xp += 100;

    // Unlock the next sequential module
    const order = ['mod-01', 'mod-02', 'mod-03', 'mod-04', 'mod-05'];
    const idx = order.indexOf(modId);
    if (idx !== -1 && idx + 1 < order.length) {
      const nextId = order[idx + 1];
      if (state.modules[nextId]) {
        state.modules[nextId].unlocked = true;
      }
    }
  }
  saveProgress(state);
}

export function resetAllProgress() {
  localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event('progress-updated'));
}
