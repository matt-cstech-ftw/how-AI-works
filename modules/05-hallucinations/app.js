import { completeActivity, saveQuizScore } from '../../assets/js/progress.js';

// ==========================================
// ARCADE GAME ENGINE ("THE DATA DIET")
// ==========================================
const canvas = document.getElementById('arcade-canvas');
const ctx = canvas.getContext('2d');

let isPlaying = false;
let animId = null;
let score = 0;
const TARGET_SCORE = 12;
let coreIntegrity = 100;
let tick = 0;
let screenShake = 0;

const ship = { x: 400, y: 430, w: 116, h: 18, speed: 8.5 };
let packets = [];
let lasers = [];
let particles = [];
let floatingTexts = [];

const CLEAN_PACKET_TYPES = [
  { label: 'Science Book', color: '#10b981', points: 1 },
  { label: 'Verified Facts', color: '#38bdf8', points: 1 },
  { label: 'Helpful Code', color: '#c084fc', points: 1 },
  { label: 'Kind Dialogue', color: '#10b981', points: 1 },
  { label: 'History Archive', color: '#38bdf8', points: 1 }
];

// Safely censored toxic/corrupted internet training data
const TOXIC_PACKET_TYPES = [
  { label: '@#%! Hate Post', color: '#ef4444' },
  { label: 'Sh*tpost Spam', color: '#ef4444' },
  { label: 'F*ke Rumor Bot', color: '#f59e0b' },
  { label: 'B*llsh!t Hoax', color: '#ef4444' },
  { label: 'T*xic Flamewar', color: '#ef4444' }
];

const BG_GRID_STARS = Array.from({ length: 90 }, () => ({
  x: Math.random(),
  y: Math.random(),
  speed: 0.001 + Math.random() * 0.002,
  r: Math.random() * 1.3 + 0.4
}));

// DOM Elements
const arcadeViewport = document.getElementById('arcade-viewport');
const hudScore = document.getElementById('hud-score');
const hudWave = document.getElementById('hud-wave');
const coreLight = document.getElementById('core-light');
const progressReadout = document.getElementById('progress-readout');
const arcadeDiagnostic = document.getElementById('arcade-diagnostic');
const arcadeDiagText = document.getElementById('arcade-diag-text');
const btnStartArcade = document.getElementById('btn-start-arcade');
const postGameSummary = document.getElementById('post-game-summary');
const btnSummaryTakeExam = document.getElementById('btn-summary-take-exam');

// Exam & Certificate DOM
const examModal = document.getElementById('exam-modal');
const btnOpenExam = document.getElementById('btn-open-exam');
const btnCloseExam = document.getElementById('btn-close-exam');
const btnSubmitExam = document.getElementById('btn-submit-exam');
const examResultBanner = document.getElementById('exam-result-banner');
const btnOpenCertAfterPass = document.getElementById('btn-open-cert-after-pass');

const certModal = document.getElementById('cert-modal');
const certCanvas = document.getElementById('cert-canvas');
const certNameInput = document.getElementById('cert-name-input');
const btnCloseCert = document.getElementById('btn-close-cert');
const btnDownloadCert = document.getElementById('btn-download-cert');
const btnPrintCert = document.getElementById('btn-print-cert');

let finalExamScorePct = 100;

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons();
}
refreshIcons();

if (new URLSearchParams(window.location.search).get('quiz') === '1') {
  examModal.classList.remove('hidden');
}

// Synthesized Web Audio API Arcade Sounds
let audioCtx = null;
function playArcadeSound(type) {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    if (type === 'laser') {
      osc.type = 'square';
      osc.frequency.setValueAtTime(720, now);
      osc.frequency.exponentialRampToValueAtTime(160, now + 0.09);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.linearRampToValueAtTime(0.01, now + 0.09);
      osc.start(now);
      osc.stop(now + 0.09);
    } else if (type === 'catch') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(520, now);
      osc.frequency.exponentialRampToValueAtTime(980, now + 0.12);
      gain.gain.setValueAtTime(0.14, now);
      gain.gain.linearRampToValueAtTime(0.01, now + 0.12);
      osc.start(now);
      osc.stop(now + 0.12);
    } else if (type === 'blast') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(300, now);
      osc.frequency.exponentialRampToValueAtTime(90, now + 0.14);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.linearRampToValueAtTime(0.01, now + 0.14);
      osc.start(now);
      osc.stop(now + 0.14);
    } else if (type === 'damage') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(150, now);
      osc.frequency.linearRampToValueAtTime(65, now + 0.22);
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.linearRampToValueAtTime(0.01, now + 0.22);
      osc.start(now);
      osc.stop(now + 0.22);
    } else if (type === 'win') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(523.25, now);
      osc.frequency.setValueAtTime(659.25, now + 0.1);
      osc.frequency.setValueAtTime(783.99, now + 0.2);
      osc.frequency.setValueAtTime(1046.5, now + 0.3);
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.linearRampToValueAtTime(0.01, now + 0.5);
      osc.start(now);
      osc.stop(now + 0.5);
    }
  } catch {
    // Ignore audio context locks
  }
}

