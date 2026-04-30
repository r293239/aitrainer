const fs = require('fs');
const path = require('path');

const TRAINING_FILE = path.join(process.cwd(), 'lib', 'training_data.json');
const UNCERTAIN_FILE = path.join(process.cwd(), 'lib', 'uncertain_questions.json');
const BRAIN_FILE = path.join(process.cwd(), 'lib', 'brain_weights.json');
const VOCAB_FILE = path.join(process.cwd(), 'lib', 'vocab.json');

function logUncertain(question) {
  if (!question || question.trim().length < 3) return;
  try {
    let uncertain = [];
    if (fs.existsSync(UNCERTAIN_FILE)) {
      uncertain = JSON.parse(fs.readFileSync(UNCERTAIN_FILE, 'utf-8'));
    }
    if (!uncertain.find(q => q.text === question)) {
      uncertain.push({ text: question, timestamp: new Date().toISOString() });
      if (uncertain.length > 50) uncertain = uncertain.slice(-50);
      fs.writeFileSync(UNCERTAIN_FILE, JSON.stringify(uncertain, null, 2));
    }
  } catch (e) {}
}

function findBestMatch(message, pairs) {
  const msgWords = message.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  let best = null;
  let bestScore = 0;

  for (const pair of pairs) {
    const promptWords = pair.prompt.toLowerCase().split(/\s+/);
    let score = 0;
    for (const word of msgWords) {
      if (promptWords.includes(word)) score += 3;
    }
    if (pair.prompt.toLowerCase().includes(message.toLowerCase())) score += 10;
    if (score > bestScore) {
      bestScore = score;
      best = pair;
    }
  }
  return bestScore >= 2 ? best : null;
}

function cleanResponse(text) {
  if (!text) return '';
  return text
    .replace(/^["']|["']$/g, '')
    .replace(/^(I|As an AI|Sure|Here|Let me|Okay|Alright|Great|Excellent|Absolutely|Of course|Definitely|Certainly|Well|So|Yes|No|Right|Indeed|Actually|Basically)[,.]?\s*/i, '')
    .trim();
}

export default async function handler(req, res) {
  // CRITICAL: Check method first
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed - use POST' });
  }

  try {
    const { message } = req.body;
    
    if (!message || message.trim() === '') {
      return res.status(200).json({ reply: 'Please say something!' });
    }

    // Load training data safely
    let pairs = [];
    try {
      if (fs.existsSync(TRAINING_FILE)) {
        const raw = fs.readFileSync(TRAINING_FILE, 'utf-8');
        if (raw && raw.trim()) {
          pairs = JSON.parse(raw);
        }
      }
    } catch (e) {
      console.error('Failed to load training data:', e.message);
    }

    // Method 1: Direct match
    const match = findBestMatch(message, pairs);
    if (match && match.response) {
      const cleaned = cleanResponse(match.response);
      if (cleaned.length > 3) {
        return res.status(200).json({ 
          reply: cleaned.charAt(0).toUpperCase() + cleaned.slice(1) 
        });
      }
    }

    // Method 2: Keyword search
    const msgWords = message.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    const relevant = pairs.filter(p => {
      const combined = (p.prompt + ' ' + p.response).toLowerCase();
      return msgWords.some(w => combined.includes(w));
    });

    if (relevant.length > 0) {
      const pick = relevant[Math.floor(Math.random() * relevant.length)];
      const cleaned = cleanResponse(pick.response);
      if (cleaned.length > 5) {
        return res.status(200).json({ 
          reply: cleaned.charAt(0).toUpperCase() + cleaned.slice(1) 
        });
      }
    }

    // Method 3: Random fallback from training
    if (pairs.length > 0) {
      const pick = pairs[Math.floor(Math.random() * pairs.length)];
      const cleaned = cleanResponse(pick.response);
      if (cleaned.length > 5) {
        return res.status(200).json({ 
          reply: cleaned.charAt(0).toUpperCase() + cleaned.slice(1) 
        });
      }
    }

    // Fallback
    logUncertain(message.trim());
    return res.status(200).json({ 
      reply: `I'm learning! I have ${pairs.length} knowledge entries and add more every 10 minutes. Ask me something else!` 
    });

  } catch (error) {
    console.error('Fatal error:', error.message);
    return res.status(200).json({ 
      reply: "My brain hit a small bump! Try again. 🧠" 
    });
  }
}
