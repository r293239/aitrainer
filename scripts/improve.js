const fs = require('fs');
const path = require('path');

const STATE_FILE = path.join(__dirname, '..', 'lib', 'state.json');
const CHAT_FILE = path.join(__dirname, '..', 'pages', 'api', 'chat.js');

// Load current state
let state = { failures: [], successes: [], stableHours: [] };
try {
  if (fs.existsSync(STATE_FILE)) {
    const raw = fs.readFileSync(STATE_FILE, 'utf-8');
    if (raw.trim()) {
      state = JSON.parse(raw);
    }
  }
} catch (e) {
  console.log('Starting fresh state...');
}

const timestamp = new Date().toISOString();
const hour = new Date().getUTCHours();

console.log('='.repeat(50));
console.log('🤖 AI SELF-IMPROVEMENT CYCLE');
console.log('='.repeat(50));
console.log(`Time: ${timestamp}`);
console.log(`Previous successes: ${state.successes.length}`);
console.log(`Previous failures: ${state.failures.length}`);

// Read current chat file
let chatCode = '';
try {
  chatCode = fs.readFileSync(CHAT_FILE, 'utf-8');
  console.log(`Chat file size: ${chatCode.length} characters`);
} catch (e) {
  console.log('Could not read chat file');
}

// Record this successful execution
state.successes.push({
  time: timestamp,
  hour: hour,
  message: 'Improvement cycle completed',
  chatFileSize: chatCode.length
});

// Track hour for stability detection
if (!state.stableHours) state.stableHours = [];
state.stableHours.push(hour);

// Analyze stable times (hours with most successes)
const hourCounts = {};
state.stableHours.forEach(h => {
  hourCounts[h] = (hourCounts[h] || 0) + 1;
});
const sortedHours = Object.entries(hourCounts).sort((a, b) => b[1] - a[1]);
if (sortedHours.length > 0) {
  console.log(`Most stable hour: ${sortedHours[0][0]} UTC (${sortedHours[0][1]} successes)`);
}

// Save updated state
fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
console.log('✅ State saved successfully');
console.log('='.repeat(50));
