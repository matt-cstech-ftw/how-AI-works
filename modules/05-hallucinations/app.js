import { completeActivity, getProgress } from '../../assets/js/progress.js';

// ==========================================
// PROCEDURAL SIDE-SCROLLING PLATFORMER ENGINE
// ==========================================
const canvas = document.getElementById('arcade-canvas');
const ctx = canvas.getContext('2d');

const arcadeViewport = document.getElementById('arcade-viewport');
const hudScore = document.getElementById('hud-score');
const hudPowerup = document.getElementById('hud-powerup');
const hudProgress = document.getElementById('hud-progress');
const coreLight = document.getElementById('core-light');
const progressReadout = document.getElementById('progress-readout');
const arcadeDiagnostic = document.getElementById('arcade-diagnostic');
const arcadeDiagText = document.getElementById('arcade-diag-text');
const btnStartArcade = document.getElementById('btn-start-arcade');
const postGameSummary = document.getElementById('post-game-summary');
const navCertBtn = document.getElementById('nav-cert-btn');

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons();
}
refreshIcons();

// Show "View Certificate" button in topbar if already passed
const savedCert = localStorage.getItem('ai_course_certificate_v1');
const progState = getProgress();
if (savedCert || (progState.modules['mod-05'] && progState.modules['mod-05'].quizPassed)) {
  navCertBtn.classList.remove('hidden');
}

if (new URLSearchParams(window.location.search).get('quiz') === '1') {
  window.location.href = '../final-exam/index.html';
}

// Web Audio API Retro Platformer Sound Effects
let audioCtx = null;
function playSound(type) {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    if (type === 'jump') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(280, now);
      osc.frequency.exponentialRampToValueAtTime(620, now + 0.13);
      gain.gain.setValueAtTime(0.11, now);
      gain.gain.linearRampToValueAtTime(0.01, now + 0.13);
      osc.start(now);
      osc.stop(now + 0.13);
    } else if (type === 'laser') {
      osc.type = 'square';
      osc.frequency.setValueAtTime(780, now);
      osc.frequency.exponentialRampToValueAtTime(190, now + 0.08);
      gain.gain.setValueAtTime(0.07, now);
      gain.gain.linearRampToValueAtTime(0.01, now + 0.08);
      osc.start(now);
      osc.stop(now + 0.08);
    } else if (type === 'data') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, now);
      osc.frequency.exponentialRampToValueAtTime(1046.5, now + 0.11);
      gain.gain.setValueAtTime(0.14, now);
      gain.gain.linearRampToValueAtTime(0.01, now + 0.11);
      osc.start(now);
      osc.stop(now + 0.11);
    } else if (type === 'powerup') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.setValueAtTime(659.25, now + 0.07);
      osc.frequency.setValueAtTime(880, now + 0.14);
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.linearRampToValueAtTime(0.01, now + 0.28);
      osc.start(now);
      osc.stop(now + 0.28);
    } else if (type === 'blast') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(85, now + 0.14);
      gain.gain.setValueAtTime(0.14, now);
      gain.gain.linearRampToValueAtTime(0.01, now + 0.14);
      osc.start(now);
      osc.stop(now + 0.14);
    } else if (type === 'hurt') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(140, now);
      osc.frequency.linearRampToValueAtTime(55, now + 0.22);
      gain.gain.setValueAtTime(0.16, now);
      gain.gain.linearRampToValueAtTime(0.01, now + 0.22);
      osc.start(now);
      osc.stop(now + 0.22);
    } else if (type === 'win') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(523.25, now);
      osc.frequency.setValueAtTime(659.25, now + 0.1);
      osc.frequency.setValueAtTime(783.99, now + 0.2);
      osc.frequency.setValueAtTime(1046.5, now + 0.3);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.linearRampToValueAtTime(0.01, now + 0.55);
      osc.start(now);
      osc.stop(now + 0.55);
    }
  } catch {
    // Ignore audio context restrictions
  }
}

// Smoother, Fairer Physics & Game State
const GRAVITY = 0.46;
let isPlaying = false;
let animId = null;
let tick = 0;
let score = 0;
let integrity = 100;
let cameraX = 0;
let levelGoalX = 3200;
let screenShake = 0;

// Active Power-Up State ('rapid', 'magnet', 'shield', or null)
let activePowerUp = null;
let powerUpTimer = 0;

const player = {
  x: 90,
  y: 260,
  w: 34,
  h: 48,
  vx: 0,
  vy: 0,
  speed: 5.0,
  jumpForce: -11.6,
  grounded: false,
  jumpsLeft: 2,
  facing: 1,
  iFrames: 0,
  lastSafeX: 90,
  lastSafeY: 260
};

