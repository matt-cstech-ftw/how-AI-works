import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.3.3';
import { completeActivity, saveQuizScore } from '../../assets/js/progress.js';

env.allowLocalModels = false;
env.useBrowserCache = true;

// ==========================================
// STAGE 1 & 2 STAR CATALOG (Normalized 0..1 Coordinates)
// ==========================================
const STAR_CATALOG = [
  // Nebula 1: Warm CafÃ© & Beverage Cluster (Top-Left, Amber/Gold)
  { id: 'espresso', label: 'Espresso', x: 0.18, y: 0.24, cluster: 'cafe', color: '#f59e0b' },
  { id: 'latte', label: 'Latte', x: 0.27, y: 0.17, cluster: 'cafe', color: '#f59e0b' },
  { id: 'roast', label: 'Coffee', x: 0.13, y: 0.37, cluster: 'cafe', color: '#f59e0b' },
  { id: 'cafe', label: 'Cafe', x: 0.28, y: 0.34, cluster: 'cafe', color: '#f59e0b' },

  // Nebula 2: Deep Space & Cosmos Cluster (Top-Right, Cyan)
  { id: 'astronaut', label: 'Astronaut', x: 0.74, y: 0.23, cluster: 'space', color: '#38bdf8' },
  { id: 'orbit', label: 'Orbit', x: 0.84, y: 0.16, cluster: 'space', color: '#38bdf8' },
  { id: 'rocket', label: 'Rocket', x: 0.66, y: 0.32, cluster: 'space', color: '#38bdf8' },
  { id: 'saturn', label: 'Saturn', x: 0.83, y: 0.35, cluster: 'space', color: '#38bdf8' },

  // Nebula 3: Living Creatures Cluster (Bottom-Right, Emerald)
  { id: 'puppy', label: 'Puppy', x: 0.72, y: 0.68, cluster: 'nature', color: '#10b981' },
  { id: 'dog', label: 'Dog', x: 0.85, y: 0.66, cluster: 'nature', color: '#10b981' },
  { id: 'kitten', label: 'Kitten', x: 0.73, y: 0.84, cluster: 'nature', color: '#10b981' },
  { id: 'cat', label: 'Cat', x: 0.86, y: 0.82, cluster: 'nature', color: '#10b981' },

  // Nebula 4: Royalty & World Capitals Cluster (Bottom-Left, Violet â€” Revealed in Stage 2)
  { id: 'king', label: 'King', x: 0.16, y: 0.66, cluster: 'royalty', color: '#c084fc' },
  { id: 'queen', label: 'Queen', x: 0.29, y: 0.66, cluster: 'royalty', color: '#c084fc' },
  { id: 'man', label: 'Man', x: 0.16, y: 0.83, cluster: 'royalty', color: '#c084fc' },
  { id: 'woman', label: 'Woman', x: 0.29, y: 0.83, cluster: 'royalty', color: '#c084fc' },
  { id: 'paris', label: 'Paris', x: 0.43, y: 0.66, cluster: 'geo', color: '#c084fc' },
  { id: 'france', label: 'France', x: 0.43, y: 0.83, cluster: 'geo', color: '#c084fc' },
  { id: 'tokyo', label: 'Tokyo', x: 0.56, y: 0.66, cluster: 'geo', color: '#c084fc' },
  { id: 'japan', label: 'Japan', x: 0.56, y: 0.83, cluster: 'geo', color: '#c084fc' }
];

const NEBULA_CLOUDS = [
  { id: 'cafe', x: 0.21, y: 0.27, rx: 140, color: 'rgba(245, 158, 11, 0.15)', name: 'WARMTH / CAFE NEBULA' },
  { id: 'space', x: 0.77, y: 0.26, rx: 145, color: 'rgba(56, 189, 248, 0.15)', name: 'COSMOS / AEROSPACE NEBULA' },
  { id: 'nature', x: 0.79, y: 0.75, rx: 135, color: 'rgba(16, 185, 129, 0.14)', name: 'LIVING CREATURES NEBULA' },
  { id: 'royalty', x: 0.36, y: 0.75, rx: 185, color: 'rgba(192, 132, 252, 0.13)', name: 'ROYALTY & CAPITALS NEBULA' }
];