function resizeCanvas() {
  const rect = arcadeViewport.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ship.y = rect.height - 42;
  ship.x = Math.min(Math.max(20, ship.x), rect.width - ship.w - 20);
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// Controls: Keyboard + Mouse + Click/Spacebar Laser
const keys = { left: false, right: false };
window.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft' || e.key === 'a') keys.left = true;
  if (e.key === 'ArrowRight' || e.key === 'd') keys.right = true;
  if (e.code === 'Space' && isPlaying) {
    e.preventDefault();
    fireFilterLaser();
  }
});
window.addEventListener('keyup', (e) => {
  if (e.key === 'ArrowLeft' || e.key === 'a') keys.left = false;
  if (e.key === 'ArrowRight' || e.key === 'd') keys.right = false;
});

canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  ship.x = Math.max(10, Math.min(rect.width - ship.w - 10, mx - ship.w / 2));
});

canvas.addEventListener('mousedown', () => {
  if (isPlaying) fireFilterLaser();
});

function fireFilterLaser() {
  if (lasers.length >= 4) return;
  playArcadeSound('laser');
  lasers.push({
    x: ship.x + ship.w / 2,
    y: ship.y - 6,
    vy: -10.5
  });
}

function spawnDataPacket() {
  const w = canvas.clientWidth;
  const isClean = Math.random() > 0.42;
  const speedBoost = score >= 6 ? 0.65 : 0;

  if (isClean) {
    const template = CLEAN_PACKET_TYPES[Math.floor(Math.random() * CLEAN_PACKET_TYPES.length)];
    packets.push({
      x: Math.random() * (w - 140) + 70,
      y: -28,
      r: 22,
      vy: 2.1 + Math.random() * 1.2 + speedBoost,
      isClean: true,
      label: template.label,
      color: template.color,
      rot: 0
    });
  } else {
    const template = TOXIC_PACKET_TYPES[Math.floor(Math.random() * TOXIC_PACKET_TYPES.length)];
    packets.push({
      x: Math.random() * (w - 140) + 70,
      y: -28,
      r: 23,
      vy: 2.3 + Math.random() * 1.4 + speedBoost,
      isClean: false,
      label: template.label,
      color: template.color,
      rot: 0
    });
  }
}

function createBurst(x, y, color, count = 16) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const spd = 1.5 + Math.random() * 4.5;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * spd,
      vy: Math.sin(angle) * spd,
      r: Math.random() * 3 + 1.5,
      color,
      alpha: 1
    });
  }
}

function addFloatingText(x, y, text, color) {
  floatingTexts.push({ x, y, text, color, alpha: 1, vy: -1.4 });
}

function drawSpikyMine(x, y, radius, rot, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.fillStyle = 'rgba(239, 68, 68, 0.22)';
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;

  const spikes = 8;
  ctx.beginPath();
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? radius + 5 : radius - 4;
    const a = (i * Math.PI) / spikes;
    if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function renderIdleScreen() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  ctx.clearRect(0, 0, w, h);

  // Subtle cyber grid
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.06)';
  ctx.lineWidth = 1;
  for (let x = 0; x < w; x += 40) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
  }
  for (let y = 0; y < h; y += 40) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }

  ctx.fillStyle = '#fafafa';
  ctx.font = '800 22px "Inter", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('NEURAL FEED // THE DATA DIET ARCADE', w / 2, h / 2 - 25);

  ctx.fillStyle = '#a1a1aa';
  ctx.font = '500 13px "JetBrains Mono", monospace';
  ctx.fillText('Catch 12 Clean Data Orbs • Blast or Dodge Censored Toxic Mines (@#%!)', w / 2, h / 2 + 6);
  ctx.fillStyle = '#38bdf8';
  ctx.fillText('Click "Launch Arcade Game" below to begin!', w / 2, h / 2 + 34);
}
renderIdleScreen();

