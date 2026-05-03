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
const CONVERSATION_LOG = path.join(__dirname, '..', 'lib', 'conversation_log.json');

const INPUT_SIZE = 100;
const HIDDEN_SIZE = 200;
const OUTPUT_SIZE = 100;
const TRAINING_MINUTES = 8;
const HARD_STOP_MS = 9.5 * 60 * 1000;

let apiCallCount = 0;
let apiSuccessCount = 0;
let lastApiCallTime = 0;

function timeLeft(startTime) {
  return Math.max(0, HARD_STOP_MS - (Date.now() - startTime));
}

async function callGPT4(messages, label = '') {
  apiCallCount++;
  
  const now = Date.now();
  const timeSinceLastCall = now - lastApiCallTime;
  const minDelay = 5000;
  if (timeSinceLastCall < minDelay && lastApiCallTime > 0) {
    const waitTime = minDelay - timeSinceLastCall;
    await new Promise(r => setTimeout(r, waitTime));
  }
  lastApiCallTime = Date.now();
  
  const token = process.env.GH_TOKEN;
  
  if (!token) {
    console.log(`     ❌ [${label}] No GH_TOKEN`);
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
    
    if (response.status === 429) {
      console.log(`     ⏳ [${label}] Rate limited, waiting 30s...`);
      await new Promise(r => setTimeout(r, 30000));
      
      const retryResponse = await fetch('https://models.inference.ai.azure.com/chat/completions', {
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
        })
      });
      
      if (!retryResponse.ok) {
        console.log(`     ❌ [${label}] Retry failed with ${retryResponse.status}`);
        return null;
      }
      
      const retryData = await retryResponse.json();
      if (retryData.error) {
        console.log(`     ❌ [${label}] Retry API error: ${retryData.error.message}`);
        return null;
      }
      
      apiSuccessCount++;
      return retryData.choices[0].message.content;
    }
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log(`     ❌ [${label}] HTTP ${response.status}: ${errorText.substring(0, 100)}`);
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

// Practical everyday topics
const practicalTopics = [
  "What is the best way to learn something new?",
  "How does the internet actually work?",
  "What causes rain and thunderstorms?",
  "How do airplanes stay in the sky?",
  "What is the difference between a virus and bacteria?",
  "How do solar panels generate electricity?",
  "What makes food spicy?",
  "Why do we need sleep?",
  "How do vaccines protect us?",
  "What is climate change and what causes it?",
  "How does a microwave heat food?",
  "Why is the ocean salty?",
  "How do birds navigate during migration?",
  "What causes earthquakes?",
  "How does blockchain technology work?",
  "What is artificial intelligence?",
  "How do touchscreens detect fingers?",
  "Why do leaves change color in autumn?",
  "How does GPS know where you are?",
  "What is the difference between weather and climate?"
];

function getCodePurpose(fileName) {
  const purposes = {
    'chat.js': 'handles user messages',
    'index.js': 'the chat interface',
    'improve.js': 'evaluates intelligence',
    'train.js': 'the training loop',
    'brain.js': 'neural network',
    'textProcessor.js': 'text to vectors'
  };
  return purposes[fileName] || '';
}

function learnAboutCode() {
  console.log('\n📚 Phase 1: Code Awareness');
  for (const filePath of ['pages/api/chat.js', 'pages/index.js', 'scripts/improve.js', 'scripts/train.js', 'lib/brain.js', 'lib/textProcessor.js']) {
    try {
      const fullPath = path.join(__dirname, '..', filePath);
      if (!fs.existsSync(fullPath)) continue;
      const fileName = path.basename(filePath);
      console.log(`  📄 ${fileName}: ${getCodePurpose(fileName)}`);
    } catch (e) {}
  }
  return []; // Don't add code descriptions to training pairs
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
  
  console.log(`\n❓ Answering ${Math.min(2, uncertain.length)} uncertain questions...`);
  
  const results = [];
  const toAnswer = uncertain.slice(-2);
  
  for (const q of toAnswer) {
    if (timeLeft(startTime) < 45000) break;
    
    const answer = await callGPT4([
      { role: 'system', content: 'Give a helpful, direct, and concise answer. Keep it 2-4 sentences. Answer the question directly without being philosophical.' },
      { role: 'user', content: q.text }
    ], `q-${q.text.substring(0, 20)}`);
    
    if (answer) {
      results.push({ prompt: q.text, response: answer, weight: 2 });
      console.log(`  ✅ "${q.text.substring(0, 40)}..."`);
    }
  }
  
  const remaining = uncertain.filter(q => !toAnswer.some(a => a.text === q.text));
  fs.writeFileSync(UNCERTAIN_FILE, JSON.stringify(remaining, null, 2));
  
  return results;
}