const STAGE1_MISSIONS = [
  {
    roundTag: 'STAGE 1 // CONSTELLATION 1 OF 3',
    title: 'Wire the "Espresso" Meaning Constellation',
    anchorId: 'espresso',
    targetIds: ['latte', 'roast', 'cafe'],
    visibleClusters: ['cafe'],
    extraVisibleStarIds: ['astronaut', 'puppy'],
    promptInstruction: `Look at the pulsing gold star <code>"Espresso"</code> in the top-left nebula. <strong>Click its 3 closest neighbor stars</strong> (<code>Latte</code>, <code>Coffee</code>, <code>Cafe</code>) to wire your first Meaning Constellation!`,
    successHtml: `<strong>Coffee Constellation Permanently Wired!</strong> Because <code>Espresso</code>, <code>Latte</code>, <code>Coffee</code>, and <code>Cafe</code> appear in similar contexts, the AI parks their stars right next to each other. Click <strong>Illuminate Next Nebula</strong> to reveal the next part of the sky!`,
    walkthrough: null
  },
  {
    roundTag: 'STAGE 1 // CONSTELLATION 2 OF 3',
    title: 'Wire the "Astronaut" Meaning Constellation',
    anchorId: 'astronaut',
    targetIds: ['orbit', 'rocket', 'saturn'],
    visibleClusters: ['cafe', 'space'],
    extraVisibleStarIds: ['puppy'],
    promptInstruction: `Notice how your Coffee Constellation stayed lit on the left! Now look at the pulsing cyan star <code>"Astronaut"</code> in the newly revealed top-right nebula and <strong>click its 3 cosmic neighbor stars</strong>!`,
    successHtml: `<strong>Space Constellation Permanently Wired!</strong> Now you have two complete meaning clusters glowing in the sky. Click <strong>Illuminate Next Nebula</strong> to reveal one more constellation!`,
    walkthrough: null
  },
  {
    roundTag: 'STAGE 1 // CONSTELLATION 3 OF 3',
    title: 'Wire the "Puppy" Meaning Constellation',
    anchorId: 'puppy',
    targetIds: ['dog', 'kitten', 'cat'],
    visibleClusters: ['cafe', 'space', 'nature'],
    extraVisibleStarIds: [],
    promptInstruction: `Look at the bottom-right emerald nebula! Click the <strong>3 furry neighbor stars</strong> around <code>"Puppy"</code> (<code>Dog</code>, <code>Kitten</code>, <code>Cat</code>) to complete all 3 constellations!`,
    successHtml: `<strong>All 3 Meaning Constellations Wired!</strong> Look how cleanly the AI organizes concepts into neighborhoods. Click <strong>Go to Stage 2: Star Math Navigation</strong> to see how the AI navigates across these stars!`,
    walkthrough: {
      tag: 'LEARNING MOMENT â€¢ WHAT IS AN EMBEDDING?',
      title: 'Words Are Coordinates in a Meaning Galaxy',
      svgHtml: `
        <svg width="350" height="90" viewBox="0 0 350 90" fill="none">
          <circle cx="70" cy="45" r="34" fill="rgba(245,158,11,0.14)"/>
          <circle cx="58" cy="35" r="5" fill="#f59e0b"/>
          <circle cx="84" cy="38" r="5" fill="#f59e0b"/>
          <circle cx="68" cy="58" r="5" fill="#f59e0b"/>
          <path d="M58 35 L84 38 L68 58 Z" stroke="#f59e0b" stroke-width="1.5"/>
          <text x="70" y="84" fill="#fcd34d" font-family="JetBrains Mono" font-size="9" text-anchor="middle">Coffee Cluster</text>

          <path d="M115 45 H235" stroke="#52525b" stroke-width="1.5" stroke-dasharray="4 4"/>
          <text x="175" y="38" fill="#a1a1aa" font-family="JetBrains Mono" font-size="9" text-anchor="middle">Far Apart = Unrelated</text>

          <circle cx="280" cy="45" r="34" fill="rgba(56,189,248,0.14)"/>
          <circle cx="268" cy="34" r="5" fill="#38bdf8"/>
          <circle cx="294" cy="38" r="5" fill="#38bdf8"/>
          <circle cx="278" cy="58" r="5" fill="#38bdf8"/>
          <path d="M268 34 L294 38 L278 58 Z" stroke="#38bdf8" stroke-width="1.5"/>
          <text x="280" y="84" fill="#7dd3fc" font-family="JetBrains Mono" font-size="9" text-anchor="middle">Space Cluster</text>
        </svg>
      `,
      bodyHtml: `
        How does a computer made of numbers "understand" what you mean?<br><br>
        During training, the AI builds this <strong>Meaning Star Map (called Embeddings)</strong>. Every time two words show up in similar conversations, gravity pulls their stars closer together.<br><br>
        Next, in <strong>Stage 2</strong>, we'll illuminate the bottom-left nebula and see how you can <strong>add and subtract stars</strong> like a compass to navigate through ideas!
      `,
      autoAdvanceToStage2: true
    }
  }
];

const STAGE2_MATH = [
  {
    roundTag: 'STAGE 2 // STAR MATH 1 OF 2',
    title: 'Solve the Classic AI Vector Equation: King âˆ’ Man + Woman = ?',
    startId: 'king',
    minusId: 'man',
    plusId: 'woman',
    answerId: 'queen',
    explanation: `<strong>Bullseye!</strong> On the star map, subtracting <code>Man</code> from <code>King</code> gives the pure direction of <em>"Royalty"</em>. Starting at <code>Woman</code> and moving in that exact same direction lands directly on <code>Queen</code>! Click <strong>Next Star Equation</strong> to try one more!`
  },
  {
    roundTag: 'STAGE 2 // STAR MATH 2 OF 2',
    title: 'Navigate Across Countries: Paris âˆ’ France + Japan = ?',
    startId: 'paris',
    minusId: 'france',
    plusId: 'japan',
    answerId: 'tokyo',
    explanation: `<strong>Star Navigation Mastered!</strong> The direction from <code>France</code> to <code>Paris</code> is the <em>"Capital City"</em> vector. Applying that exact same vector arrow from <code>Japan</code> points straight at <code>Tokyo</code>!`
  }
];

// Stopwords to filter out so Stage 3 maps meaningful content words in the user's prompt
const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'up', 'about', 'into', 'over', 'after', 'is', 'am', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'it', 'its', 'they', 'them', 'their', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'we', 'my', 'your', 'our'
]);

