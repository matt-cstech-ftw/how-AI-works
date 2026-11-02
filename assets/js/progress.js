const STORAGE_KEY = 'ai_foundry_progress_v1';

const defaultState = {
  xp: 0,
  modules: {
    'mod-01': { completed: false, quizPassed: false, score: null, unlocked: true },
    'mod-02': { completed: false, quizPassed: false, score: null, unlocked: false },
    'mod-03': { completed: false, quizPassed: false, score: null, unlocked: false },
    'mod-04': { completed: false, quizPassed: false, score: null, unlocked: false },
    'mod-05': { completed: false, quizPassed: false, score: null, unlocked: false }
  }
};

export function getProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(defaultState);
    const parsed = JSON.parse(raw);
    return {
      ...defaultState,
      ...parsed,
      modules: { ...defaultState.modules, ...(parsed.modules || {}) }
    };
  } catch {
    return structuredClone(defaultState);
  }
}

export function completeActivity(moduleId, earnedXp = 150) {
  const state = getProgress();
  if (!state.modules[moduleId]) return state;

  if (!state.modules[moduleId].completed) {
    state.modules[moduleId].completed = true;
    state.xp += earnedXp;
  }

  // Unlock the next module automatically
  const keys = Object.keys(state.modules);
  const nextIdx = keys.indexOf(moduleId) + 1;
  if (nextIdx < keys.length) {
    state.modules[keys[nextIdx]].unlocked = true;
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  window.dispatchEvent(new Event('progress-updated'));
  return state;
}

export function saveQuizScore(moduleId, scorePct, bonusXp = 100) {
  const state = getProgress();
  if (!state.modules[moduleId]) return state;

  if (!state.modules[moduleId].quizPassed && scorePct >= 100) {
    state.xp += bonusXp;
    state.modules[moduleId].quizPassed = true;
  }
  state.modules[moduleId].score = scorePct;

  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  window.dispatchEvent(new Event('progress-updated'));
  return state;
}

export function resetAllProgress() {
  localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event('progress-updated'));
}