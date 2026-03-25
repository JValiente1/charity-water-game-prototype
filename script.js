const GOAL_SCORE = 20;
const GAME_DURATION = 30;
const MAX_LEVEL = 10;
// Per-level spawn delays in ms.
// Levels 2-10 increase steadily without sudden jumps.
const LEVEL_SPAWN_DELAY_MS = [
  900, // level 1
  835, // level 2
  780, // level 3
  730, // level 4
  685, // level 5
  645, // level 6
  610, // level 7
  580, // level 8
  550, // level 9
  520  // level 10
];
const MISSED_CAN_PENALTY = 1;
const MISSED_CLICK_PENALTY = 1;
const BEST_SCORE_KEY = 'water-quest-best-score';
const FEEDBACK_DURATION = 1100;
const winningMessages = [
  'You did it. Every can collected helps move clean water closer to communities in need.',
  'Strong finish. You hit the goal and completed the Water Quest.',
  'Mission complete. That was a winning run for clean water.'
];
const losingMessages = [
  'Time is up. Give it another run and see if you can reach 20.',
  'Close, but not there yet. Try again and collect cans faster.',
  'The quest is not over. Restart and push for a higher score.'
];

let currentScore = 0;
let timeLeft = GAME_DURATION;
let currentLevel = 1;
let gameActive = false;
let spawnTimeout;
let timerInterval;
let activeCanButton = null;
let activeCanCell = null;
let activeCanCollected = true;
let bestScore = getStoredBestScore();
let comboStreak = 0;
let feedbackTimeout;
let audioContext;
let scoreFlashTimeout;
let timerFlashTimeout;
let nextLevelReady = false;
let gamePaused = false;
let pausedTimeLeft = 0;
let lostOnLevel = 1;
let missClickGraceUntil = 0;
let spawnSequence = 0;
let confettiLoopInterval;
let levelTransitionTimeout;

const grid = document.querySelector('.game-grid');
const levelDisplay = document.getElementById('level-count');
const scoreDisplay = document.getElementById('current-cans');
const goalDisplay = document.getElementById('goal-score');
const comboDisplay = document.getElementById('combo-count');
const bestScoreDisplay = document.getElementById('best-score');
const timerDisplay = document.getElementById('timer');
const levelCard = document.getElementById('level-card');
const scoreCard = document.getElementById('score-card');
const comboCard = document.getElementById('combo-card');
const timerCard = document.getElementById('timer-card');
const messageDisplay = document.getElementById('achievements');
const confettiLayer = document.getElementById('confetti-layer');
const levelTransition = document.getElementById('level-transition');
const startOverlay = document.getElementById('start-overlay');
const endOverlay = document.getElementById('end-overlay');
const endOverlayTag = document.getElementById('end-overlay-tag');
const endOverlayTitle = document.getElementById('end-overlay-title');
const endOverlayMessage = document.getElementById('end-overlay-message');
const endOverlayLink = document.getElementById('end-overlay-link');
const overlayStartButton = document.getElementById('overlay-start-button');
const overlayRestartButton = document.getElementById('overlay-restart-button');
const pauseOverlay = document.getElementById('pause-overlay');
const overlayResumeButton = document.getElementById('overlay-resume-button');

goalDisplay.textContent = GOAL_SCORE;
bestScoreDisplay.textContent = bestScore;
comboDisplay.textContent = comboStreak;
levelDisplay.textContent = currentLevel;

function getStoredBestScore() {
  const storedValue = window.localStorage.getItem(BEST_SCORE_KEY);
  const parsedValue = Number.parseInt(storedValue ?? '0', 10);

  return Number.isNaN(parsedValue) ? 0 : parsedValue;
}

function setBestScore(score) {
  bestScore = score;
  bestScoreDisplay.textContent = bestScore;
  window.localStorage.setItem(BEST_SCORE_KEY, String(bestScore));
}

function createGrid() {
  grid.innerHTML = '';
  grid.setAttribute('role', 'grid');

  for (let index = 0; index < 9; index += 1) {
    const cell = document.createElement('div');
    cell.className = 'grid-cell';
    cell.setAttribute('role', 'gridcell');
    grid.appendChild(cell);
  }
}

function updateStats() {
  levelDisplay.textContent = currentLevel;
  scoreDisplay.textContent = currentScore;
  comboDisplay.textContent = comboStreak;
  bestScoreDisplay.textContent = bestScore;
  timerDisplay.textContent = timeLeft;
}