function updateArcadeHud() {
  hudScore.textContent = `CLEAN DATA FED: ${score} / ${TARGET_SCORE}`;
  progressReadout.innerHTML = `Core Integrity: <strong>${coreIntegrity}%</strong>`;
  hudWave.textContent = score >= 6 ? 'WAVE 2: VIRAL INTERNET FIREHOSE' : 'WAVE 1: STANDARD WEB SCRAPE';
  coreLight.style.backgroundColor = coreIntegrity > 50 ? '#10b981' : '#ef4444';
}

function gameLoop() {
  if (!isPlaying) return;
  tick++;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;

  ctx.save();
  if (screenShake > 0) {
    const dx = (Math.random() - 0.5) * screenShake;
    const dy = (Math.random() - 0.5) * screenShake;
    ctx.translate(dx, dy);
    screenShake *= 0.85;
    if (screenShake < 0.5) screenShake = 0;
  }

  ctx.clearRect(0, 0, w, h);

  // 1. Scrolling Data Stream Grid & Stars
  BG_GRID_STARS.forEach(st => {
    st.y += st.speed;
    if (st.y > 1) st.y = 0;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.beginPath();
    ctx.arc(st.x * w, st.y * h, st.r, 0, Math.PI * 2);
    ctx.fill();
  });

  // 2. Move Neural Collector Shield
  if (keys.left) ship.x = Math.max(10, ship.x - ship.speed);
  if (keys.right) ship.x = Math.min(w - ship.w - 10, ship.x + ship.speed);

  // Draw Neural Shield Paddle + Blaster Turret
  ctx.save();
  ctx.fillStyle = '#38bdf8';
  ctx.shadowColor = '#38bdf8';
  ctx.shadowBlur = 16;
  ctx.beginPath();
  ctx.roundRect(ship.x, ship.y, ship.w, ship.h, 9);
  ctx.fill();

  // Center Turret Nozzle
  ctx.fillStyle = '#fafafa';
  ctx.fillRect(ship.x + ship.w / 2 - 4, ship.y - 7, 8, 8);
  ctx.restore();

  // 3. Update & Draw Filter Lasers
  for (let i = lasers.length - 1; i >= 0; i--) {
    const l = lasers[i];
    l.y += l.vy;
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(l.x, l.y);
    ctx.lineTo(l.x, l.y + 14);
    ctx.stroke();

    if (l.y < -20) lasers.splice(i, 1);
  }

  // 4. Spawn Falling Internet Data Packets
  const spawnInterval = score >= 6 ? 42 : 54;
  if (tick % spawnInterval === 0) {
    spawnDataPacket();
  }

  // 5. Update & Draw Packets + Check Collisions
  for (let i = packets.length - 1; i >= 0; i--) {
    const p = packets[i];
    p.y += p.vy;
    p.rot += 0.03;

    if (p.isClean) {
      // Glowing Clean Data Orb
      ctx.save();
      ctx.fillStyle = `${p.color}28`;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    } else {
      // Spiky Rotating Toxic Mine
      drawSpikyMine(p.x, p.y, p.r, p.rot, p.color);
    }

    // Packet Label Pill
    ctx.fillStyle = 'rgba(9, 9, 11, 0.85)';
    ctx.fillRect(p.x - 54, p.y - 8, 108, 16);
    ctx.fillStyle = p.isClean ? '#d1fae5' : '#fecaca';
    ctx.font = '700 10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(p.label, p.x, p.y + 3);

    // Check Laser Hit on Packet
    let hitByLaser = false;
    for (let j = lasers.length - 1; j >= 0; j--) {
      const l = lasers[j];
      if (Math.hypot(l.x - p.x, l.y - p.y) <= p.r + 8) {
        lasers.splice(j, 1);
        hitByLaser = true;
        if (!p.isClean) {
          playArcadeSound('blast');
          createBurst(p.x, p.y, '#f59e0b', 18);
          addFloatingText(p.x, p.y, 'TOXIC DATA FILTERED!', '#f59e0b');
        } else {
          createBurst(p.x, p.y, '#38bdf8', 10);
          addFloatingText(p.x, p.y, 'OOPS! SHOT CLEAN DATA', '#94a3b8');
        }
        packets.splice(i, 1);
        break;
      }
    }
    if (hitByLaser) continue;

    // Check Paddle Catch Collision
    if (
      p.y + p.r >= ship.y &&
      p.y - p.r <= ship.y + ship.h &&
      p.x >= ship.x - 10 &&
      p.x <= ship.x + ship.w + 10
    ) {
      if (p.isClean) {
        score++;
        playArcadeSound('catch');
        createBurst(p.x, ship.y, '#10b981', 18);
        addFloatingText(p.x, ship.y - 12, '+1 CLEAN DATA!', '#10b981');
      } else {
        coreIntegrity = Math.max(0, coreIntegrity - 25);
        screenShake = 11;
        playArcadeSound('damage');
        createBurst(p.x, ship.y, '#ef4444', 24);
        addFloatingText(p.x, ship.y - 12, '-25% BIAS CORRUPTION!', '#ef4444');
      }
      packets.splice(i, 1);
      updateArcadeHud();
      continue;
    }

    // Off-screen bottom
    if (p.y - p.r > h) {
      packets.splice(i, 1);
    }
  }

  // 6. Particles & Floating Text
  for (let i = particles.length - 1; i >= 0; i--) {
    const pt = particles[i];
    pt.x += pt.vx;
    pt.y += pt.vy;
    pt.alpha -= 0.028;
    if (pt.alpha <= 0) {
      particles.splice(i, 1);
      continue;
    }
    ctx.fillStyle = pt.color;
    ctx.globalAlpha = pt.alpha;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, pt.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  for (let i = floatingTexts.length - 1; i >= 0; i--) {
    const ft = floatingTexts[i];
    ft.y += ft.vy;
    ft.alpha -= 0.022;
    if (ft.alpha <= 0) {
      floatingTexts.splice(i, 1);
      continue;
    }
    ctx.fillStyle = ft.color;
    ctx.globalAlpha = ft.alpha;
    ctx.font = '700 11px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(ft.text, ft.x, ft.y);
    ctx.globalAlpha = 1;
  }

  ctx.restore();

  if (score >= TARGET_SCORE) {
    handleArcadeVictory();
    return;
  }

  if (coreIntegrity <= 0) {
    handleArcadeDefeat();
    return;
  }

  animId = requestAnimationFrame(gameLoop);
}

function handleArcadeVictory() {
  isPlaying = false;
  cancelAnimationFrame(animId);
  playArcadeSound('win');

  arcadeViewport.classList.add('victory-glow');
  arcadeDiagnostic.className = 'diagnostic-bar status-solved';
  arcadeDiagText.innerHTML = `<strong>🎉 Neural Core 100% Trained with Clean Data!</strong> Read your Complete Course Summary below, then launch the 10-Question Final Exam!`;
  btnStartArcade.innerHTML = `<i data-lucide="rotate-ccw" class="icon-xs"></i><span>Replay Arcade</span>`;
  btnStartArcade.classList.remove('hidden');

  postGameSummary.classList.remove('hidden');
  completeActivity('mod-05', 200);
  refreshIcons();

  setTimeout(() => {
    postGameSummary.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, 150);
}

function handleArcadeDefeat() {
  isPlaying = false;
  cancelAnimationFrame(animId);

  arcadeDiagnostic.className = 'diagnostic-bar status-error';
  arcadeDiagText.innerHTML = `<strong>⚠️ AI Core Corrupted by Toxic Data!</strong> Too many red mines hit your collector shield. Click <strong>Try Again</strong> (Tip: Press Spacebar or Click to shoot red mines!).`;
  btnStartArcade.innerHTML = `<i data-lucide="play" class="icon-xs"></i><span>Try Again</span>`;
  btnStartArcade.classList.remove('hidden');
  refreshIcons();
}

btnStartArcade.addEventListener('click', () => {
  score = 0;
  coreIntegrity = 100;
  packets = [];
  lasers = [];
  particles = [];
  floatingTexts = [];
  isPlaying = true;
  arcadeViewport.classList.remove('victory-glow');
  btnStartArcade.classList.add('hidden');
  arcadeDiagnostic.className = 'diagnostic-bar status-good';
  arcadeDiagText.innerHTML = `<strong>Arcade Active:</strong> Catch 12 Clean Data Orbs! Press <strong>Spacebar or Click</strong> to blast spiky red Censored Toxic Mines!`;
  updateArcadeHud();
  gameLoop();
});

// ==========================================
// 10-QUESTION FINAL EXAM LOGIC (NO HINTS, 70% TO PASS)
// ==========================================
btnOpenExam.addEventListener('click', () => examModal.classList.remove('hidden'));
btnSummaryTakeExam.addEventListener('click', () => examModal.classList.remove('hidden'));
btnCloseExam.addEventListener('click', () => examModal.classList.add('hidden'));

document.querySelectorAll('.quiz-opt').forEach(opt => {
  opt.addEventListener('click', () => {
    const parent = opt.closest('.quiz-q');
    parent.querySelectorAll('.quiz-opt').forEach(o => {
      o.classList.remove('selected', 'ans-correct', 'ans-wrong');
      const oldTag = o.querySelector('.quiz-status-tag');
      if (oldTag) oldTag.remove();
    });
    opt.classList.add('selected');
  });
});

btnSubmitExam.addEventListener('click', () => {
  const questions = document.querySelectorAll('#exam-modal .quiz-q');
  const selected = document.querySelectorAll('#exam-modal .quiz-opt.selected');

  if (selected.length < questions.length) {
    alert(`Please answer all 10 questions before grading (you have answered ${selected.length} of 10).`);
    return;
  }

  let correctCount = 0;
  const missedNumbers = [];

  questions.forEach((q, idx) => {
    const chosen = q.querySelector('.quiz-opt.selected');
    const oldTag = chosen.querySelector('.quiz-status-tag');
    if (oldTag) oldTag.remove();

    const isRight = chosen.dataset.correct === 'true';
    const tag = document.createElement('span');
    tag.className = 'quiz-status-tag';

    if (isRight) {
      correctCount++;
      chosen.classList.add('ans-correct');
      tag.textContent = '✔ CORRECT';
      chosen.appendChild(tag);
    } else {
      missedNumbers.push(`#${idx + 1}`);
      chosen.classList.add('ans-wrong');
      tag.textContent = '✖ INCORRECT';
      chosen.appendChild(tag);
    }
  });

  finalExamScorePct = Math.round((correctCount / questions.length) * 100);
  examResultBanner.classList.remove('hidden');

  if (finalExamScorePct >= 70) {
    completeActivity('mod-05', 200);
    saveQuizScore('mod-05', 100, 100);

    examResultBanner.style.background = 'rgba(16, 185, 129, 0.14)';
    examResultBanner.style.border = '1px solid var(--emerald)';
    examResultBanner.style.color = '#d1fae5';

    const missedNote = missedNumbers.length > 0
      ? `You missed question(s) ${missedNumbers.join(', ')} (marked in red above).`
      : `Flawless 10/10 score!`;

    examResultBanner.innerHTML = `
      <strong>🎉 Congratulations — You Passed! Final Score: ${finalExamScorePct}% (${correctCount} / 10)</strong><br>
      ${missedNote} Because you scored 70% or higher, you have officially unlocked your <strong>AI Foundations Certificate of Completion</strong>!
    `;
    btnOpenCertAfterPass.classList.remove('hidden');
  } else {
    examResultBanner.style.background = 'rgba(239, 68, 68, 0.14)';
    examResultBanner.style.border = '1px solid var(--red)';
    examResultBanner.style.color = '#fecaca';
    examResultBanner.innerHTML = `
      <strong>Final Score: ${finalExamScorePct}% (${correctCount} / 10) — 70% (7/10) Required to Pass</strong><br>
      You missed question(s): <strong>${missedNumbers.join(', ')}</strong> (marked in red above). Review those questions, select new answers, and click <strong>Grade My Final Exam</strong> again!
    `;
    btnOpenCertAfterPass.classList.add('hidden');
  }
});

// ==========================================
// CERTIFICATE GENERATOR (CANVAS -> PNG & PRINT)
// ==========================================
function renderCertificateCanvas() {
  const cCtx = certCanvas.getContext('2d');
  const w = certCanvas.width;
  const h = certCanvas.height;
  const recipient = certNameInput.value.trim() || 'AI Lab Graduate';
  const dateStr = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  // Deep Carbon Background
  cCtx.fillStyle = '#09090b';
  cCtx.fillRect(0, 0, w, h);

  // Subtle Architectural Grid
  cCtx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
  cCtx.lineWidth = 1;
  for (let x = 0; x < w; x += 32) {
    cCtx.beginPath(); cCtx.moveTo(x, 0); cCtx.lineTo(x, h); cCtx.stroke();
  }
  for (let y = 0; y < h; y += 32) {
    cCtx.beginPath(); cCtx.moveTo(0, y); cCtx.lineTo(w, y); cCtx.stroke();
  }

  // Outer Emerald/Cyan Double Frame
  cCtx.strokeStyle = '#27272a';
  cCtx.lineWidth = 3;
  cCtx.strokeRect(28, 28, w - 56, h - 56);

  cCtx.strokeStyle = '#10b981';
  cCtx.lineWidth = 2;
  cCtx.strokeRect(42, 42, w - 84, h - 84);

  // Corner Accents
  cCtx.fillStyle = '#38bdf8';
  [ [42, 42], [w - 50, 42], [42, h - 50], [w - 50, h - 50] ].forEach(([cx, cy]) => {
    cCtx.fillRect(cx, cy, 8, 8);
  });

  // Top Badge
  cCtx.fillStyle = '#10b981';
  cCtx.font = '700 14px "JetBrains Mono", monospace';
  cCtx.textAlign = 'center';
  cCtx.fillText('HOW AI WORKS // INTERACTIVE CURRICULUM LAB', w / 2, 115);

  // Main Title
  cCtx.fillStyle = '#fafafa';
  cCtx.font = '800 38px "Inter", sans-serif';
  cCtx.fillText('CERTIFICATE OF COMPLETION', w / 2, 170);

  cCtx.fillStyle = '#a1a1aa';
  cCtx.font = '400 16px "Inter", sans-serif';
  cCtx.fillText('This certifies that', w / 2, 225);

  // Recipient Name
  cCtx.fillStyle = '#38bdf8';
  cCtx.font = '800 44px "Inter", sans-serif';
  cCtx.fillText(recipient, w / 2, 285);

  // Divider Line under Name
  cCtx.strokeStyle = '#3f3f46';
  cCtx.lineWidth = 1.5;
  cCtx.beginPath();
  cCtx.moveTo(w / 2 - 220, 305);
  cCtx.lineTo(w / 2 + 220, 305);
  cCtx.stroke();

  // Description Body
  cCtx.fillStyle = '#e4e4e7';
  cCtx.font = '500 17px "Inter", sans-serif';
  cCtx.fillText(
    'has successfully completed all 5 interactive labs and passed the Final Mastery Exam',
    w / 2,
    355
  );
  cCtx.fillStyle = '#a1a1aa';
  cCtx.font = '400 15px "Inter", sans-serif';
  cCtx.fillText(
    'demonstrating foundational knowledge of Next-Word Prediction, Subword Tokenization,',
    w / 2,
    385
  );
  cCtx.fillText(
    'Self-Attention Context, Vector Meaning Maps, and AI Training Datasets.',
    w / 2,
    410
  );

  // Verified Modules Pill Row
  const pills = ['01 Next-Word Contest', '02 Subword Slicer', '03 Self-Attention', '04 Meaning Star Map', '05 Data Diet'];
  cCtx.font = '600 12px "JetBrains Mono", monospace';
  pills.forEach((pText, idx) => {
    const px = 115 + idx * 165;
    const py = 455;
    cCtx.fillStyle = '#18181b';
    cCtx.strokeStyle = '#10b981';
    cCtx.lineWidth = 1;
    cCtx.fillRect(px, py, 150, 32);
    cCtx.strokeRect(px, py, 150, 32);
    cCtx.fillStyle = '#d1fae5';
    cCtx.fillText(`✔ ${pText}`, px + 75, py + 20);
  });

  // Footer Metadata (Score, Date, Verification ID)
  cCtx.fillStyle = '#fafafa';
  cCtx.font = '700 16px "JetBrains Mono", monospace';
  cCtx.textAlign = 'left';
  cCtx.fillText(`FINAL EXAM SCORE: ${finalExamScorePct}% (PASSED)`, 90, 575);

  cCtx.textAlign = 'right';
  cCtx.fillText(`DATE ISSUED: ${dateStr}`, w - 90, 575);

  cCtx.fillStyle = '#71717a';
  cCtx.font = '500 12px "JetBrains Mono", monospace';
  cCtx.textAlign = 'center';
  cCtx.fillText('VERIFIED LOCAL BROWSER CREDENTIAL // HOW-AI-WORKS INTERACTIVE LAB', w / 2, 615);
}

btnOpenCertAfterPass.addEventListener('click', () => {
  examModal.classList.add('hidden');
  certModal.classList.remove('hidden');
  renderCertificateCanvas();
  refreshIcons();
});

certNameInput.addEventListener('input', renderCertificateCanvas);
btnCloseCert.addEventListener('click', () => certModal.classList.add('hidden'));

btnDownloadCert.addEventListener('click', () => {
  renderCertificateCanvas();
  const link = document.createElement('a');
  link.download = 'AI-Foundations-Certificate.png';
  link.href = certCanvas.toDataURL('image/png');
  link.click();
});

btnPrintCert.addEventListener('click', () => {
  renderCertificateCanvas();
  window.print();
});