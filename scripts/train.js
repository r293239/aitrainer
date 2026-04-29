const fs = require('fs');
const path = require('path');
const { NeuralNetwork } = require('../lib/brain');
const { TextProcessor } = require('../lib/textProcessor');

const BRAIN_FILE = path.join(__dirname, '..', 'lib', 'brain_weights.json');
const STATE_FILE = path.join(__dirname, '..', 'lib', 'state.json');
const VOCAB_FILE = path.join(__dirname, '..', 'lib', 'vocab.json');
const TRAINING_DATA = path.join(__dirname, '..', 'lib', 'training_data.json');
const RANKINGS_FILE = path.join(__dirname, '..', 'lib', 'rankings.json');

const INPUT_SIZE = 100;
const HIDDEN_SIZE = 200;
const OUTPUT_SIZE = 100;
const TRAINING_MINUTES = 10;

async function callGPT4(messages) {
  try {
    const response = await fetch('https://models.inference.ai.azure.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages,
        temperature: 0.9,
        max_tokens: 200
      })
    });
    const data = await response.json();
    return data.choices[0].message.content;
  } catch (e) {
    return null;
  }
}

// GPT-4o talks to ITSELF - this is the secret sauce
async function gpt4SelfConversation() {
  const topics = [
    "philosophy of mind",
    "the future of artificial intelligence",
    "the nature of consciousness",
    "what makes humans unique",
    "the meaning of creativity",
    "how language shapes thought",
    "the ethics of technology",
    "the relationship between logic and emotion",
    "what is intelligence really",
    "the beauty of mathematics"
  ];
  
  const topic = topics[Math.floor(Math.random() * topics.length)];
  const conversations = [];
  
  // GPT-4 starts the conversation
  const starter = await callGPT4([
    { role: "system", content: "You are a deep thinker. Start a conversation about: " + topic + ". Ask a thought-provoking question." },
    { role: "user", content: "Start a deep conversation about " + topic }
  ]);
  
  if (!starter) return [];
  
  conversations.push({ role: "GPT-4 (A)", content: starter, timestamp: Date.now() });
  
  // GPT-4 responds to itself (different persona)
  const response1 = await callGPT4([
    { role: "system", content: "You are a different thinker with unique perspectives. Respond thoughtfully to this message." },
    { role: "user", content: starter }
  ]);
  
  if (!response1) return conversations;
  conversations.push({ role: "GPT-4 (B)", content: response1, timestamp: Date.now() });
  
  // Back and forth
  const response2 = await callGPT4([
    { role: "system", content: "You are the original thinker. Build on the conversation. Ask another question." },
    { role: "user", content: "You said: " + starter + "\nThey responded: " + response1 + "\nContinue the conversation." }
  ]);
  
  if (!response2) return conversations;
  conversations.push({ role: "GPT-4 (A)", content: response2, timestamp: Date.now() });
  
  const response3 = await callGPT4([
    { role: "system", content: "You are the second thinker. Conclude this thought with a profound insight." },
    { role: "user", content: "They said: " + response2 + "\nOffer a concluding insight." }
  ]);
  
  if (!response3) return conversations;
  conversations.push({ role: "GPT-4 (B)", content: response3, timestamp: Date.now() });
  
  return conversations;
}

// GPT-4 ranks your AI's responses
async function rankMyAIResponse(prompt, myAIResponse) {
  const ranking = await callGPT4([
    { 
      role: "system", 
      content: `You are an AI evaluator. Rate the following AI response on a scale of 1-10 for:
1. Relevance (does it address the prompt?)
2. Coherence (does it make sense?)
3. Helpfulness (is it useful?)
4. Grammar (is it well-formed?)
5. Intelligence (does it show understanding?)

Respond in this exact format:
RELEVANCE: [score]
COHERENCE: [score]
HELPFULNESS: [score]
GRAMMAR: [score]
INTELLIGENCE: [score]
TOTAL: [average score]
FEEDBACK: [one sentence of improvement advice]`
    },
    { 
      role: "user", 
      content: `Prompt: "${prompt}"\n\nAI Response: "${myAIResponse}"\n\nRate this response.` 
    }
  ]);
  
  return ranking;
}

function parseRanking(rankingText) {
  if (!rankingText) return null;
  
  const scores = {};
  const lines = rankingText.split('\n');
  
  lines.forEach(line => {
    const match = line.match(/(\w+):\s*([\d.]+)/);
    if (match) {
      scores[match[1].toLowerCase()] = parseFloat(match[2]);
    }
  });
  
  const feedbackMatch = rankingText.match(/FEEDBACK:\s*(.+)/);
  scores.feedback = feedbackMatch ? feedbackMatch[1] : '';
  
  return scores;
}