let platforms = [];
let dataBits = [];      // Positive collectible data bits (+100 PTS each)
let powerUps = [];      // Randomized Power-Up Orbs
let groundObjects = []; // Varied: 'barrier' (jump over) OR 'monster' (shoot with laser!)
let flyingEnemies = []; // Swooping drones (shoot with laser!)
let lasers = [];
let particles = [];
let floatingTexts = [];

const DATA_BIT_LABELS = [
  'Verified Fact',
  'Clean Code',
  'Science Data',
  'Peer Review',
  'Open Textbook'
];

const BARRIER_LABELS = [
  'Bad Info',
  'Misinformation',
  'Fake News'
];

const GROUND_MONSTER_LABELS = [
  'Glitch Monster',
  'Bias Slime',
  'Malware Bug'
];

const SWOOP_ENEMY_LABELS = [
  '@#%! Troll Bot',
  'Sp*m Drone',
  'H*te Speech',
  'F*ke Rumor'
];

const POWERUP_TYPES = [
  { id: 'rapid', label: '⚡ TRIPLE LASER', color: '#f59e0b' },
  { id: 'magnet', label: '🧲 DATA MAGNET', color: '#c084fc' },
  { id: 'shield', label: '🛡️ SHIELD + HEAL', color: '#38bdf8' }
];

// Parallax Background Stars
const PARALLAX_STARS = Array.from({ length: 110 }, () => ({
  x: Math.random() * 4000,
  y: Math.random() * 380,
  r: Math.random() * 1.5 + 0.5,
  parallax: 0.2 + Math.random() * 0.35
}));

