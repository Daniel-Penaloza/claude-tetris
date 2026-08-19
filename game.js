'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const WILD = 8; // bloque comodín generado por el power-up "Tinte"

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#82b1ff', // J - pale blue
  '#ffb74d', // L - orange
  '#ffffff', // 8 - comodín (render especial arcoíris)
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
];

const LINE_SCORES = [0, 100, 300, 500, 800];

// ---------- Skins visuales ----------
const SKIN_KEY = 'tetris-skin';

const PALETTE_NEON = [
  null,
  '#00e5ff', // I
  '#ffea00', // O
  '#d500f9', // T
  '#00e676', // S
  '#ff1744', // Z
  '#2979ff', // J
  '#ff9100', // L
  '#ffffff', // 8 - comodín
];

const PALETTE_PASTEL = [
  null,
  '#aee9f2', // I
  '#fff3b0', // O
  '#e5c9ef', // T
  '#c8ecc9', // S
  '#f7c2c2', // Z
  '#c9d7fb', // J
  '#ffdcb3', // L
  '#ffffff', // 8 - comodín
];

let activeSkin = 'retro';

function drawWildBlock(context, x, y, size, alpha, glow) {
  context.globalAlpha = alpha ?? 1;
  const g = context.createLinearGradient(x * size, y * size, (x + 1) * size, (y + 1) * size);
  g.addColorStop(0, '#ff5252');
  g.addColorStop(0.35, '#ffd54f');
  g.addColorStop(0.65, '#69f0ae');
  g.addColorStop(1, '#40c4ff');
  if (glow) {
    context.shadowBlur = 12;
    context.shadowColor = '#ffffff';
  }
  context.fillStyle = g;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  context.shadowBlur = 0;
  context.fillStyle = 'rgba(255,255,255,0.16)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function roundedRectPath(context, x, y, w, h, r) {
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + w, y, x + w, y + h, r);
  context.arcTo(x + w, y + h, x, y + h, r);
  context.arcTo(x, y + h, x, y, r);
  context.arcTo(x, y, x + w, y, r);
  context.closePath();
}

function drawCellRetro(context, x, y, colorIndex, size) {
  context.fillStyle = COLORS[colorIndex];
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
}

function drawCellNeon(context, x, y, colorIndex, size) {
  const color = PALETTE_NEON[colorIndex];
  context.shadowBlur = 10;
  context.shadowColor = color;
  context.fillStyle = color;
  context.fillRect(x * size + 2, y * size + 2, size - 4, size - 4);
  context.shadowBlur = 0;
  context.strokeStyle = 'rgba(255,255,255,0.55)';
  context.lineWidth = 1;
  context.strokeRect(x * size + 2.5, y * size + 2.5, size - 5, size - 5);
}

function drawCellPastel(context, x, y, colorIndex, size) {
  const px = x * size + 2, py = y * size + 2, s = size - 4;
  const r = Math.min(6, s / 3);
  context.fillStyle = PALETTE_PASTEL[colorIndex];
  roundedRectPath(context, px, py, s, s, r);
  context.fill();
  context.fillStyle = 'rgba(255,255,255,0.35)';
  roundedRectPath(context, px, py, s, Math.max(2, s * 0.3), r);
  context.fill();
}

function drawCellPixel(context, x, y, colorIndex, size) {
  const px = x * size, py = y * size;
  context.fillStyle = COLORS[colorIndex];
  context.fillRect(px + 1, py + 1, size - 2, size - 2);
  const unit = Math.max(2, Math.floor(size / 6));
  context.fillStyle = 'rgba(255,255,255,0.35)';
  context.fillRect(px + 1, py + 1, size - 2, unit);
  context.fillRect(px + 1, py + 1, unit, size - 2);
  context.fillStyle = 'rgba(0,0,0,0.3)';
  context.fillRect(px + 1, py + size - 1 - unit, size - 2, unit);
  context.fillRect(px + size - 1 - unit, py + 1, unit, size - 2);
  context.fillStyle = 'rgba(0,0,0,0.12)';
  const half = size / 2;
  context.fillRect(px + 1, py + 1, half - 1, half - 1);
  context.fillRect(px + half, py + half, half - 1, half - 1);
}

const SKINS = {
  retro:  { name: 'Retro',     drawCell: drawCellRetro,  wildGlow: false },
  neon:   { name: 'Neón',      drawCell: drawCellNeon,   wildGlow: true },
  pastel: { name: 'Pastel',    drawCell: drawCellPastel, wildGlow: false },
  pixel:  { name: 'Pixel Art', drawCell: drawCellPixel,  wildGlow: false },
};
const SKIN_ORDER = ['retro', 'neon', 'pastel', 'pixel'];

// ---------- Power-ups ----------
const POWERUP_EVERY = 5;      // aparece una pieza especial cada N líneas
const FREEZE_MS = 5000;       // duración del congelamiento