function showMessage(message, resultType = '', persist = false) {
  clearTimeout(feedbackTimeout);
  messageDisplay.textContent = message;
  messageDisplay.className = `achievement ${resultType}`.trim();

  if (!persist) {
    feedbackTimeout = window.setTimeout(() => {
      if (!gameActive) {
        return;
      }

      messageDisplay.textContent = 'Build a streak to earn combo bonus points.';
      messageDisplay.className = 'achievement';
    }, FEEDBACK_DURATION);
  }
}

function applyScoreChange(points) {
  currentScore = Math.max(0, currentScore + points);
  updateStats();
  pulseStatCard(scoreCard, points >= 0 ? 'stat-hit' : 'stat-miss', 'score');
}

function pulseStatCard(element, className, type) {
  if (!element) {
    return;
  }

  const timeoutKey = type === 'timer' ? 'timer' : 'score';
  const timeoutId = timeoutKey === 'timer' ? timerFlashTimeout : scoreFlashTimeout;

  clearTimeout(timeoutId);
  element.classList.remove('stat-hit', 'stat-miss', 'stat-alert');
  void element.offsetWidth;
  element.classList.add(className);

  const nextTimeout = window.setTimeout(() => {
    element.classList.remove(className);
  }, 320);

  if (timeoutKey === 'timer') {
    timerFlashTimeout = nextTimeout;
  } else {
    scoreFlashTimeout = nextTimeout;
  }
}

function updateTimerState() {
  timerCard.classList.toggle('stat-urgent', timeLeft <= 10 && gameActive);

  if (timeLeft <= 10 && gameActive) {
    pulseStatCard(timerCard, 'stat-alert', 'timer');
  }
}

function clearConfetti() {
  clearInterval(confettiLoopInterval);
  confettiLoopInterval = null;

  if (typeof window.confetti === 'function' && typeof window.confetti.reset === 'function') {
    window.confetti.reset();
  }

  confettiLayer.innerHTML = '';
  confettiLayer.classList.remove('is-active');
}

function clearLevelTransition() {
  clearTimeout(levelTransitionTimeout);
  levelTransition.textContent = '';
  levelTransition.classList.remove('is-visible');
}

function showLevelTransition(level) {
  clearLevelTransition();
  levelTransition.textContent = `Level ${level}`;
  levelTransition.classList.add('is-visible');

  levelTransitionTimeout = window.setTimeout(() => {
    levelTransition.classList.remove('is-visible');
  }, 900);
}

function launchFallbackConfetti() {
  clearConfetti();
  confettiLayer.classList.add('is-active');

  for (let index = 0; index < 42; index += 1) {
    const piece = document.createElement('span');
    const variants = ['pill', 'square', 'streamer'];
    const variant = variants[index % variants.length];

    piece.className = `confetti-piece confetti-${variant}`;
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.animationDelay = `${Math.random() * 0.35}s`;
    piece.style.animationDuration = `${2.4 + Math.random() * 1.2}s`;
    piece.style.setProperty('--confetti-drift', `${(Math.random() * 2) - 1}`);
    piece.style.setProperty('--confetti-spin', `${360 + Math.random() * 540}deg`);
    piece.style.setProperty('--confetti-sway', `${12 + Math.random() * 24}px`);
    piece.style.background = ['#ffc907', '#2e9df7', '#8bd1cb', '#ff902a', '#f16061'][index % 5];
    confettiLayer.appendChild(piece);
  }

}

function launchConfetti() {
  const canUseCanvasConfetti = typeof window.confetti === 'function';

  if (!canUseCanvasConfetti) {
    launchFallbackConfetti();
    return;
  }

  clearConfetti();

  const colors = ['#ffc907', '#2e9df7', '#8bd1cb', '#ff902a', '#f16061'];

  const fireBurst = () => {
    if (gameActive || !endOverlay.classList.contains('is-visible')) {
      return;
    }

    window.confetti({
      particleCount: 85,
      startVelocity: 56,
      spread: 118,
      ticks: 260,
      gravity: 0.84,
      scalar: 1.32,
      drift: -0.2,
      origin: { x: 0.15, y: 0.62 },
      colors,
      shapes: ['square', 'circle', 'star'],
      zIndex: 7,
      disableForReducedMotion: true
    });

    window.confetti({
      particleCount: 85,
      startVelocity: 56,
      spread: 118,
      ticks: 260,
      gravity: 0.84,
      scalar: 1.32,
      drift: 0.2,
      origin: { x: 0.85, y: 0.62 },
      colors,
      shapes: ['square', 'circle', 'star'],
      zIndex: 7,
      disableForReducedMotion: true
    });

    window.confetti({
      particleCount: 36,
      startVelocity: 48,
      spread: 130,
      ticks: 250,
      gravity: 0.9,
      scalar: 1.22,
      origin: { x: 0.5, y: 0.2 },
      colors,
      shapes: ['circle', 'star'],
      zIndex: 7,
      disableForReducedMotion: true
    });
  };

  fireBurst();
  confettiLoopInterval = window.setInterval(fireBurst, 520);
}

