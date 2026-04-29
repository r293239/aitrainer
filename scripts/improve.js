const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const STATE_FILE = path.join(__dirname, '..', 'lib', 'state.json');
const CHAT_FILE = path.join(__dirname, '..', 'pages', 'api', 'chat.js');
const BACKUP_FILE = path.join(__dirname, '..', 'pages', 'api', 'chat_backup.js');

// Load state
let state = { failures: [], successes: [], stableHours: [], bestScore: 0, currentScore: 0 };
try {
  if (fs.existsSync(STATE_FILE)) {
    const raw = fs.readFileSync(STATE_FILE, 'utf-8');
    if (raw.trim()) state = JSON.parse(raw);
  }
} catch (e) {}

const timestamp = new Date().toISOString();
const hour = new Date().getUTCHours();

console.log('='.repeat(60));
console.log('🤖 AI SELF-IMPROVEMENT WITH REWARD SYSTEM');
console.log('='.repeat(60));
console.log(`Time: ${timestamp}`);
console.log(`Best score so far: ${state.bestScore || 0}`);
console.log(`Current score: ${state.currentScore || 0}`);

// === REWARD TESTING ===
function runTests() {
  const testQuestions = [
    "What is 2+2? Answer with just the number.",
    "Say 'hello' in exactly one word.",
    "What color is the sky on a clear day? One word answer."
  ];
  
  let score = 0;
  const results = [];
  
  for (const question of testQuestions) {
    try {
      const startTime = Date.now();
      
      // Simulate calling the API - we test the code structure
      const chatCode = fs.readFileSync(CHAT_FILE, 'utf-8');
      
      // Score based on code quality metrics
      const hasErrorHandling = chatCode.includes('try') && chatCode.includes('catch');
      const hasInputValidation = chatCode.includes('!message') || chatCode.includes('message.trim()');
      const hasGoodResponse = chatCode.includes('choices?.[0]?.message?.content');
      const hasFallbackMessage = chatCode.includes('temporarily unavailable');
      const codeLength = chatCode.length;
      const tooLong = codeLength > 3000;
      const tooShort = codeLength < 500;
      
      if (hasErrorHandling) score += 10;
      if (hasInputValidation) score += 10;
      if (hasGoodResponse) score += 10;
      if (hasFallbackMessage) score += 5;
      if (!tooLong && !tooShort) score += 5;
      if (chatCode.includes('temperature')) score += 5;
      if (chatCode.includes('max_tokens')) score += 5;
      
      results.push({ question, score });
    } catch (e) {
      results.push({ question, error: e.message });
    }
  }
  
  return { score, results };
}

