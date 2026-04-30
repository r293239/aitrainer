const fs = require('fs');
const path = require('path');
const { NeuralNetwork } = require('../lib/brain');
const { TextProcessor } = require('../lib/textProcessor');

const BRAIN_FILE = path.join(__dirname, '..', 'lib', 'brain_weights.json');
const STATE_FILE = path.join(__dirname, '..', 'lib', 'state.json');
const VOCAB_FILE = path.join(__dirname, '..', 'lib', 'vocab.json');
const TRAINING_DATA = path.join(__dirname, '..', 'lib', 'training_data.json');
const RANKINGS_FILE = path.join(__dirname, '..', 'lib', 'rankings.json');
const SELF_TALK_FILE = path.join(__dirname, '..', 'lib', 'self_talk.json');
const UNCERTAIN_FILE = path.join(__dirname, '..', 'lib', 'uncertain_questions.json');

const INPUT_SIZE = 100;
const HIDDEN_SIZE = 200;
const OUTPUT_SIZE = 100;
const TRAINING_MINUTES = 8;
const HARD_STOP_MS = 9.5 * 60 * 1000;

const CODE_FILES = [
  'pages/api/chat.js',
  'pages/index.js',
  'scripts/improve.js',
  'scripts/train.js',
  'lib/brain.js',
  'lib/textProcessor.js'
];

let apiCallCount = 0;
let apiSuccessCount = 0;

function timeLeft(startTime) {
  return Math.max(0, HARD_STOP_MS - (Date.now() - startTime));
}

// 🔑 USE GH_TOKEN INSTEAD OF GITHUB_TOKEN
async function callGPT4(messages, label = '') {
  apiCallCount++;
  const token = process.env.GH_TOKEN;
  
  if (!token) {
    console.log(`     ❌ [${label}] No GH_TOKEN secret found`);
    return null;
  }
  
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    
    const response = await fetch('https://models.inference.ai.azure.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages,
        temperature: 0.85,
        max_tokens: 200
      }),
      signal: controller.signal
    });
    
    clearTimeout(timeout);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log(`     ❌ [${label}] HTTP ${response.status}: ${errorText.substring(0, 120)}`);
      return null;
    }
    
    const data = await response.json();
    
    if (data.error) {
      console.log(`     ❌ [${label}] API: ${data.error.message}`);
      return null;
    }
    
    if (!data.choices?.[0]?.message?.content) {
      console.log(`     ❌ [${label}] No content`);
      return null;
    }
    
    apiSuccessCount++;
    return data.choices[0].message.content;
  } catch (e) {
    console.log(`     ❌ [${label}] ${e.message}`);
    return null;
  }
}

function getCodePurpose(fileName) {
  const purposes = {
    'chat.js': 'handles user messages, matches training data, generates responses, logs uncertain questions',
    'index.js': 'the chat interface with user/bot avatars, dark theme, and brain status indicator',
    'improve.js': 'evaluates bot intelligence by scoring vocabulary, training data, and error rates',
    'train.js': 'trains the neural network using GPT-4o debates, self-talk, and response ranking',
    'brain.js': 'a pure JavaScript neural network with forward/backward propagation',
    'textProcessor.js': 'converts text to number vectors and manages word vocabulary'
  };
  return purposes[fileName] || 'part of the self-improving chatbot system';
}

function learnAboutCode() {
  console.log('\n📚 Phase 1: Code Awareness');
  const pairs = [];
  for (const filePath of CODE_FILES) {
    try {
      const fullPath = path.join(__dirname, '..', filePath);
      if (!fs.existsSync(fullPath)) continue;
      const fileName = path.basename(filePath);
      pairs.push({ prompt: `What does ${fileName} do?`, response: getCodePurpose(fileName) });
      console.log(`  📄 ${fileName}`);
    } catch (e) {}
  }
  return pairs;
}

async function generateTopics(startTime) {
  if (timeLeft(startTime) < 60000) return [];
  
  console.log('\n💡 Generating topics...');
  const response = await callGPT4([
    { role: 'system', content: 'Generate 5 interesting conversation questions. Output one per line. No numbers.' },
    { role: 'user', content: 'Give me 5 diverse topics.' }
  ], 'topics');
  
  if (!response) return [];
  
  const topics = response.split('\n')
    .map(l => l.replace(/^[-\d\.\s]+/, '').trim())
    .filter(l => l.length > 15 && l.includes('?'));
  
  console.log(`  ✅ ${topics.length} topics`);
  return topics.slice(0, 5);
}