function resizeCanvas() {
  const rect = arcadeViewport.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// ==========================================
// PROCEDURAL LEVEL GENERATOR (FAIR, VARIED & REWARDING)
// ==========================================
function generateProceduralLevel() {
  platforms = [];
  dataBits = [];
  powerUps = [];
  groundObjects = [];
  flyingEnemies = [];
  lasers = [];
  particles = [];
  floatingTexts = [];
  activePowerUp = null;
  powerUpTimer = 0;

  // 1. Starting Safe Platform with Welcome Data Bits
  let curX = 0;
  let curY = 385;
  platforms.push({ x: 0, y: curY, w: 500, h: 140, isStart: true });
  for (let b = 0; b < 3; b++) {
    dataBits.push({
      x: 220 + b * 75,
      y: curY - 32,
      r: 13,
      label: DATA_BIT_LABELS[b % DATA_BIT_LABELS.length],
      collected: false,
      phase: b * 0.8
    });
  }
  curX = 500;

  // 2. Generate 8 Generous Platform Islands with Positive Data Bits, Power-Ups & Varied Ground Objects
  const numSegments = 8;
  for (let i = 0; i < numSegments; i++) {
    // Easy, forgiving gap (55..76px) with a guiding arc of Positive Data Bits!
    const gapWidth = Math.floor(55 + Math.random() * 22);
    const nextDeltaY = Math.floor((Math.random() - 0.5) * 46);
    const nextY = Math.max(315, Math.min(395, curY + nextDeltaY));

    // Floating Data Bit right above the gap to guide the jump
    dataBits.push({
      x: curX + gapWidth / 2,
      y: Math.min(curY, nextY) - 68,
      r: 13,
      label: DATA_BIT_LABELS[(i + 1) % DATA_BIT_LABELS.length],
      collected: false,
      phase: i
    });

    curX += gapWidth;
    curY = nextY;
    const platWidth = Math.floor(370 + Math.random() * 140); // Wide 370..510px platforms
    platforms.push({ x: curX, y: curY, w: platWidth, h: 200, isStart: false });

    // Spawn 3 Positive Data Bits along this platform
    for (let b = 0; b < 3; b++) {
      const bx = curX + 65 + b * Math.floor((platWidth - 130) / 2);
      const isHighArc = b === 1;
      dataBits.push({
        x: bx,
        y: curY - (isHighArc ? 88 : 30),
        r: 13,
        label: DATA_BIT_LABELS[(i + b) % DATA_BIT_LABELS.length],
        collected: false,
        phase: (i + b) * 0.7
      });
    }

    // Spawn a Randomized Power-Up Orb on every other platform (or 60% chance)
    if (i % 2 === 0 || Math.random() > 0.45) {
      const pType = POWERUP_TYPES[Math.floor(Math.random() * POWERUP_TYPES.length)];
      powerUps.push({
        x: curX + 95,
        y: curY - 78,
        r: 16,
        id: pType.id,
        label: pType.label,
        color: pType.color,
        collected: false
      });
    }

    // Spawn ONE Ground Object in the middle-right of the platform:
    // 55% chance it's a Shootable Ground Monster, 45% chance it's a Jumpable Hazard Barrier
    const isMonster = Math.random() < 0.58;
    const objX = curX + Math.floor(platWidth * 0.56);

    if (isMonster) {
      const mLabel = GROUND_MONSTER_LABELS[Math.floor(Math.random() * GROUND_MONSTER_LABELS.length)];
      groundObjects.push({
        type: 'monster',
        x: objX,
        y: curY - 38,
        w: 44,
        h: 38,
        minX: curX + 110,
        maxX: curX + platWidth - 95,
        vx: 1.15,
        label: mLabel
      });
    } else {
      const bLabel = BARRIER_LABELS[Math.floor(Math.random() * BARRIER_LABELS.length)];
      groundObjects.push({
        type: 'barrier',
        x: objX,
        y: curY - 34,
        w: 40,
        h: 34,
        label: bLabel
      });
    }

    // Spawn at most 1 Swooping Flying Enemy on later platforms (gentle speed)
    if (i >= 1 && Math.random() < 0.65) {
      const sLabel = SWOOP_ENEMY_LABELS[Math.floor(Math.random() * SWOOP_ENEMY_LABELS.length)];
      flyingEnemies.push({
        x: curX + platWidth - 40,
        baseY: curY - 125,
        y: curY - 125,
        r: 19,
        vx: -(1.15 + Math.random() * 0.6),
        swoopSpeed: 0.038,
        swoopAmp: 28,
        phase: Math.random() * Math.PI * 2,
        label: sLabel,
        active: false
      });
    }

    curX += platWidth;
  }

  // 3. Final Goal Platform with Neural Core Portal
  curX += 60;
  platforms.push({ x: curX, y: 365, w: 420, h: 200, isGoalPlat: true });
  levelGoalX = curX + 210;

  // Reset Player
  player.x = 90;
  player.y = 300;
  player.vx = 0;
  player.vy = 0;
  player.facing = 1;
  player.grounded = false;
  player.jumpsLeft = 2;
  player.iFrames = 0;
  player.lastSafeX = 90;
  player.lastSafeY = 300;
  cameraX = 0;
}

// Controls
const keys = { left: false, right: false };

function triggerJump() {
  if (!isPlaying) return;
  if (player.grounded || player.jumpsLeft > 0) {
    player.vy = player.jumpForce;
    player.grounded = false;
    player.jumpsLeft--;
    playSound('jump');
    createBurst(player.x + player.w / 2, player.y + player.h, '#38bdf8', 8);
  }
}

function fireLaser() {
  if (!isPlaying) return;
  const maxBolts = activePowerUp === 'rapid' ? 12 : 6;
  if (lasers.length >= maxBolts) return;

  playSound('laser');
  const gunX = player.facing === 1 ? player.x + player.w + 10 : player.x - 14;
  const gunY = player.y + 21;

  if (activePowerUp === 'rapid') {
    // Triple Spread Laser!
    [-1.6, 0, 1.6].forEach(vySpread => {
      lasers.push({
        x: gunX,
        y: gunY,
        vx: player.facing * 13.5,
        vy: vySpread,
        color: '#f59e0b',
        life: 65
      });
    });
  } else {
    lasers.push({
      x: gunX,
      y: gunY,
      vx: player.facing * 12.5,
      vy: 0,
      color: '#38bdf8',
      life: 65
    });
  }
}

window.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
    keys.left = true;
    player.facing = -1;
  }
  if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
    keys.right = true;
    player.facing = 1;
  }
  if (e.code === 'Space' || e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
    if (isPlaying) {
      e.preventDefault();
      triggerJump();
    }
  }
  if (e.key === 'f' || e.key === 'F' || e.key === 'Enter' || e.key === 'z' || e.key === 'Z') {
    if (isPlaying) {
      e.preventDefault();
      fireLaser();
    }
  }
});

window.addEventListener('keyup', (e) => {
  if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keys.left = false;
  if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.right = false;
});

canvas.addEventListener('mousedown', (e) => {
  if (isPlaying) {
    e.preventDefault();
    fireLaser();
  }
});

function createBurst(x, y, color, count = 14) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const spd = 1.2 + Math.random() * 4.2;
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
  floatingTexts.push({ x, y, text, color, alpha: 1, vy: -1.3 });
}

