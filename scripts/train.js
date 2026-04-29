const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { NeuralNetwork } = require('../lib/brain');
const { TextProcessor } = require('../lib/textProcessor');

const BRAIN_FILE = path.join(__dirname, '..', 'lib', 'brain_weights.json');
const STATE_FILE = path.join(__dirname, '..', 'lib', 'state.json');
const VOCAB_FILE = path.join(__dirname, '..', 'lib', 'vocab.json');
const TRAINING_DATA = path.join(__dirname, '..', 'lib', 'training_data.json');
const RANKINGS_FILE = path.join(__dirname, '..', 'lib', 'rankings.json');
const SELF_TALK_FILE = path.join(__dirname, '..', 'lib', 'self_talk.json');

const INPUT_SIZE = 100;
const HIDDEN_SIZE = 200;
const OUTPUT_SIZE = 100;
const TRAINING_MINUTES = 10;

// Available free models
const MODELS = [
  'gpt-4o-mini',
  'Phi-3-mini-4k-instruct',
  'Llama-3.2-3B-Instruct',
  'AI21-Jamba-1.5-Mini'
];

// Safe files to learn from (read-only, no editing)
const CODE_FILES = [
  'pages/api/chat.js',
  'pages/index.js',
  'scripts/improve.js',
  'scripts/train.js',
  'lib/brain.js',
  'lib/textProcessor.js'
];

async function callModel(model, messages) {
  try {
    const response = await fetch('https://models.inference.ai.azure.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`
      },
      body: JSON.stringify({ model, messages, temperature: 0.85, max_tokens: 200 })
    });
    const data = await response.json();
    if (data.error) throw new Error(data.error.message);
    return data.choices[0].message.content;
  } catch (e) {
    return null;
  }
}

// Multiple AI models debate each other
async function multiModelDebate(topic) {
  console.log(`\n  🎤 Multi-Model Debate: "${topic}"`);
  
  const results = [];
  
  // Get responses from different models
  for (const model of MODELS.slice(0, 2)) {
    const response = await callModel(model, [
      { role: 'system', content: 'You are a knowledgeable AI. Give a detailed, helpful response.' },
      { role: 'user', content: topic }
    ]);
    
    if (response) {
      results.push({ model, response });
      console.log(`  ${model}: "${response.substring(0, 80)}..."`);
    }
    await new Promise(r => setTimeout(r, 500));
  }
  
  if (results.length < 2) return null;
  
  // Have a third model judge and combine
  const judgePrompt = `You are an expert judge. Combine the best parts of these two responses into ONE improved response. Keep it under 150 words.\n\nResponse 1: ${results[0].response}\n\nResponse 2: ${results[1].response}`;
  
  const combined = await callModel(MODELS[0], [
    { role: 'system', content: 'You are an expert at combining information into clear, concise responses.' },
    { role: 'user', content: judgePrompt }
  ]);
  
  if (combined) {
    console.log(`  ✅ COMBINED: "${combined.substring(0, 80)}..."`);
  }
  
  return {
    topic,
    responses: results,
    combined: combined || results[0].response
  };
}

// GPT-4o talks to itself
async function gpt4SelfConversation() {
  const topics = [
    "What is the nature of intelligence?",
    "How does learning transform the mind?",
    "What makes humans and machines different?",
    "The relationship between language and thought",
    "How does creativity emerge?",
    "What is the role of curiosity in growth?",
    "The ethics of artificial consciousness",
    "How do we measure understanding?",
    "The beauty of mathematical patterns",
    "What defines meaningful communication?"
  ];
  
  const topic = topics[Math.floor(Math.random() * topics.length)];
  const conversation = [];
  
  const starter = await callModel(MODELS[0], [
    { role: 'system', content: 'You are a deep philosophical thinker. Start a conversation with a thought-provoking question.' },
    { role: 'user', content: `Start a deep conversation about: ${topic}` }
  ]);
  
  if (!starter) return [];
  conversation.push({ role: 'Thinker A', content: starter });
  
  const response1 = await callModel(MODELS[1] || MODELS[0], [
    { role: 'system', content: 'You have a unique and different perspective. Respond thoughtfully.' },
    { role: 'user', content: starter }
  ]);
  
  if (!response1) return conversation;
  conversation.push({ role: 'Thinker B', content: response1 });
  
  const response2 = await callModel(MODELS[0], [
    { role: 'system', content: 'Build on this exchange. Find deeper meaning.' },
    { role: 'user', content: `You said: ${starter}\nThey said: ${response1}\nFind a deeper connection.` }
  ]);
  
  if (!response2) return conversation;
  conversation.push({ role: 'Thinker A', content: response2 });
  
  return conversation;
}

