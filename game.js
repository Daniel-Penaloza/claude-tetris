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
const comboEl = document.getElementById('combo-status');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeToggleBtn = document.getElementById('theme-toggle');

const startScreen = document.getElementById('start-screen');
const playBtn = document.getElementById('play-btn');
const highscoreListEl = document.getElementById('highscore-list');
const bestComboEl = document.getElementById('best-combo');
const maxLinesEl = document.getElementById('max-lines');
const resetScoresBtn = document.getElementById('reset-scores-btn');
const resetConfirm = document.getElementById('reset-confirm');
const resetConfirmYes = document.getElementById('reset-confirm-yes');
const resetConfirmNo = document.getElementById('reset-confirm-no');

const saveScoreSection = document.getElementById('save-score-section');
const playerNameInput = document.getElementById('player-name-input');
const saveScoreBtn = document.getElementById('save-score-btn');
const saveScoreMsg = document.getElementById('save-score-msg');
const overlayHighscores = document.getElementById('overlay-highscores');
const overlayHighscoreList = document.getElementById('overlay-highscore-list');

const THEME_KEY = 'tetris-theme';
const HIGHSCORES_KEY = 'tetris-highscores';
const MAX_HIGHSCORES = 5;
const MAX_NAME_LEN = 12;

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let nextPowerupAt, pendingPowerup, freezeUntil, freezeRemaining, flashes;
let combo, bestComboRun, scoreSaved, highscoresData, gameStarted;

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
  return cleared;
}