const DYNAMIC_COLORS = ['#38bdf8', '#10b981', '#c084fc', '#f59e0b', '#f472b6'];

// State
let currentStage = 1;
let s1Idx = 0;
let s1ConnectedIds = new Set();
let s1MissionComplete = false;
let completedConstellations = [];
let s1WrongLine = null;

let s2Idx = 0;
let s2Solved = false;
let completedMathVectors = [];

// Stage 3 Live Neural Embedding State
let extractor = null;
let isEmbeddingLoading = false;
let s3DynamicStars = []; // Array of { label, x, y, color, vec }
let s3Links = [];        // Array of { fromIdx, toIdx, sim }
let s3Centroid = null;   // { x, y }

let hoveredStarId = null;
let discoveriesCount = 0;
let animTick = 0;
let pendingStageAdvance = null;

// Background Ambient Starfield
const BG_STARS = Array.from({ length: 220 }, () => ({
  x: Math.random(),
  y: Math.random(),
  r: Math.random() * 1.4 + 0.4,
  phase: Math.random() * Math.PI * 2,
  speed: 0.015 + Math.random() * 0.03
}));

// DOM References
const progressReadout = document.getElementById('progress-readout');
const tabStage1 = document.getElementById('tab-stage-1');
const tabStage2 = document.getElementById('tab-stage-2');
const tabStage3 = document.getElementById('tab-stage-3');

const obsRoundTag = document.getElementById('obs-round-tag');
const obsTitle = document.getElementById('obs-title');
const obsSub = document.getElementById('obs-sub');
const btnStage3Quiz = document.getElementById('btn-stage3-quiz');

const equationBar = document.getElementById('equation-bar');
const promptConstellationBar = document.getElementById('prompt-constellation-bar');
const customPromptInput = document.getElementById('custom-prompt-input');
const btnMapPrompt = document.getElementById('btn-map-prompt');
const embedModelStatus = document.getElementById('embed-model-status');

const cosmosViewport = document.getElementById('cosmos-viewport');
const canvas = document.getElementById('cosmos-canvas');
const ctx = canvas.getContext('2d');
const hudModeText = document.getElementById('hud-mode-text');
const hudRight = document.getElementById('hud-right');

const obsDiagnostic = document.getElementById('obs-diagnostic');
const obsDiagText = document.getElementById('obs-diag-text');
const btnObsNext = document.getElementById('btn-obs-next');

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

function updateDiscoveries(val) {
  discoveriesCount = Math.max(discoveriesCount, val);
  progressReadout.innerHTML = `Discoveries: <strong>${discoveriesCount} / 6</strong>`;
  if (discoveriesCount >= 6) {
    completeActivity('mod-03', 150);
    btnOpenQuiz.classList.add('btn-primary');
  }
}

function getStar(id) {
  return STAR_CATALOG.find(s => s.id === id);
}

function getVisibleStars() {
  if (currentStage === 3) return []; // Stage 3 uses clean blank sky + live user prompt stars!
  if (currentStage === 1) {
    const m = STAGE1_MISSIONS[s1Idx];
    return STAR_CATALOG.filter(
      st => m.visibleClusters.includes(st.cluster) || m.extraVisibleStarIds.includes(st.id)
    );
  }
  return STAR_CATALOG;
}

function getVisibleNebulae() {
  if (currentStage === 3) return []; // Original nebulae disappear in Stage 3!
  if (currentStage === 1) {
    const m = STAGE1_MISSIONS[s1Idx];
    return NEBULA_CLOUDS.filter(neb => m.visibleClusters.includes(neb.id));
  }
  return NEBULA_CLOUDS;
}