function clearGrid() {
  document.querySelectorAll('.grid-cell').forEach(cell => {
    cell.innerHTML = '';
    cell.classList.remove('active-target');
  });

  activeCanButton = null;
  activeCanCell = null;
}

function pickRandomMessage(messages) {
  const randomIndex = Math.floor(Math.random() * messages.length);
  return messages[randomIndex];
}

function ensureAudioContext() {
  if (!audioContext) {
    audioContext = new window.AudioContext();
  }

  if (audioContext.state === 'suspended') {
    audioContext.resume();
  }
}

function playTone(frequency, duration, type, volume) {
  if (!audioContext) {
    return;
  }

  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();
  const now = audioContext.currentTime;

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, now);
  gainNode.gain.setValueAtTime(volume, now);
  gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration);

  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);
  oscillator.start(now);
  oscillator.stop(now + duration);
}

function playHitSound() {
  playTone(560, 0.08, 'triangle', 0.045);
  playTone(720, 0.12, 'triangle', 0.03);
}

function playMissSound() {
  playTone(420, 0.06, 'triangle', 0.024);
  playTone(260, 0.12, 'sine', 0.03);
  playTone(180, 0.18, 'sine', 0.026);
}

function playWinSound() {
  if (!audioContext) {
    return;
  }

  const notes = [392, 523.25, 659.25, 783.99, 1046.5];

  notes.forEach((frequency, index) => {
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    const startTime = audioContext.currentTime + (index * 0.085);
    const duration = 0.22 + (index * 0.015);

    oscillator.type = index < 2 ? 'sawtooth' : 'square';
    oscillator.frequency.setValueAtTime(frequency, startTime);
    oscillator.frequency.linearRampToValueAtTime(frequency * 1.02, startTime + 0.06);

    gainNode.gain.setValueAtTime(0.0001, startTime);
    gainNode.gain.linearRampToValueAtTime(0.055 - (index * 0.005), startTime + 0.025);
    gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    oscillator.start(startTime);
    oscillator.stop(startTime + duration);
  });
}

function flashScreen(flashType) {
  return flashType;
}

function updateOverlayState(showStart, showEnd, showPause = false) {
  startOverlay.classList.toggle('is-visible', showStart);
  endOverlay.classList.toggle('is-visible', showEnd);
  pauseOverlay.classList.toggle('is-visible', showPause);

  if (showStart) {
    window.requestAnimationFrame(() => {
      overlayStartButton.focus();
    });
  }

  if (showEnd) {
    window.requestAnimationFrame(() => {
      overlayRestartButton.focus();
    });
  }

  if (showPause) {
    window.requestAnimationFrame(() => {
      overlayResumeButton.focus();
    });
  }
}

function pauseGame() {
  if (!gameActive || gamePaused) {
    return;
  }

  gamePaused = true;
  pausedTimeLeft = timeLeft;
  clearTimeout(spawnTimeout);
  clearInterval(timerInterval);
  updateOverlayState(false, false, true);
}

function resumeGame() {
  if (!gamePaused) {
    return;
  }

  gamePaused = false;
  timeLeft = pausedTimeLeft;
  updateOverlayState(false, false, false);
  startTimer();

  if (activeCanButton && !activeCanCollected) {
    focusActiveCan();
  } else {
    scheduleNextSpawn();
  }
}

function focusActiveCan() {
  if (!activeCanButton) {
    return;
  }

  window.requestAnimationFrame(() => {
    activeCanButton.focus();
  });
}

function resetCombo() {
  comboStreak = 0;
  updateStats();
  comboCard.classList.remove('stat-hit');
}

function getComboPoints() {
  return 1 + Math.floor(comboStreak / 3);
}

function clampLevel(level) {
  return Math.max(1, Math.min(MAX_LEVEL, level));
}

