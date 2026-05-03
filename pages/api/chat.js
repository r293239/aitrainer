const fs = require('fs');
const path = require('path');

const TRAINING_FILE = path.join(process.cwd(), 'lib', 'training_data.json');
const UNCERTAIN_FILE = path.join(process.cwd(), 'lib', 'uncertain_questions.json');
const CONVERSATION_LOG = path.join(process.cwd(), 'lib', 'conversation_log.json');
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

function logConversation(prompt, reply) {
  try {
    let log = [];
    if (fs.existsSync(CONVERSATION_LOG)) {
      log = JSON.parse(fs.readFileSync(CONVERSATION_LOG, 'utf-8'));
    }
    log.push({ prompt, reply, timestamp: new Date().toISOString() });
    if (log.length > 100) log = log.slice(-100);
    fs.writeFileSync(CONVERSATION_LOG, JSON.stringify(log, null, 2));
  } catch (e) {}
}

function cleanResponse(text) {
  if (!text) return '';
  return text
    .replace(/^["']|["']$/g, '')
    .replace(/^(I|As an AI|Sure|Here|Let me|Okay|Alright|Great|Excellent|Absolutely|Of course|Definitely|Certainly|Well|So|Yes|No|Right|Indeed|Actually|Basically)[,.]?\s*/i, '')
    .trim();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed - use POST' });
  }

  try {
    const { message } = req.body;
    if (!message || message.trim() === '') {
      return res.status(200).json({ reply: 'Please say something!' });
    }

    // Load training data (for fallback only)
    let pairs = [];
    try {
      if (fs.existsSync(TRAINING_FILE)) {
        const raw = fs.readFileSync(TRAINING_FILE, 'utf-8');
        if (raw && raw.trim()) {
          const allPairs = JSON.parse(raw);
          pairs = allPairs.filter(p => {
            const resp = (p.response || '').toLowerCase();
            return !resp.includes('lines long') &&
                   !resp.includes('handles user') &&
                   !resp.includes('chat interface') &&
                   !resp.includes('pure javascript') &&
                   !resp.includes('converts text') &&
                   !resp.includes('evaluates bot') &&
                   !resp.includes('trains the neural') &&
                   !resp.includes('monitors training') &&
                   !resp.includes('file that') &&
                   !resp.includes('functional programming');
          });
        }
      }
    } catch (e) {}

    // ============================================================
    // PRIMARY: Use Neural Network to generate original response
    // ============================================================
    let nnReply = null;
    
    try {
      if (fs.existsSync(BRAIN_FILE) && fs.existsSync(VOCAB_FILE)) {
        const { NeuralNetwork } = require('../../lib/brain');
        const { TextProcessor } = require('../../lib/textProcessor');
        
        const brainData = JSON.parse(fs.readFileSync(BRAIN_FILE, 'utf-8'));
        const vocabData = JSON.parse(fs.readFileSync(VOCAB_FILE, 'utf-8'));
        
        if (brainData.inputSize && vocabData.vocabSize > 10) {
          const brain = NeuralNetwork.fromJSON(brainData);
          let tp = new TextProcessor(500);
          tp.wordToIndex = vocabData.wordToIndex || {};
          tp.indexToWord = vocabData.indexToWord || {};
          tp.vocabSize = vocabData.vocabSize || 0;
          
          const inputVector = tp.textToVector(message, brain.inputSize);
          const outputVector = brain.forward(inputVector);
          const words = tp.getWords();
          
          // Get activated words
          const wordScores = [];
          for (let i = 0; i < Math.min(outputVector.length, words.length); i++) {
            if (words[i] && words[i].length > 1 && outputVector[i] > 0.001) {
              wordScores.push({ word: words[i], score: outputVector[i] });
            }
          }
          wordScores.sort((a, b) => b.score - a.score);
          
          // Remove stop words
          const stopWords = new Set(['the','a','an','is','was','are','were','be','been','being','have','has','had','do','does','did','will','would','could','should','may','might','can','shall','to','of','in','for','on','with','at','by','from','as','into','through','during','before','after','and','or','but','if','that','this','it','its','so','very','just','not','no']);
          const contentWords = wordScores.filter(w => !stopWords.has(w.word.toLowerCase()) && w.score > 0.005);
          
          if (contentWords.length >= 4) {
            // Build a sentence from the top words
            const topWords = contentWords.slice(0, 10).map(w => w.word);
            
            // Remove duplicates
            const uniqueWords = [];
            for (const w of topWords) {
              if (!uniqueWords.includes(w)) uniqueWords.push(w);
            }
            
            // Create different sentence structures
            if (uniqueWords.length >= 3) {
              // Structure 1: Statement
              const sentence = uniqueWords.join(' ') + '.';
              nnReply = sentence.charAt(0).toUpperCase() + sentence.slice(1);
              
              // Only use NN reply if it's different from training data
              const isUnique = !pairs.some(p => 
                p.response && p.response.toLowerCase().includes(nnReply.toLowerCase().substring(0, 20))
              );
              
              if (isUnique && nnReply.length > 15) {
                logConversation(message, nnReply);
                return res.status(200).json({ reply: nnReply + ' 🧠' });
              }
            }
          }
        }
      }
    } catch (nnError) {
      console.error('Neural network failed:', nnError.message);
    }

    // ============================================================
    // FALLBACK: Match from training data (only if NN fails)
    // ============================================================
    const msgWords = message.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    
    // Find best keyword match
    let bestMatch = null;
    let bestScore = 0;
    
    for (const pair of pairs) {
      const combined = (pair.prompt + ' ' + pair.response).toLowerCase();
      let score = 0;
      for (const word of msgWords) {
        if (combined.includes(word)) score += 2;
      }
      if (pair.prompt.toLowerCase().includes(message.toLowerCase())) score += 5;
      if (score > bestScore) {
        bestScore = score;
        bestMatch = pair;
      }
    }
    
    if (bestMatch && bestScore >= 2 && bestMatch.response) {
      const cleaned = cleanResponse(bestMatch.response);
      if (cleaned.length > 5) {
        const reply = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
        logConversation(message, reply);
        return res.status(200).json({ reply });
      }
    }

    // ============================================================
    // LAST RESORT: Log as uncertain
    // ============================================================
    logUncertain(message.trim());
    const fallback = `I'm thinking... my brain has ${pairs.length} patterns and ${vocabData?.vocabSize || 0} words. Ask me something else!`;
    logConversation(message, fallback);
    return res.status(200).json({ reply: fallback });

  } catch (error) {
    console.error('Fatal error:', error.message);
    return res.status(200).json({ 
      reply: "My brain hit a bump! Try again. 🧠" 
    });
  }
}