async function debate(topic) {
  console.log(`  🎤 "${topic.substring(0, 55)}..."`);
  
  const answer = await callGPT4([
    { role: 'system', content: 'Give a detailed, helpful answer under 150 words.' },
    { role: 'user', content: topic }
  ], 'debate');
  
  if (!answer) return null;
  
  const improved = await callGPT4([
    { role: 'system', content: 'Make this response even better. More helpful and natural.' },
    { role: 'user', content: `Original: ${answer}\n\nImproved:` }
  ], 'improve');
  
  const final = improved || answer;
  console.log(`     ✅ "${final.substring(0, 60)}..."`);
  
  return { topic, response: final };
}

async function handleUncertainQuestions(startTime) {
  if (timeLeft(startTime) < 60000) return [];
  
  let uncertain = [];
  try {
    if (fs.existsSync(UNCERTAIN_FILE)) {
      uncertain = JSON.parse(fs.readFileSync(UNCERTAIN_FILE, 'utf-8'));
    }
  } catch (e) {}
  
  if (uncertain.length === 0) return [];
  
  console.log(`\n❓ Answering ${Math.min(3, uncertain.length)} uncertain questions...`);
  
  const results = [];
  const toAnswer = uncertain.slice(-3);
  
  for (const q of toAnswer) {
    if (timeLeft(startTime) < 45000) break;
    
    const answer = await callGPT4([
      { role: 'system', content: 'Give a helpful, natural, and engaging answer. Keep it under 3 sentences.' },
      { role: 'user', content: q.text }
    ], `q-${q.text.substring(0, 20)}`);
    
    if (answer) {
      results.push({ prompt: q.text, response: answer });
      console.log(`  ✅ "${q.text.substring(0, 40)}..."`);
    }
    await new Promise(r => setTimeout(r, 500));
  }
  
  const remaining = uncertain.filter(q => !toAnswer.some(a => a.text === q.text));
  fs.writeFileSync(UNCERTAIN_FILE, JSON.stringify(remaining, null, 2));
  
  return results;
}

async function selfTalk(startTime) {
  if (timeLeft(startTime) < 45000) return [];
  
  console.log('\n💬 Self-talk...');
  
  const starter = await callGPT4([
    { role: 'system', content: 'Start a thoughtful conversation with a deep question.' },
    { role: 'user', content: 'Begin a conversation about intelligence.' }
  ], 'self-start');
  
  if (!starter) return [];
  
  const response = await callGPT4([
    { role: 'system', content: 'Respond thoughtfully with a different perspective.' },
    { role: 'user', content: starter }
  ], 'self-respond');
  
  if (!response) return [{ role: 'A', content: starter }];
  
  return [
    { role: 'A', content: starter },
    { role: 'B', content: response }
  ];
}

async function rankMyAI(brain, tp, startTime) {
  if (timeLeft(startTime) < 45000) return [];
  
  console.log('\n⭐ Ranking...');
  
  const prompts = ["What is AI?", "How does learning work?"];
  const rankings = [];
  
  for (const prompt of prompts) {
    if (timeLeft(startTime) < 30000) break;
    
    const inputVector = tp.textToVector(prompt, INPUT_SIZE);
    const outputVector = brain.forward(inputVector);
    const words = tp.getWords();
    
    const wordScores = words.map((w, i) => ({ word: w, score: outputVector[i] || 0 }));
    wordScores.sort((a, b) => b.score - a.score);
    
    const stopWords = new Set(['the','a','an','is','was','are','be','to','of','in','for','on','with','at','by','from','as','and','or','but','if','that','this','it','its','so','very','just','not','no']);
    const contentWords = wordScores.filter(w => !stopWords.has(w.word) && w.score > 0.001);
    const myResponse = contentWords.slice(0, 8).map(w => w.word).join(' ') + '.';
    
    const rating = await callGPT4([
      { role: 'system', content: 'Rate this AI response 1-10. Output ONLY: TOTAL: [number]' },
      { role: 'user', content: `Q: "${prompt}"\nA: "${myResponse}"\nRating:` }
    ], 'rank');
    
    if (rating) {
      const match = rating.match(/TOTAL:\s*(\d+)/);
      const score = match ? parseInt(match[1]) : 5;
      rankings.push({ timestamp: new Date().toISOString(), prompt, response: myResponse, score });
      console.log(`  "${prompt}" → ${score}/10`);
    }
    await new Promise(r => setTimeout(r, 500));
  }
  
  return rankings;
}