async function train() {
  console.log('='.repeat(60));
  console.log('🧠 META-LEARNING: GPT-4o Self-Talk + Ranking');
  console.log('='.repeat(60));
  console.log(`Training duration: ${TRAINING_MINUTES} minutes`);
  console.log(`Network: ${INPUT_SIZE} -> ${HIDDEN_SIZE} -> ${OUTPUT_SIZE}`);
  
  // Load brain
  let brain;
  if (fs.existsSync(BRAIN_FILE)) {
    const data = JSON.parse(fs.readFileSync(BRAIN_FILE, 'utf-8'));
    if (data.inputSize === INPUT_SIZE && data.outputSize === OUTPUT_SIZE) {
      brain = NeuralNetwork.fromJSON(data);
      console.log('📂 Loaded existing brain');
    } else {
      brain = new NeuralNetwork(INPUT_SIZE, HIDDEN_SIZE, OUTPUT_SIZE);
      console.log('🧠 Created new brain (size mismatch)');
    }
  } else {
    brain = new NeuralNetwork(INPUT_SIZE, HIDDEN_SIZE, OUTPUT_SIZE);
    console.log('🧠 Created new brain');
  }
  
  // Load data
  let tp = new TextProcessor(500);
  let trainingPairs = [];
  let rankings = [];
  
  if (fs.existsSync(TRAINING_DATA)) {
    trainingPairs = JSON.parse(fs.readFileSync(TRAINING_DATA, 'utf-8'));
  }
  if (fs.existsSync(RANKINGS_FILE)) {
    rankings = JSON.parse(fs.readFileSync(RANKINGS_FILE, 'utf-8'));
  }
  if (fs.existsSync(VOCAB_FILE)) {
    const vocab = JSON.parse(fs.readFileSync(VOCAB_FILE, 'utf-8'));
    tp.wordToIndex = vocab.wordToIndex;
    tp.indexToWord = vocab.indexToWord;
    tp.vocabSize = vocab.vocabSize;
  }
  
  console.log(`📊 Existing pairs: ${trainingPairs.length}`);
  console.log(`📊 Previous rankings: ${rankings.length}`);
  
  // === PHASE 1: GPT-4o SELF-TALK ===
  console.log('\n💬 PHASE 1: GPT-4o Self-Conversation');
  console.log('-'.repeat(40));
  
  const selfConvo = await gpt4SelfConversation();
  console.log(`Messages generated: ${selfConvo.length}`);
  
  selfConvo.forEach(msg => {
    console.log(`  ${msg.role}: "${msg.content.substring(0, 80)}..."`);
  });
  
  // Add self-conversation to training data
  for (let i = 0; i < selfConvo.length - 1; i++) {
    trainingPairs.push({
      prompt: selfConvo[i].content,
      response: selfConvo[i + 1].content
    });
  }
  
  // === PHASE 2: RANK MY AI's RESPONSES ===
  console.log('\n⭐ PHASE 2: Ranking My AI Responses');
  console.log('-'.repeat(40));
  
  const testPrompts = [
    "What is artificial intelligence?",
    "How does learning work?",
    "Explain the concept of growth",
    "What makes something intelligent?",
    "Describe the process of improvement"
  ];
  
  for (const testPrompt of testPrompts) {
    // Get our AI's response
    const inputVector = tp.textToVector(testPrompt, INPUT_SIZE);
    const outputVector = brain.forward(inputVector);
    
    const words = tp.getWords();
    const wordScores = outputVector.map((score, i) => ({ word: words[i] || 'the', score }));
    wordScores.sort((a, b) => b.score - a.score);
    const responseWords = wordScores.slice(0, 15).filter(w => w.score > 0.01);
    const myResponse = responseWords.map(w => w.word).join(' ');
    
    // Get GPT-4 to rank it
    console.log(`\n  Testing: "${testPrompt}"`);
    console.log(`  My AI: "${myResponse.substring(0, 100)}"`);
    
    const ranking = await rankMyAIResponse(testPrompt, myResponse);
    const parsed = parseRanking(ranking);
    
    if (parsed) {
      console.log(`  Scores: R:${parsed.relevance} C:${parsed.coherence} H:${parsed.helpfulness} G:${parsed.grammar} I:${parsed.intelligence} | Total: ${parsed.total}`);
      console.log(`  Feedback: ${parsed.feedback}`);
      
      rankings.push({
        timestamp: new Date().toISOString(),
        prompt: testPrompt,
        response: myResponse,
        scores: parsed
      });
    }
  }
  
  // === PHASE 3: TRAIN WITH WEIGHTED DATA ===
  console.log('\n🔄 PHASE 3: Weighted Training');
  console.log('-'.repeat(40));
  
  // Weight training pairs based on rankings
  const weightedPairs = [...trainingPairs];
  
  rankings.forEach(rank => {
    if (rank.scores && rank.scores.total > 7) {
      // Good response - add similar patterns
      weightedPairs.push({
        prompt: rank.prompt,
        response: rank.response,
        weight: rank.scores.total / 10
      });
    }
  });
  
  // Build vocabulary from all data
  const allTexts = weightedPairs.map(p => p.prompt + ' ' + p.response);
  tp.buildVocabulary(allTexts);
  console.log(`📚 Vocabulary: ${tp.vocabSize} words`);
  console.log(`📊 Weighted pairs: ${weightedPairs.length}`);
  
  const endTime = Date.now() + TRAINING_MINUTES * 60 * 1000;
  let cycles = 0;
  let totalError = 0;
  
  console.log('\n⏰ Training until: ' + new Date(endTime).toISOString());
  
  while (Date.now() < endTime) {
    const pair = weightedPairs[Math.floor(Math.random() * weightedPairs.length)];
    const weight = pair.weight || 1;
    
    const inputVector = tp.textToVector(pair.prompt, INPUT_SIZE);
    const targetVector = tp.textToVector(pair.response, OUTPUT_SIZE);
    
    // Learning rate boosted for highly ranked responses
    const learningRate = 0.08 * weight;
    brain.forward(inputVector);
    const error = brain.backward(targetVector, learningRate);
    
    totalError += error;
    cycles++;
    
    if (cycles % 50 === 0) {
      const remaining = Math.max(0, Math.floor((endTime - Date.now()) / 1000));
      const avgError = totalError / cycles;
      process.stdout.write(`\r   Cycles: ${cycles} | Error: ${avgError.toFixed(4)} | Remaining: ${remaining}s`);
    }
  }
  
  console.log('\n');
  
  // Save everything
  fs.writeFileSync(BRAIN_FILE, JSON.stringify(brain.toJSON(), null, 2));
  fs.writeFileSync(VOCAB_FILE, JSON.stringify({
    wordToIndex: tp.wordToIndex,
    indexToWord: tp.indexToWord,
    vocabSize: tp.vocabSize
  }, null, 2));
  fs.writeFileSync(TRAINING_DATA, JSON.stringify(weightedPairs.slice(-1000), null, 2));
  fs.writeFileSync(RANKINGS_FILE, JSON.stringify(rankings, null, 2));
  
  // Update state
  let state = { failures: [], successes: [], stableHours: [], bestScore: 0, currentScore: 0 };
  if (fs.existsSync(STATE_FILE)) {
    const raw = fs.readFileSync(STATE_FILE, 'utf-8');
    if (raw.trim()) state = JSON.parse(raw);
  }
  
  const avgError = totalError / Math.max(cycles, 1);
  const recentRankings = rankings.slice(-5);
  const avgScore = recentRankings.reduce((sum, r) => sum + (r.scores?.total || 0), 0) / Math.max(recentRankings.length, 1);
  
  state.trainingSessions = (state.trainingSessions || 0) + 1;
  state.lastTrainingError = avgError;
  state.totalTrainingCycles = (state.totalTrainingCycles || 0) + cycles;
  state.trainingPairs = weightedPairs.length;
  state.vocabSize = tp.vocabSize;
  state.selfConversations = (state.selfConversations || 0) + 1;
  state.averageRanking = avgScore;
  state.totalRankings = rankings.length;
  
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  
  console.log('='.repeat(60));
  console.log('✅ META-TRAINING COMPLETE');
  console.log(`   Self-conversations: ${state.selfConversations}`);
  console.log(`   Rankings collected: ${rankings.length}`);
  console.log(`   Average score: ${avgScore.toFixed(1)}/10`);
  console.log(`   Training cycles: ${cycles}`);
  console.log(`   Final error: ${avgError.toFixed(4)}`);
  console.log('='.repeat(60));
}

train().catch(console.error);