// Learn from code files (read-only)
function learnFromCode() {
  console.log('\n📚 PHASE: Code Learning');
  console.log('-'.repeat(40));
  
  const codePairs = [];
  
  for (const filePath of CODE_FILES) {
    try {
      if (fs.existsSync(path.join(__dirname, '..', filePath))) {
        const code = fs.readFileSync(path.join(__dirname, '..', filePath), 'utf-8');
        const fileName = path.basename(filePath);
        
        // Create training pairs from code
        codePairs.push({
          prompt: `Explain what ${fileName} does`,
          response: `${fileName} is a file that contains ${code.split('\n').length} lines of code. It handles ${getCodePurpose(fileName)}.`
        });
        
        codePairs.push({
          prompt: `How is ${fileName} structured?`,
          response: `The ${fileName} file uses ${code.includes('import') ? 'ES modules' : 'CommonJS'} and contains ${(code.match(/function/g) || []).length} functions. Key patterns include ${code.includes('try') ? 'error handling' : 'basic logic'}, ${code.includes('async') ? 'async operations' : 'synchronous code'}, and ${code.includes('export') ? 'module exports' : 'inline code'}.`
        });
        
        // Learn from the actual code content
        const codeLines = code.split('\n').filter(l => l.trim().length > 0);
        const meaningfulLines = codeLines.filter(l => 
          l.includes('//') || l.includes('function') || l.includes('const') || 
          l.includes('let') || l.includes('if') || l.includes('return')
        );
        
        if (meaningfulLines.length > 0) {
          const codeSample = meaningfulLines.slice(0, 5).join(' | ');
          codePairs.push({
            prompt: `What coding patterns are in ${fileName}?`,
            response: `In ${fileName}, you can find patterns like: ${codeSample.substring(0, 200)}`
          });
        }
        
        console.log(`  📄 ${fileName}: ${codePairs.length} pairs created`);
      }
    } catch (e) {
      console.log(`  ⚠️ Could not read ${filePath}`);
    }
  }
  
  return codePairs;
}

function getCodePurpose(fileName) {
  const purposes = {
    'chat.js': 'user message processing and response generation using the neural network',
    'index.js': 'the chat user interface with React components and message display',
    'improve.js': 'evaluation and reward scoring for the self-improvement system',
    'train.js': 'neural network training with multiple AI models and knowledge building',
    'brain.js': 'the core neural network class with forward and backward propagation',
    'textProcessor.js': 'text-to-vector conversion and vocabulary management'
  };
  return purposes[fileName] || 'application logic and data processing';
}

// Rich knowledge seeding
async function generateKnowledgeDebates() {
  const topics = [
    "Explain how computers process information step by step",
    "What are the fundamental principles of physics?",
    "How does the scientific method work?",
    "Explain the water cycle in detail",
    "What are the main branches of mathematics?",
    "How does evolution by natural selection work?",
    "What is the structure of an atom?",
    "Explain how the internet transmits data",
    "What causes weather patterns?",
    "How do ecosystems maintain balance?",
    "What is the history of the internet?",
    "Explain how vaccines work in the body",
    "What are the layers of the Earth?",
    "How does photosynthesis convert light to energy?",
    "What is the difference between bacteria and viruses?",
    "Explain how democracy functions",
    "What causes earthquakes and volcanoes?",
    "How do airplanes achieve flight?",
    "What is the greenhouse effect?",
    "Explain how batteries store and release energy"
  ];
  
  const debates = [];
  const shuffled = topics.sort(() => Math.random() - 0.5).slice(0, 5);
  
  for (const topic of shuffled) {
    const debate = await multiModelDebate(topic);
    if (debate && debate.combined) {
      debates.push({
        prompt: topic,
        response: debate.combined
      });
    }
    await new Promise(r => setTimeout(r, 1000));
  }
  
  return debates;
}

