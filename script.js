// ================================
// Bossdle script.js (FINAL)
// Eastern-midnight safe + exploit fix
// ================================

// ---------------- Constants & Globals ----------------
const GRID_SIZE = 6;
const STATS_KEY = 'erdle_stats_v1';
const ATTEMPTS_KEY = 'erdle_attempts_v1';
const LAST_DATE_KEY = 'erdle_last_date_v1';

let bosses = [];
let target = null;
let attempts = [];
let gameOver = false;
let testDayOffset = 0;
let testMode = false;
let countdownInterval = null;

// ---------------- Time Helpers ----------------

// Start date in EST
const startDate = new Date('2025-10-17T00:00:00-04:00');

// Returns UTC hour for Eastern midnight (5 in winter, 4 in summer)
function easternMidnightUtcHour() {
  return new Date().getTimezoneOffset() / 60;
}

// Days since start, synced to Eastern midnight
function daysSinceStart() {
  const nowUtc = new Date();
  const rawDays = Math.floor((nowUtc - startDate) / 86400000);

  const utcHour = easternMidnightUtcHour();
  const estMidnightTodayUtc = new Date(
    Date.UTC(
      nowUtc.getUTCFullYear(),
      nowUtc.getUTCMonth(),
      nowUtc.getUTCDate(),
      utcHour, 0, 0, 0
    )
  );

  if (nowUtc < estMidnightTodayUtc) {
    return rawDays - 1 + testDayOffset;
  }
  return rawDays + testDayOffset;
}

// Next Eastern midnight (UTC)
function getNextESTMidnightUTC() {
  const nowUtc = new Date();
  const utcHour = easternMidnightUtcHour();

  const estMidnightTodayUtc = new Date(
    Date.UTC(
      nowUtc.getUTCFullYear(),
      nowUtc.getUTCMonth(),
      nowUtc.getUTCDate(),
      utcHour, 0, 0, 0
    )
  );

  if (nowUtc >= estMidnightTodayUtc) {
    return new Date(estMidnightTodayUtc.getTime() + 86400000);
  }
  return estMidnightTodayUtc;
}

// ---------------- Seeded Random ----------------
function seededRandom(seed) {
  seed = (seed ^ 61) ^ (seed >> 16);
  seed += seed << 3;
  seed ^= seed >> 4;
  seed *= 0x27d4eb2d;
  seed ^= seed >> 15;
  return (seed >>> 0) / 4294967295;
}

function getBossOfTheDay() {
  const daySeed = daysSinceStart() + 1;
  return bosses[Math.floor(seededRandom(daySeed) * bosses.length)];
}

// ---------------- Utilities ----------------
function pad(num, size) {
  return String(num).padStart(size, '0');
}

function bossEmojiRow(boss) {
  return ['name', 'region', 'type', 'damage', 'Remembrance']
    .map(a => (boss[a] === target[a] ? '🟩' : '⬛'))
    .join('');
}

function copyResults(win) {
  const num = daysSinceStart();
  const header = `Bossdle ${pad(num + 1, 3)} ${win ? attempts.length : 'X'}/${GRID_SIZE}\n`;
  const gridStr = attempts.map(bossEmojiRow).join('\n');
  navigator.clipboard.writeText(header + gridStr);
}

// ---------------- DOM Elements ----------------
const gridEl = document.getElementById('grid');
const inputEl = document.getElementById('guess-input');
const btnEl = document.getElementById('guess-btn');
const feedbackEl = document.getElementById('feedback');
const bossdleDayEl = document.getElementById('today-date');
const answerRevealEl = document.getElementById('answer-reveal');
const answerNameEl = document.getElementById('answer-name');
const overlay = document.getElementById('win-overlay');
const countdownEl = document.getElementById('overlay-countdown');

// ---------------- Exploit Fix ----------------
function setInputsEnabled(enabled) {
  inputEl.disabled = !enabled;
  btnEl.disabled = !enabled;
  if (!enabled) inputEl.value = '';
}