const POWERUPS = [
  { id: 'bomb',    name: 'Bomba',    icon: '💣', color: '#ff5252', desc: 'Destruye un área 3x3' },
  { id: 'laser',   name: 'Rayo',     icon: '⚡', color: '#40c4ff', desc: 'Limpia fila y columna' },
  { id: 'dye',     name: 'Tinte',    icon: '🎨', color: '#e040fb', desc: 'Un color → comodines' },
  { id: 'gravity', name: 'Gravedad', icon: '🌀', color: '#69f0ae', desc: 'Compacta los huecos' },
  { id: 'freeze',  name: 'Congelar', icon: '❄️', color: '#80d8ff', desc: 'Pausa la caída 5s' },
];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const powerEl = document.getElementById('power-status');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeToggleBtn = document.getElementById('theme-toggle');
const skinSelect = document.getElementById('skin-select');

const THEME_KEY = 'tetris-theme';

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let nextPowerupAt, pendingPowerup, freezeUntil, freezeRemaining, flashes;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 7) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function randomPowerPiece() {
  const power = POWERUPS[Math.floor(Math.random() * POWERUPS.length)];
  return { type: 0, power, shape: [[1]], x: Math.floor(COLS / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    // Los comodines detonan con cualquier línea limpiada
    detonateWilds();
    while (lines >= nextPowerupAt) {
      pendingPowerup = true;
      nextPowerupAt += POWERUP_EVERY;
    }
    updateHUD();
  }
}

// ---------- Efectos de power-up ----------

function addFlash(x, y) {
  flashes.push({ x, y, t: performance.now() });
}

function destroyCell(x, y) {
  if (y < 0 || y >= ROWS || x < 0 || x >= COLS) return 0;
  if (!board[y][x]) return 0;
  board[y][x] = 0;
  addFlash(x, y);
  return 1;
}

function bombEffect(cx, cy) {
  let destroyed = 0;
  for (let y = cy - 1; y <= cy + 1; y++)
    for (let x = cx - 1; x <= cx + 1; x++)
      destroyed += destroyCell(x, y);
  return destroyed;
}

function laserEffect(cx, cy) {
  let destroyed = 0;
  for (let x = 0; x < COLS; x++) destroyed += destroyCell(x, cy);
  for (let y = 0; y < ROWS; y++) destroyed += destroyCell(cx, y);
  return destroyed;
}

function dyeEffect() {
  // Convierte todos los bloques del color más abundante en comodines
  const counts = new Array(COLORS.length).fill(0);
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      const v = board[r][c];
      if (v && v !== WILD) counts[v]++;
    }
  let best = 0, bestCount = 0;
  for (let i = 1; i < counts.length; i++)
    if (counts[i] > bestCount) { bestCount = counts[i]; best = i; }
  if (!best) return 0;
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      if (board[r][c] === best) { board[r][c] = WILD; addFlash(c, r); }
  return bestCount;
}

function detonateWilds() {
  let destroyed = 0;
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      if (board[r][c] === WILD) destroyed += destroyCell(c, r);
  if (destroyed) {
    score += destroyed * 20 * level;
    applyGravity();
  }
  return destroyed;
}

function applyGravity() {
  let moved = 0;
  for (let c = 0; c < COLS; c++) {
    let write = ROWS - 1;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (board[r][c]) {
        if (write !== r) {
          board[write][c] = board[r][c];
          board[r][c] = 0;
          moved++;
        }
        write--;
      }
    }
  }
  return moved;
}

function startFreeze() {
  freezeUntil = performance.now() + FREEZE_MS;
  freezeRemaining = 0;
}

function isFrozen() {
  return freezeUntil > performance.now();
}

function activatePowerup(power, cx, cy) {
  let gained = 0;
  switch (power.id) {
    case 'bomb':
      gained = bombEffect(cx, cy) * 15;
      applyGravity();
      break;
    case 'laser':
      gained = laserEffect(cx, cy) * 20;
      applyGravity();
      break;
    case 'dye':
      gained = dyeEffect() * 5;
      break;
    case 'gravity':
      gained = applyGravity() * 10;
      break;
    case 'freeze':
      startFreeze();
      gained = 50;
      break;
  }
  score += gained * level;
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  if (gameOver) return;
  if (current.power) {
    activatePowerup(current.power, current.x, current.y);
  } else {
    merge();
  }
  clearLines();
  updateHUD();
  spawn();
}

function spawn() {
  current = next;
  next = pendingPowerup ? randomPowerPiece() : randomPiece();
  if (pendingPowerup) pendingPowerup = false;
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
  updateHUD();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
  if (!powerEl) return;
  if (isFrozen()) {
    const secs = Math.ceil((freezeUntil - performance.now()) / 1000);
    powerEl.textContent = `❄️ Congelado ${secs}s`;
    powerEl.className = 'power-status active';
  } else if (next && next.power) {
    powerEl.textContent = `${next.power.icon} ${next.power.name} · ¡listo!`;
    powerEl.className = 'power-status ready';
  } else {
    powerEl.textContent = `Próximo en ${Math.max(0, nextPowerupAt - lines)} líneas`;
    powerEl.className = 'power-status';
  }
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const skin = SKINS[activeSkin] || SKINS.retro;
  context.globalAlpha = alpha ?? 1;
  if (colorIndex === WILD) {
    drawWildBlock(context, x, y, size, alpha, skin.wildGlow);
  } else {
    skin.drawCell(context, x, y, colorIndex, size);
  }
  context.globalAlpha = 1;
  context.shadowBlur = 0;
}