async function train() {
  console.log('='.repeat(60));
  console.log('🧠 MULTI-MODEL TRAINING WITH CODE LEARNING');
  console.log('='.repeat(60));
  console.log(`Models: ${MODELS.join(', ')}`);
  console.log(`Code files: ${CODE_FILES.length}`);
  console.log(`Duration: ${TRAINING_MINUTES} minutes`);
  console.log(`Network: ${INPUT_SIZE} → ${HIDDEN_SIZE} → ${OUTPUT_SIZE}\n`);
  
  // Load brain
  let brain;
  if (fs.existsSync(BRAIN_FILE)) {
    const data = JSON.parse(fs.readFileSync(BRAIN_FILE, 'utf-8'));
    if (data.inputSize === INPUT_SIZE && data.outputSize === OUTPUT_SIZE) {
      brain = NeuralNetwork.fromJSON(data);
    } else {
      brain = new NeuralNetwork(INPUT_SIZE, HIDDEN_SIZE, OUTPUT_SIZE);
    }
  } else {
    brain = new NeuralNetwork(INPUT_SIZE, HIDDEN_SIZE, OUTPUT_SIZE);
  }
  console.log('✅ Brain loaded\n');
  
  // Load existing data
  let trainingPairs = [];
  if (fs.existsSync(TRAINING_DATA)) {
    trainingPairs = JSON.parse(fs.readFileSync(TRAINING_DATA, 'utf-8'));
  }
  console.log(`📊 Existing training pairs: ${trainingPairs.length}`);
  
  let rankings = [];
  if (fs.existsSync(RANKINGS_FILE)) {
    rankings = JSON.parse(fs.readFileSync(RANKINGS_FILE, 'utf-8'));
  }
  
  // === PHASE 1: Code Learning ===
  const codePairs = learnFromCode();
  trainingPairs.push(...codePairs);
  console.log(`\n📊 After code learning: ${trainingPairs.length} pairs`);
  
  // === PHASE 2: Multi-Model Debates ===
  console.log('\n🎤 PHASE: Multi-Model Knowledge Debates');
  console.log('-'.repeat(40));
  const debatePairs = await generateKnowledgeDebates();
  trainingPairs.push(...debatePairs);
  console.log(`\n📊 After debates: ${trainingPairs.length} pairs`);
  
  // === PHASE 3: Self-Talk ===
  console.log('\n💬 PHASE: AI Self-Conversation');
  console.log('-'.repeat(40));
  const selfConvo = await gpt4SelfConversation();
  
  let selfTalks = [];
  if (fs.existsSync(SELF_TALK_FILE)) {
    selfTalks = JSON.parse(fs.readFileSync(SELF_TALK_FILE, 'utf-8'));
  }
  selfTalks.push({ timestamp: new Date().toISOString(), conversation: selfConvo });
  fs.writeFileSync(SELF_TALK_FILE, JSON.stringify(selfTalks.slice(-20), null, 2));
  
  for (let i = 0; i < selfConvo.length - 1; i++) {
    trainingPairs.push({
      prompt: selfConvo[i].content,
      response: selfConvo[i + 1].content
    });
  }
  console.log(`Self-talk messages: ${selfConvo.length}`);
  console.log(`\n📊 After self-talk: ${trainingPairs.length} pairs`);
  
  // === PHASE 4: Rank Your AI ===
  console.log('\n⭐ PHASE: Ranking Bot Responses');
  console.log('-'.repeat(40));
  
  const testPrompts = [
    "What is artificial intelligence?",
    "How does learning work?",
    "What makes something intelligent?",
    "Explain the concept of growth"
  ];
  
  for (const testPrompt of testPrompts.slice(0, 2)) {
    const { TextProcessor } = require('../lib/textProcessor');
    let tp = new TextProcessor(500);
    if (fs.existsSync(VOCAB_FILE)) {
      const vocab = JSON.parse(fs.readFileSync(VOCAB_FILE, 'utf-8'));
      tp.wordToIndex = vocab.wordToIndex;
      tp.indexToWord = vocab.indexToWord;
      tp.vocabSize = vocab.vocabSize;
    }
    
    const inputVector = tp.textToVector(testPrompt, INPUT_SIZE);
    const outputVector = brain.forward(inputVector);
    const words = tp.getWords();
    
    const wordScores = [];
    for (let i = 0; i < Math.min(outputVector.length, words.length); i++) {
      if (words[i] && words[i].length > 1) {
        wordScores.push({ word: words[i], score: outputVector[i] });
      }
    }
    wordScores.sort((a, b) => b.score - a.score);
    const myResponse = wordScores.slice(0, 10).map(w => w.word).join(' ');
    
    const ranking = await callModel(MODELS[0], [
      { role: 'system', content: 'Rate this response 1-10 for relevance, coherence, helpfulness. Format: TOTAL: [score]' },
      { role: 'user', content: `Prompt: "${testPrompt}"\nResponse: "${myResponse}"\nRate:` }
    ]);
    
    if (ranking) {
      const scoreMatch = ranking.match(/TOTAL:\s*(\d+)/);
      const score = scoreMatch ? parseInt(scoreMatch[1]) : 5;
      rankings.push({ timestamp: new Date().toISOString(), prompt: testPrompt, response: myResponse, score });
      console.log(`  "${testPrompt}" → Score: ${score}/10`);
    }
  }
  
  fs.writeFileSync(RANKINGS_FILE, JSON.stringify(rankings, null, 2));
  
  // === PHASE 5: Weighted Neural Training ===
  console.log('\n🔄 PHASE: Neural Network Training');
  console.log('-'.repeat(40));
  
  let tp = new TextProcessor(500);
  const allTexts = trainingPairs.map(p => p.prompt + ' ' + p.response);
  tp.buildVocabulary(allTexts);
  
  const weightedPairs = trainingPairs.map(p => {
    let weight = 1;
    const rank = rankings.find(r => r.prompt && p.prompt && p.prompt.includes(r.prompt.substring(0, 20)));
    if (rank && rank.score > 7) weight = 2;
    return { ...p, weight };
  });
  
  console.log(`Vocabulary: ${tp.vocabSize} words`);
  console.log(`Weighted pairs: ${weightedPairs.length}\n`);
  
  const endTime = Date.now() + (TRAINING_MINUTES - 2) * 60 * 1000;
  let cycles = 0;
  let totalError = 0;
  
  while (Date.now() < endTime) {
    const pair = weightedPairs[Math.floor(Math.random() * weightedPairs.length)];
    const weight = pair.weight || 1;
    
    const inputVector = tp.textToVector(pair.prompt, INPUT_SIZE);
    const targetVector = tp.textToVector(pair.response, OUTPUT_SIZE);
    
    const learningRate = 0.08 * weight * (1 - Math.min(cycles / 3000, 0.7));
    brain.forward(inputVector);
    const error = brain.backward(targetVector, learningRate);
    
    totalError += error;
    cycles++;
    
    if (cycles % 40 === 0) {
      const remaining = Math.max(0, Math.floor((endTime - Date.now()) / 1000));
      const avgError = totalError / cycles;
      process.stdout.write(`\r   Cycles: ${cycles} | Error: ${avgError.toFixed(4)} | Rate: ${learningRate.toFixed(4)} | ${remaining}s left`);
    }
    
    if (cycles % 30 === 0) await new Promise(r => setTimeout(r, 100));
  }
  
  console.log('\n');
  
  // === SAVE EVERYTHING ===
  fs.writeFileSync(BRAIN_FILE, JSON.stringify(brain.toJSON(), null, 2));
  fs.writeFileSync(VOCAB_FILE, JSON.stringify({
    wordToIndex: tp.wordToIndex,
    indexToWord: tp.indexToWord,
    vocabSize: tp.vocabSize
  }, null, 2));
  
  const uniquePairs = trainingPairs.filter((p, i, arr) =>
    arr.findIndex(t => t.prompt === p.prompt && t.response === p.response) === i
  );
  fs.writeFileSync(TRAINING_DATA, JSON.stringify(uniquePairs.slice(-1500), null, 2));
  
  let state = {};
  if (fs.existsSync(STATE_FILE)) {
    const raw = fs.readFileSync(STATE_FILE, 'utf-8');
    if (raw.trim()) state = JSON.parse(raw);
  }
  
  const avgError = totalError / Math.max(cycles, 1);
  const avgRanking = rankings.length > 0
    ? rankings.slice(-5).reduce((s, r) => s + (r.score || 5), 0) / Math.min(rankings.length, 5)
    : 0;
  
  state.trainingSessions = (state.trainingSessions || 0) + 1;
  state.lastTrainingError = avgError;
  state.totalTrainingCycles = (state.totalTrainingCycles || 0) + cycles;
  state.trainingPairs = uniquePairs.length;
  state.vocabSize = tp.vocabSize;
  state.selfConversations = (state.selfConversations || 0) + 1;
  state.averageRanking = avgRanking;
  state.totalRankings = rankings.length;
  state.codeFiles = CODE_FILES.length;
  state.modelsUsed = MODELS.slice(0, 2);
  state.lastTrainingTime = new Date().toISOString();
  
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  
  console.log('='.repeat(60));
  console.log('✅ MULTI-MODEL TRAINING COMPLETE');
  console.log(`   Models used: ${state.modelsUsed.join(', ')}`);
  console.log(`   Debates: ${debatePairs.length}`);
  console.log(`   Code pairs: ${codePairs.length}`);
  console.log(`   Self-talks: ${selfTalks.length}`);
  console.log(`   Total pairs: ${uniquePairs.length}`);
  console.log(`   Vocab size: ${tp.vocabSize}`);
  console.log(`   Training cycles: ${cycles}`);
  console.log(`   Avg error: ${avgError.toFixed(4)}`);
  console.log(`   Avg ranking: ${avgRanking.toFixed(1)}/10`);
  console.log('='.repeat(60));
}

train().catch(console.error);