// Actualiza la racha de combo tras un bloqueo. Una pieza de power-up que no
// limpia línea no rompe la racha (fue el juego, no el jugador, quien la
// insertó); solo una pieza normal sin línea limpiada corta el combo.
function updateCombo(cleared, wasPowerup) {
  if (cleared) {
    combo++;
    if (combo > bestComboRun) bestComboRun = combo;
  } else if (!wasPowerup) {
    combo = 0;
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
  const wasPowerup = !!current.power;
  if (wasPowerup) {
    activatePowerup(current.power, current.x, current.y);
  } else {
    merge();
  }
  const cleared = clearLines();
  updateCombo(cleared, wasPowerup);
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
  if (comboEl) {
    if (combo > 1) {
      comboEl.textContent = `🔥 Combo x${combo}`;
      comboEl.classList.remove('hidden');
    } else {
      comboEl.classList.add('hidden');
    }
  }
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
  context.globalAlpha = alpha ?? 1;
  if (colorIndex === WILD) {
    const g = context.createLinearGradient(x * size, y * size, (x + 1) * size, (y + 1) * size);
    g.addColorStop(0, '#ff5252');
    g.addColorStop(0.35, '#ffd54f');
    g.addColorStop(0.65, '#69f0ae');
    g.addColorStop(1, '#40c4ff');
    context.fillStyle = g;
  } else {
    context.fillStyle = COLORS[colorIndex];
  }
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
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

// ---------- Tabla de records ----------

function defaultHighscores() {
  return { scores: [], bestCombo: 0, maxLines: 0 };
}

function loadHighscores() {
  try {
    const raw = localStorage.getItem(HIGHSCORES_KEY);
    if (!raw) return defaultHighscores();
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object' || !Array.isArray(data.scores)) return defaultHighscores();
    const scores = data.scores
      .filter(e => e && typeof e === 'object')
      .map(e => ({
        name: typeof e.name === 'string' && e.name.trim() ? e.name.slice(0, MAX_NAME_LEN) : 'Jugador',
        score: Number.isFinite(e.score) ? e.score : 0,
        lines: Number.isFinite(e.lines) ? e.lines : 0,
        level: Number.isFinite(e.level) ? e.level : 1,
        combo: Number.isFinite(e.combo) ? e.combo : 0,
        date: typeof e.date === 'string' ? e.date : '',
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_HIGHSCORES);
    return {
      scores,
      bestCombo: Number.isFinite(data.bestCombo) ? data.bestCombo : 0,
      maxLines: Number.isFinite(data.maxLines) ? data.maxLines : 0,
    };
  } catch (e) {
    return defaultHighscores();
  }
}

function saveHighscoresToStorage() {
  try {
    localStorage.setItem(HIGHSCORES_KEY, JSON.stringify(highscoresData));
  } catch (e) {
    // almacenamiento no disponible; se ignora silenciosamente
  }
}

function renderHighscoreList(listEl, highlightIndex) {
  listEl.innerHTML = '';
  if (!highscoresData.scores.length) {
    const li = document.createElement('li');
    li.className = 'hs-empty';
    li.textContent = 'Sin puntuaciones aún';
    listEl.appendChild(li);
    return;
  }
  highscoresData.scores.forEach((entry, i) => {
    const li = document.createElement('li');
    if (i === highlightIndex) li.classList.add('hs-new');
    const rank = document.createElement('span');
    rank.className = 'hs-rank';
    rank.textContent = `${i + 1}.`;
    const name = document.createElement('span');
    name.className = 'hs-name';
    name.textContent = entry.name;
    const scoreSpan = document.createElement('span');
    scoreSpan.className = 'hs-score';
    scoreSpan.textContent = entry.score.toLocaleString();
    li.append(rank, name, scoreSpan);
    listEl.appendChild(li);
  });
}

function refreshHighscoreUI() {
  renderHighscoreList(highscoreListEl, -1);
  bestComboEl.textContent = highscoresData.bestCombo;
  maxLinesEl.textContent = highscoresData.maxLines;
}

function saveScore() {
  if (scoreSaved) return;
  const rawName = playerNameInput.value.trim();
  const name = (rawName || 'Jugador').slice(0, MAX_NAME_LEN);
  const entry = { name, score, lines, level, combo: bestComboRun, date: new Date().toISOString() };
  highscoresData.scores.push(entry);
  highscoresData.scores.sort((a, b) => b.score - a.score);
  highscoresData.scores = highscoresData.scores.slice(0, MAX_HIGHSCORES);
  const idx = highscoresData.scores.indexOf(entry);
  saveHighscoresToStorage();
  scoreSaved = true;
  saveScoreSection.classList.add('hidden');
  saveScoreMsg.classList.remove('hidden');
  saveScoreMsg.textContent = idx >= 0
    ? `¡Guardado en el puesto #${idx + 1}!`
    : 'No alcanzó el top 5 esta vez.';
  overlayHighscores.classList.remove('hidden');
  renderHighscoreList(overlayHighscoreList, idx);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  animId = null;
  if (combo > bestComboRun) bestComboRun = combo;
  if (bestComboRun > highscoresData.bestCombo) highscoresData.bestCombo = bestComboRun;
  if (lines > highscoresData.maxLines) highscoresData.maxLines = lines;
  saveHighscoresToStorage();
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  scoreSaved = false;
  playerNameInput.value = '';
  saveScoreSection.classList.remove('hidden');
  saveScoreMsg.classList.add('hidden');
  overlayHighscores.classList.add('hidden');
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
    saveScoreSection.classList.add('hidden');
    saveScoreMsg.classList.add('hidden');
    overlayHighscores.classList.add('hidden');
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
  gameStarted = true;
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
  combo = 0;
  bestComboRun = 0;
  scoreSaved = false;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  if (gameOver) return;
  overlay.classList.add('hidden');
  saveScoreSection.classList.add('hidden');
  saveScoreMsg.classList.add('hidden');
  overlayHighscores.classList.add('hidden');
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (!gameStarted) return;
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

restartBtn.addEventListener('click', () => {
  if (gameOver) {
    // Tras GAME OVER, volvemos a la pantalla de inicio (records actualizados)
    // en vez de arrancar directamente; así "Resetear records" sigue accesible.
    gameStarted = false;
    overlay.classList.add('hidden');
    refreshHighscoreUI();
    startScreen.classList.remove('hidden');
  } else {
    // Durante la pausa, "Reiniciar" mantiene su comportamiento original.
    init();
  }
});

saveScoreBtn.addEventListener('click', saveScore);
playerNameInput.addEventListener('keydown', e => {
  e.stopPropagation();
  if (e.key === 'Enter') saveScore();
});

playBtn.addEventListener('click', () => {
  startScreen.classList.add('hidden');
  init();
});

resetScoresBtn.addEventListener('click', () => {
  resetConfirm.classList.remove('hidden');
});

resetConfirmNo.addEventListener('click', () => {
  resetConfirm.classList.add('hidden');
});

resetConfirmYes.addEventListener('click', () => {
  highscoresData = defaultHighscores();
  saveHighscoresToStorage();
  refreshHighscoreUI();
  resetConfirm.classList.add('hidden');
});

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

gameStarted = false;
highscoresData = loadHighscores();
refreshHighscoreUI();
