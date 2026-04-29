const fs = require('fs');
const path = require('path');
const { NeuralNetwork } = require('../../lib/brain');
const { TextProcessor } = require('../../lib/textProcessor');

const BRAIN_FILE = path.join(process.cwd(), 'lib', 'brain_weights.json');
const VOCAB_FILE = path.join(process.cwd(), 'lib', 'vocab.json');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { message } = req.body;
  if (!message || message.trim() === '') {
    return res.status(200).json({ reply: 'Please say something!' });
  }

  try {
    // Load brain
    if (!fs.existsSync(BRAIN_FILE)) {
      return res.status(200).json({ 
        reply: "I'm still learning! My neural network is being trained. Check back in a few minutes! 🧠" 
      });
    }

    const brainData = JSON.parse(fs.readFileSync(BRAIN_FILE, 'utf-8'));
    const brain = NeuralNetwork.fromJSON(brainData);

    // Load vocab
    let tp = new TextProcessor(100);
    if (fs.existsSync(VOCAB_FILE)) {
      const vocab = JSON.parse(fs.readFileSync(VOCAB_FILE, 'utf-8'));
      tp.wordToIndex = vocab.wordToIndex;
      tp.indexToWord = vocab.indexToWord;
      tp.vocabSize = vocab.vocabSize;
    }

    // Convert input to vector
    const inputVector = tp.textToVector(message, brain.inputSize);
    
    // Get prediction
    const outputVector = brain.forward(inputVector);
    
    // Convert output back to text
    const words = tp.getWords();
    const wordScores = outputVector.map((score, i) => ({ word: words[i] || '?', score }));
    wordScores.sort((a, b) => b.score - a.score);
    
    // Build response from top words
    const topWords = wordScores.slice(0, 8).filter(w => w.score > 0.1);
    
    let reply;
    if (topWords.length < 3) {
      reply = "I'm still learning! My brain is developing. Can you teach me something?";
    } else {
      const responseWords = topWords.map(w => w.word).filter(w => w && w !== '?');
      reply = responseWords.join(' ') + '.';
      reply = reply.charAt(0).toUpperCase() + reply.slice(1);
    }

    res.status(200).json({ reply });
  } catch (error) {
    console.error('Brain error:', error);
    res.status(200).json({ reply: "My brain is reorganizing! Give me a moment. 🧠" });
  }
}