function updateHud() {
  const pct = Math.min(100, Math.max(0, Math.round((player.x / levelGoalX) * 100)));
  hudScore.textContent = `DATA SCORE: ${score} PTS | HEALTH: ${integrity}%`;
  hudProgress.textContent = `PROGRESS: ${pct}%`;
  progressReadout.innerHTML = `Data Score: <strong>${score} PTS</strong>`;
  coreLight.style.backgroundColor = integrity > 50 ? '#10b981' : '#ef4444';

  if (activePowerUp && powerUpTimer > 0) {
    const secs = Math.ceil(powerUpTimer / 60);
    const names = {
      rapid: `⚡ TRIPLE LASER (${secs}s)`,
      magnet: `🧲 DATA MAGNET (${secs}s)`,
      shield: `🛡️ INVINCIBLE SHIELD (${secs}s)`
    };
    hudPowerup.textContent = names[activePowerUp] || 'POWER-UP: ACTIVE';
  } else {
    hudPowerup.textContent = 'POWER-UP: NONE';
  }
}

// Draw Player Character + Active Power-Up Aura
function drawPlayerCharacter(px, py) {
  ctx.save();
  if (player.iFrames > 0 && activePowerUp !== 'shield' && Math.floor(tick / 3) % 2 === 0) {
    ctx.globalAlpha = 0.45;
  }

  const cx = px + player.w / 2;
  const cy = py + player.h / 2;

  // Draw Active Power-Up Aura Ring
  if (activePowerUp) {
    ctx.save();
    const auraColor = activePowerUp === 'rapid' ? '#f59e0b' : (activePowerUp === 'magnet' ? '#c084fc' : '#38bdf8');
    ctx.strokeStyle = auraColor;
    ctx.lineWidth = 2.5;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.arc(cx, cy, 32 + Math.sin(tick * 0.15) * 3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  const legSwing = player.grounded && Math.abs(player.vx) > 0.2
    ? Math.sin(tick * 0.32) * 8
    : (player.grounded ? 0 : 6);

  // Legs
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 4.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - 4, py + 34);
  ctx.lineTo(cx - 6 - legSwing, py + player.h);
  ctx.moveTo(cx + 4, py + 34);
  ctx.lineTo(cx + 6 + legSwing, py + player.h);
  ctx.stroke();

  // Suit Body
  ctx.fillStyle = '#0f172a';
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(px + 4, py + 14, player.w - 8, 22, 6);
  ctx.fill();
  ctx.stroke();

  // Helmet
  ctx.fillStyle = '#1e293b';
  ctx.strokeStyle = '#10b981';
  ctx.beginPath();
  ctx.roundRect(px + 5, py, player.w - 10, 16, 5);
  ctx.fill();
  ctx.stroke();

  // Visor
  ctx.fillStyle = '#10b981';
  const visorX = player.facing === 1 ? px + 16 : px + 7;
  ctx.fillRect(visorX, py + 5, 9, 5);

  // Laser Blaster
  ctx.fillStyle = '#e2e8f0';
  const gunX = player.facing === 1 ? cx + 2 : cx - 22;
  ctx.fillRect(gunX, py + 19, 20, 6);
  ctx.fillStyle = activePowerUp === 'rapid' ? '#f59e0b' : '#38bdf8';
  const tipX = player.facing === 1 ? gunX + 18 : gunX - 4;
  ctx.fillRect(tipX, py + 18, 6, 8);

  ctx.restore();
}

// Draw Shootable Ground Monster (Patrolling Glitch Crawler)
function drawGroundMonster(m) {
  ctx.save();
  const cx = m.x + m.w / 2;
  const bounce = Math.abs(Math.sin(tick * 0.18)) * 4;

  // Monster Dome Body
  ctx.fillStyle = 'rgba(192, 132, 252, 0.28)';
  ctx.strokeStyle = '#c084fc';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.arc(cx, m.y + m.h - 14 - bounce, 18, Math.PI, 0, false);
  ctx.lineTo(m.x + m.w - 4, m.y + m.h);
  ctx.lineTo(m.x + 4, m.y + m.h);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Glowing Monster Eyes
  ctx.fillStyle = '#ef4444';
  ctx.beginPath();
  ctx.arc(cx - 6, m.y + m.h - 18 - bounce, 3.2, 0, Math.PI * 2);
  ctx.arc(cx + 6, m.y + m.h - 18 - bounce, 3.2, 0, Math.PI * 2);
  ctx.fill();

  // Jagged Teeth
  ctx.strokeStyle = '#fafafa';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx - 8, m.y + m.h - 9 - bounce);
  ctx.lineTo(cx - 4, m.y + m.h - 5 - bounce);
  ctx.lineTo(cx, m.y + m.h - 9 - bounce);
  ctx.lineTo(cx + 4, m.y + m.h - 5 - bounce);
  ctx.lineTo(cx + 8, m.y + m.h - 9 - bounce);
  ctx.stroke();

  // Label Tag ("Glitch Monster [SHOOT!]")
  ctx.fillStyle = 'rgba(9, 9, 11, 0.9)';
  ctx.fillRect(cx - 56, m.y - 22, 112, 15);
  ctx.fillStyle = '#e9d5ff';
  ctx.font = '700 9px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`👾 ${m.label}`, cx, m.y - 11);

  ctx.restore();
}

