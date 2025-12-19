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

// ---------------- Timezone Helpers (DST-safe) ----------------
const EASTERN_TZ = 'America/New_York';

// Returns "YYYY-MM-DD" for the given Date in America/New_York (handles DST correctly)
function easternYMD(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: EASTERN_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);

  const y = parts.find(p => p.type === 'year').value;
  const m = parts.find(p => p.type === 'month').value;
  const d = parts.find(p => p.type === 'day').value;
  return `${y}-${m}-${d}`;
}

// Counts whole-day difference between two Eastern YMD strings
function daysBetweenEastern(startYMD, endYMD) {
  // Interpret YMD as UTC midnights solely for stable day counting (no DST issues)
  const start = new Date(`${startYMD}T00:00:00Z`);
  const end = new Date(`${endYMD}T00:00:00Z`);
  return Math.floor((end - start) / 86400000);
}

// Converts an Eastern local wall-clock time (YYYY-MM-DD + HH:MM:SS) to a real UTC Date
function easternWallTimeToUTC(ymd, hh = 0, mm = 0, ss = 0) {
  // Step 1: Build a Date as if that wall time were UTC
  const naiveUTC = new Date(Date.UTC(
    parseInt(ymd.slice(0, 4), 10),
    parseInt(ymd.slice(5, 7), 10) - 1,
    parseInt(ymd.slice(8, 10), 10),
    hh, mm, ss, 0
  ));

  // Step 2: Figure out what wall time that naiveUTC corresponds to in Eastern
  const easternAtNaive = new Date(naiveUTC.toLocaleString('en-US', { timeZone: EASTERN_TZ }));

  // Step 3: Offset between naive and "interpreted eastern" gives the correction to real UTC
  const correctionMs = naiveUTC.getTime() - easternAtNaive.getTime();

  // Step 4: Apply correction
  return new Date(naiveUTC.getTime() + correctionMs);
}

// Next Eastern midnight, as a UTC Date (DST-safe)
function getNextESTMidnightUTC() {
  const now = new Date();

  // tomorrow's date in Eastern
  const nowEastern = new Date(now.toLocaleString('en-US', { timeZone: EASTERN_TZ }));
  nowEastern.setDate(nowEastern.getDate() + 1);
  const tomorrowYMD = easternYMD(nowEastern);

  // Eastern midnight at start of tomorrow
  return easternWallTimeToUTC(tomorrowYMD, 0, 0, 0);
}

// ---------------- Time & Seeded Random ----------------
// Start date anchored to Eastern calendar day.
// (Keeping your original startDate literal; day counting below is based on Eastern YMD.)
const startDate = new Date('2025-10-17T00:00:00-04:00');

// Days since start, synced to Eastern midnight (DST-safe)
function daysSinceStart() {
  const startYMD = easternYMD(startDate);
  const todayYMD = easternYMD(new Date());
  return daysBetweenEastern(startYMD, todayYMD) + testDayOffset;
}

function seededRandom(seed) {
  seed = (seed ^ 61) ^ (seed >> 16);
  seed = seed + (seed << 3);
  seed = seed ^ (seed >> 4);
  seed = seed * 0x27d4eb2d;
  seed = seed ^ (seed >> 15);
  return (seed >>> 0) / 4294967295;
}

function getBossOfTheDay() {
  const daySeed = daysSinceStart();
  const index = Math.floor(seededRandom(daySeed) * bosses.length);
  return bosses[index];
}

// ---------------- Utilities ----------------
function pad(num, size) {
  let s = "000" + num;
  return s.substr(s.length - size);
}

function bossEmojiRow(boss) {
  return ['name', 'region', 'type', 'damage', 'Remembrance'].map(attr => {
    return boss[attr] === target[attr] ? '🟩' : '⬛';
  }).join('');
}

function copyResults(win) {
  const num = daysSinceStart();
  const header = `Bossdle ${pad(num + 1, 3)} ${win ? attempts.length : 'X'}/${GRID_SIZE}\n`;
  const gridStr = attempts.map(a => bossEmojiRow(a)).join('\n');
  navigator.clipboard.writeText(header + gridStr).then(() => alert('Copied to clipboard!'));
}

// ---------------- DOM Elements ----------------
const gridEl = document.getElementById('grid');
const inputEl = document.getElementById('guess-input');
const btnEl = document.getElementById('guess-btn');
const feedbackEl = document.getElementById('feedback');
const bossdleDayEl = document.getElementById('bossdle-day');
const answerRevealEl = document.getElementById('answer-reveal');
const answerNameEl = document.getElementById('answer-name');
const overlay = document.getElementById('win-overlay');
const countdownEl = document.getElementById('overlay-countdown');