function registerSuccessfulHit() {
  comboStreak += 1;
  pulseStatCard(levelCard, 'stat-hit', 'score');
  pulseStatCard(comboCard, 'stat-hit', 'score');

  const awardedPoints = getComboPoints();
  applyScoreChange(awardedPoints);
  playHitSound();
  flashScreen('hit');

  if (awardedPoints > 1) {
    showMessage(`Combo x${comboStreak}. +${awardedPoints} points.`, 'highlight');
  } else {
    showMessage('Clean hit. Keep the streak alive.', 'highlight');
  }

  if (currentScore > bestScore) {
    setBestScore(currentScore);
    showMessage(`New best score: ${bestScore}.`, 'highlight');
  }

  if (currentScore >= GOAL_SCORE) {
    endGame(true);
  }
}

function registerPenalty(points, message) {
  resetCombo();
  applyScoreChange(-points);
  playMissSound();
  flashScreen('miss');
  showMessage(message, 'warning');
}

function getCurrentSpawnDelay() {
  const clampedLevel = clampLevel(currentLevel);
  return LEVEL_SPAWN_DELAY_MS[clampedLevel - 1];
}

function collectActiveCan() {
  if (!gameActive || !activeCanButton || !activeCanCell || activeCanCollected) {
    return false;
  }

  const collectedCell = activeCanCell;

  clearTimeout(spawnTimeout);
  activeCanCollected = true;
  activeCanButton = null;
  activeCanCell = null;
  registerSuccessfulHit();

  if (gameActive) {
    collectedCell.innerHTML = '';
    collectedCell.classList.remove('active-target');
    scheduleNextSpawn();
  }

  return true;
}

function scheduleNextSpawn() {
  if (!gameActive) {
    return;
  }

  // Ensure only one spawn timer is active at any time.
  clearTimeout(spawnTimeout);
  const sequence = ++spawnSequence;

  spawnTimeout = window.setTimeout(() => {
    if (sequence !== spawnSequence) {
      return;
    }

    spawnWaterCan();
  }, getCurrentSpawnDelay());
}

function registerMissedCan() {
  if (!gameActive || activeCanCollected || !activeCanButton) {
    return;
  }

  // Mark this can as closed out before clearing, so stale events do not count.
  activeCanCollected = true;
  missClickGraceUntil = Date.now() + 180;
  registerPenalty(MISSED_CAN_PENALTY, 'Missed can. Your streak is gone and your score drops.');
}

function spawnWaterCan() {
  if (!gameActive) {
    return;
  }

  // This callback is now active; cancel any stale timer handle.
  clearTimeout(spawnTimeout);

  const cells = document.querySelectorAll('.grid-cell');
  registerMissedCan();
  clearGrid();

  const randomCell = cells[Math.floor(Math.random() * cells.length)];
  const canButton = document.createElement('button');
  canButton.className = 'water-can';
  canButton.type = 'button';
  canButton.setAttribute('aria-label', 'Collect water can');
  canButton.setAttribute('title', 'Press Enter or Space to collect');

  activeCanButton = canButton;
  activeCanCell = randomCell;
  activeCanCollected = false;
  randomCell.classList.add('active-target');

  function handleCanInteraction(event) {
    event.stopPropagation();
    event.preventDefault();

    if (!gameActive) {
      return;
    }

    collectActiveCan();
  }

  canButton.addEventListener('pointerdown', handleCanInteraction);

  randomCell.appendChild(canButton);
  focusActiveCan();
  scheduleNextSpawn();
}