async function train() {
  const startTime = Date.now();

  console.log('='.repeat(65));
  console.log('🧠 GPT-4o NEURAL TRAINING');
  console.log('='.repeat(65));
  console.log(`GH_TOKEN: ${process.env.GH_TOKEN ? '✅ Present' : '❌ MISSING'}`);
  console.log(`Start: ${new Date().toISOString()}`);
  console.log(`Time limit: ${TRAINING_MINUTES}min\n`);

  // Load brain
  let brain;
  if (fs.existsSync(BRAIN_FILE)) {
    try {
      brain = NeuralNetwork.fromJSON(JSON.parse(fs.readFileSync(BRAIN_FILE, 'utf-8')));
      console.log('📂 Brain loaded');
    } catch (e) {
      brain = new NeuralNetwork(INPUT_SIZE, HIDDEN_SIZE, OUTPUT_SIZE);
    }
  } else {
    brain = new NeuralNetwork(INPUT_SIZE, HIDDEN_SIZE, OUTPUT_SIZE);
  }

  // Load data
  let trainingPairs = [];
  if (fs.existsSync(TRAINING_DATA)) {
    try { trainingPairs = JSON.parse(fs.readFileSync(TRAINING_DATA, 'utf-8')); } catch (e) {}
  }
  console.log(`📊 ${trainingPairs.length} training pairs`);

  let rankings = [];
  if (fs.existsSync(RANKINGS_FILE)) {
    try { rankings = JSON.parse(fs.readFileSync(RANKINGS_FILE, 'utf-8')); } catch (e) {}
  }

  let selfTalks = [];
  if (fs.existsSync(SELF_TALK_FILE)) {
    try { selfTalks = JSON.parse(fs.readFileSync(SELF_TALK_FILE, 'utf-8')); } catch (e) {}
  }

  // Phase 1: Code awareness
  trainingPairs.push(...learnAboutCode());

  // Phase 2: Answer uncertain questions
  trainingPairs.push(...(await handleUncertainQuestions(startTime)));

  // Phase 3: Generate topics & debate
  const topics = await generateTopics(startTime);
  const debateTopics = topics.length >= 2 ? topics : [
    "What is artificial intelligence?",
    "How does learning work?",
    "What makes humans unique?",
    "How do computers process information?"
  ];
  
  console.log(`\n🎤 Debating ${Math.min(4, debateTopics.length)} topics...`);
  for (const topic of debateTopics.slice(0, 4)) {
    if (timeLeft(startTime) < 45000) break;
    const result = await debate(topic);
    if (result) trainingPairs.push({ prompt: result.topic, response: result.response });
    await new Promise(r => setTimeout(r, 800));
  }

  // Phase 4: Self-talk
  const convo = await selfTalk(startTime);
  if (convo.length >= 2) {
    selfTalks.push({ timestamp: new Date().toISOString(), conversation: convo });
    if (selfTalks.length > 20) selfTalks = selfTalks.slice(-20);
    trainingPairs.push({ prompt: convo[0].content, response: convo[1].content });
    console.log('  ✅ Self-talk added');
  }

  // Phase 5: Vocabulary
  console.log('\n📚 Building vocabulary...');
  let tp = new TextProcessor(500);
  if (fs.existsSync(VOCAB_FILE)) {
    try {
      const existing = JSON.parse(fs.readFileSync(VOCAB_FILE, 'utf-8'));
      tp.wordToIndex = existing.wordToIndex || {};
      tp.indexToWord = existing.indexToWord || {};
      tp.vocabSize = existing.vocabSize || 0;
    } catch (e) {}
  }
  
  let newWords = 0;
  trainingPairs.forEach(p => {
    const text = (p.prompt + ' ' + p.response).toLowerCase().replace(/[^a-z0-9\s]/g, '');
    text.split(/\s+/).filter(w => w.length > 1).forEach(word => {
      if (!(word in tp.wordToIndex)) {
        tp.wordToIndex[word] = tp.vocabSize;
        tp.indexToWord[tp.vocabSize] = word;
        tp.vocabSize++;
        newWords++;
      }
    });
  });
  console.log(`  ${tp.vocabSize} words (+${newWords} new)`);

  // Phase 6: Ranking
  const newRankings = await rankMyAI(brain, tp, startTime);
  rankings.push(...newRankings);
  if (rankings.length > 50) rankings = rankings.slice(-50);

  // Phase 7: Training
  console.log('\n🔄 Training neural network...');
  const trainingEnd = Math.min(
    startTime + TRAINING_MINUTES * 60 * 1000,
    startTime + HARD_STOP_MS - 30000
  );
  
  let cycles = 0;
  const remaining = Math.max(0, trainingEnd - Date.now());
  console.log(`  Training for ${Math.floor(remaining / 1000)}s...`);

  while (Date.now() < trainingEnd) {
    const pair = trainingPairs[Math.floor(Math.random() * trainingPairs.length)];
    const inputVector = tp.textToVector(pair.prompt, INPUT_SIZE);
    const targetVector = tp.textToVector(pair.response, OUTPUT_SIZE);
    brain.forward(inputVector);
    brain.backward(targetVector, 0.1);
    cycles++;
    if (cycles % 200 === 0) {
      const sec = Math.floor((trainingEnd - Date.now()) / 1000);
      process.stdout.write(`\r  Cycles: ${cycles} | ${sec}s left`);
    }
  }
  console.log(`\r  Cycles: ${cycles} completed`);

  // Save
  console.log('\n💾 Saving...');
  fs.writeFileSync(BRAIN_FILE, JSON.stringify(brain.toJSON(), null, 2));
  fs.writeFileSync(VOCAB_FILE, JSON.stringify({
    wordToIndex: tp.wordToIndex,
    indexToWord: tp.indexToWord,
    vocabSize: tp.vocabSize
  }, null, 2));
  
  const unique = [];
  const seen = new Set();
  for (const p of trainingPairs) {
    const key = (p.prompt + p.response).substring(0, 100);
    if (!seen.has(key)) { seen.add(key); unique.push(p); }
  }
  fs.writeFileSync(TRAINING_DATA, JSON.stringify(unique.slice(-1500), null, 2));
  fs.writeFileSync(RANKINGS_FILE, JSON.stringify(rankings, null, 2));
  fs.writeFileSync(SELF_TALK_FILE, JSON.stringify(selfTalks, null, 2));
  
  let state = {};
  if (fs.existsSync(STATE_FILE)) {
    try { state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8')); } catch (e) {}
  }
  
  state.trainingSessions = (state.trainingSessions || 0) + 1;
  state.totalTrainingCycles = (state.totalTrainingCycles || 0) + cycles;
  state.trainingPairs = unique.length;
  state.vocabSize = tp.vocabSize;
  state.apiCalls = (state.apiCalls || 0) + apiCallCount;
  state.apiSuccesses = (state.apiSuccesses || 0) + apiSuccessCount;
  state.lastTrainingTime = new Date().toISOString();
  state.trainingDuration = Math.floor((Date.now() - startTime) / 1000);
  
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  
  const duration = Math.floor((Date.now() - startTime) / 1000);
  console.log(`\n${'='.repeat(65)}`);
  console.log(`✅ COMPLETE (${duration}s)`);
  console.log(`${'='.repeat(65)}`);
  console.log(`  API: ${apiSuccessCount}/${apiCallCount} calls succeeded`);
  console.log(`  Pairs: ${unique.length} | Vocab: ${tp.vocabSize} | Cycles: ${cycles}`);
  console.log(`${'='.repeat(65)}\n`);

  // Trigger next
  try {
    const repo = process.env.GITHUB_REPOSITORY;
    if (repo) {
      const [owner, name] = repo.split('/');
      await fetch(`https://api.github.com/repos/${owner}/${name}/actions/workflows/trigger.yml/dispatches`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.GH_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ ref: 'main' })
      });
    }
  } catch (e) {}
}

train().catch(e => {
  console.error('❌', e.message);
  process.exit(1);
});