// ---------------- Exploit Fix (Option 2) ----------------
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

    if (!target) target = getBossOfTheDay();

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
  stats.streak = stats.streak || 0;
  stats.wins = stats.wins || 0;
  stats.played = stats.played || 0;
  stats.played++;
  if (win) { stats.wins++; stats.streak++; }
  else stats.streak = 0;
  localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  loadStats();
}

// ---------------- Game Initialization ----------------
function initializeGame() {
  loadStats();
  gridEl.innerHTML = '';
  makeHeaderRow();

  attempts.forEach(a => drawGridRow(a, false));

  const guessedCorrectly = attempts.some(a => a.name === target?.name);

  if (guessedCorrectly) {
    gameOver = true;
    setInputsEnabled(false); // ✅ lock
    removeEmptyRows();
    showWinOverlay(true, true);
  } else if (attempts.length >= GRID_SIZE) {
    gameOver = true;
    setInputsEnabled(false); // ✅ lock
    removeEmptyRows();
    answerNameEl.textContent = target?.name || '';
    answerRevealEl.classList.remove('hidden');
    showWinOverlay(false, true);
  } else if (attempts.length === 0) {
    gameOver = false;
    setInputsEnabled(true); // ✅ allow play
    addEmptyRow();
  } else {
    gameOver = false;
    setInputsEnabled(true); // ✅ allow play
    const lastRow = gridEl.querySelector('.guess-row:last-child');
    if (lastRow && ![...lastRow.children].some(cell => cell.textContent.includes('—'))) {
      addEmptyRow();
    }
  }

  feedbackEl.textContent = '';
  updateBossdleDayLabel();
}

// ---------------- Daily Reset ----------------
function checkForNewDay() {
  const currentDay = daysSinceStart();
  const lastDayPlayed = parseInt(localStorage.getItem(LAST_DATE_KEY) || "-1");
  if (currentDay !== lastDayPlayed || testMode) {
    attempts = [];
    localStorage.setItem(ATTEMPTS_KEY, JSON.stringify([]));
    localStorage.setItem(LAST_DATE_KEY, currentDay.toString());
    target = getBossOfTheDay();
    gameOver = false;
    setInputsEnabled(true); // ✅ re-enable on new day
  }
}

// ---------------- Grid Rendering ----------------
function removeEmptyRows() {
  const emptyRows = gridEl.querySelectorAll('.empty-row');
  emptyRows.forEach(r => r.remove());
}

function makeHeaderRow() {
  if (gridEl.querySelector('.header-row')) return;
  const row = document.createElement('div');
  row.className = 'attr-grid header-row';
  ['Name', 'Region', 'Type', 'Damage', 'Remembrance'].forEach(text => {
    const cell = document.createElement('div');
    cell.className = 'attr-header';
    cell.textContent = text;
    row.appendChild(cell);
  });
  gridEl.appendChild(row);
}

function addEmptyRow() {
  if (gameOver) return;
  const row = document.createElement('div');
  row.classList.add('guess-row', 'empty-row');
  row.style.marginTop = '16px';
  for (let i = 0; i < 5; i++) {
    const cell = document.createElement('div');
    cell.classList.add('guess-cell', 'bad');
    cell.textContent = '—';
    row.appendChild(cell);
  }
  gridEl.appendChild(row);
}

function drawGridRow(boss, save = true) {
  let row = gridEl.querySelector('.empty-row');
  if (!row) {
    row = document.createElement('div');
    row.classList.add('guess-row');
    gridEl.appendChild(row);
  }
  row.classList.remove('empty-row');
  row.innerHTML = '';

  ['name', 'region', 'type', 'damage', 'Remembrance'].forEach(attr => {
    const cell = document.createElement('div');
    cell.classList.add('guess-cell');
    let val = boss[attr];
    if (typeof val === 'boolean') val = val ? 'Yes' : 'No';
    cell.textContent = val;

    if (boss[attr] === target[attr]) cell.classList.add('good');
    else if (
      boss[attr] &&
      target[attr] &&
      String(boss[attr]).toLowerCase() === String(target[attr]).toLowerCase()
    )
      cell.classList.add('semi');
    else cell.classList.add('bad');

    row.appendChild(cell);
  });

  if (save) {
    attempts.push(boss);
    if (!testMode) localStorage.setItem(ATTEMPTS_KEY, JSON.stringify(attempts));
  }
}