function endGame(playerWon = currentScore >= GOAL_SCORE) {
  currentLevel = clampLevel(currentLevel);
  const finishedAllLevels = playerWon && currentLevel >= MAX_LEVEL;
  const wonMilestoneLevel = playerWon && currentLevel % 5 === 0;
  const shouldShowWebsitePrompt = !playerWon || wonMilestoneLevel || finishedAllLevels;
  const endMessage = playerWon ? pickRandomMessage(winningMessages) : pickRandomMessage(losingMessages);

  gameActive = false;
  clearTimeout(spawnTimeout);
  clearTimeout(levelTransitionTimeout);
  clearInterval(timerInterval);
  clearTimeout(feedbackTimeout);

  if (currentScore > bestScore) {
    setBestScore(currentScore);
  }

  clearGrid();
  nextLevelReady = playerWon && currentLevel < MAX_LEVEL;
  showMessage(
    playerWon
      ? (finishedAllLevels ? 'Goal reached. You completed all 10 levels.' : 'Goal reached. You won this level.')
      : 'Round complete. Review your result and play again when ready.',
    playerWon ? 'win' : 'lose',
    true
  );
  endOverlayTag.textContent = playerWon ? `Level ${currentLevel} complete` : 'Try again';
  endOverlayTitle.textContent = playerWon ? (finishedAllLevels ? 'You beat Water Quest' : 'You won') : 'Time is up';
  endOverlayMessage.textContent = playerWon
    ? (finishedAllLevels
      ? `${endMessage} Amazing run. You cleared all 10 levels. Final score: ${currentScore}. Best score: ${bestScore}.`
      : `${endMessage} You reached the goal on level ${currentLevel}. Ready for level ${currentLevel + 1}?`)
    : `${endMessage} Final score: ${currentScore}. Best score: ${bestScore}.`;

  if (shouldShowWebsitePrompt) {
    endOverlayLink.classList.remove('is-hidden');
    endOverlayLink.style.display = 'block';
  } else {
    endOverlayLink.classList.add('is-hidden');
    endOverlayLink.style.display = 'none';
  }

  if (!playerWon) {
    lostOnLevel = currentLevel;
  }

  overlayRestartButton.textContent = playerWon
    ? (finishedAllLevels ? 'Play Again From Level 1' : `Start Level ${currentLevel + 1}`)
    : 'Skip and Play Again';
  updateOverlayState(false, true);

  if (playerWon) {
    playWinSound();
    flashScreen('hit');
    launchConfetti();
  } else {
    playMissSound();
    flashScreen('miss');
    clearConfetti();
  }
}

function startTimer() {
  timerInterval = setInterval(() => {
    timeLeft -= 1;
    updateStats();
    updateTimerState();

    if (timeLeft <= 0) {
      endGame();
    }
  }, 1000);
}

function startGame() {
  if (gameActive) {
    return;
  }

  ensureAudioContext();
  clearTimeout(spawnTimeout);
  spawnSequence += 1;
  clearTimeout(levelTransitionTimeout);
  clearInterval(timerInterval);
  clearTimeout(feedbackTimeout);
  clearConfetti();
  clearLevelTransition();

  const startingNextLevel = nextLevelReady;

  if (nextLevelReady) {
    currentLevel = clampLevel(currentLevel + 1);
  } else if (endOverlay.classList.contains('is-visible')) {
    // restart from the level the player lost on (or level 1 for a fresh start)
    currentLevel = lostOnLevel;
  }

  currentLevel = clampLevel(currentLevel);

  currentScore = 0;
  timeLeft = GAME_DURATION;
  gameActive = true;
  activeCanCollected = true;
  comboStreak = 0;
  nextLevelReady = false;

  createGrid();
  updateStats();
  updateTimerState();
  const cadenceMs = getCurrentSpawnDelay();
  showMessage(`Level ${currentLevel} is live. Pace: ~${Math.round(1000 / cadenceMs)} cans/sec. Keep your streak going.`, 'highlight');
  updateOverlayState(false, false);

  if (startingNextLevel) {
    showLevelTransition(currentLevel);
    levelTransitionTimeout = window.setTimeout(() => {
      if (!gameActive) {
        return;
      }

      spawnWaterCan();
      startTimer();
    }, 900);
    return;
  }

  spawnWaterCan();
  startTimer();
}

grid.addEventListener('click', event => {
  const clickedCell = event.target.closest('.grid-cell');

  if (!gameActive || !clickedCell) {
    return;
  }

  if (Date.now() < missClickGraceUntil) {
    return;
  }

  if (clickedCell === activeCanCell && collectActiveCan()) {
    return;
  }

  if (!activeCanButton || activeCanCollected) {
    return;
  }

  registerPenalty(MISSED_CLICK_PENALTY, 'Missed click. Aim for the can or lose points.');
});

createGrid();
updateStats();
overlayStartButton.focus();

overlayStartButton.addEventListener('click', startGame);
overlayRestartButton.addEventListener('click', startGame);
overlayResumeButton.addEventListener('click', resumeGame);

// Pause when the player leaves the tab or the window loses focus
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    pauseGame();
  }
});

window.addEventListener('blur', () => {
  pauseGame();
});

window.addEventListener('keydown', event => {
  if (event.key !== 'Escape') {
    return;
  }

  if (gameActive && !gamePaused) {
    pauseGame();
    return;
  }

  if (gamePaused) {
    resumeGame();
  }
});

