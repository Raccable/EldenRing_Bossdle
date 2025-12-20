// ================================
// Elden Ring: Bossdle — PRODUCTION
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
let countdownInterval = null;

// ---------------- Time Helpers (GLOBAL, CORRECT) ----------------
const startDate = new Date('2025-10-17T00:00:00-04:00');
const EASTERN_TZ = 'America/New_York';

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

function daysBetweenYMD(startYMD, endYMD) {
  const start = new Date(`${startYMD}T00:00:00Z`);
  const end = new Date(`${endYMD}T00:00:00Z`);
  return Math.floor((end - start) / 86400000);
}

function daysSinceStart() {
  const startYMD = easternYMD(startDate);
  const todayYMD = easternYMD(new Date());
  return daysBetweenYMD(startYMD, todayYMD);
}

function parseGmtOffsetToMinutes(gmtString) {
  const m = /^GMT([+-])(\d{1,2})(?::(\d{2}))?$/.exec(gmtString);
  if (!m) return 0;

  const sign = m[1] === '-' ? -1 : 1;
  const hours = parseInt(m[2], 10);
  const mins = m[3] ? parseInt(m[3], 10) : 0;
  return sign * (hours * 60 + mins);
}

function easternOffsetMinutesForYMD(y, m, d) {
  const probe = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: EASTERN_TZ,
    timeZoneName: 'shortOffset',
    hour: '2-digit'
  }).formatToParts(probe);

  const tz = parts.find(p => p.type === 'timeZoneName')?.value || 'GMT+0';
  return parseGmtOffsetToMinutes(tz);
}

function easternMidnightUTCDate(y, m, d) {
  const offsetMin = easternOffsetMinutesForYMD(y, m, d);
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0) - offsetMin * 60000);
}

function getNextESTMidnightUTC() {
  const todayYMD = easternYMD(new Date());
  const todayNoonUTC = new Date(`${todayYMD}T12:00:00Z`);
  const tomorrowNoonUTC = new Date(todayNoonUTC.getTime() + 86400000);
  const [y, m, d] = easternYMD(tomorrowNoonUTC).split('-').map(Number);
  return easternMidnightUTCDate(y, m, d);
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

// ---------------- Input Lock ----------------
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

// ---------------- Datalist ----------------
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
  const stats = JSON.parse(localStorage.getItem(STATS_KEY) || '{}');
  stats.played = (stats.played || 0) + 1;
  stats.wins = stats.wins || 0;
  stats.streak = stats.streak || 0;
  win ? (stats.wins++, stats.streak++) : (stats.streak = 0);
  localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  loadStats();
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
  if (gameOver || gridEl.querySelector('.empty-row')) return;
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
    c.textContent = attr === 'Remembrance' ? (boss[attr] ? 'Yes' : 'No') : boss[attr];
    c.classList.add(boss[attr] === target[attr] ? 'good' : 'bad');
    row.appendChild(c);
  });

  const emptyRow = gridEl.querySelector('.empty-row');
  emptyRow ? gridEl.insertBefore(row, emptyRow) : gridEl.appendChild(row);

  if (save) {
    attempts.push(boss);
    localStorage.setItem(ATTEMPTS_KEY, JSON.stringify(attempts));
  }
}

// ---------------- Init ----------------
function initializeGame() {
  loadStats();
  gridEl.innerHTML = '';
  overlay.classList.add('hidden');
  answerRevealEl.classList.add('hidden');

  makeHeaderRow();
  attempts.forEach(a => drawGridRow(a, false));

  const won = attempts.some(a => a.name === target.name);

  if (won || attempts.length >= GRID_SIZE) {
    gameOver = true;
    setInputsEnabled(false);
    if (!won) {
      answerNameEl.textContent = target.name;
      answerRevealEl.classList.remove('hidden');
    }
    showWinOverlay(won);
  } else {
    gameOver = false;
    setInputsEnabled(true);
    addEmptyRow();
  }

  feedbackEl.textContent = '';
  updateBossdleDayLabel();
}

// ---------------- Guess ----------------
function handleGuess() {
  if (gameOver) return;

  const guess = inputEl.value.trim().toLowerCase();
  const boss = bosses.find(b => b.name.toLowerCase() === guess);

  if (!boss || attempts.some(a => a.name === boss.name)) {
    feedbackEl.textContent = 'Invalid guess.';
    return;
  }

  drawGridRow(boss);
  inputEl.value = '';

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

function showWinOverlay(win) {
  overlay.classList.remove('hidden');
  const title = document.getElementById('overlay-title');
  const text = document.getElementById('overlay-text');
  const shareBtn = document.getElementById('overlay-share');

  title.textContent = win ? 'You Win!' : 'You Lose!';
  title.className = win ? 'win' : 'loss';

  const rows = attempts.map(bossEmojiRow).join('<br>');
  text.innerHTML = win
    ? `You guessed <strong>${target.name}</strong>!<br>${rows}`
    : `The boss was <strong>${target.name}</strong><br>${rows}`;

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

// ---------------- Daily Reset ----------------
function checkForNewDay() {
  const today = daysSinceStart();
  const last = parseInt(localStorage.getItem(LAST_DATE_KEY) || '-1', 10);

  if (today !== last) {
    attempts = [];
    localStorage.setItem(ATTEMPTS_KEY, '[]');
    localStorage.setItem(LAST_DATE_KEY, today.toString());
    target = getBossOfTheDay();
    gameOver = false;
    initializeGame();
  }
}

function startDailyCheck() {
  setInterval(checkForNewDay, 60000);
}

// ---------------- Label ----------------
function updateBossdleDayLabel() {
  bossdleDayEl.textContent = `Bossdle: ${pad(daysSinceStart() + 1, 3)}`;
}

// ---------------- Events ----------------
btnEl.addEventListener('click', handleGuess);
inputEl.addEventListener('keydown', e => e.key === 'Enter' && handleGuess());