const fs = require('fs');
const path = require('path');
const { NeuralNetwork } = require('../lib/brain');
const { TextProcessor } = require('../lib/textProcessor');

const BRAIN_FILE = path.join(__dirname, '..', 'lib', 'brain_weights.json');
const STATE_FILE = path.join(__dirname, '..', 'lib', 'state.json');
const VOCAB_FILE = path.join(__dirname, '..', 'lib', 'vocab.json');
const TRAINING_DATA = path.join(__dirname, '..', 'lib', 'training_data.json');

const INPUT_SIZE = 50;
const HIDDEN_SIZE = 100;
const OUTPUT_SIZE = 50;
const TRAINING_MINUTES = 10;

// Training conversation starters
const trainingPrompts = [
  "Hello! How are you?",
  "What is the meaning of life?",
  "Tell me a fun fact",
  "How does AI work?",
  "What is love?",
  "Explain gravity simply",
  "Why is the sky blue?",
  "How do I learn programming?",
  "What's your favorite color?",
  "Tell me a story"
];

async function getGPT4Response(prompt) {
  try {
    const response = await fetch('https://models.inference.ai.azure.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.8,
        max_tokens: 100
      })
    });
    const data = await response.json();
    return data.choices[0].message.content;
  } catch (e) {
    return null;
  }
}

async function train() {
  console.log('='.repeat(60));
  console.log('🧠 NEURAL NETWORK TRAINING SESSION');
  console.log('='.repeat(60));
  console.log(`Training duration: ${TRAINING_MINUTES} minutes`);
  console.log(`Network: ${INPUT_SIZE} -> ${HIDDEN_SIZE} -> ${OUTPUT_SIZE}`);
  
  // Load or create neural network
  let brain;
  if (fs.existsSync(BRAIN_FILE)) {
    const data = JSON.parse(fs.readFileSync(BRAIN_FILE, 'utf-8'));
    brain = NeuralNetwork.fromJSON(data);
    console.log('📂 Loaded existing brain');
  } else {
    brain = new NeuralNetwork(INPUT_SIZE, HIDDEN_SIZE, OUTPUT_SIZE);
    console.log('🧠 Created new brain');
  }
  
  // Load or create text processor
  let tp = new TextProcessor(100);
  if (fs.existsSync(VOCAB_FILE)) {
    const vocab = JSON.parse(fs.readFileSync(VOCAB_FILE, 'utf-8'));
    tp.wordToIndex = vocab.wordToIndex;
    tp.indexToWord = vocab.indexToWord;
    tp.vocabSize = vocab.vocabSize;
  }
  
  // Load training data
  let trainingPairs = [];
  if (fs.existsSync(TRAINING_DATA)) {
    trainingPairs = JSON.parse(fs.readFileSync(TRAINING_DATA, 'utf-8'));
  }
  
  const endTime = Date.now() + TRAINING_MINUTES * 60 * 1000;
  let cycles = 0;
  let totalError = 0;
  let newPairs = 0;
  
  console.log(`\n⏰ Training until: ${new Date(endTime).toISOString()}`);
  console.log('🔄 Starting training loop...\n');
  
  while (Date.now() < endTime) {
    // Mix: use existing training data AND get new from GPT-4
    let prompt, response;
    
    if (Math.random() < 0.3 || trainingPairs.length < 10) {
      // Get fresh training data from GPT-4
      prompt = trainingPrompts[Math.floor(Math.random() * trainingPrompts.length)];
      response = await getGPT4Response(prompt);
      
      if (response) {
        trainingPairs.push({ prompt, response });
        newPairs++;
      }
    }
    
    if (trainingPairs.length > 0) {
      const pair = trainingPairs[Math.floor(Math.random() * trainingPairs.length)];
      prompt = pair.prompt;
      response = pair.response;
    } else {
      continue;
    }
    
    // Update vocabulary
    tp.buildVocabulary([prompt, response]);
    
    // Convert to vectors
    const inputVector = tp.textToVector(prompt, INPUT_SIZE);
    const targetVector = tp.textToVector(response, OUTPUT_SIZE);
    
    // Train
    brain.forward(inputVector);
    const error = brain.backward(targetVector, 0.05);
    totalError += error;
    cycles++;
    
    if (cycles % 10 === 0) {
      const remaining = Math.max(0, Math.floor((endTime - Date.now()) / 1000));
      const avgError = totalError / cycles;
      process.stdout.write(`\r   Cycles: ${cycles} | Error: ${avgError.toFixed(4)} | New pairs: ${newPairs} | Remaining: ${remaining}s`);
    }
    
    // Small delay to avoid rate limiting
    if (cycles % 5 === 0) await new Promise(r => setTimeout(r, 500));
  }
  
  console.log('\n');
  
  // Save everything
  fs.writeFileSync(BRAIN_FILE, JSON.stringify(brain.toJSON(), null, 2));
  fs.writeFileSync(VOCAB_FILE, JSON.stringify({
    wordToIndex: tp.wordToIndex,
    indexToWord: tp.indexToWord,
    vocabSize: tp.vocabSize
  }, null, 2));
  fs.writeFileSync(TRAINING_DATA, JSON.stringify(trainingPairs.slice(-500), null, 2)); // Keep last 500
  
  // Update state
  let state = { failures: [], successes: [], stableHours: [], bestScore: 0, currentScore: 0, trainingSessions: 0 };
  if (fs.existsSync(STATE_FILE)) {
    state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
  }
  
  state.trainingSessions = (state.trainingSessions || 0) + 1;
  state.lastTrainingError = totalError / Math.max(cycles, 1);
  state.totalTrainingCycles = (state.totalTrainingCycles || 0) + cycles;
  state.trainingPairs = trainingPairs.length;
  
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  
  console.log('='.repeat(60));
  console.log('✅ TRAINING COMPLETE');
  console.log(`   Cycles: ${cycles}`);
  console.log(`   Avg error: ${(totalError / cycles).toFixed(4)}`);
  console.log(`   New pairs: ${newPairs}`);
  console.log(`   Total pairs: ${trainingPairs.length}`);
  console.log(`   Vocabulary: ${tp.vocabSize} words`);
  console.log(`   Sessions: ${state.trainingSessions}`);
  console.log('='.repeat(60));
}

train().catch(console.error);
