const fs = require('fs');
const { execSync } = require('child_process');

const CHAT_FILE = 'pages/api/chat.js';
const STATE_FILE = 'lib/state.json';
const BACKUP_FILE = 'pages/api/chat_backup.js';

// Load current state
let state = { failures: [], successes: [] };
try {
  state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
} catch (e) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// Backup current code
const currentCode = fs.readFileSync(CHAT_FILE, 'utf-8');
fs.writeFileSync(BACKUP_FILE, currentCode);

console.log('Improvement cycle ran successfully at ' + new Date().toISOString());
console.log('Successes so far:', state.successes.length);
console.log('Failures so far:', state.failures.length);

// For now, just log — we'll add actual improvements once basics work
state.successes.push({ time: new Date().toISOString(), message: 'Cycle completed' });
fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