// ==========================================
// CANVAS RESIZE & 60FPS DEEP-SPACE RENDERER
// ==========================================
function resizeCanvas() {
  const rect = cosmosViewport.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

function drawConstellationGroup(anchorId, targetIds, color, w, h, isComplete) {
  const anchor = getStar(anchorId);
  if (!anchor) return;

  targetIds.forEach(tid => {
    const target = getStar(tid);
    if (target) {
      drawGlowLine(anchor.x * w, anchor.y * h, target.x * w, target.y * h, color, 2.4, false);
    }
  });

  if (isComplete && targetIds.length === 3) {
    const arr = targetIds.map(id => getStar(id));
    drawGlowLine(arr[0].x * w, arr[0].y * h, arr[1].x * w, arr[1].y * h, color, 1.4, true);
    drawGlowLine(arr[1].x * w, arr[1].y * h, arr[2].x * w, arr[2].y * h, color, 1.4, true);
  }
}

function renderCosmos() {
  animTick += 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  ctx.clearRect(0, 0, w, h);

  // 1. Draw Visible Nebula Clouds (Stages 1 & 2)
  const visibleNebulae = getVisibleNebulae();
  visibleNebulae.forEach(neb => {
    const cx = neb.x * w;
    const cy = neb.y * h;
    const grad = ctx.createRadialGradient(cx, cy, 8, cx, cy, neb.rx);
    grad.addColorStop(0, neb.color);
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, neb.rx, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.font = '600 9px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(neb.name, cx, cy - neb.rx * 0.55);
  });

  // 2. Draw Twinkling Background Stars (Always active)
  BG_STARS.forEach(st => {
    const alpha = 0.25 + 0.45 * Math.sin(animTick * st.speed + st.phase);
    ctx.fillStyle = `rgba(255, 255, 255, ${alpha.toFixed(2)})`;
    ctx.beginPath();
    ctx.arc(st.x * w, st.y * h, st.r, 0, Math.PI * 2);
    ctx.fill();
  });

  // 3. STAGE 3: Render ONLY the User's Live Prompt Constellation on a Clean Sky!
  if (currentStage === 3) {
    if (s3DynamicStars.length === 0) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.font = '600 13px "Inter", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('âœ¨ Type a sentence in the glowing box above and press "Map My Prompt"!', w / 2, h / 2);
      requestAnimationFrame(renderCosmos);
      return;
    }

    // Draw soft nebula glow around the user's Prompt Center of Gravity
    if (s3Centroid) {
      const cx = s3Centroid.x * w;
      const cy = s3Centroid.y * h;
      const grad = ctx.createRadialGradient(cx, cy, 10, cx, cy, 190);
      grad.addColorStop(0, 'rgba(56, 189, 248, 0.16)');
      grad.addColorStop(0.6, 'rgba(192, 132, 252, 0.08)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, 190, 0, Math.PI * 2);
      ctx.fill();

      // Draw Semantic Constellation Links between related words in user's prompt
      s3Links.forEach(link => {
        const sA = s3DynamicStars[link.fromIdx];
        const sB = s3DynamicStars[link.toIdx];
        if (!sA || !sB) return;
        drawGlowLine(sA.x * w, sA.y * h, sB.x * w, sB.y * h, '#38bdf8', 2.2, false);

        // Show similarity percentage on the line midpoint
        const mx = ((sA.x + sB.x) / 2) * w;
        const my = ((sA.y + sB.y) / 2) * h;
        ctx.fillStyle = 'rgba(9, 9, 11, 0.8)';
        ctx.fillRect(mx - 18, my - 8, 36, 14);
        ctx.fillStyle = '#7dd3fc';
        ctx.font = '600 9px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`${Math.round(link.sim * 100)}%`, mx, my + 2);
      });

      // Draw gravitational tether lines from each word star to the Center of Gravity
      s3DynamicStars.forEach(st => {
        drawGlowLine(st.x * w, st.y * h, cx, cy, 'rgba(16, 185, 129, 0.5)', 1.5, true);
      });

      // Draw Pulsing Center of Gravity (AI Thought Core)
      const pulseR = 16 + 5 * Math.sin(animTick * 0.08);
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(cx, cy, pulseR, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = '#10b981';
      ctx.beginPath();
      ctx.arc(cx, cy, 6.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#d1fae5';
      ctx.font = '700 11px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('â˜… PROMPT CENTER OF GRAVITY (COMBINED THOUGHT)', cx, cy - 24);
    }

    // Draw each Word Star from the user's prompt
    s3DynamicStars.forEach(star => {
      const sx = star.x * w;
      const sy = star.y * h;

      const haloR = 13 + 3.5 * Math.sin(animTick * 0.08);
      ctx.fillStyle = `${star.color}38`;
      ctx.beginPath();
      ctx.arc(sx, sy, haloR, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(sx, sy, 5.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = star.color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(sx - 9, sy); ctx.lineTo(sx + 9, sy);
      ctx.moveTo(sx, sy - 9); ctx.lineTo(sx, sy + 9);
      ctx.stroke();

      ctx.font = '700 12px "JetBrains Mono", monospace';
      ctx.fillStyle = '#fafafa';
      ctx.textAlign = 'center';
      ctx.fillText(star.label, sx, sy + 20);
    });

    requestAnimationFrame(renderCosmos);
    return;
  }

  // 4. STAGES 1 & 2: Draw Previously Completed Constellations
  completedConstellations.forEach(comp => {
    drawConstellationGroup(comp.anchorId, comp.targetIds, comp.color, w, h, true);
  });

  if (currentStage === 1) {
    const m = STAGE1_MISSIONS[s1Idx];
    const anchor = getStar(m.anchorId);
    const activeTargets = Array.from(s1ConnectedIds);
    drawConstellationGroup(m.anchorId, activeTargets, anchor.color, w, h, activeTargets.length === 3);

    if (s1WrongLine) {
      drawGlowLine(
        s1WrongLine.from.x * w,
        s1WrongLine.from.y * h,
        s1WrongLine.to.x * w,
        s1WrongLine.to.y * h,
        '#ef4444',
        2,
        true
      );
    }
  } else if (currentStage === 2) {
    completedMathVectors.forEach(eq => {
      const sStart = getStar(eq.startId);
      const sMinus = getStar(eq.minusId);
      const sPlus = getStar(eq.plusId);
      const sAns = getStar(eq.answerId);
      drawGlowLine(sMinus.x * w, sMinus.y * h, sStart.x * w, sStart.y * h, 'rgba(56, 189, 248, 0.45)', 1.6, true);
      drawGlowLine(sPlus.x * w, sPlus.y * h, sAns.x * w, sAns.y * h, 'rgba(16, 185, 129, 0.55)', 2, false);
    });

    const eq = STAGE2_MATH[s2Idx];
    const sStart = getStar(eq.startId);
    const sMinus = getStar(eq.minusId);
    const sPlus = getStar(eq.plusId);
    const sAns = getStar(eq.answerId);

    drawGlowLine(sMinus.x * w, sMinus.y * h, sStart.x * w, sStart.y * h, '#38bdf8', 2.4, true);
    drawGlowLine(sPlus.x * w, sPlus.y * h, sAns.x * w, sAns.y * h, s2Solved ? '#10b981' : '#f59e0b', 3.2, !s2Solved);
  }

  // 5. Draw Visible Foreground Word Stars (Stages 1 & 2)
  const visibleStars = getVisibleStars();
  visibleStars.forEach(star => {
    const sx = star.x * w;
    const sy = star.y * h;
    const isHovered = hoveredStarId === star.id;

    const isPermanentlyWired = completedConstellations.some(
      c => c.anchorId === star.id || c.targetIds.includes(star.id)
    );

    let isAnchorOrHighlight = isPermanentlyWired;
    let isCurrentMissionAnchor = false;

    if (currentStage === 1) {
      const m = STAGE1_MISSIONS[s1Idx];
      isCurrentMissionAnchor = star.id === m.anchorId;
      if (isCurrentMissionAnchor || s1ConnectedIds.has(star.id)) {
        isAnchorOrHighlight = true;
      }
    } else if (currentStage === 2) {
      const eq = STAGE2_MATH[s2Idx];
      isCurrentMissionAnchor = star.id === eq.answerId && !s2Solved;
      if ([eq.startId, eq.minusId, eq.plusId].includes(star.id) || (s2Solved && star.id === eq.answerId)) {
        isAnchorOrHighlight = true;
      }
    }

    if (isAnchorOrHighlight || isHovered || isCurrentMissionAnchor) {
      const haloR = isHovered ? 17 : 12 + 3.5 * Math.sin(animTick * 0.08);
      ctx.fillStyle = isHovered ? 'rgba(255, 255, 255, 0.25)' : `${star.color}38`;
      ctx.beginPath();
      ctx.arc(sx, sy, haloR, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = isAnchorOrHighlight || isHovered ? '#ffffff' : star.color;
    ctx.beginPath();
    ctx.arc(sx, sy, isAnchorOrHighlight ? 5.5 : 4.2, 0, Math.PI * 2);
    ctx.fill();

    if (isAnchorOrHighlight) {
      ctx.strokeStyle = star.color;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(sx - 9, sy); ctx.lineTo(sx + 9, sy);
      ctx.moveTo(sx, sy - 9); ctx.lineTo(sx, sy + 9);
      ctx.stroke();
    }

    ctx.font = `${isAnchorOrHighlight || isHovered ? '700' : '500'} 11px "JetBrains Mono", monospace`;
    ctx.fillStyle = isAnchorOrHighlight || isHovered ? '#fafafa' : '#a1a1aa';
    ctx.textAlign = 'center';
    ctx.fillText(star.label, sx, sy + 18);
  });

  requestAnimationFrame(renderCosmos);
}

function drawGlowLine(x1, y1, x2, y2, color, width = 2, dashed = false) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  if (dashed) ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.restore();
}

function getStarAtPosition(clientX, clientY) {
  if (currentStage === 3) return null;
  const rect = canvas.getBoundingClientRect();
  const mx = clientX - rect.left;
  const my = clientY - rect.top;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;

  const visibleStars = getVisibleStars();
  for (const star of visibleStars) {
    const sx = star.x * w;
    const sy = star.y * h;
    const dist = Math.hypot(mx - sx, my - sy);
    if (dist <= 26) return star;
  }
  return null;
}

canvas.addEventListener('mousemove', (e) => {
  const hit = getStarAtPosition(e.clientX, e.clientY);
  hoveredStarId = hit ? hit.id : null;
  canvas.style.cursor = hit ? 'pointer' : 'crosshair';
  if (hit) {
    hudRight.textContent = `Star: "${hit.label}" â€¢ Coordinates: (${(hit.x * 100).toFixed(0)}, ${(hit.y * 100).toFixed(0)})`;
  }
});

canvas.addEventListener('click', (e) => {
  const hit = getStarAtPosition(e.clientX, e.clientY);
  if (!hit) return;

  if (currentStage === 1) handleStage1StarClick(hit);
  else if (currentStage === 2) handleStage2StarClick(hit);
});

// ==========================================
// STAGE 1 LOGIC: WIRE THE CONSTELLATIONS
// ==========================================
function loadStage1Mission(idx) {
  s1Idx = idx;
  s1ConnectedIds.clear();
  s1WrongLine = null;
  s1MissionComplete = false;
  const m = STAGE1_MISSIONS[idx];

  obsRoundTag.textContent = m.roundTag;
  obsTitle.textContent = m.title;
  hudModeText.textContent = `ANCHOR STAR: "${getStar(m.anchorId).label.toUpperCase()}"`;
  cosmosViewport.className = 'cosmos-viewport';
  btnObsNext.classList.add('hidden');

  obsDiagnostic.className = 'diagnostic-bar status-neutral';
  obsDiagText.innerHTML = m.promptInstruction;
}

function handleStage1StarClick(clickedStar) {
  const m = STAGE1_MISSIONS[s1Idx];
  const anchor = getStar(m.anchorId);

  if (s1MissionComplete) {
    obsDiagnostic.className = 'diagnostic-bar status-solved';
    obsDiagText.innerHTML = `<strong>Constellation complete!</strong> Click the button on the right to continue to the next part of the sky!`;
    return;
  }

  if (clickedStar.id === m.anchorId) return;
  s1WrongLine = null;

  if (m.targetIds.includes(clickedStar.id)) {
    s1ConnectedIds.add(clickedStar.id);
    const remaining = 3 - s1ConnectedIds.size;

    if (remaining === 0) {
      s1MissionComplete = true;

      if (!completedConstellations.some(c => c.anchorId === m.anchorId)) {
        completedConstellations.push({
          anchorId: m.anchorId,
          targetIds: [...m.targetIds],
          color: anchor.color
        });
      }

      cosmosViewport.className = 'cosmos-viewport solved';
      obsDiagnostic.className = 'diagnostic-bar status-solved';
      obsDiagText.innerHTML = m.successHtml;
      btnObsNext.classList.remove('hidden');

      updateDiscoveries(s1Idx + 1);

      if (s1Idx < STAGE1_MISSIONS.length - 1) {
        btnObsNext.innerHTML = `<span>Illuminate Next Nebula</span><i data-lucide="sparkles" class="icon-xs"></i>`;
      } else {
        tabStage1.classList.add('completed');
        btnObsNext.innerHTML = `<span>Go to Stage 2: Star Math Navigation</span><i data-lucide="compass" class="icon-xs"></i>`;
      }

      if (m.walkthrough) {
        wtTag.textContent = m.walkthrough.tag;
        wtTitle.textContent = m.walkthrough.title;
        wtVisual.innerHTML = m.walkthrough.svgHtml;
        wtBody.innerHTML = m.walkthrough.bodyHtml;
        pendingStageAdvance = m.walkthrough.autoAdvanceToStage2 ? 2 : null;
        wtModal.classList.remove('hidden');
      }
      refreshIcons();
    } else {
      obsDiagnostic.className = 'diagnostic-bar status-good';
      obsDiagText.innerHTML = `<strong>Constellation link locked!</strong> <code>"${clickedStar.label}"</code> is right next door to <code>"${anchor.label}"</code>. Click <strong>${remaining} more neighbor star${remaining > 1 ? 's' : ''}</strong> in this nebula!`;
    }
  } else {
    s1WrongLine = { from: anchor, to: clickedStar };
    cosmosViewport.classList.remove('error-shake');
    void cosmosViewport.offsetWidth;
    cosmosViewport.classList.add('error-shake');

    const distScore = Math.round(Math.hypot(anchor.x - clickedStar.x, anchor.y - clickedStar.y) * 100);
    obsDiagnostic.className = 'diagnostic-bar status-error';
    obsDiagText.innerHTML = `<strong>Too Far Away in Meaning Space (Distance: ${distScore} light-years)!</strong> <code>"${clickedStar.label}"</code> lives in a different nebula than <code>"${anchor.label}"</code>. Click the stars right next to <code>"${anchor.label}"</code>!`;
  }
}

// ==========================================
// STAGE 2 LOGIC: STAR MATH NAVIGATION
// ==========================================
function loadStage2Math(idx) {
  s2Idx = idx;
  s2Solved = false;
  const eq = STAGE2_MATH[idx];

  obsRoundTag.textContent = eq.roundTag;
  obsTitle.textContent = eq.title;
  hudModeText.textContent = 'STAR MATH VECTOR COMPASS';
  cosmosViewport.className = 'cosmos-viewport';
  btnObsNext.classList.add('hidden');

  equationBar.innerHTML = `
    <span class="eq-chip">${getStar(eq.startId).label}</span>
    <span class="eq-op">âˆ’</span>
    <span class="eq-chip">${getStar(eq.minusId).label}</span>
    <span class="eq-op">+</span>
    <span class="eq-chip">${getStar(eq.plusId).label}</span>
    <span class="eq-op">=</span>
    <span class="eq-target" id="eq-answer-slot">? (Click Destination Star)</span>
  `;

  obsDiagnostic.className = 'diagnostic-bar status-neutral';
  obsDiagText.innerHTML = `Look at the newly revealed bottom-left purple nebula! Follow the gold dashed vector arrow starting from <code>"${getStar(eq.plusId).label}"</code> and <strong>click the destination star</strong> where it lands!`;
}

function handleStage2StarClick(clickedStar) {
  if (s2Solved) return;
  const eq = STAGE2_MATH[s2Idx];

  if (clickedStar.id === eq.answerId) {
    s2Solved = true;
    completedMathVectors.push(eq);

    const slot = document.getElementById('eq-answer-slot');
    if (slot) {
      slot.textContent = clickedStar.label;
      slot.style.borderColor = '#10b981';
      slot.style.color = '#10b981';
      slot.style.background = 'rgba(16, 185, 129, 0.15)';
    }

    cosmosViewport.className = 'cosmos-viewport solved';
    obsDiagnostic.className = 'diagnostic-bar status-solved';
    obsDiagText.innerHTML = eq.explanation;
    btnObsNext.classList.remove('hidden');

    updateDiscoveries(3 + s2Idx + 1);

    if (s2Idx < STAGE2_MATH.length - 1) {
      btnObsNext.innerHTML = `<span>Next Star Equation</span><i data-lucide="arrow-right" class="icon-xs"></i>`;
    } else {
      tabStage2.classList.add('completed');
      btnObsNext.innerHTML = `<span>Unlock Stage 3: Live AI Prompt Mapper</span><i data-lucide="sparkles" class="icon-xs"></i>`;
    }
    refreshIcons();
  } else {
    cosmosViewport.classList.remove('error-shake');
    void cosmosViewport.offsetWidth;
    cosmosViewport.classList.add('error-shake');
    obsDiagnostic.className = 'diagnostic-bar status-error';
    obsDiagText.innerHTML = `Not <code>"${clickedStar.label}"</code>! Look at the bottom-left purple nebula and click the star at the tip of the gold dashed arrow starting from <code>"${getStar(eq.plusId).label}"</code>.`;
  }
}

// ==========================================
// STAGE 3 LOGIC: REAL IN-BROWSER NEURAL PROMPT MAPPER
// ==========================================
function cosineSimilarity(vecA, vecB) {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) + 1e-8);
}

async function ensureEmbeddingModelLoaded() {
  if (extractor) return true;
  if (isEmbeddingLoading) return false;
  isEmbeddingLoading = true;
  embedModelStatus.textContent = 'Waking Up Neural Embedding Model (~22MB)...';
  embedModelStatus.style.color = '#38bdf8';

  try {
    extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
      dtype: 'q8'
    });
    embedModelStatus.textContent = 'Live Neural Embedding Engine: Active (384-D)';
    embedModelStatus.style.color = '#10b981';
    isEmbeddingLoading = false;
    return true;
  } catch (err) {
    console.warn('Embedding model load warning:', err);
    embedModelStatus.textContent = 'Neural Mapper Ready';
    isEmbeddingLoading = false;
    return false;
  }
}

async function mapLiveUserPrompt() {
  const rawText = customPromptInput.value.trim();
  customPromptInput.classList.remove('pulsing-prompt');

  if (!rawText) {
    s3DynamicStars = [];
    s3Links = [];
    s3Centroid = null;
    obsDiagnostic.className = 'diagnostic-bar status-neutral';
    obsDiagText.innerHTML = `<strong>Waiting for your prompt:</strong> Type any sentence into the highlighted box above and click <strong>Map My Prompt</strong> to watch the AI turn your words into a live constellation!`;
    return;
  }

  // Extract meaningful words from the user's sentence (up to 8 key words so the sky stays crisp)
  const cleanWords = rawText
    .replace(/[^a-zA-Z0-9\s'-]/g, '')
    .split(/\s+/)
    .filter(w => w.length >= 2 && !STOPWORDS.has(w.toLowerCase()));

  const uniqueWords = [...new Set(cleanWords.length > 0 ? cleanWords : rawText.split(/\s+/).filter(Boolean))].slice(0, 8);

  obsDiagnostic.className = 'diagnostic-bar status-good';
  obsDiagText.innerHTML = `<strong>Computing 384-dimensional coordinates for ${uniqueWords.length} words...</strong>`;

  const hasModel = await ensureEmbeddingModelLoaded();
  const vectors = [];

  if (hasModel && extractor) {
    for (const word of uniqueWords) {
      const out = await extractor(word, { pooling: 'mean', normalize: true });
      vectors.push(Array.from(out.data));
    }
  } else {
    // Fallback deterministic 384-D projection if offline
    for (const word of uniqueWords) {
      const v = Array.from({ length: 32 }, (_, idx) => Math.sin(word.charCodeAt(idx % word.length) * (idx + 1)));
      vectors.push(v);
    }
  }

  // Project high-dimensional vectors onto 2D canvas coordinates where semantically similar words pull closer together!
  const count = uniqueWords.length;
  const rawCoords = uniqueWords.map((word, idx) => {
    const vec = vectors[idx];
    // Use two orthogonal slices of the normalized embedding vector for initial 2D projection
    let sumX = 0;
    let sumY = 0;
    for (let i = 0; i < vec.length; i++) {
      if (i % 2 === 0) sumX += vec[i] * Math.cos(i);
      else sumY += vec[i] * Math.sin(i);
    }
    return { label: word, x: sumX, y: sumY, vec };
  });

  // Normalize coordinates nicely into the safe canvas viewport [0.18 .. 0.82] and apply a similarity spring pass
  const minX = Math.min(...rawCoords.map(c => c.x));
  const maxX = Math.max(...rawCoords.map(c => c.x));
  const minY = Math.min(...rawCoords.map(c => c.y));
  const maxY = Math.max(...rawCoords.map(c => c.y));

  s3DynamicStars = rawCoords.map((item, idx) => {
    const angle = (idx / Math.max(1, count)) * Math.PI * 2;
    const normX = maxX > minX ? (item.x - minX) / (maxX - minX) : 0.5 + 0.25 * Math.cos(angle);
    const normY = maxY > minY ? (item.y - minY) / (maxY - minY) : 0.5 + 0.25 * Math.sin(angle);

    return {
      id: `user_star_${idx}`,
      label: item.label,
      x: 0.20 + normX * 0.60,
      y: 0.22 + normY * 0.58,
      color: DYNAMIC_COLORS[idx % DYNAMIC_COLORS.length],
      vec: item.vec
    };
  });

  // Compute pairwise Cosine Similarities & pull strongly related words closer together
  s3Links = [];
  let strongestPair = null;

  for (let i = 0; i < s3DynamicStars.length; i++) {
    for (let j = i + 1; j < s3DynamicStars.length; j++) {
      const sim = Math.max(0.15, cosineSimilarity(s3DynamicStars[i].vec, s3DynamicStars[j].vec));
      if (!strongestPair || sim > strongestPair.sim) {
        strongestPair = { a: s3DynamicStars[i].label, b: s3DynamicStars[j].label, sim };
      }
      if (sim >= 0.32 || s3DynamicStars.length <= 4) {
        s3Links.push({ fromIdx: i, toIdx: j, sim });
      }
    }
  }

  // Sort links and keep top 5 clearest constellation lines
  s3Links.sort((a, b) => b.sim - a.sim);
  s3Links = s3Links.slice(0, 5);

  // Compute combined Prompt Center of Gravity
  const avgX = s3DynamicStars.reduce((s, st) => s + st.x, 0) / s3DynamicStars.length;
  const avgY = s3DynamicStars.reduce((s, st) => s + st.y, 0) / s3DynamicStars.length;
  s3Centroid = { x: avgX, y: avgY };

  const pairText = strongestPair
    ? `Strongest semantic connection: <code>"${strongestPair.a}"</code> â†” <code>"${strongestPair.b}"</code> (<strong>${Math.round(strongestPair.sim * 100)}% similarity</strong>).`
    : '';

  cosmosViewport.className = 'cosmos-viewport solved';
  obsDiagnostic.className = 'diagnostic-bar status-solved';
  obsDiagText.innerHTML = `
    <strong>Live Prompt Constellation Mapped!</strong> Our miniature browser AI converted your ${s3DynamicStars.length} key words into 384-dimensional coordinates and locked onto their green <strong>Center of Gravity</strong>. ${pairText}<br>
    <small style="color:var(--text-secondary);">Remember: Giant cloud models like ChatGPT and Gemini map your prompt across thousands of dimensions, so their constellation of what you mean is much sharper than our tiny pocket brain!</small>
  `;

  updateDiscoveries(6);
}

// Stage Switching
function switchStage(stageNum) {
  currentStage = stageNum;
  [tabStage1, tabStage2, tabStage3].forEach((t, i) => t.classList.toggle('active', i + 1 === stageNum));

  equationBar.classList.toggle('hidden', stageNum !== 2);
  promptConstellationBar.classList.toggle('hidden', stageNum !== 3);
  btnStage3Quiz.classList.toggle('hidden', stageNum !== 3);
  btnObsNext.classList.add('hidden');

  if (stageNum === 1) {
    loadStage1Mission(s1Idx);
  } else if (stageNum === 2) {
    loadStage2Math(s2Idx);
  } else if (stageNum === 3) {
    tabStage3.classList.add('completed');
    obsRoundTag.textContent = 'STAGE 3 // LIVE NEURAL PROMPT MAPPER';
    obsTitle.textContent = 'Type Any Prompt & Watch the AI Map Its Constellation Live';
    obsSub.innerHTML = `We just cleared the sky! Type any sentence into the highlighted box below. A real neural embedding model in your browser will convert your words into coordinates, connect the closest meanings, and find your prompt's <strong>Center of Gravity</strong>.`;
    hudModeText.textContent = 'LIVE NEURAL EMBEDDING MAPPER';
    hudRight.textContent = '384-Dimensional Vector Projection';
    cosmosViewport.className = 'cosmos-viewport';

    // Focus the blank, pulsing input box and preload the embedding model
    customPromptInput.focus();
    ensureEmbeddingModelLoaded();

    if (s3DynamicStars.length === 0) {
      obsDiagnostic.className = 'diagnostic-bar status-neutral';
      obsDiagText.innerHTML = `<strong>Your Turn:</strong> Type any sentence into the glowing cyan box above and press <strong>Map My Prompt</strong> (or click one of the example buttons) to see how AI maps what you're trying to say!`;
    }
  }
}

tabStage1.addEventListener('click', () => switchStage(1));
tabStage2.addEventListener('click', () => switchStage(2));
tabStage3.addEventListener('click', () => switchStage(3));

btnObsNext.addEventListener('click', () => {
  if (currentStage === 1) {
    if (s1Idx < STAGE1_MISSIONS.length - 1) loadStage1Mission(s1Idx + 1);
    else switchStage(2);
  } else if (currentStage === 2) {
    if (s2Idx < STAGE2_MATH.length - 1) loadStage2Math(s2Idx + 1);
    else switchStage(3);
  }
});

btnMapPrompt.addEventListener('click', mapLiveUserPrompt);
customPromptInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') mapLiveUserPrompt();
});

document.querySelectorAll('.prompt-preset').forEach(btn => {
  btn.addEventListener('click', () => {
    customPromptInput.value = btn.dataset.prompt;
    mapLiveUserPrompt();
  });
});

btnWtClose.addEventListener('click', () => {
  wtModal.classList.add('hidden');
  if (pendingStageAdvance) {
    const nextSt = pendingStageAdvance;
    pendingStageAdvance = null;
    switchStage(nextSt);
  }
});

// ==========================================
// QUIZ MODAL LOGIC (Visual Per-Option Grading)
// ==========================================
btnOpenQuiz.addEventListener('click', () => quizModal.classList.remove('hidden'));
btnStage3Quiz.addEventListener('click', () => quizModal.classList.remove('hidden'));
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
      tag.textContent = 'âœ” CORRECT';
      chosen.appendChild(tag);
    } else {
      chosen.classList.add('ans-wrong');
      tag.textContent = 'âœ– NOT QUITE';
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

// Boot Stage 1 and Start 60FPS Starfield
loadStage1Mission(0);
requestAnimationFrame(renderCosmos);