// Draw Swooping Flying Drone Enemy
function drawSwoopingEnemy(en) {
  ctx.save();
  ctx.translate(en.x, en.y);

  const wingFlap = Math.sin(tick * 0.45) * 6;
  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(-24, -8 + wingFlap);
  ctx.lineTo(0, 0);
  ctx.lineTo(24, -8 - wingFlap);
  ctx.stroke();

  ctx.fillStyle = 'rgba(239, 68, 68, 0.28)';
  ctx.strokeStyle = '#ef4444';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, en.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#ef4444';
  ctx.beginPath();
  ctx.arc(-5, 0, 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(9, 9, 11, 0.88)';
  ctx.fillRect(-52, -en.r - 20, 104, 15);
  ctx.fillStyle = '#fecaca';
  ctx.font = '700 9.5px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.fillText(en.label, 0, -en.r - 9);

  ctx.restore();
}

function renderIdleScreen() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  ctx.clearRect(0, 0, w, h);

  ctx.strokeStyle = 'rgba(56, 189, 248, 0.06)';
  for (let x = 0; x < w; x += 40) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
  }
  for (let y = 0; y < h; y += 40) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }

  ctx.fillStyle = '#fafafa';
  ctx.font = '800 22px "Inter", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('THE DATA DIET // PROCEDURAL LASER PLATFORMER', w / 2, h / 2 - 28);

  ctx.fillStyle = '#a1a1aa';
  ctx.font = '500 13px "JetBrains Mono", monospace';
  ctx.fillText('Collect Green Data Bits (+100) • Grab Power-Ups • Blast Ground Monsters & Drones (+150)', w / 2, h / 2 + 4);
  ctx.fillStyle = '#10b981';
  ctx.fillText('Click "Generate Level & Start Run" below to play!', w / 2, h / 2 + 32);
}
renderIdleScreen();

function takeDamage(msg, x, y) {
  if (activePowerUp === 'shield') {
    addFloatingText(x, y, 'SHIELD BLOCKED HIT!', '#38bdf8');
    return;
  }
  integrity = Math.max(0, integrity - 15);
  player.iFrames = 60;
  screenShake = 8;
  playSound('hurt');
  createBurst(x, y, '#ef4444', 16);
  addFloatingText(x, y - 12, `${msg} -15%`, '#ef4444');
  updateHud();
}

