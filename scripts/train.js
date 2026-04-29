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
  'scripts/keep-alive.js',
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
  console.log(`\n  🎤 Multi-Model Debate: "${topic.substring(0, 60)}..."`);
  
  const results = [];
  
  // Get responses from different models
  for (const model of MODELS.slice(0, 2)) {
    const response = await callModel(model, [
      { role: 'system', content: 'You are a knowledgeable AI. Give a detailed, helpful response.' },
      { role: 'user', content: topic }
    ]);
    
    if (response) {
      results.push({ model, response });
      console.log(`     ${model}: "${response.substring(0, 60)}..."`);
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
    console.log(`     ✅ COMBINED: "${combined.substring(0, 60)}..."`);
  }
  
  return {
    topic,
    responses: results,
    combined: combined || results[0].response
  };
}

// GPT-4o talks to itself - deep philosophical conversations
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
    { role: 'system', content: 'Build on this exchange. Find deeper meaning and ask another question.' },
    { role: 'user', content: `You said: ${starter}\nThey said: ${response1}\nFind a deeper connection and continue.` }
  ]);
  
  if (!response2) return conversation;
  conversation.push({ role: 'Thinker A', content: response2 });
  
  const response3 = await callModel(MODELS[1] || MODELS[0], [
    { role: 'system', content: 'Offer a concluding insight that synthesizes this conversation.' },
    { role: 'user', content: `The conversation so far:\nA: ${starter}\nB: ${response1}\nA: ${response2}\nProvide a meaningful conclusion.` }
  ]);
  
  if (!response3) return conversation;
  conversation.push({ role: 'Thinker B', content: response3 });
  
  return conversation;
}

