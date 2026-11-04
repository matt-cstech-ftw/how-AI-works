import { completeActivity } from '../../assets/js/progress.js';

// ==========================================
// PROCEDURAL SIDE-SCROLLING PLATFORMER ENGINE
// ==========================================
const canvas = document.getElementById('arcade-canvas');
const ctx = canvas.getContext('2d');

const arcadeViewport = document.getElementById('arcade-viewport');
const hudScore = document.getElementById('hud-score');
const hudProgress = document.getElementById('hud-progress');
const coreLight = document.getElementById('core-light');
const progressReadout = document.getElementById('progress-readout');
const arcadeDiagnostic = document.getElementById('arcade-diagnostic');
const arcadeDiagText = document.getElementById('arcade-diag-text');
const btnStartArcade = document.getElementById('btn-start-arcade');
const postGameSummary = document.getElementById('post-game-summary');

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons();
}
refreshIcons();

// If user navigated with ?quiz=1 from dashboard, send them to the standalone Final Exam page
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
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.linearRampToValueAtTime(0.01, now + 0.13);
      osc.start(now);
      osc.stop(now + 0.13);
    } else if (type === 'laser') {
      osc.type = 'square';
      osc.frequency.setValueAtTime(780, now);
      osc.frequency.exponentialRampToValueAtTime(190, now + 0.08);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.linearRampToValueAtTime(0.01, now + 0.08);
      osc.start(now);
      osc.stop(now + 0.08);
    } else if (type === 'score') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(520, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.12);
      gain.gain.setValueAtTime(0.14, now);
      gain.gain.linearRampToValueAtTime(0.01, now + 0.12);
      osc.start(now);
      osc.stop(now + 0.12);
    } else if (type === 'blast') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(85, now + 0.14);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.linearRampToValueAtTime(0.01, now + 0.14);
      osc.start(now);
      osc.stop(now + 0.14);
    } else if (type === 'hurt') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(140, now);
      osc.frequency.linearRampToValueAtTime(55, now + 0.24);
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.linearRampToValueAtTime(0.01, now + 0.24);
      osc.start(now);
      osc.stop(now + 0.24);
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

// Game State & Physics Constants
const GRAVITY = 0.58;
let isPlaying = false;
let animId = null;
let tick = 0;
let score = 0;
let integrity = 100;
let cameraX = 0;
let levelGoalX = 3400;
let screenShake = 0;

const player = {
  x: 90,
  y: 260,
  w: 34,
  h: 48,
  vx: 0,
  vy: 0,
  speed: 4.8,
  jumpForce: -11.8,
  grounded: false,
  jumpsLeft: 2,
  facing: 1,
  iFrames: 0,
  lastSafeX: 90,
  lastSafeY: 260
};

let platforms = [];
let gaps = [];
let obstacles = [];
let enemies = [];
let lasers = [];
let particles = [];
let floatingTexts = [];

const OBSTACLE_LABELS = [
  'Bad Info',
  'Misinformation',
  'Fake News',
  'Biased Data',
  'Corrupted File',
  'Clickbait Myth'
];

const SWOOP_ENEMY_LABELS = [
  '@#%! Troll Bot',
  'Sp*m Drone',
  'H*te Speech',
  'F*ke Rumor Bug',
  'T*xic Bot'
];