function drawPowerBlock(context, x, y, power, size, alpha) {
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = power.color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  context.fillStyle = 'rgba(255,255,255,0.18)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.font = `${Math.floor(size * 0.6)}px system-ui, sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillStyle = '#fff';
  context.fillText(power.icon, x * size + size / 2, y * size + size / 2 + 1);
  context.globalAlpha = 1;
}

function drawFlashes() {
  const now = performance.now();
  flashes = flashes.filter(f => now - f.t < 300);
  for (const f of flashes) {
    const p = 1 - (now - f.t) / 300;
    ctx.globalAlpha = p * 0.8;
    ctx.fillStyle = '#fff';
    ctx.fillRect(f.x * BLOCK, f.y * BLOCK, BLOCK, BLOCK);
    ctx.globalAlpha = 1;
  }
}

function drawGrid() {
  ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--grid-color').trim();
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function drawPiece(piece, py, alpha) {
  for (let r = 0; r < piece.shape.length; r++)
    for (let c = 0; c < piece.shape[r].length; c++) {
      if (!piece.shape[r][c]) continue;
      if (piece.power) drawPowerBlock(ctx, piece.x + c, py + r, piece.power, BLOCK, alpha);
      else drawBlock(ctx, piece.x + c, py + r, piece.shape[r][c], BLOCK, alpha);
    }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  drawFlashes();

  // ghost + pieza actual
  drawPiece(current, ghostY(), 0.2);
  drawPiece(current, current.y);

  if (isFrozen()) {
    ctx.fillStyle = 'rgba(128, 216, 255, 0.12)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      if (next.power) drawPowerBlock(nextCtx, offX + c, offY + r, next.power, NB);
      else drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
    }
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  animId = null;
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    if (freezeRemaining > 0) {
      freezeUntil = lastTime + freezeRemaining;
      freezeRemaining = 0;
    }
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    freezeRemaining = Math.max(0, freezeUntil - performance.now());
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  if (gameOver || paused) return;
  const dt = ts - lastTime;
  lastTime = ts;
  if (isFrozen()) {
    dropAccum = 0;
  } else {
    dropAccum += dt;
  }
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  updateHUD();
  if (gameOver) return;
  animId = requestAnimationFrame(loop);
}

function init() {
  cancelAnimationFrame(animId);
  animId = null;
  paused = false;
  gameOver = false;
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  dropInterval = 1000;
  dropAccum = 0;
  nextPowerupAt = POWERUP_EVERY;
  pendingPowerup = false;
  freezeUntil = 0;
  freezeRemaining = 0;
  flashes = [];
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  if (gameOver) return;
  overlay.classList.add('hidden');
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

function applyTheme(theme) {
  document.body.classList.toggle('light-theme', theme === 'light');
  themeToggleBtn.textContent = theme === 'light' ? '☀️' : '🌙';
  themeToggleBtn.setAttribute('aria-label', theme === 'light' ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro');
}

themeToggleBtn.addEventListener('click', () => {
  const theme = document.body.classList.contains('light-theme') ? 'dark' : 'light';
  applyTheme(theme);
  localStorage.setItem(THEME_KEY, theme);
});

applyTheme(localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark');

function setSkinClasses(skin) {
  for (const s of SKIN_ORDER) document.body.classList.toggle(`skin-${s}`, s === skin);
}

function applySkin(skin, { repaint = true } = {}) {
  const valid = SKIN_ORDER.includes(skin) ? skin : 'retro';
  activeSkin = valid;
  setSkinClasses(valid);
  if (skinSelect) skinSelect.value = valid;
  // Repinta al instante aunque el juego esté pausado o en game over.
  if (repaint && typeof board !== 'undefined' && board) {
    draw();
    if (next) drawNext();
  }
}

if (skinSelect) {
  skinSelect.addEventListener('change', () => {
    applySkin(skinSelect.value);
    try {
      localStorage.setItem(SKIN_KEY, activeSkin);
    } catch (e) {
      // Almacenamiento no disponible (p. ej. navegación privada); la skin
      // sigue aplicada en memoria, solo no persiste entre sesiones.
    }
  });
}

function loadSkinPreference() {
  let saved = null;
  try {
    saved = localStorage.getItem(SKIN_KEY);
  } catch (e) {
    saved = null;
  }
  applySkin(SKIN_ORDER.includes(saved) ? saved : 'retro', { repaint: false });
}

loadSkinPreference();

init();