// ---------------- Load Boss Data ----------------
fetch('bosses.json')
  .then(r => r.json())
  .then(data => {
    bosses = data;
    populateDatalist();
    checkForNewDay();
    attempts = JSON.parse(localStorage.getItem(ATTEMPTS_KEY) || '[]');
    target = getBossOfTheDay();
    initializeGame();
    startDailyCheck();
  });

function populateDatalist() {
  const list = document.getElementById('bosses-list');
  bosses.forEach(b => {
    const opt = document.createElement('option');
    opt.value = b.name;
    list.appendChild(opt);
  });
}

// ---------------- Stats ----------------
function loadStats() {
  const stats = JSON.parse(localStorage.getItem(STATS_KEY) || '{}');
  document.getElementById('streak').textContent = stats.streak || 0;
  document.getElementById('wins').textContent = stats.wins || 0;
  document.getElementById('played').textContent = stats.played || 0;
}

function saveStats(win) {
  if (testMode) return;
  const stats = JSON.parse(localStorage.getItem(STATS_KEY) || '{}');
  stats.played = (stats.played || 0) + 1;
  stats.wins = stats.wins || 0;
  stats.streak = stats.streak || 0;
  if (win) {
    stats.wins++;
    stats.streak++;
  } else {
    stats.streak = 0;
  }
  localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  loadStats();
}

// ---------------- Game Init ----------------
function initializeGame() {
  loadStats();

  gridEl.innerHTML = '';
  overlay.classList.add('hidden');
  answerRevealEl.classList.add('hidden');

  makeHeaderRow();

  // Restore previous guesses
  attempts.forEach(a => drawGridRow(a, false));

  const guessedCorrectly = attempts.some(a => a.name === target.name);

  if (guessedCorrectly) {
    gameOver = true;
    setInputsEnabled(false);
    showWinOverlay(true, true);
  } 
  else if (attempts.length >= GRID_SIZE) {
    gameOver = true;
    setInputsEnabled(false);
    answerNameEl.textContent = target.name;
    answerRevealEl.classList.remove('hidden');
    showWinOverlay(false, true);
  } 
  else {
    gameOver = false;
    setInputsEnabled(true);

    // ✅ only add ONE empty row
    if (!gridEl.querySelector('.empty-row')) {
      addEmptyRow();
    }
  }

  feedbackEl.textContent = '';
  updateBossdleDayLabel();
}


// ---------------- Daily Reset ----------------
function checkForNewDay() {
  const today = daysSinceStart();
  const last = parseInt(localStorage.getItem(LAST_DATE_KEY) || '-1', 10);

  if (today !== last || testMode) {
    attempts = [];
    localStorage.setItem(ATTEMPTS_KEY, '[]');
    localStorage.setItem(LAST_DATE_KEY, today.toString());
    target = getBossOfTheDay();
    gameOver = false;
    overlay.classList.add('hidden');
    answerRevealEl.classList.add('hidden');
    setInputsEnabled(true);
    initializeGame();
  }
}

// ---------------- Grid ----------------
function makeHeaderRow() {
  const row = document.createElement('div');
  row.className = 'attr-grid header-row';
  ['Name', 'Region', 'Type', 'Damage', 'Remembrance'].forEach(t => {
    const c = document.createElement('div');
    c.className = 'attr-header';
    c.textContent = t;
    row.appendChild(c);
  });
  gridEl.appendChild(row);
}

function addEmptyRow() {
  if (gameOver) return;

  if (gridEl.querySelector('.empty-row')) return;

  const row = document.createElement('div');
  row.className = 'guess-row empty-row';

  for (let i = 0; i < 5; i++) {
    const c = document.createElement('div');
    c.className = 'guess-cell bad';
    c.textContent = '—';
    row.appendChild(c);
  }

  gridEl.appendChild(row);
}