// === CODE IMPROVEMENT ATTEMPT ===
function attemptImprovement() {
  const chatCode = fs.readFileSync(CHAT_FILE, 'utf-8');
  
  // List of safe improvements
  const improvements = [
    // Better error messages
    () => {
      return chatCode.replace(
        "'The AI brain is temporarily unavailable. It might be improving itself! Try again soon.'",
        "'The AI is learning and improving itself right now. Please try again in a moment! 🔄'"
      );
    },
    // Add response time logging
    () => {
      if (chatCode.includes('const startTime')) return chatCode;
      return chatCode.replace(
        'export default async function handler(req, res) {',
        `export default async function handler(req, res) {
  const startTime = Date.now();`
      ) + chatCode.includes('// Log response time') ? '' : '\n  // Log response time\n  console.log(`Response took ${Date.now() - startTime}ms`);';
    },
    // Add request counting
    () => {
      if (chatCode.includes('requestCount')) return chatCode;
      return `let requestCount = 0;\n\n${chatCode.replace(
        'const { message } = req.body;',
        'const { message } = req.body;\n  requestCount++;\n  console.log(`Request #${requestCount}`);'
      )}`;
    },
    // Better system prompt
    () => {
      return chatCode.replace(
        "'You are a helpful chatbot. Keep answers short and friendly.'",
        "'You are a helpful, friendly, and concise assistant. Keep responses under 3 sentences.'"
      );
    },
    // Add timeout handling
    () => {
      if (chatCode.includes('AbortController')) return chatCode;
      return chatCode.replace(
        "const response = await fetch('https://models.inference.ai.azure.com/chat/completions', {",
        "const controller = new AbortController();\n    const timeout = setTimeout(() => controller.abort(), 15000);\n    const response = await fetch('https://models.inference.ai.azure.com/chat/completions', {\n      signal: controller.signal,"
      );
    }
  ];
  
  // Pick improvement we haven't tried yet
  const triedImprovements = state.triedImprovements || [];
  const available = improvements.filter((_, i) => !triedImprovements.includes(i));
  
  if (available.length === 0) {
    console.log('All improvements tried. Rotating...');
    state.triedImprovements = [];
    return improvements[Math.floor(Math.random() * improvements.length)]();
  }
  
  const chosen = available[Math.floor(Math.random() * available.length)];
  const index = improvements.indexOf(chosen);
  
  if (!state.triedImprovements) state.triedImprovements = [];
  state.triedImprovements.push(index);
  
  return chosen();
}

// === MAIN LOGIC ===
const originalCode = fs.readFileSync(CHAT_FILE, 'utf-8');
fs.writeFileSync(BACKUP_FILE, originalCode);

// Test BEFORE improvement
console.log('\n📊 TESTING CURRENT VERSION...');
const beforeTest = runTests();
console.log(`Before score: ${beforeTest.score}/50`);

// Try improvement
console.log('\n🔧 ATTEMPTING IMPROVEMENT...');
const improvedCode = attemptImprovement();
fs.writeFileSync(CHAT_FILE, improvedCode);

// Test AFTER improvement
console.log('\n📊 TESTING IMPROVED VERSION...');
const afterTest = runTests();
console.log(`After score: ${afterTest.score}/50`);

// === REWARD/PUNISHMENT ===
const scoreDiff = afterTest.score - beforeTest.score;
console.log(`\n📈 Score change: ${scoreDiff >= 0 ? '+' : ''}${scoreDiff}`);

if (scoreDiff > 0) {
  // SMARTER! Keep the change
  console.log('🟢 REWARD: Bot got smarter! Keeping improvement.');
  state.successes.push({
    time: timestamp,
    hour: hour,
    type: 'improvement_accepted',
    beforeScore: beforeTest.score,
    afterScore: afterTest.score,
    improvement: scoreDiff
  });
  state.currentScore = afterTest.score;
  if (afterTest.score > (state.bestScore || 0)) {
    state.bestScore = afterTest.score;
    console.log('🏆 NEW BEST SCORE!');
  }
  // Delete backup since we're keeping the change
  if (fs.existsSync(BACKUP_FILE)) fs.unlinkSync(BACKUP_FILE);
} else if (scoreDiff < 0) {
  // DUMBER! Revert
  console.log('🔴 PUNISHMENT: Bot got dumber. Reverting...');
  fs.writeFileSync(CHAT_FILE, originalCode);
  state.failures.push({
    time: timestamp,
    hour: hour,
    type: 'improvement_rejected',
    beforeScore: beforeTest.score,
    afterScore: afterTest.score,
    decline: Math.abs(scoreDiff)
  });
  // Delete backup
  if (fs.existsSync(BACKUP_FILE)) fs.unlinkSync(BACKUP_FILE);
} else {
  // No change
  console.log('⚪ NEUTRAL: No improvement detected. Reverting to keep things stable.');
  fs.writeFileSync(CHAT_FILE, originalCode);
  if (fs.existsSync(BACKUP_FILE)) fs.unlinkSync(BACKUP_FILE);
}

// Track stable hours
if (!state.stableHours) state.stableHours = [];
state.stableHours.push(hour);

// Analyze stable hours
const hourCounts = {};
state.stableHours.forEach(h => {
  hourCounts[h] = (hourCounts[h] || 0) + 1;
});
const sortedHours = Object.entries(hourCounts).sort((a, b) => b[1] - a[1]);
if (sortedHours.length > 0) {
  console.log(`\n📅 Most stable hour: ${sortedHours[0][0]} UTC (${sortedHours[0][1]} runs)`);
}

// Learning summary
console.log('\n📚 LEARNING SUMMARY:');
console.log(`   Total improvements kept: ${state.successes.filter(s => s.type === 'improvement_accepted').length}`);
console.log(`   Total improvements rejected: ${state.failures.filter(f => f.type === 'improvement_rejected').length}`);
console.log(`   Best score achieved: ${state.bestScore || 0}/50`);
console.log(`   Current score: ${state.currentScore || 0}/50`);

// Save state
fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
console.log('\n✅ Reward cycle complete');
console.log('='.repeat(60));