async function rateAndImproveConversations(startTime) {
  if (timeLeft(startTime) < 90000) {
    console.log('\n📝 Conversation Review: SKIPPED (low time)');
    return [];
  }

  let conversations = [];
  try {
    if (fs.existsSync(CONVERSATION_LOG)) {
      conversations = JSON.parse(fs.readFileSync(CONVERSATION_LOG, 'utf-8'));
    }
  } catch (e) {}

  if (conversations.length === 0) {
    console.log('\n📝 Conversation Review: No conversations yet');
    return [];
  }

  console.log(`\n📝 Reviewing ${Math.min(3, conversations.length)} past conversations...`);
  console.log('-'.repeat(40));

  const improved = [];
  const toReview = conversations.slice(-3);

  for (const convo of toReview) {
    if (timeLeft(startTime) < 45000) break;

    console.log(`  Q: "${convo.prompt.substring(0, 50)}..."`);

    const rating = await callGPT4([
      {
        role: 'system',
        content: `Rate this chatbot response 1-10. Consider:
1. Does it directly answer the question?
2. Is it relevant?
3. Is it clear and helpful?
4. Is it the right length?
Output: SCORE: [number]`
      },
      {
        role: 'user',
        content: `Question: "${convo.prompt}"\n\nResponse: "${convo.reply}"\n\nRate:`
      }
    ], `rate-${convo.prompt.substring(0, 15)}`);

    if (!rating) continue;

    const scoreMatch = rating.match(/SCORE:\s*(\d+)/);
    const score = scoreMatch ? parseInt(scoreMatch[1]) : 5;

    console.log(`     Score: ${score}/10`);

    if (score < 7) {
      console.log(`     🔧 Improving...`);
      
      const betterAnswer = await callGPT4([
        {
          role: 'system',
          content: `Write a BETTER response that directly answers the question. Keep it 2-4 sentences. Be clear and concise. Do NOT write an essay.`
        },
        {
          role: 'user',
          content: `Question: "${convo.prompt}"\n\nBad response: "${convo.reply}"\n\nBetter response:`
        }
      ], `improve-${convo.prompt.substring(0, 15)}`);

      if (betterAnswer && betterAnswer.length < convo.reply.length) {
        improved.push({
          prompt: convo.prompt,
          response: betterAnswer,
          weight: 3
        });
        console.log(`     ✅ Improved`);
      }
    } else {
      improved.push({
        prompt: convo.prompt,
        response: convo.reply,
        weight: 2
      });
      console.log(`     ✅ Keeping`);
    }

    await new Promise(r => setTimeout(r, 500));
  }

  const remaining = conversations.slice(0, -3);
  fs.writeFileSync(CONVERSATION_LOG, JSON.stringify(remaining, null, 2));

  console.log(`  ✅ ${improved.length} conversations processed`);
  return improved;
}

async function debate(topic) {
  console.log(`  🎤 "${topic.substring(0, 55)}..."`);
  
  const answer = await callGPT4([
    { role: 'system', content: 'Give a helpful, clear answer. 2-4 sentences. Be practical and direct.' },
    { role: 'user', content: topic }
  ], 'debate');
  
  if (!answer) return null;
  console.log(`     ✅ "${answer.substring(0, 60)}..."`);
  
  return { topic, response: answer };
}

async function selfTalk(startTime) {
  if (timeLeft(startTime) < 45000) return [];
  
  console.log('\n💬 Self-talk...');
  
  const starter = await callGPT4([
    { role: 'system', content: 'Start a thoughtful conversation with a deep question.' },
    { role: 'user', content: 'Begin a philosophical conversation about intelligence and learning.' }
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

async function train() {
  const startTime = Date.now();

  console.log('='.repeat(65));
  console.log('🧠 GPT-4o NEURAL TRAINING');
  console.log('='.repeat(65));
  console.log(`GH_TOKEN: ${process.env.GH_TOKEN ? '✅ Present' : '❌ MISSING'}`);
  console.log(`Start: ${new Date().toISOString()}`);
  console.log(`Time limit: ${TRAINING_MINUTES}min\n`);

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

  // Phase 1: Code awareness (no training pairs added)
  learnAboutCode();

  // Phase 2: Answer uncertain questions
  trainingPairs.push(...(await handleUncertainQuestions(startTime)));

  // Phase 3: Rate & improve past conversations 🆕
  trainingPairs.push(...(await rateAndImproveConversations(startTime)));

  // Phase 4: Practical topic debates
  const selectedTopics = practicalTopics.sort(() => Math.random() - 0.5).slice(0, 2);
  console.log(`\n🎤 Debating ${selectedTopics.length} topics...`);
  for (const topic of selectedTopics) {
    if (timeLeft(startTime) < 45000) break;
    const result = await debate(topic);
    if (result) trainingPairs.push({ prompt: result.topic, response: result.response, weight: 1 });
  }

  // Phase 5: Self-talk (philosophical)
  const convo = await selfTalk(startTime);
  if (convo.length >= 2) {
    selfTalks.push({ timestamp: new Date().toISOString(), conversation: convo });
    if (selfTalks.length > 20) selfTalks = selfTalks.slice(-20);
    trainingPairs.push({ prompt: convo[0].content, response: convo[1].content, weight: 1 });
    console.log('  ✅ Self-talk added');
  }

  // Phase 6: Vocabulary
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
    const weight = pair.weight || 1;
    const inputVector = tp.textToVector(pair.prompt, INPUT_SIZE);
    const targetVector = tp.textToVector(pair.response, OUTPUT_SIZE);
    const lr = 0.1 * weight;
    brain.forward(inputVector);
    brain.backward(targetVector, lr);
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
    const key = (p.prompt + (p.response || '')).substring(0, 100);
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
  console.log(`  API: ${apiSuccessCount}/${apiCallCount} succeeded`);
  console.log(`  Pairs: ${unique.length} | Vocab: ${tp.vocabSize} | Cycles: ${cycles}`);
  console.log(`${'='.repeat(65)}\n`);

  // Trigger next
  try {
    const repo = process.env.GITHUB_REPOSITORY;
    if (repo) {
      const [owner, name] = repo.split('/');
      await fetch(`https://api.github.com/repos/${owner}/${name}/actions/workflows/improve.yml/dispatches`, {
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