function drawGridRow(boss, save = true) {
  const row = document.createElement('div');
  row.className = 'guess-row';

  ['name', 'region', 'type', 'damage', 'Remembrance'].forEach(attr => {
    const c = document.createElement('div');
    c.className = 'guess-cell';

    let displayValue = boss[attr];

    // 🔥 Convert boolean → Yes / No (display only)
    if (attr === 'Remembrance') {
      displayValue = boss[attr] ? 'Yes' : 'No';
    }

    c.textContent = displayValue;
    c.classList.add(boss[attr] === target[attr] ? 'good' : 'bad');
    row.appendChild(c);
  });

  // Insert before empty row if it exists (keeps layout correct)
  const emptyRow = gridEl.querySelector('.empty-row');
  if (emptyRow) {
    gridEl.insertBefore(row, emptyRow);
  } else {
    gridEl.appendChild(row);
  }

  if (save) {
    attempts.push(boss);
    localStorage.setItem(ATTEMPTS_KEY, JSON.stringify(attempts));
  }
}



// ---------------- Guess Handling ----------------
function handleGuess() {
  if (gameOver) return;

  const guess = inputEl.value.trim().toLowerCase();
  const boss = bosses.find(b => b.name.toLowerCase() === guess);

  if (!boss) {
    feedbackEl.textContent = 'Not a valid boss name.';
    return;
  }
  if (attempts.some(a => a.name === boss.name)) {
    feedbackEl.textContent = 'Already guessed.';
    return;
  }

  drawGridRow(boss);
  inputEl.value = '';
  feedbackEl.textContent = '';

  if (boss.name === target.name) {
    gameOver = true;
    setInputsEnabled(false);
    saveStats(true);
    showWinOverlay(true);
  } else if (attempts.length >= GRID_SIZE) {
    gameOver = true;
    setInputsEnabled(false);
    answerNameEl.textContent = target.name;
    answerRevealEl.classList.remove('hidden');
    saveStats(false);
    showWinOverlay(false);
  } else {
    addEmptyRow();
  }
}

// ---------------- Overlay ----------------
document.getElementById('win-close').onclick = () => overlay.classList.add('hidden');

function showWinOverlay(win, fromStorage = false) {
  overlay.classList.remove('hidden');

  const title = document.getElementById('overlay-title');
  const text = document.getElementById('overlay-text');
  const shareBtn = document.getElementById('overlay-share');

  // 🔥 RESET old classes
  title.classList.remove('win', 'loss');
  text.classList.remove('win', 'loss');

  // 🔥 APPLY correct class
  title.classList.add(win ? 'win' : 'loss');
  text.classList.add(win ? 'win' : 'loss');

  title.textContent = win ? 'You Win!' : 'You Lose!';

  const rowsContent = attempts.map(a => bossEmojiRow(a)).join('<br>');

text.innerHTML = win
  ? `You guessed <strong>${target.name}</strong>!<br>${rowsContent}`
  : `The boss was <strong>${target.name}</strong><br>${rowsContent}`;


  shareBtn.style.display = 'inline-block';
  shareBtn.onclick = () => copyResults(win);

  startCountdownTimer();
}


// ---------------- Countdown ----------------
function startCountdownTimer() {
  clearInterval(countdownInterval);
  countdownInterval = setInterval(() => {
    const diff = getNextESTMidnightUTC() - new Date();
    if (diff <= 0) return;
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    countdownEl.textContent = `Next Bossdle in ${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)}`;
  }, 1000);
}

// ---------------- Label & Events ----------------
function updateBossdleDayLabel() {
  bossdleDayEl.textContent = `Bossdle: ${pad(daysSinceStart() + 1, 3)}`;
}

btnEl.addEventListener('click', handleGuess);
inputEl.addEventListener('keydown', e => e.key === 'Enter' && handleGuess());

function startDailyCheck() {
  setInterval(checkForNewDay, 60000);
}
