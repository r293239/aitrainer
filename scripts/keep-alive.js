// This script ensures continuous training even when GitHub is slow
const fs = require('fs');
const path = require('path');

const STATE_FILE = path.join(__dirname, '..', 'lib', 'state.json');

// Read state
let state = { trainingSessions: 0, lastTrainingTime: null };
if (fs.existsSync(STATE_FILE)) {
  const raw = fs.readFileSync(STATE_FILE, 'utf-8');
  if (raw.trim()) state = JSON.parse(raw);
}

const now = new Date();
const lastTraining = state.lastTrainingTime ? new Date(state.lastTrainingTime) : null;

// Check if training happened recently
if (lastTraining) {
  const minutesSince = Math.floor((now - lastTraining) / 60000);
  console.log(`Last training: ${minutesSince} minutes ago`);
  
  if (minutesSince > 30) {
    console.log('⚠️ Training gap detected. Requesting immediate training...');
    // Signal that training is overdue
    state.trainingOverdue = true;
    state.lastGapDetected = now.toISOString();
  } else {
    console.log('✅ Training is active');
    state.trainingOverdue = false;
  }
} else {
  console.log('📊 No training recorded yet');
}

state.lastCheckTime = now.toISOString();
fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));

console.log('Keep-alive check complete');
