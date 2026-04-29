const fs = require('fs');
const path = require('path');

const BRAIN_FILE = path.join(process.cwd(), 'lib', 'brain_weights.json');
const VOCAB_FILE = path.join(process.cwd(), 'lib', 'vocab.json');
const TRAINING_FILE = path.join(process.cwd(), 'lib', 'training_data.json');
const RANKINGS_FILE = path.join(process.cwd(), 'lib', 'rankings.json');
const STATE_FILE = path.join(process.cwd(), 'lib', 'state.json');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { message } = req.body;
  if (!message || message.trim() === '') {
    return res.status(200).json({ reply: 'Please say something!' });
  }

  try {
    const msg = message.toLowerCase().trim();
    
    // === METHOD 1: Direct knowledge match from training data ===
    let trainingPairs = [];
    if (fs.existsSync(TRAINING_FILE)) {
      trainingPairs = JSON.parse(fs.readFileSync(TRAINING_FILE, 'utf-8'));
    }
    
    // Find best matching prompt
    let bestMatch = null;
    let bestScore = 0;
    
    const msgWords = msg.split(/\s+/);
    
    for (const pair of trainingPairs) {
      const promptWords = pair.prompt.toLowerCase().split(/\s+/);
      let matchScore = 0;
      
      // Count matching words between user message and training prompts
      for (const word of msgWords) {
        if (word.length > 2 && promptWords.includes(word)) {
          matchScore += 2;
        }
      }
      
      // Bonus for phrase matches
      for (let i = 0; i < msgWords.length - 1; i++) {
        const phrase = msgWords[i] + ' ' + msgWords[i + 1];
        if (pair.prompt.toLowerCase().includes(phrase)) {
          matchScore += 5;
        }
      }
      
      // Prefer highly ranked responses
      if (fs.existsSync(RANKINGS_FILE)) {
        const rankings = JSON.parse(fs.readFileSync(RANKINGS_FILE, 'utf-8'));
        const rank = rankings.find(r => 
          r.prompt && pair.prompt && 
          r.prompt.toLowerCase().includes(pair.prompt.toLowerCase().substring(0, 20))
        );
        if (rank && rank.scores && rank.scores.total > 7) {
          matchScore += 10;
        }
      }
      
      if (matchScore > bestScore) {
        bestScore = matchScore;
        bestMatch = pair;
      }
    }
    
    // If we found a strong match, use it
    if (bestMatch && bestScore > 3) {
      const response = bestMatch.response;
      // Clean up response
      const cleanResponse = response
        .replace(/^["']|["']$/g, '')
        .replace(/^(I|As an AI|Sure|Here|Let me|Okay|Alright|Great|Excellent|Absolutely|Of course|Definitely|Certainly|Well|So|Yes|No|Right|Indeed|Actually|Basically|Essentially|Fundamentally|Generally|Honestly|Interestingly|Naturally|Obviously|Perhaps|Probably|Really|Truly|Typically|Understandably|Undoubtedly|Unfortunately)[,.]?\s*/i, '')
        .trim();
      
      const finalResponse = cleanResponse.charAt(0).toUpperCase() + cleanResponse.slice(1);
      
      if (finalResponse.length > 3 && finalResponse !== '.') {
        return res.status(200).json({ reply: finalResponse });
      }
    }
    
    // === METHOD 2: Neural network generation with fixed output ===
    if (fs.existsSync(BRAIN_FILE) && fs.existsSync(VOCAB_FILE)) {
      const { NeuralNetwork } = require('../../lib/brain');
      const { TextProcessor } = require('../../lib/textProcessor');
      
      const brainData = JSON.parse(fs.readFileSync(BRAIN_FILE, 'utf-8'));
      const brain = NeuralNetwork.fromJSON(brainData);
      
      const vocab = JSON.parse(fs.readFileSync(VOCAB_FILE, 'utf-8'));
      let tp = new TextProcessor(500);
      tp.wordToIndex = vocab.wordToIndex;
      tp.indexToWord = vocab.indexToWord;
      tp.vocabSize = vocab.vocabSize;
      
      const inputVector = tp.textToVector(message, brain.inputSize);
      const outputVector = brain.forward(inputVector);
      
      // Get all available words
      const allWords = tp.getWords();
      
      // Create word-score pairs
      const wordScores = [];
      for (let i = 0; i < outputVector.length; i++) {
        const word = allWords[i] || tp.indexToWord[i.toString()] || '';
        if (word && word.length > 1) {
          wordScores.push({ word, score: outputVector[i] });
        }
      }
      
      // Sort by score
      wordScores.sort((a, b) => b.score - a.score);
      
      // Take words with significant activation
      const activeWords = wordScores.filter(w => w.score > 0.01);
      
      if (activeWords.length >= 2) {
        // Build a proper response
        const topWords = activeWords.slice(0, 12);
        
        // Remove duplicates and function words from end
        const contentWords = topWords
          .map(w => w.word)
          .filter((w, i, arr) => arr.indexOf(w) === i)
          .filter(w => !['the', 'a', 'an', 'is', 'was', 'are', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'shall', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'between', 'under', 'again', 'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'both', 'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just', 'because', 'but', 'however', 'if', 'or', 'and', 'that', 'this', 'it', 'its'].includes(w.toLowerCase()))
          .slice(0, 8);
        
        if (contentWords.length >= 2) {
          const sentence = contentWords.join(' ') + '.';
          const capitalized = sentence.charAt(0).toUpperCase() + sentence.slice(1);
          
          if (capitalized.length > 5 && capitalized !== '.') {
            return res.status(200).json({ reply: capitalized });
          }
        }
      }
    }
    
    // === METHOD 3: Smart fallback using random training responses ===
    if (trainingPairs.length > 0) {
      // Try to find something relevant
      const relevantPairs = trainingPairs.filter(p => {
        const combined = (p.prompt + ' ' + p.response).toLowerCase();
        return msgWords.some(w => w.length > 2 && combined.includes(w));
      });
      
      if (relevantPairs.length > 0) {
        const pair = relevantPairs[Math.floor(Math.random() * relevantPairs.length)];
        const response = pair.response
          .replace(/^(I|As an AI|Sure|Here|Let me|Okay|Alright|Great|Excellent)[,.]?\s*/i, '')
          .trim();
        
        if (response.length > 5 && response !== '.') {
          const finalResponse = response.charAt(0).toUpperCase() + response.slice(1);
          return res.status(200).json({ reply: finalResponse });
        }
      }
      
      // Just use a random training response as fallback
      const randomPair = trainingPairs[Math.floor(Math.random() * trainingPairs.length)];
      const response = randomPair.response
        .replace(/^(I|As an AI|Sure|Here|Let me)[,.]?\s*/i, '')
        .trim();
      
      if (response.length > 5) {
        const finalResponse = response.charAt(0).toUpperCase() + response.slice(1);
        return res.status(200).json({ reply: finalResponse });
      }
    }
    
    // === ULTIMATE FALLBACK ===
    return res.status(200).json({ 
      reply: "I'm learning! My brain has " + trainingPairs.length + " memories and growing. Ask me about " + (trainingPairs[0]?.prompt?.substring(0, 30) || 'anything') + "!" 
    });
    
  } catch (error) {
    console.error('Chat error:', error);
    return res.status(200).json({ 
      reply: "My brain is reorganizing! I'll be back smarter in a moment. 🧠" 
    });
  }
}