function platformerLoop() {
  if (!isPlaying) return;
  tick++;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;

  if (powerUpTimer > 0) {
    powerUpTimer--;
    if (powerUpTimer === 0) activePowerUp = null;
  }

  // 1. Horizontal Movement
  if (keys.left) player.vx = -player.speed;
  else if (keys.right) player.vx = player.speed;
  else player.vx *= 0.8;

  player.x = Math.max(20, player.x + player.vx);

  // 2. Vertical Movement & Platform Collisions
  const prevBottom = player.y + player.h;
  player.vy += GRAVITY;
  player.y += player.vy;
  player.grounded = false;

  for (const plat of platforms) {
    if (
      player.x + player.w > plat.x + 4 &&
      player.x < plat.x + plat.w - 4 &&
      prevBottom <= plat.y + 12 &&
      player.y + player.h >= plat.y &&
      player.vy >= 0
    ) {
      player.y = plat.y - player.h;
      player.vy = 0;
      player.grounded = true;
      player.jumpsLeft = 2;
      player.lastSafeX = Math.max(plat.x + 25, Math.min(player.x, plat.x + plat.w - 60));
      player.lastSafeY = plat.y - player.h - 10;
      break;
    }
  }

  if (player.iFrames > 0) player.iFrames--;

  // Fell into a gap -> respawn on last safe platform
  if (player.y > h + 40) {
    player.x = player.lastSafeX;
    player.y = player.lastSafeY;
    player.vy = 0;
    takeDamage('FELL IN GAP!', player.x, player.y);
  }

  // 3. Smooth Camera Follow
  const targetCamX = Math.max(0, player.x - w * 0.28);
  cameraX += (targetCamX - cameraX) * 0.14;

  // 4. Render World
  ctx.save();
  if (screenShake > 0) {
    ctx.translate((Math.random() - 0.5) * screenShake, (Math.random() - 0.5) * screenShake);
    screenShake *= 0.85;
  }

  ctx.clearRect(0, 0, w, h);

  // Parallax Starfield
  PARALLAX_STARS.forEach(st => {
    const sx = (st.x - cameraX * st.parallax) % w;
    const drawX = sx < 0 ? sx + w : sx;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.beginPath();
    ctx.arc(drawX, st.y, st.r, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.save();
  ctx.translate(-cameraX, 0);

  // 5. Draw Platforms
  for (const plat of platforms) {
    if (plat.x + plat.w < cameraX - 50 || plat.x > cameraX + w + 50) continue;

    const grad = ctx.createLinearGradient(plat.x, plat.y, plat.x, plat.y + 80);
    grad.addColorStop(0, '#18181b');
    grad.addColorStop(1, '#09090b');
    ctx.fillStyle = grad;
    ctx.strokeStyle = plat.isGoalPlat ? '#10b981' : '#38bdf8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(plat.x, plat.y, plat.w, plat.h, 6);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = plat.isGoalPlat ? '#10b981' : '#38bdf8';
    ctx.fillRect(plat.x + 2, plat.y, plat.w - 4, 4);
  }

  const pcx = player.x + player.w / 2;
  const pcy = player.y + player.h / 2;

  // 6. Update & Draw Positive Collectible Data Bits (+100 PTS each!)
  for (const bit of dataBits) {
    if (bit.collected) continue;
    if (bit.x < cameraX - 80 || bit.x > cameraX + w + 80) continue;

    // Data Magnet Pull Effect
    if (activePowerUp === 'magnet' && Math.hypot(pcx - bit.x, pcy - bit.y) < 230) {
      bit.x += (pcx - bit.x) * 0.14;
      bit.y += (pcy - bit.y) * 0.14;
    }

    const bobY = bit.y + Math.sin(tick * 0.08 + bit.phase) * 4;

    // Glowing Emerald Data Orb
    ctx.save();
    ctx.fillStyle = 'rgba(16, 185, 129, 0.25)';
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(bit.x, bobY, bit.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#d1fae5';
    ctx.font = '700 9px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(bit.label, bit.x, bobY - bit.r - 5);
    ctx.fillText('+100', bit.x, bobY + 3);
    ctx.restore();

    // Check Collection by Player
    if (Math.hypot(pcx - bit.x, pcy - bobY) <= bit.r + 22) {
      bit.collected = true;
      score += 100;
      playSound('data');
      createBurst(bit.x, bobY, '#10b981', 12);
      addFloatingText(bit.x, bobY - 12, `+100 ${bit.label.toUpperCase()}!`, '#10b981');
      updateHud();
    }
  }

  // 7. Update & Draw Randomized Power-Up Orbs
  for (const pu of powerUps) {
    if (pu.collected) continue;
    if (pu.x < cameraX - 80 || pu.x > cameraX + w + 80) continue;

    const bobY = pu.y + Math.cos(tick * 0.09) * 5;
    ctx.save();
    ctx.fillStyle = `${pu.color}33`;
    ctx.strokeStyle = pu.color;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(pu.x, bobY, pu.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#fafafa';
    ctx.font = '700 9.5px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(pu.label, pu.x, bobY - pu.r - 6);
    ctx.fillText('★', pu.x, bobY + 4);
    ctx.restore();

    if (Math.hypot(pcx - pu.x, pcy - bobY) <= pu.r + 22) {
      pu.collected = true;
      activePowerUp = pu.id;
      powerUpTimer = 60 * 8; // 8 seconds
      if (pu.id === 'shield') {
        integrity = Math.min(100, integrity + 30);
      }
      playSound('powerup');
      createBurst(pu.x, bobY, pu.color, 20);
      addFloatingText(pu.x, bobY - 14, `${pu.label} ACTIVATED!`, pu.color);
      updateHud();
    }
  }

  // 8. Update & Draw Varied Ground Objects (Shootable Monsters vs. Static Hazard Barriers)
  for (let i = groundObjects.length - 1; i >= 0; i--) {
    const obj = groundObjects[i];
    if (obj.x + obj.w < cameraX - 100 || obj.x > cameraX + w + 100) continue;

    if (obj.type === 'monster') {
      // Patrol back and forth
      obj.x += obj.vx;
      if (obj.x <= obj.minX || obj.x + obj.w >= obj.maxX) obj.vx *= -1;
      drawGroundMonster(obj);

      // Check Laser Hit on Ground Monster
      let killed = false;
      for (let j = lasers.length - 1; j >= 0; j--) {
        const l = lasers[j];
        if (l.x >= obj.x && l.x <= obj.x + obj.w && l.y >= obj.y && l.y <= obj.y + obj.h) {
          lasers.splice(j, 1);
          groundObjects.splice(i, 1);
          killed = true;
          score += 150;
          playSound('blast');
          createBurst(obj.x + obj.w / 2, obj.y + obj.h / 2, '#c084fc', 20);
          addFloatingText(obj.x + obj.w / 2, obj.y - 12, `+150 ${obj.label.toUpperCase()} BLASTED!`, '#c084fc');
          updateHud();
          break;
        }
      }
      if (killed) continue;
    } else {
      // Static Low Hazard Barrier ("Bad Info", "Misinformation")
      ctx.save();
      ctx.fillStyle = 'rgba(239, 68, 68, 0.22)';
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(obj.x, obj.y, obj.w, obj.h, 5);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = 'rgba(9, 9, 11, 0.9)';
      ctx.fillRect(obj.x + obj.w / 2 - 46, obj.y - 19, 92, 14);
      ctx.fillStyle = '#fca5a5';
      ctx.font = '700 9px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(obj.label, obj.x + obj.w / 2, obj.y - 9);
      ctx.restore();
    }

    // Check Player Collision with Ground Object (No points for avoiding; damage on touch)
    if (
      player.iFrames === 0 &&
      player.x + player.w - 5 > obj.x &&
      player.x + 5 < obj.x + obj.w &&
      player.y + player.h - 4 > obj.y &&
      player.y + 4 < obj.y + obj.h
    ) {
      player.vy = -6.0;
      takeDamage(`HIT ${obj.label.toUpperCase()}!`, player.x, player.y);
      if (obj.type === 'monster') {
        groundObjects.splice(i, 1);
      }
    }
  }

  // 9. Update & Draw Swooping Flying Enemies
  for (let i = flyingEnemies.length - 1; i >= 0; i--) {
    const en = flyingEnemies[i];
    if (en.x - cameraX < w + 140) en.active = true;
    if (!en.active) continue;

    en.x += en.vx;
    en.phase += en.swoopSpeed;
    en.y = en.baseY + Math.sin(en.phase) * en.swoopAmp;

    drawSwoopingEnemy(en);

    // Check Laser Hit
    let destroyed = false;
    for (let j = lasers.length - 1; j >= 0; j--) {
      const l = lasers[j];
      if (Math.hypot(l.x - en.x, l.y - en.y) <= en.r + 12) {
        lasers.splice(j, 1);
        flyingEnemies.splice(i, 1);
        destroyed = true;
        score += 150;
        playSound('blast');
        createBurst(en.x, en.y, '#f59e0b', 22);
        addFloatingText(en.x, en.y - 15, '+150 TOXIC BOT BLASTED!', '#f59e0b');
        updateHud();
        break;
      }
    }
    if (destroyed) continue;

    if (player.iFrames === 0 && Math.hypot(pcx - en.x, pcy - en.y) <= en.r + 15) {
      takeDamage('HIT BY TOXIC BOT!', player.x, player.y);
      flyingEnemies.splice(i, 1);
      continue;
    }

    if (en.x < cameraX - 120) flyingEnemies.splice(i, 1);
  }

  // 10. Update & Draw Laser Bolts
  for (let i = lasers.length - 1; i >= 0; i--) {
    const l = lasers[i];
    l.x += l.vx;
    l.y += l.vy;
    l.life--;

    ctx.strokeStyle = l.color;
    ctx.shadowColor = l.color;
    ctx.shadowBlur = 10;
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(l.x, l.y);
    ctx.lineTo(l.x - Math.sign(l.vx) * 18, l.y - l.vy);
    ctx.stroke();
    ctx.shadowBlur = 0;

    if (l.life <= 0) lasers.splice(i, 1);
  }

  // 11. Draw End-of-Level Neural Core Goal Portal
  const portalY = 365 - 95;
  const pulse = Math.sin(tick * 0.08) * 6;
  ctx.save();
  ctx.strokeStyle = '#10b981';
  ctx.fillStyle = 'rgba(16, 185, 129, 0.18)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(levelGoalX, portalY + 45, 28 + pulse * 0.4, 48 + pulse * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#d1fae5';
  ctx.font = '700 11px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.fillText('★ NEURAL CORE GOAL ★', levelGoalX, portalY - 12);
  ctx.restore();

  // 12. Draw Player Character
  drawPlayerCharacter(player.x, player.y);

  // 13. Particles & Floating Popups
  for (let i = particles.length - 1; i >= 0; i--) {
    const pt = particles[i];
    pt.x += pt.vx;
    pt.y += pt.vy;
    pt.alpha -= 0.03;
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
  ctx.restore();

  updateHud();

  if (player.x + player.w >= levelGoalX - 20) {
    handleLevelVictory();
    return;
  }

  if (integrity <= 0) {
    handleLevelDefeat();
    return;
  }

  animId = requestAnimationFrame(platformerLoop);
}

function handleLevelVictory() {
  isPlaying = false;
  cancelAnimationFrame(animId);
  playSound('win');

  arcadeViewport.classList.add('victory-glow');
  arcadeDiagnostic.className = 'diagnostic-bar status-solved';
  arcadeDiagText.innerHTML = `<strong>🎉 Neural Core Reached! Total Clean Data Score: ${score} PTS!</strong> Read your Complete Journey Summary below, then proceed to the Official Final Examination!`;

  btnStartArcade.innerHTML = `<i data-lucide="shuffle" class="icon-xs"></i><span>Play New Procedural Level</span>`;
  btnStartArcade.classList.remove('hidden');

  postGameSummary.classList.remove('hidden');
  completeActivity('mod-05', 200);
  refreshIcons();

  setTimeout(() => {
    postGameSummary.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, 150);
}

function handleLevelDefeat() {
  isPlaying = false;
  cancelAnimationFrame(animId);

  arcadeDiagnostic.className = 'diagnostic-bar status-error';
  arcadeDiagText.innerHTML = `<strong>⚠️ Core Integrity Depleted!</strong> Tip: Grab <strong>Power-Up Orbs</strong> for shields and triple-lasers, shoot purple <strong>Ground Glitch Monsters</strong> with <strong>Click or F</strong>, and jump over static barriers!`;
  btnStartArcade.innerHTML = `<i data-lucide="rotate-ccw" class="icon-xs"></i><span>Generate New Level & Try Again</span>`;
  btnStartArcade.classList.remove('hidden');
  refreshIcons();
}

btnStartArcade.addEventListener('click', () => {
  score = 0;
  integrity = 100;
  tick = 0;
  generateProceduralLevel();
  isPlaying = true;
  arcadeViewport.classList.remove('victory-glow');
  btnStartArcade.classList.add('hidden');
  arcadeDiagnostic.className = 'diagnostic-bar status-good';
  arcadeDiagText.innerHTML = `<strong>Run Active:</strong> Collect green <strong>Clean Data Bits</strong> (+100 pts), grab <strong>Power-Up Orbs</strong>, and shoot purple <strong>Ground Monsters</strong> & flying <strong>Toxic Bots</strong> (+150 pts)!`;
  updateHud();
  platformerLoop();
});


// Mobile Touch Controls Binding (Left, Right, Jump, Laser)
const touchLeft = document.getElementById('touch-left');
const touchRight = document.getElementById('touch-right');
const touchJump = document.getElementById('touch-jump');
const touchLaser = document.getElementById('touch-laser');

function bindHoldButton(btn, onDown, onUp) {
  if (!btn) return;
  const start = (e) => { e.preventDefault(); btn.classList.add('pressed'); onDown(); };
  const end = (e) => { e.preventDefault(); btn.classList.remove('pressed'); if (onUp) onUp(); };
  btn.addEventListener('touchstart', start, { passive: false });
  btn.addEventListener('touchend', end, { passive: false });
  btn.addEventListener('touchcancel', end, { passive: false });
  btn.addEventListener('mousedown', start);
  btn.addEventListener('mouseup', end);
  btn.addEventListener('mouseleave', end);
}

bindHoldButton(
  touchLeft,
  () => { keys.left = true; player.facing = -1; },
  () => { keys.left = false; }
);
bindHoldButton(
  touchRight,
  () => { keys.right = true; player.facing = 1; },
  () => { keys.right = false; }
);
bindHoldButton(touchJump, () => { if (isPlaying) triggerJump(); });
bindHoldButton(touchLaser, () => { if (isPlaying) fireLaser(); });