// Parallax Background Stars
const PARALLAX_STARS = Array.from({ length: 110 }, () => ({
  x: Math.random() * 4200,
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
// PROCEDURAL LEVEL GENERATOR (NEW EVERY RUN!)
// ==========================================
function generateProceduralLevel() {
  platforms = [];
  gaps = [];
  obstacles = [];
  enemies = [];
  lasers = [];
  particles = [];
  floatingTexts = [];

  // 1. Starting Safe Platform
  let curX = 0;
  let curY = 380;
  platforms.push({ x: 0, y: curY, w: 460, h: 120, isStart: true });
  curX = 460;

  // 2. Procedurally Generate 10 Platform Islands, Data Gaps, Ground Obstacles, and Swooping Enemies
  const numSegments = 10;
  for (let i = 0; i < numSegments; i++) {
    const gapWidth = Math.floor(78 + Math.random() * 48); // 78..126px jumpable gap
    const gapStart = curX;
    const gapEnd = curX + gapWidth;
    gaps.push({ startX: gapStart, endX: gapEnd, cleared: false });

    curX = gapEnd;
    // Vary platform height smoothly between y=300 and y=395
    const deltaY = Math.floor((Math.random() - 0.5) * 70);
    curY = Math.max(300, Math.min(395, curY + deltaY));
    const platWidth = Math.floor(270 + Math.random() * 170);

    platforms.push({ x: curX, y: curY, w: platWidth, h: 200, isStart: false });

    // Place 1 or 2 Ground Obstacles ("Bad Info", "Misinformation", etc.) on this platform
    const obsCount = platWidth > 360 && Math.random() > 0.35 ? 2 : 1;
    for (let j = 0; j < obsCount; j++) {
      const obsW = 46;
      const obsH = 38 + Math.floor(Math.random() * 12);
      const localOffset = j === 0
        ? Math.floor(75 + Math.random() * 55)
        : Math.floor(215 + Math.random() * 65);

      if (localOffset + obsW < platWidth - 50) {
        const label = OBSTACLE_LABELS[Math.floor(Math.random() * OBSTACLE_LABELS.length)];
        obstacles.push({
          x: curX + localOffset,
          y: curY - obsH,
          w: obsW,
          h: obsH,
          label,
          cleared: false,
          hit: false
        });
      }
    }

    // Spawn 1 or 2 Swooping Flying Enemies above this sector
    const enemyCount = i >= 2 && Math.random() > 0.3 ? 2 : 1;
    for (let e = 0; e < enemyCount; e++) {
      const label = SWOOP_ENEMY_LABELS[Math.floor(Math.random() * SWOOP_ENEMY_LABELS.length)];
      enemies.push({
        x: curX + 120 + e * 160 + Math.random() * 60,
        baseY: curY - 125 - Math.random() * 45,
        y: curY - 130,
        r: 20,
        vx: -(1.4 + Math.random() * 1.1),
        swoopSpeed: 0.045 + Math.random() * 0.03,
        swoopAmp: 38 + Math.random() * 28,
        phase: Math.random() * Math.PI * 2,
        label,
        active: false
      });
    }

    curX += platWidth;
  }

  // 3. Final Goal Platform with Neural Core Portal
  const finalGap = 85;
  gaps.push({ startX: curX, endX: curX + finalGap, cleared: false });
  curX += finalGap;
  platforms.push({ x: curX, y: 360, w: 420, h: 200, isGoalPlat: true });
  levelGoalX = curX + 220;

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

// Controls: A/D or Arrows to Run, W/Up/Space to Jump, Click or F/Enter to Shoot Laser
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
  if (!isPlaying || lasers.length >= 5) return;
  playSound('laser');
  const gunX = player.facing === 1 ? player.x + player.w + 10 : player.x - 14;
  const gunY = player.y + 21;
  lasers.push({
    x: gunX,
    y: gunY,
    vx: player.facing * 12.5,
    life: 65
  });
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
  hudScore.textContent = `SCORE: ${score} PTS | INTEGRITY: ${integrity}%`;
  hudProgress.textContent = `COURSE PROGRESS: ${pct}%`;
  progressReadout.innerHTML = `Score: <strong>${score} PTS</strong>`;
  coreLight.style.backgroundColor = integrity > 50 ? '#10b981' : '#ef4444';
}

// Draw Character Holding Laser Blaster
function drawPlayerCharacter(px, py) {
  ctx.save();
  if (player.iFrames > 0 && Math.floor(tick / 3) % 2 === 0) {
    ctx.globalAlpha = 0.45;
  }

  const cx = px + player.w / 2;
  const legSwing = player.grounded && Math.abs(player.vx) > 0.2
    ? Math.sin(tick * 0.32) * 8
    : (player.grounded ? 0 : 6);

  // Animated Legs
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 4.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - 4, py + 34);
  ctx.lineTo(cx - 6 - legSwing, py + player.h);
  ctx.moveTo(cx + 4, py + 34);
  ctx.lineTo(cx + 6 + legSwing, py + player.h);
  ctx.stroke();

  // Cyber Suit Body
  ctx.fillStyle = '#0f172a';
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(px + 4, py + 14, player.w - 8, 22, 6);
  ctx.fill();
  ctx.stroke();

  // Head / Helmet
  ctx.fillStyle = '#1e293b';
  ctx.strokeStyle = '#10b981';
  ctx.beginPath();
  ctx.roundRect(px + 5, py, player.w - 10, 16, 5);
  ctx.fill();
  ctx.stroke();

  // Glowing Visor Eye
  ctx.fillStyle = '#10b981';
  const visorX = player.facing === 1 ? px + 16 : px + 7;
  ctx.fillRect(visorX, py + 5, 9, 5);

  // Laser Rifle Held in Hand
  ctx.fillStyle = '#e2e8f0';
  const gunX = player.facing === 1 ? cx + 2 : cx - 22;
  ctx.fillRect(gunX, py + 19, 20, 6);
  // Glowing Cyan Laser Barrel Tip
  ctx.fillStyle = '#38bdf8';
  const tipX = player.facing === 1 ? gunX + 18 : gunX - 4;
  ctx.fillRect(tipX, py + 18, 6, 8);

  ctx.restore();
}

// Draw Swooping Flying Drone Enemy
function drawSwoopingEnemy(en) {
  ctx.save();
  ctx.translate(en.x, en.y);

  // Glowing Wing Blades
  const wingFlap = Math.sin(tick * 0.45) * 6;
  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(-24, -8 + wingFlap);
  ctx.lineTo(0, 0);
  ctx.lineTo(24, -8 - wingFlap);
  ctx.stroke();

  // Spiky Drone Core
  ctx.fillStyle = 'rgba(239, 68, 68, 0.28)';
  ctx.strokeStyle = '#ef4444';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, en.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Angry Red Drone Eye
  ctx.fillStyle = '#ef4444';
  ctx.beginPath();
  ctx.arc(-5, 0, 4, 0, Math.PI * 2);
  ctx.fill();

  // Censored Label Tag above Drone
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
  ctx.fillText('Jump Over "Bad Info" & "Misinformation" (+100) • Shoot Swooping Toxic Bots (+150)', w / 2, h / 2 + 4);
  ctx.fillStyle = '#10b981';
  ctx.fillText('Every Playthrough Procedurally Generates a Brand-New Course!', w / 2, h / 2 + 32);
}
renderIdleScreen();

function platformerLoop() {
  if (!isPlaying) return;
  tick++;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;

  // 1. Horizontal Movement
  if (keys.left) player.vx = -player.speed;
  else if (keys.right) player.vx = player.speed;
  else player.vx *= 0.78;

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
      prevBottom <= plat.y + 10 &&
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

  // Check if Player Fell Into a Data Gap
  if (player.y > h + 40) {
    integrity = Math.max(0, integrity - 25);
    screenShake = 10;
    playSound('hurt');
    player.x = player.lastSafeX;
    player.y = player.lastSafeY;
    player.vy = 0;
    player.iFrames = 55;
    addFloatingText(player.x, player.y - 10, 'FELL IN DATA GAP! -25%', '#ef4444');
    updateHud();
  }

  // 3. Check Gap Jumps for Score (+100 PTS per gap cleared!)
  for (const gap of gaps) {
    if (!gap.cleared && player.x > gap.endX + 10 && player.grounded) {
      gap.cleared = true;
      score += 100;
      playSound('score');
      addFloatingText(player.x, player.y - 18, '+100 GAP CLEARED!', '#10b981');
      updateHud();
    }
  }

  // 4. Update Camera Smooth Follow
  const targetCamX = Math.max(0, player.x - w * 0.28);
  cameraX += (targetCamX - cameraX) * 0.14;

  // 5. Render World
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

  // Translate by Camera
  ctx.save();
  ctx.translate(-cameraX, 0);

  // 6. Draw Platforms
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

    // Glowing Top Surface Rail
    ctx.fillStyle = plat.isGoalPlat ? '#10b981' : '#38bdf8';
    ctx.fillRect(plat.x + 2, plat.y, plat.w - 4, 4);
  }

  // 7. Draw & Check Labeled Ground Obstacles ("Bad Info", "Misinformation", etc.)
  for (const obs of obstacles) {
    if (obs.x + obs.w < cameraX - 80 || obs.x > cameraX + w + 80) continue;

    // Hazard Crate Body
    ctx.fillStyle = 'rgba(239, 68, 68, 0.2)';
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(obs.x, obs.y, obs.w, obs.h, 5);
    ctx.fill();
    ctx.stroke();

    // Diagonal Warning Stripes
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.45)';
    ctx.beginPath();
    ctx.moveTo(obs.x + 6, obs.y + obs.h - 6);
    ctx.lineTo(obs.x + obs.w - 6, obs.y + 6);
    ctx.stroke();

    // Obstacle Label Tag ("Bad Info", "Misinformation", etc.)
    ctx.fillStyle = 'rgba(9, 9, 11, 0.9)';
    ctx.fillRect(obs.x + obs.w / 2 - 48, obs.y - 20, 96, 15);
    ctx.fillStyle = '#fca5a5';
    ctx.font = '700 9.5px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(obs.label, obs.x + obs.w / 2, obs.y - 9);

    // Collision Check with Player
    if (
      player.iFrames === 0 &&
      player.x + player.w - 4 > obs.x &&
      player.x + 4 < obs.x + obs.w &&
      player.y + player.h - 4 > obs.y &&
      player.y + 4 < obs.y + obs.h
    ) {
      obs.hit = true;
      integrity = Math.max(0, integrity - 25);
      player.iFrames = 50;
      player.vy = -6.5;
      screenShake = 10;
      playSound('hurt');
      createBurst(obs.x + obs.w / 2, obs.y + obs.h / 2, '#ef4444', 18);
      addFloatingText(player.x, player.y - 12, `HIT ${obs.label.toUpperCase()}! -25%`, '#ef4444');
      updateHud();
    }

    // Check if Player Jumped Over Obstacle Cleanly (+100 PTS!)
    if (!obs.cleared && !obs.hit && player.x > obs.x + obs.w + 6) {
      obs.cleared = true;
      score += 100;
      playSound('score');
      addFloatingText(obs.x + obs.w / 2, obs.y - 26, `+100 JUMPED ${obs.label.toUpperCase()}!`, '#10b981');
      updateHud();
    }
  }

  // 8. Update & Draw Swooping Flying Enemies
  for (let i = enemies.length - 1; i >= 0; i--) {
    const en = enemies[i];
    if (en.x - cameraX < w + 160) en.active = true;
    if (!en.active) continue;

    en.x += en.vx;
    en.phase += en.swoopSpeed;
    en.y = en.baseY + Math.sin(en.phase) * en.swoopAmp;

    drawSwoopingEnemy(en);

    // Check Laser Hit on Swooping Enemy
    let destroyed = false;
    for (let j = lasers.length - 1; j >= 0; j--) {
      const l = lasers[j];
      if (Math.hypot(l.x - en.x, l.y - en.y) <= en.r + 10) {
        lasers.splice(j, 1);
        enemies.splice(i, 1);
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

    // Check Swooping Enemy Collision with Player
    const pcx = player.x + player.w / 2;
    const pcy = player.y + player.h / 2;
    if (player.iFrames === 0 && Math.hypot(pcx - en.x, pcy - en.y) <= en.r + 16) {
      integrity = Math.max(0, integrity - 25);
      player.iFrames = 50;
      screenShake = 11;
      playSound('hurt');
      createBurst(en.x, en.y, '#ef4444', 20);
      addFloatingText(player.x, player.y - 15, '-25% HIT BY TOXIC BOT!', '#ef4444');
      enemies.splice(i, 1);
      updateHud();
      continue;
    }

    if (en.x < cameraX - 120) enemies.splice(i, 1);
  }

  // 9. Update & Draw Horizontal Laser Bolts
  for (let i = lasers.length - 1; i >= 0; i--) {
    const l = lasers[i];
    l.x += l.vx;
    l.life--;

    ctx.strokeStyle = '#38bdf8';
    ctx.shadowColor = '#38bdf8';
    ctx.shadowBlur = 10;
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(l.x, l.y);
    ctx.lineTo(l.x - Math.sign(l.vx) * 18, l.y);
    ctx.stroke();
    ctx.shadowBlur = 0;

    if (l.life <= 0) lasers.splice(i, 1);
  }

  // 10. Draw End-of-Level Neural Core Goal Portal
  const portalY = 360 - 95;
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

  // 11. Draw Player Character
  drawPlayerCharacter(player.x, player.y);

  // 12. Draw Particles & Floating Score Popups
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

  ctx.restore(); // End Camera Translate
  ctx.restore(); // End Screen Shake

  updateHud();

  // Check Victory (Reached Neural Core Goal Portal!)
  if (player.x + player.w >= levelGoalX - 20) {
    handleLevelVictory();
    return;
  }

  // Check Defeat
  if (integrity <= 0) {
    handleLevelDefeat();
    return;
  }

  animId = requestAnimationFrame(platformerLoop);
}

function handleLevelVictory() {
  isPlaying = false;
  cancelAnimationFrame(animId);
  score += 500;
  updateHud();
  playSound('win');

  arcadeViewport.classList.add('victory-glow');
  arcadeDiagnostic.className = 'diagnostic-bar status-solved';
  arcadeDiagText.innerHTML = `<strong>🎉 Level Complete! Final Run Score: ${score} PTS!</strong> You cleared the procedural obstacle course and reached the Neural Core! Read your Reverse-Order Journey Summary below, then proceed to the Final Course Exam!`;

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
  arcadeDiagText.innerHTML = `<strong>⚠️ Core Integrity Depleted!</strong> Remember: Jump over "Bad Info" crates with <strong>Spacebar / W / Up Arrow</strong> (you can Double-Jump!), and shoot swooping Toxic Bots with <strong>Click or F</strong>!`;
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
  arcadeDiagText.innerHTML = `<strong>Procedural Run Active:</strong> Move with <strong>A/D or Arrows</strong> • Jump/Double-Jump with <strong>Space/W/▲</strong> • Fire Laser with <strong>Click or F</strong>!`;
  updateHud();
  platformerLoop();
});
