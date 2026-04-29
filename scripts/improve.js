const fs = require('fs');
const path = require('path');

const STATE_FILE = path.join(__dirname, '..', 'lib', 'state.json');
const BRAIN_FILE = path.join(__dirname, '..', 'lib', 'brain_weights.json');

let state = { 
  failures: [], 
  successes: [], 
  stableHours: [], 
  bestScore: 0, 
  currentScore: 0,
  trainingSessions: 0,
  lastTrainingError: 1
};

if (fs.existsSync(STATE_FILE)) {
  const raw = fs.readFileSync(STATE_FILE, 'utf-8');
  if (raw.trim()) state = JSON.parse(raw);
}

const timestamp = new Date().toISOString();
const hour = new Date().getUTCHours();

console.log('='.repeat(60));
console.log('📊 REWARD EVALUATION');
console.log('='.repeat(60));

// Check if brain exists
const brainExists = fs.existsSync(BRAIN_FILE);
let brainSize = 0;
if (brainExists) {
  brainSize = fs.statSync(BRAIN_FILE).size;
}

// Score the current state
let score = 0;
if (brainExists) score += 20;
if (state.trainingSessions > 0) score += 10;
if (state.lastTrainingError < 0.3) score += 20;
if (state.lastTrainingError < 0.2) score += 10;
if (state.totalTrainingCycles > 100) score += 15;
if (state.trainingPairs > 50) score += 15;
if (brainSize > 10000) score += 10;

console.log(`Brain exists: ${brainExists}`);
console.log(`Brain size: ${brainSize} bytes`);
console.log(`Training sessions: ${state.trainingSessions || 0}`);
console.log(`Last error: ${(state.lastTrainingError || 1).toFixed(4)}`);
console.log(`Total cycles: ${state.totalTrainingCycles || 0}`);
console.log(`Training pairs: ${state.trainingPairs || 0}`);
console.log(`\n📈 Current score: ${score}/100`);
console.log(`🏆 Best score: ${state.bestScore || 0}/100`);

const prevScore = state.currentScore || 0;
state.currentScore = score;

if (score > (state.bestScore || 0)) {
  state.bestScore = score;
  console.log('🟢 NEW BEST SCORE! Bot is getting smarter!');
}

const diff = score - prevScore;
if (diff > 0) {
  state.successes.push({ time: timestamp, hour, score, improvement: diff });
  console.log(`🟢 REWARD: +${diff} points`);
} else if (diff < 0) {
  state.failures.push({ time: timestamp, hour, score, decline: Math.abs(diff) });
  console.log(`🔴 PENALTY: ${diff} points`);
} else {
  console.log('⚪ STABLE: No change');
}

if (!state.stableHours) state.stableHours = [];
state.stableHours.push(hour);

fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
console.log('✅ Evaluation complete');
console.log('='.repeat(60));
