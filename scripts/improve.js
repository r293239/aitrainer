const fs = require('fs');
const path = require('path');

const STATE_FILE = path.join(__dirname, '..', 'lib', 'state.json');
const BRAIN_FILE = path.join(__dirname, '..', 'lib', 'brain_weights.json');
const TRAINING_FILE = path.join(__dirname, '..', 'lib', 'training_data.json');
const RANKINGS_FILE = path.join(__dirname, '..', 'lib', 'rankings.json');
const UNCERTAIN_FILE = path.join(__dirname, '..', 'lib', 'uncertain_questions.json');

let state = {};
if (fs.existsSync(STATE_FILE)) {
  try {
    const raw = fs.readFileSync(STATE_FILE, 'utf-8');
    if (raw.trim()) state = JSON.parse(raw);
  } catch (e) {}
}

// Ensure all arrays exist before pushing
if (!Array.isArray(state.successes)) state.successes = [];
if (!Array.isArray(state.failures)) state.failures = [];
if (!Array.isArray(state.stableHours)) state.stableHours = [];
if (typeof state.bestScore !== 'number') state.bestScore = 0;
if (typeof state.currentScore !== 'number') state.currentScore = 0;

const timestamp = new Date().toISOString();
const hour = new Date().getUTCHours();

console.log('='.repeat(60));
console.log('📊 REWARD EVALUATION');
console.log('='.repeat(60));

const brainExists = fs.existsSync(BRAIN_FILE);
let brainSize = brainExists ? fs.statSync(BRAIN_FILE).size : 0;

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

let score = 0;
if (brainExists) score += 15;
if (brainSize > 50000) score += 15;
if (brainSize > 100000) score += 10;
if (trainingPairs > 50) score += 15;
if (trainingPairs > 200) score += 10;
if (state.vocabSize > 200) score += 10;
if (uncertainCount < 10) score += 5;

console.log(`Brain: ${brainExists ? '✅' : '❌'} (${(brainSize/1024).toFixed(1)} KB)`);
console.log(`Training pairs: ${trainingPairs}`);
console.log(`Vocab size: ${state.vocabSize || 0}`);
console.log(`Uncertain questions: ${uncertainCount}`);
console.log(`\n📈 Current score: ${score}/100`);
console.log(`🏆 Best score: ${state.bestScore}/100`);

const prevScore = state.currentScore;
state.currentScore = score;

if (score > state.bestScore) {
  state.bestScore = score;
  console.log('🟢 NEW BEST SCORE!');
}

const diff = score - prevScore;
if (diff > 0) {
  state.successes.push({ time: timestamp, hour, score, improvement: diff });
  console.log(`🟢 REWARD: +${diff}`);
} else if (diff < 0) {
  state.failures.push({ time: timestamp, hour, score, decline: Math.abs(diff) });
  console.log(`🔴 PENALTY: ${diff}`);
} else {
  console.log('⚪ STABLE');
}

state.stableHours.push(hour);
if (state.successes.length > 100) state.successes = state.successes.slice(-100);
if (state.failures.length > 100) state.failures = state.failures.slice(-100);
if (state.stableHours.length > 200) state.stableHours = state.stableHours.slice(-200);

// Signal whether to merge to main (used by workflow)
const avgRanking = state.averageRanking || 0;
const shouldMerge = avgRanking >= 5 && state.trainingPairs > 50;
console.log(`\n📊 Merge recommendation: ${shouldMerge ? 'MERGE ✅' : 'HOLD ⏳'}`);
console.log(`   (Avg ranking: ${avgRanking.toFixed(1)}/10, Pairs: ${state.trainingPairs || 0})`);

fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
console.log('✅ Evaluation complete');
console.log('='.repeat(60));