// ---------------- Guess Handling ----------------
function handleGuess() {
  // ✅ extra safety: if game is over, ignore guesses (even if someone triggers via console)
  if (gameOver) return;

  const guess = inputEl.value.trim().toLowerCase();
  const boss = bosses.find(b => b.name.toLowerCase() === guess);
  if (!boss) {
    feedbackEl.textContent = 'Not a valid boss name.';
    return;
  }
  if (attempts.some(a => a.name === boss.name)) {
    feedbackEl.textContent = 'You already guessed that boss!';
    return;
  }

  drawGridRow(boss);
  inputEl.value = '';
  feedbackEl.textContent = '';

  if (boss.name === target.name) {
    gameOver = true;
    setInputsEnabled(false); // ✅ lock on win
    saveStats(true);
    removeEmptyRows();
    showWinOverlay(true);
    return;
  }

  if (attempts.length >= GRID_SIZE) {
    gameOver = true;
    setInputsEnabled(false); // ✅ lock on loss
    answerNameEl.textContent = target.name;
    answerRevealEl.classList.remove('hidden');
    saveStats(false);
    removeEmptyRows();
    showWinOverlay(false);
    return;
  }

  const lastRow = gridEl.querySelector('.guess-row:last-child');
  if (lastRow && ![...lastRow.children].some(cell => cell.textContent.includes('—'))) {
    addEmptyRow();
  }
}

// ---------------- Overlay ----------------
document.getElementById('win-close').onclick = () => overlay.classList.add('hidden');

function showWinOverlay(win, fromStorage = false) {
  overlay.classList.remove('hidden');
  const text = document.getElementById('overlay-text');
  const title = document.getElementById('overlay-title');
  const shareBtn = document.getElementById('overlay-share');

  title.textContent = win ? 'You Win!' : 'You Lose!';
  title.classList.remove('win', 'loss');
  text.classList.remove('win', 'loss');

  if (win) { title.classList.add('win'); text.classList.add('win'); }
  else { title.classList.add('loss'); text.classList.add('loss'); }

  const rowsContent = attempts.map(a => bossEmojiRow(a)).join('<br>');
  text.innerHTML = win
    ? `You guessed <strong>${target.name}</strong>!<br>${rowsContent}`
    : `The boss was <strong>${target.name}</strong><br>${rowsContent}`;

  shareBtn.style.display = 'inline-block';
  shareBtn.onclick = () => copyResults(win);

  if (!testMode) startCountdownTimer();

  if (win && !fromStorage) {
    const rows = gridEl.querySelectorAll('.guess-row');
    const winningRow = Array.from(rows).reverse().find(r =>
      Array.from(r.children).some(c => c.classList.contains('good'))
    );
    if (winningRow) {
      const cells = winningRow.querySelectorAll('.guess-cell');
      cells.forEach((cell, i) => {
        cell.style.animationDelay = `${i * 0.1}s`;
        cell.classList.add('wave-cell');
      });
    }
  }
}

// ---------------- Countdown Timer ----------------
function startCountdownTimer() {
  if (countdownInterval) clearInterval(countdownInterval);

  function updateCountdown() {
    const nowUtc = new Date();
    const nextMidnight = getNextESTMidnightUTC();

    const diff = nextMidnight - nowUtc;
    if (diff <= 0) {
      countdownEl.textContent = 'A new Bossdle is available!';
      clearInterval(countdownInterval);
      return;
    }

    const hrs = Math.floor(diff / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    const secs = Math.floor((diff % 60000) / 1000);

    countdownEl.textContent = `Next Bossdle in ${pad(hrs, 2)}:${pad(mins, 2)}:${pad(secs, 2)}`;
  }

  updateCountdown();
  countdownInterval = setInterval(updateCountdown, 1000);
}

// ---------------- Bossdle Day Label ----------------
function updateBossdleDayLabel() {
  const dayNum = daysSinceStart();
  bossdleDayEl.textContent = `Bossdle: ${pad(dayNum + 1, 3)}`;
}

// ---------------- Event Listeners ----------------
btnEl.addEventListener('click', handleGuess);
inputEl.addEventListener('keyup', e => { if (e.key === 'Enter') handleGuess(); });

// ---------------- Automatic Daily Check ----------------
function startDailyCheck() {
  checkForNewDay();
  setInterval(checkForNewDay, 60 * 1000);
}