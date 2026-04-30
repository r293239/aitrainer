const fs = require('fs');
const path = require('path');

const STATE_FILE = path.join(__dirname, '..', 'lib', 'state.json');
const BRAIN_FILE = path.join(__dirname, '..', 'lib', 'brain_weights.json');
const TRAINING_FILE = path.join(__dirname, '..', 'lib', 'training_data.json');
const RANKINGS_FILE = path.join(__dirname, '..', 'lib', 'rankings.json');
const UNCERTAIN_FILE = path.join(__dirname, '..', 'lib', 'uncertain_questions.json');

// Load state safely
let state = {};
if (fs.existsSync(STATE_FILE)) {
  try {
    const raw = fs.readFileSync(STATE_FILE, 'utf-8');
    if (raw.trim()) state = JSON.parse(raw);
  } catch (e) {
    console.log('⚠️ Could not parse state.json, starting fresh');
  }
}

// Ensure all arrays exist
if (!state.successes) state.successes = [];
if (!state.failures) state.failures = [];
if (!state.stableHours) state.stableHours = [];
if (state.bestScore === undefined) state.bestScore = 0;
if (state.currentScore === undefined) state.currentScore = 0;

const timestamp = new Date().toISOString();
const hour = new Date().getUTCHours();

console.log('='.repeat(60));
console.log('📊 REWARD EVALUATION');
console.log('='.repeat(60));

// Check resources
const brainExists = fs.existsSync(BRAIN_FILE);
let brainSize = 0;
if (brainExists) brainSize = fs.statSync(BRAIN_FILE).size;

let trainingPairs = 0;
if (fs.existsSync(TRAINING_FILE)) {
  try { trainingPairs = JSON.parse(fs.readFileSync(TRAINING_FILE, 'utf-8')).length; } catch (e) {}
}

let rankings = 0;
if (fs.existsSync(RANKINGS_FILE)) {
  try { rankings = JSON.parse(fs.readFileSync(RANKINGS_FILE, 'utf-8')).length; } catch (e) {}
}

let uncertainCount = 0;
if (fs.existsSync(UNCERTAIN_FILE)) {
  try { uncertainCount = JSON.parse(fs.readFileSync(UNCERTAIN_FILE, 'utf-8')).length; } catch (e) {}
}

// Score
let score = 0;
if (brainExists) score += 15;
if (brainSize > 50000) score += 15;
if (brainSize > 100000) score += 10;
if (trainingPairs > 50) score += 15;
if (trainingPairs > 200) score += 10;
if (trainingPairs > 500) score += 10;
if (rankings > 10) score += 10;
if (state.averageRanking > 5) score += 10;
if (state.averageRanking > 7) score += 15;
if (state.lastTrainingError < 0.1) score += 15;
if (state.lastTrainingError < 0.05) score += 10;
if (state.vocabSize > 200) score += 10;
if (uncertainCount < 10) score += 5;

console.log(`Brain: ${brainExists ? '✅' : '❌'} (${(brainSize / 1024).toFixed(1)} KB)`);
console.log(`Training pairs: ${trainingPairs}`);
console.log(`Rankings: ${rankings}`);
console.log(`Avg ranking: ${(state.averageRanking || 0).toFixed(1)}/10`);
console.log(`Training sessions: ${state.trainingSessions || 0}`);
console.log(`Training error: ${(state.lastTrainingError || 1).toFixed(4)}`);
console.log(`Vocab size: ${state.vocabSize || 0}`);
console.log(`Uncertain questions: ${uncertainCount}`);
console.log(`\n📈 Current score: ${score}/100`);
console.log(`🏆 Best score: ${state.bestScore || 0}/100`);

const prevScore = state.currentScore || 0;
state.currentScore = score;

if (score > (state.bestScore || 0)) {
  state.bestScore = score;
  console.log('🟢 NEW BEST SCORE!');
}

const diff = score - prevScore;
if (diff > 0) {
  state.successes.push({ time: timestamp, hour, score, improvement: diff });
  console.log(`🟢 REWARD: +${diff} points`);
} else if (diff < 0) {
  state.failures.push({ time: timestamp, hour, score, decline: Math.abs(diff) });
  console.log(`🔴 PENALTY: ${diff} points`);
} else {
  console.log('⚪ STABLE');
}

state.stableHours.push(hour);

// Trim arrays to prevent infinite growth
if (state.successes.length > 100) state.successes = state.successes.slice(-100);
if (state.failures.length > 100) state.failures = state.failures.slice(-100);
if (state.stableHours.length > 200) state.stableHours = state.stableHours.slice(-200);

fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
console.log('✅ Evaluation complete');
console.log('='.repeat(60));