// Learn from code files (read-only)
function learnFromCode() {
  console.log('\n📚 PHASE 1: Code Learning');
  console.log('-'.repeat(40));
  
  const codePairs = [];
  
  for (const filePath of CODE_FILES) {
    try {
      const fullPath = path.join(__dirname, '..', filePath);
      if (fs.existsSync(fullPath)) {
        const code = fs.readFileSync(fullPath, 'utf-8');
        const fileName = path.basename(filePath);
        const lineCount = code.split('\n').length;
        const functionCount = (code.match(/function\s+\w+/g) || []).length + (code.match(/=>\s*{/g) || []).length;
        const hasAsync = code.includes('async');
        const hasAwait = code.includes('await');
        const hasImports = code.includes('require(') || code.includes('import ');
        const hasExports = code.includes('module.exports') || code.includes('export ');
        const hasErrorHandling = code.includes('try') && code.includes('catch');
        const hasLoops = code.includes('for ') || code.includes('while ');
        const hasConditionals = code.includes('if ') || code.includes('else');
        const hasArrays = code.includes('[') && code.includes(']');
        const hasObjects = code.includes('{') && code.includes('}');
        
        // Create descriptive training pairs about this code
        codePairs.push({
          prompt: `What does ${fileName} do?`,
          response: `${fileName} is a ${lineCount}-line JavaScript file that handles ${getCodePurpose(fileName)}. It ${hasAsync ? 'uses async operations' : 'runs synchronously'}, ${hasErrorHandling ? 'includes error handling' : 'has basic logic flow'}, and ${hasExports ? 'exports functionality for other files' : 'runs independently'}.`
        });
        
        codePairs.push({
          prompt: `How is ${fileName} structured?`,
          response: `The ${fileName} file contains approximately ${functionCount} functions. It ${hasImports ? 'imports dependencies from' : 'is self-contained without'} other modules. The code structure includes ${hasConditionals ? 'conditional logic' : ''}${hasConditionals && hasLoops ? ' and ' : ''}${hasLoops ? 'loop iterations' : ''}${!hasConditionals && !hasLoops ? 'straight-line execution' : ''}. It ${hasErrorHandling ? 'has robust error handling with try-catch blocks' : 'relies on basic error flows'}.`
        });
        
        codePairs.push({
          prompt: `What programming concepts are used in ${fileName}?`,
          response: `${fileName} demonstrates several programming concepts: ${hasAsync ? 'asynchronous programming' : 'synchronous execution'}, ${hasArrays ? 'data structures (arrays/objects)' : ''}${hasArrays && hasObjects ? ', ' : ''}${hasObjects ? 'object manipulation' : ''}, ${hasErrorHandling ? 'error handling patterns' : ''}${hasErrorHandling && hasExports ? ', ' : ''}${hasExports ? 'module organization' : ''}. The code follows ${code.includes('class ') ? 'object-oriented' : 'functional'} programming style.`
        });
        
        // Learn from actual code content
        const codeLines = code.split('\n').filter(l => l.trim().length > 10 && !l.trim().startsWith('//'));
        const keyLines = codeLines.filter(l => 
          l.includes('function') || l.includes('const ') || l.includes('let ') || 
          l.includes('if (') || l.includes('for (') || l.includes('return ') ||
          l.includes('await ') || l.includes('try {') || l.includes('catch (')
        ).slice(0, 3);
        
        if (keyLines.length > 0) {
          const codeSnippet = keyLines.map(l => l.trim()).join(' | ');
          codePairs.push({
            prompt: `Show me example code from ${fileName}`,
            response: `In ${fileName}, you can see code like: ${codeSnippet.substring(0, 300)}`
          });
        }
        
        console.log(`  📄 ${fileName}: ${lineCount} lines, ${functionCount} functions`);
      }
    } catch (e) {
      console.log(`  ⚠️ Could not read ${filePath}: ${e.message}`);
    }
  }
  
  console.log(`  ✅ Created ${codePairs.length} code learning pairs`);
  return codePairs;
}

function getCodePurpose(fileName) {
  const purposes = {
    'chat.js': 'user message processing and AI response generation using neural networks and training data matching',
    'index.js': 'the chat user interface built with React, displaying messages with avatars and handling user input',
    'improve.js': 'evaluation and reward scoring that measures if the AI is getting smarter or dumber over time',
    'train.js': 'multi-model neural network training with debates, self-talk, code learning, and response ranking',
    'keep-alive.js': 'monitoring that detects training gaps and ensures continuous improvement cycles',
    'brain.js': 'a pure JavaScript neural network class implementing forward propagation and backpropagation',
    'textProcessor.js': 'text-to-vector conversion, vocabulary management, and natural language processing utilities'
  };
  return purposes[fileName] || 'application logic and data processing for the self-improving chatbot system';
}

// Rich knowledge debates on varied topics
async function generateKnowledgeDebates() {
  const topics = [
    "Explain how computers process information step by step from input to output",
    "What are the fundamental principles of physics that govern our universe?",
    "How does the scientific method work and why is it important?",
    "Explain the water cycle and its impact on Earth's climate",
    "What are the main branches of mathematics and their applications?",
    "How does evolution by natural selection drive species change?",
    "What is the structure of an atom and how was it discovered?",
    "Explain how the internet transmits data across the world",
    "What causes weather patterns and how do meteorologists predict them?",
    "How do ecosystems maintain balance through food webs?",
    "What is the history of computing from abacus to quantum?",
    "Explain how vaccines train the immune system to fight disease",
    "What are the layers of the Earth and how do they interact?",
    "How does photosynthesis convert sunlight into chemical energy?",
    "What is the difference between bacteria and viruses?",
    "Explain how democratic systems of government function",
    "What causes earthquakes and how do we measure them?",
    "How do airplanes achieve and maintain flight?",
    "What is the greenhouse effect and climate change?",
    "Explain how batteries store and release electrical energy",
    "How does the human brain process and store memories?",
    "What is blockchain technology and how does it work?",
    "Explain the concept of supply and demand in economics",
    "How do telescopes help us understand the universe?",
    "What is the role of DNA in genetics and inheritance?"
  ];
  
  const debates = [];
  const shuffled = topics.sort(() => Math.random() - 0.5).slice(0, 5);
  
  console.log('\n🎤 PHASE 2: Multi-Model Knowledge Debates');
  console.log('-'.repeat(40));
  
  for (let i = 0; i < shuffled.length; i++) {
    console.log(`  Debate ${i + 1}/5:`);
    const debate = await multiModelDebate(shuffled[i]);
    if (debate && debate.combined) {
      debates.push({
        prompt: shuffled[i],
        response: debate.combined
      });
    }
    await new Promise(r => setTimeout(r, 1000));
  }
  
  console.log(`  ✅ Created ${debates.length} debate-based pairs`);
  return debates;
}

// Rank your own AI's responses
async function rankMyAI(brain, tp) {
  console.log('\n⭐ PHASE 3: Self-Evaluation & Ranking');
  console.log('-'.repeat(40));
  
  const testPrompts = [
    "What is artificial intelligence?",
    "How does learning work?",
    "What makes something intelligent?",
    "Explain the concept of growth",
    "How do computers solve problems?",
    "What is the meaning of knowledge?",
    "How do you improve yourself?",
    "What is the future of technology?"
  ];
  
  const newRankings = [];
  
  for (let i = 0; i < Math.min(3, testPrompts.length); i++) {
    const testPrompt = testPrompts[i];
    
    // Get our AI's response
    const inputVector = tp.textToVector(testPrompt, INPUT_SIZE);
    const outputVector = brain.forward(inputVector);
    const words = tp.getWords();
    
    const wordScores = [];
    for (let j = 0; j < Math.min(outputVector.length, words.length); j++) {
      if (words[j] && words[j].length > 1 && outputVector[j] > 0.001) {
        wordScores.push({ word: words[j], score: outputVector[j] });
      }
    }
    wordScores.sort((a, b) => b.score - a.score);
    
    const stopWords = ['the', 'a', 'an', 'is', 'was', 'are', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'shall', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during', 'before', 'after', 'and', 'or', 'but', 'if', 'that', 'this', 'it', 'its', 'so', 'very', 'just'];
    const contentWords = wordScores.filter(w => !stopWords.includes(w.word.toLowerCase()));
    const topWords = contentWords.slice(0, 12).map(w => w.word);
    
    let myResponse;
    if (topWords.length >= 3) {
      myResponse = topWords.join(' ') + '.';
      myResponse = myResponse.charAt(0).toUpperCase() + myResponse.slice(1);
    } else {
      myResponse = "I am still learning about this topic.";
    }
    
    // Have GPT-4 rate it
    const ranking = await callModel(MODELS[0], [
      { 
        role: 'system', 
        content: 'Rate this AI response on a scale of 1-10 for relevance, coherence, and helpfulness. Respond ONLY with: TOTAL: [number]' 
      },
      { 
        role: 'user', 
        content: `Prompt: "${testPrompt}"\nResponse: "${myResponse}"\nRate:` 
      }
    ]);
    
    if (ranking) {
      const scoreMatch = ranking.match(/TOTAL:\s*(\d+)/);
      const score = scoreMatch ? parseInt(scoreMatch[1]) : 5;
      newRankings.push({ 
        timestamp: new Date().toISOString(), 
        prompt: testPrompt, 
        response: myResponse, 
        score 
      });
      console.log(`  Q: "${testPrompt.substring(0, 40)}..." → Score: ${score}/10`);
    }
    
    await new Promise(r => setTimeout(r, 500));
  }
  
  return newRankings;
}

async function train() {
  const startTime = Date.now();
  
  console.log('='.repeat(70));
  console.log('🧠 MULTI-MODEL NEURAL NETWORK TRAINING');
  console.log('='.repeat(70));
  console.log(`Models: ${MODELS.slice(0, 2).join(' + ')}`);
  console.log(`Code files to learn: ${CODE_FILES.length}`);
  console.log(`Training duration: ${TRAINING_MINUTES} minutes`);
  console.log(`Network architecture: ${INPUT_SIZE} → ${HIDDEN_SIZE} → ${OUTPUT_SIZE}`);
  console.log(`Start time: ${new Date().toISOString()}\n`);
  
  // Load or create brain
  let brain;
  if (fs.existsSync(BRAIN_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(BRAIN_FILE, 'utf-8'));
      if (data.inputSize === INPUT_SIZE && data.outputSize === OUTPUT_SIZE) {
        brain = NeuralNetwork.fromJSON(data);
        console.log('📂 Loaded existing brain weights');
      } else {
        brain = new NeuralNetwork(INPUT_SIZE, HIDDEN_SIZE, OUTPUT_SIZE);
        console.log('🧠 Created new brain (architecture changed)');
      }
    } catch (e) {
      brain = new NeuralNetwork(INPUT_SIZE, HIDDEN_SIZE, OUTPUT_SIZE);
      console.log('🧠 Created new brain (load error)');
    }
  } else {
    brain = new NeuralNetwork(INPUT_SIZE, HIDDEN_SIZE, OUTPUT_SIZE);
    console.log('🧠 Created new brain (first run)');
  }
  
  // Load existing data
  let trainingPairs = [];
  if (fs.existsSync(TRAINING_DATA)) {
    try {
      trainingPairs = JSON.parse(fs.readFileSync(TRAINING_DATA, 'utf-8'));
      console.log(`📊 Loaded ${trainingPairs.length} existing training pairs`);
    } catch (e) {
      console.log('📊 Starting fresh training data');
    }
  }
  
  let rankings = [];
  if (fs.existsSync(RANKINGS_FILE)) {
    try {
      rankings = JSON.parse(fs.readFileSync(RANKINGS_FILE, 'utf-8'));
      console.log(`⭐ Loaded ${rankings.length} previous rankings`);
    } catch (e) {}
  }
  
  let selfTalks = [];
  if (fs.existsSync(SELF_TALK_FILE)) {
    try {
      selfTalks = JSON.parse(fs.readFileSync(SELF_TALK_FILE, 'utf-8'));
    } catch (e) {}
  }
  
  // === PHASE 1: Code Learning ===
  const codePairs = learnFromCode();
  trainingPairs.push(...codePairs);
  
  // === PHASE 2: Multi-Model Debates ===
  const debatePairs = await generateKnowledgeDebates();
  trainingPairs.push(...debatePairs);
  
  // === PHASE 3: Self-Talk ===
  console.log('\n💬 PHASE 3: AI Self-Conversation');
  console.log('-'.repeat(40));
  const selfConvo = await gpt4SelfConversation();
  
  selfTalks.push({ 
    timestamp: new Date().toISOString(), 
    conversation: selfConvo,
    topic: selfConvo[0]?.content?.substring(0, 100) || 'unknown'
  });
  
  // Keep last 30 self-talks
  if (selfTalks.length > 30) selfTalks = selfTalks.slice(-30);
  
  for (let i = 0; i < selfConvo.length - 1; i++) {
    trainingPairs.push({
      prompt: selfConvo[i].content,
      response: selfConvo[i + 1].content
    });
  }
  console.log(`  Self-talk messages: ${selfConvo.length}`);
  console.log(`  Total self-talks stored: ${selfTalks.length}`);
  
  // === PHASE 4: Build Vocabulary ===
  console.log('\n📚 Building Vocabulary');
  console.log('-'.repeat(40));
  
  let tp = new TextProcessor(500);
  const allTexts = trainingPairs.map(p => p.prompt + ' ' + p.response);
  
  // Also add code file contents for richer vocabulary
  CODE_FILES.forEach(filePath => {
    const fullPath = path.join(__dirname, '..', filePath);
    if (fs.existsSync(fullPath)) {
      try {
        allTexts.push(fs.readFileSync(fullPath, 'utf-8'));
      } catch (e) {}
    }
  });
  
  tp.buildVocabulary(allTexts);
  console.log(`  Vocabulary size: ${tp.vocabSize} words`);
  
  // === PHASE 5: Rank Your AI ===
  const newRankings = await rankMyAI(brain, tp);
  rankings.push(...newRankings);
  if (rankings.length > 100) rankings = rankings.slice(-100);
  
  // === PHASE 6: Weighted Neural Training ===
  console.log('\n🔄 PHASE 4: Neural Network Training');
  console.log('-'.repeat(40));
  
  // Weight pairs based on rankings
  const weightedPairs = trainingPairs.map(p => {
    let weight = 1;
    // Check if this pair is similar to a highly-ranked response
    for (const rank of rankings.slice(-20)) {
      if (rank.score >= 8 && p.response && rank.response) {
        const similarity = getWordOverlap(p.response, rank.response);
        if (similarity > 0.3) weight = 2;
      }
    }
    // Code learning pairs get extra weight
    if (p.prompt.includes('.js') || p.prompt.includes('code') || p.prompt.includes('programming')) {
      weight *= 1.5;
    }
    return { ...p, weight };
  });
  
  console.log(`  Weighted pairs: ${weightedPairs.length}`);
  console.log(`  Average weight: ${(weightedPairs.reduce((s, p) => s + p.weight, 0) / weightedPairs.length).toFixed(2)}`);
  
  const trainingEndTime = startTime + (TRAINING_MINUTES - 1) * 60 * 1000;
  let cycles = 0;
  let totalError = 0;
  let bestError = Infinity;
  
  console.log('\n  Training...');
  
  while (Date.now() < trainingEndTime) {
    const pair = weightedPairs[Math.floor(Math.random() * weightedPairs.length)];
    const weight = pair.weight || 1;
    
    const inputVector = tp.textToVector(pair.prompt, INPUT_SIZE);
    const targetVector = tp.textToVector(pair.response, OUTPUT_SIZE);
    
    // Adaptive learning rate - starts high, decays over time
    const learningRate = 0.1 * weight * Math.max(0.1, 1 - (cycles / 4000));
    
    brain.forward(inputVector);
    const error = brain.backward(targetVector, learningRate);
    
    totalError += error;
    if (error < bestError) bestError = error;
    cycles++;
    
    if (cycles % 50 === 0) {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const remaining = Math.max(0, Math.floor((trainingEndTime - Date.now()) / 1000));
      const avgError = totalError / cycles;
      const progress = Math.min(100, Math.floor((elapsed / (TRAINING_MINUTES * 60)) * 100));
      const bar = '█'.repeat(Math.floor(progress / 5)) + '░'.repeat(20 - Math.floor(progress / 5));
      process.stdout.write(`\r  [${bar}] ${progress}% | Cycles: ${cycles} | Error: ${avgError.toFixed(4)} | Best: ${bestError.toFixed(4)} | ${remaining}s left`);
    }
    
    // Small delay to prevent overwhelming
    if (cycles % 100 === 0) await new Promise(r => setTimeout(r, 50));
  }
  
  console.log('\n');
  
  // === SAVE EVERYTHING ===
  console.log('💾 Saving trained data...');
  
  fs.writeFileSync(BRAIN_FILE, JSON.stringify(brain.toJSON(), null, 2));
  console.log(`  ✅ Brain weights saved (${(fs.statSync(BRAIN_FILE).size / 1024).toFixed(1)} KB)`);
  
  fs.writeFileSync(VOCAB_FILE, JSON.stringify({
    wordToIndex: tp.wordToIndex,
    indexToWord: tp.indexToWord,
    vocabSize: tp.vocabSize
  }, null, 2));
  console.log(`  ✅ Vocabulary saved (${tp.vocabSize} words)`);
  
  // Deduplicate and save training data
  const uniquePairs = [];
  const seen = new Set();
  for (const pair of trainingPairs) {
    const key = (pair.prompt + '|||' + pair.response).substring(0, 100);
    if (!seen.has(key)) {
      seen.add(key);
      uniquePairs.push(pair);
    }
  }
  fs.writeFileSync(TRAINING_DATA, JSON.stringify(uniquePairs.slice(-1500), null, 2));
  console.log(`  ✅ Training data saved (${Math.min(uniquePairs.length, 1500)} pairs)`);
  
  fs.writeFileSync(RANKINGS_FILE, JSON.stringify(rankings, null, 2));
  console.log(`  ✅ Rankings saved (${rankings.length} entries)`);
  
  fs.writeFileSync(SELF_TALK_FILE, JSON.stringify(selfTalks, null, 2));
  console.log(`  ✅ Self-talks saved (${selfTalks.length} conversations)`);
  
  // Update state
  let state = {
    failures: [],
    successes: [],
    stableHours: [],
    bestScore: 0,
    currentScore: 0,
    trainingSessions: 0,
    lastTrainingError: 1,
    totalTrainingCycles: 0,
    trainingPairs: 0,
    vocabSize: 0,
    selfConversations: 0,
    averageRanking: 0,
    totalRankings: 0,
    codeFiles: 0
  };
  
  if (fs.existsSync(STATE_FILE)) {
    const raw = fs.readFileSync(STATE_FILE, 'utf-8');
    if (raw.trim()) {
      try {
        state = JSON.parse(raw);
      } catch (e) {}
    }
  }
  
  const avgError = totalError / Math.max(cycles, 1);
  const avgRanking = rankings.length > 0
    ? rankings.slice(-10).reduce((s, r) => s + (r.score || 5), 0) / Math.min(rankings.length, 10)
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
  state.bestError = Math.min(bestError, state.bestError || Infinity);
  state.trainingDuration = Math.floor((Date.now() - startTime) / 1000);
  
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  console.log(`  ✅ State updated`);
  
  // === SUMMARY ===
  const duration = Math.floor((Date.now() - startTime) / 1000);
  
  console.log('\n' + '='.repeat(70));
  console.log('✅ TRAINING COMPLETE');
  console.log('='.repeat(70));
  console.log(`   Duration: ${Math.floor(duration / 60)}m ${duration % 60}s`);
  console.log(`   Sessions: ${state.trainingSessions}`);
  console.log(`   Training cycles: ${cycles}`);
  console.log(`   Avg error: ${avgError.toFixed(4)}`);
  console.log(`   Best error: ${bestError.toFixed(4)}`);
  console.log(`   Vocabulary: ${tp.vocabSize} words`);
  console.log(`   Training pairs: ${uniquePairs.length}`);
  console.log(`   Code pairs: ${codePairs.length}`);
  console.log(`   Debate pairs: ${debatePairs.length}`);
  console.log(`   Self-talks: ${selfTalks.length}`);
  console.log(`   Rankings: ${rankings.length}`);
  console.log(`   Avg ranking: ${avgRanking.toFixed(1)}/10`);
  console.log('='.repeat(70));
  
  // === TRIGGER NEXT CYCLE ===
  console.log('\n🔄 Triggering next training cycle...');
  try {
    const repoInfo = process.env.GITHUB_REPOSITORY;
    if (repoInfo) {
      const [owner, repo] = repoInfo.split('/');
      const token = process.env.GITHUB_TOKEN;
      
      if (token) {
        // Trigger through the separate trigger workflow
        const response = await fetch(
          `https://api.github.com/repos/${owner}/${repo}/actions/workflows/trigger.yml/dispatches`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Accept': 'application/vnd.github.v3+json',
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ ref: 'main' })
          }
        );
        if (response.ok) {
          console.log('  ✅ Next cycle triggered via trigger workflow');
        } else {
          const text = await response.text();
          console.log(`  ⚠️ Could not trigger (${response.status}): ${text.substring(0, 100)}`);
        }
      }
    }
  } catch (e) {
    console.log(`  ℹ️ Not in GitHub Actions, skipping auto-trigger`);
  }
  
  console.log('\n' + '='.repeat(70) + '\n');
}

// Helper function for word overlap
function getWordOverlap(text1, text2) {
  if (!text1 || !text2) return 0;
  const words1 = new Set(text1.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  const words2 = text2.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  if (words1.size === 0) return 0;
  const overlap = words2.filter(w => words1.has(w)).length;
  return overlap / words1.size;
}

// Run training
train().catch(error => {
  console.error('\n❌ TRAINING FAILED:', error.message);
  console.error(error.stack);
  process.exit(1);
});
