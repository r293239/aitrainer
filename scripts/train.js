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
const TRAINING_MINUTES = 10;

// ⏰ NEW: 10-minute hard stop
const HARD_STOP_MS = 10 * 60 * 1000; // 10 minutes

const MODELS = [
  'gpt-4o-mini',
  'Phi-3-mini-4k-instruct',
  'Llama-3.2-3B-Instruct',
  'AI21-Jamba-1.5-Mini'
];

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

function getCodePurpose(fileName) {
  const purposes = {
    'chat.js': 'handles user messages. It receives chat input, matches it against training data for known answers, uses the neural network to generate new responses, and logs questions it cannot answer for future training.',
    'index.js': 'the chat interface users see. It displays messages with user and bot avatars, has a typing indicator, a dark theme, and shows brain status.',
    'improve.js': 'evaluates whether the AI is getting smarter. It scores the bot on vocabulary size, training data, error rates, and tracks the best score over time.',
    'train.js': 'the main training loop. It learns about code structure, runs multi-model debates on knowledge topics, has AI self-conversations, ranks responses, and trains the neural network.',
    'keep-alive.js': 'monitors training. It checks if training is overdue and triggers a new cycle if needed.',
    'brain.js': 'a pure JavaScript neural network. It implements forward propagation (making predictions) and backpropagation (learning from mistakes) without any external libraries.',
    'textProcessor.js': 'converts text into number vectors for the neural network, and manages the vocabulary of words the bot knows.'
  };
  return purposes[fileName] || 'part of the self-improving chatbot system';
}

// === DYNAMIC TOPIC GENERATION ===

async function generateNewTopics(count = 5) {
  console.log('\n💡 Generating fresh topics...');
  
  const topicPrompts = [
    "Give me 3 interesting questions about science that a curious person might ask.",
    "Give me 3 thought-provoking questions about technology and its future.",
    "Give me 3 deep questions about human nature and psychology.",
    "Give me 3 questions about the natural world and our planet.",
    "Give me 3 questions about learning, knowledge, and education."
  ];
  
  const allNewTopics = [];
  const usedPrompts = topicPrompts.sort(() => Math.random() - 0.5).slice(0, 3);
  
  for (const prompt of usedPrompts) {
    const response = await callModel(MODELS[0], [
      { role: 'system', content: 'You generate interesting discussion questions. Output each question on a new line starting with a number like "1. " or "- ". No other text.' },
      { role: 'user', content: prompt }
    ]);
    
    if (response) {
      const lines = response.split('\n')
        .map(l => l.replace(/^\d+[\.\)]\s*|- \s*/, '').trim())
        .filter(l => l.length > 20 && l.endsWith('?'));
      allNewTopics.push(...lines);
    }
  }
  
  const uniqueTopics = [...new Set(allNewTopics)].slice(0, count);
  console.log(`  ✅ Generated ${uniqueTopics.length} new topics`);
  return uniqueTopics;
}

async function generateSelfTalkTopics(count = 3) {
  const response = await callModel(MODELS[0], [
    { role: 'system', content: 'Generate deep philosophical conversation starters. Output each on a new line starting with "- ". No other text.' },
    { role: 'user', content: `Give me ${count} unique conversation starters for a deep philosophical discussion. They should be different from common topics.` }
  ]);
  
  if (response) {
    const topics = response.split('\n')
      .map(l => l.replace(/^-\s*/, '').trim())
      .filter(l => l.length > 15);
    return topics.slice(0, count);
  }
  return [];
}

async function generateImprovementQuestions(count = 3) {
  const response = await callModel(MODELS[0], [
    { role: 'system', content: 'Generate questions about AI self-improvement and chatbot development. Output each on a new line starting with "- ". No other text.' },
    { role: 'user', content: `Give me ${count} specific questions about how a self-improving AI chatbot can get better at conversations. Make them actionable and specific.` }
  ]);
  
  if (response) {
    return response.split('\n')
      .map(l => l.replace(/^-\s*/, '').trim())
      .filter(l => l.length > 20 && l.endsWith('?'));
  }
  return [];
}

// === LEARNING FUNCTIONS ===

function learnAboutCode() {
  console.log('\n📚 PHASE 1: Code Structure Awareness');
  console.log('-'.repeat(40));

  const codePairs = [];

  for (const filePath of CODE_FILES) {
    try {
      const fullPath = path.join(__dirname, '..', filePath);
      if (!fs.existsSync(fullPath)) continue;

      const code = fs.readFileSync(fullPath, 'utf-8');
      const fileName = path.basename(filePath);
      const lineCount = code.split('\n').length;
      const hasAsync = code.includes('async');
      const hasErrorHandling = code.includes('try') && code.includes('catch');
      const hasLoops = code.includes('for ') || code.includes('while ');
      const importsModules = code.includes('require(') || code.includes('import ');
      const exportsModules = code.includes('module.exports') || code.includes('export ');

      codePairs.push({
        prompt: `What does ${fileName} do in the chatbot system?`,
        response: getCodePurpose(fileName)
      });

      codePairs.push({
        prompt: `How is ${fileName} built?`,
        response: `${fileName} is ${lineCount} lines long. It ${hasAsync ? 'uses async operations' : 'runs synchronously'}, ${hasErrorHandling ? 'has error handling with try-catch' : 'has basic logic flow'}, and ${exportsModules ? 'shares its functionality with other files through exports' : 'works independently'}. It ${importsModules ? 'uses external modules' : 'is self-contained'}. ${hasLoops ? 'It uses loops for processing.' : ''}`
      });

      codePairs.push({
        prompt: `What programming concepts does ${fileName} demonstrate?`,
        response: `${fileName} shows how to use ${hasAsync ? 'asynchronous operations and ' : ''}${hasErrorHandling ? 'error handling, ' : ''}${hasLoops ? 'loops for iteration, ' : ''}${importsModules ? 'module imports, ' : ''}${exportsModules ? 'module exports, ' : ''}and functional programming patterns in JavaScript.`
      });

      console.log(`  📄 ${fileName}: ${lineCount} lines described`);
    } catch (e) {
      console.log(`  ⚠️ Could not read ${filePath}: ${e.message}`);
    }
  }

  console.log(`  ✅ Created ${codePairs.length} code awareness pairs`);
  return codePairs;
}

async function askForSelfImprovement() {
  console.log('\n🔧 PHASE: Self-Improvement Questions');
  console.log('-'.repeat(40));

  const generatedQuestions = await generateImprovementQuestions(3);
  const questions = generatedQuestions.length >= 3 ? generatedQuestions : [
    "How can a simple chatbot improve its response quality over time?",
    "What makes a chatbot engaging and helpful to users?",
    "How should a self-improving AI track its own progress?"
  ];

  const improvementPairs = [];

  for (let i = 0; i < questions.length; i++) {
    console.log(`  Asking: "${questions[i].substring(0, 60)}..."`);
    const debate = await multiModelDebate(questions[i]);
    if (debate && debate.combined) {
      improvementPairs.push({
        prompt: questions[i],
        response: debate.combined
      });
      console.log(`  ✅ Got improvement advice`);
    }
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log(`  ✅ Created ${improvementPairs.length} improvement pairs`);
  return improvementPairs;
}

async function multiModelDebate(topic) {
  console.log(`\n  🎤 Multi-Model Debate: "${topic.substring(0, 60)}..."`);

  const results = [];

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

  const judgePrompt = `Combine the best parts of these two responses into ONE improved response. Keep it under 150 words.\n\nResponse 1: ${results[0].response}\n\nResponse 2: ${results[1].response}`;

  const combined = await callModel(MODELS[0], [
    { role: 'system', content: 'Combine information into clear, concise responses.' },
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

async function gpt4SelfConversation() {
  const generatedTopics = await generateSelfTalkTopics(3);
  
  const fallbackTopics = [
    "What is the nature of intelligence?",
    "How does learning transform understanding?",
    "What makes communication meaningful?",
    "How does creativity emerge from knowledge?",
    "What is the role of curiosity in growth?"
  ];
  
  const topics = generatedTopics.length >= 1 ? generatedTopics : fallbackTopics;
  const topic = topics[Math.floor(Math.random() * topics.length)];
  
  console.log(`\n💬 Self-Talk Topic: "${topic.substring(0, 80)}..."`);
  
  const conversation = [];

  const starter = await callModel(MODELS[0], [
    { role: 'system', content: 'You are a thoughtful conversationalist. Start a deep conversation with an open-ended question.' },
    { role: 'user', content: `Start a conversation about: ${topic}` }
  ]);

  if (!starter) return [];
  conversation.push({ role: 'Thinker A', content: starter });

  const response1 = await callModel(MODELS[1] || MODELS[0], [
    { role: 'system', content: 'You have a completely different perspective. Challenge the assumptions and offer a unique view.' },
    { role: 'user', content: starter }
  ]);

  if (!response1) return conversation;
  conversation.push({ role: 'Thinker B', content: response1 });

  const response2 = await callModel(MODELS[0], [
    { role: 'system', content: 'Build on their perspective. Find unexpected connections and deepen the conversation.' },
    { role: 'user', content: `You said: ${starter}\nThey said: ${response1}\nFind a surprising connection and continue.` }
  ]);

  if (!response2) return conversation;
  conversation.push({ role: 'Thinker A', content: response2 });

  const response3 = await callModel(MODELS[1] || MODELS[0], [
    { role: 'system', content: 'Synthesize the entire conversation into a profound concluding insight.' },
    { role: 'user', content: `Conversation:\nA: ${starter}\nB: ${response1}\nA: ${response2}\nProvide a meaningful synthesis.` }
  ]);

  if (!response3) return conversation;
  conversation.push({ role: 'Thinker B', content: response3 });

  return conversation;
}

async function generateKnowledgeDebates() {
  const generatedTopics = await generateNewTopics(5);
  
  const fallbackTopics = [
    "Explain how computers process information simply",
    "How does the scientific method work?",
    "Explain the water cycle in nature",
    "How does evolution by natural selection work?",
    "What is the structure of an atom?"
  ];

  let uncertainQuestions = [];
  try {
    if (fs.existsSync(UNCERTAIN_FILE)) {
      uncertainQuestions = JSON.parse(fs.readFileSync(UNCERTAIN_FILE, 'utf-8'));
    }
  } catch (e) {}

  const recentUncertain = uncertainQuestions.slice(-5).map(q => q.text);
  
  const allTopics = [...generatedTopics, ...recentUncertain, ...fallbackTopics];
  const shuffled = allTopics.sort(() => Math.random() - 0.5);
  const selected = [];

  if (recentUncertain.length > 0) {
    selected.push(...recentUncertain.slice(0, 3));
  }
  
  while (selected.length < 6) {
    const topic = shuffled[Math.floor(Math.random() * shuffled.length)];
    if (!selected.includes(topic)) selected.push(topic);
  }

  console.log('\n🎤 PHASE: Knowledge Debates');
  console.log('-'.repeat(40));
  if (recentUncertain.length > 0) {
    console.log(`  📝 Including ${Math.min(recentUncertain.length, 3)} uncertain question(s)`);
  }
  if (generatedTopics.length > 0) {
    console.log(`  💡 Using ${Math.min(generatedTopics.length, 3)} AI-generated topics`);
  }

  const debates = [];
  for (let i = 0; i < selected.length; i++) {
    console.log(`  Debate ${i + 1}/${selected.length}:`);
    const debate = await multiModelDebate(selected[i]);
    if (debate && debate.combined) {
      debates.push({
        prompt: selected[i],
        response: debate.combined
      });
    }
    await new Promise(r => setTimeout(r, 1000));
  }

  if (uncertainQuestions.length > 0) {
    fs.writeFileSync(UNCERTAIN_FILE, JSON.stringify([], null, 2));
  }

  console.log(`  ✅ Created ${debates.length} debate pairs`);
  return debates;
}

async function rankMyAI(brain, tp) {
  console.log('\n⭐ PHASE: Self-Evaluation & Ranking');
  console.log('-'.repeat(40));

  const testPrompts = [
    "What is artificial intelligence?",
    "How does learning work?",
    "What makes something intelligent?",
    "Explain the concept of growth",
    "How do computers solve problems?",
    "What is the meaning of knowledge?"
  ];

  const newRankings = [];

  for (let i = 0; i < Math.min(3, testPrompts.length); i++) {
    const testPrompt = testPrompts[i];

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

    const ranking = await callModel(MODELS[0], [
      {
        role: 'system',
        content: 'Rate this AI response 1-10 for relevance, coherence, helpfulness. Reply ONLY: TOTAL: [number]'
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
      console.log(`  "${testPrompt.substring(0, 40)}..." → Score: ${score}/10`);
    }

    await new Promise(r => setTimeout(r, 500));
  }

  return newRankings;
}

function getWordOverlap(text1, text2) {
  if (!text1 || !text2) return 0;
  const words1 = new Set(text1.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  const words2 = text2.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  if (words1.size === 0) return 0;
  const overlap = words2.filter(w => words1.has(w)).length;
  return overlap / words1.size;
}

async function train() {
  const startTime = Date.now();

  console.log('='.repeat(70));
  console.log('🧠 DYNAMIC MULTI-MODEL NEURAL NETWORK TRAINING');
  console.log('='.repeat(70));
  console.log(`Models: ${MODELS.slice(0, 2).join(' + ')}`);
  console.log(`Training duration: ${TRAINING_MINUTES} minutes (hard stop at 10 min)`);
  console.log(`Network: ${INPUT_SIZE} → ${HIDDEN_SIZE} → ${OUTPUT_SIZE}`);
  console.log(`Start: ${new Date().toISOString()}`);
  console.log(`Topics: AI-generated (fresh each cycle)\n`);

  // Load or create brain
  let brain;
  if (fs.existsSync(BRAIN_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(BRAIN_FILE, 'utf-8'));
      if (data.inputSize === INPUT_SIZE && data.outputSize === OUTPUT_SIZE) {
        brain = NeuralNetwork.fromJSON(data);
        console.log('📂 Loaded existing brain');
      } else {
        brain = new NeuralNetwork(INPUT_SIZE, HIDDEN_SIZE, OUTPUT_SIZE);
        console.log('🧠 Created new brain (size changed)');
      }
    } catch (e) {
      brain = new NeuralNetwork(INPUT_SIZE, HIDDEN_SIZE, OUTPUT_SIZE);
    }
  } else {
    brain = new NeuralNetwork(INPUT_SIZE, HIDDEN_SIZE, OUTPUT_SIZE);
    console.log('🧠 Fresh brain created');
  }

  // Load existing data
  let trainingPairs = [];
  if (fs.existsSync(TRAINING_DATA)) {
    try {
      trainingPairs = JSON.parse(fs.readFileSync(TRAINING_DATA, 'utf-8'));
      console.log(`📊 Loaded ${trainingPairs.length} training pairs`);
    } catch (e) {}
  }

  let rankings = [];
  if (fs.existsSync(RANKINGS_FILE)) {
    try { rankings = JSON.parse(fs.readFileSync(RANKINGS_FILE, 'utf-8')); } catch (e) {}
  }

  let selfTalks = [];
  if (fs.existsSync(SELF_TALK_FILE)) {
    try { selfTalks = JSON.parse(fs.readFileSync(SELF_TALK_FILE, 'utf-8')); } catch (e) {}
  }

  // === PHASE 1: Code awareness ===
  const codePairs = learnAboutCode();
  trainingPairs.push(...codePairs);

  // === PHASE 2: Dynamic self-improvement questions ===
  const improvementPairs = await askForSelfImprovement();
  trainingPairs.push(...improvementPairs);

  // === PHASE 3: Dynamic knowledge debates ===
  const debatePairs = await generateKnowledgeDebates();
  trainingPairs.push(...debatePairs);

  // === PHASE 4: Dynamic self-talk ===
  console.log('\n💬 PHASE: AI Self-Conversation');
  console.log('-'.repeat(40));
  const selfConvo = await gpt4SelfConversation();

  if (selfConvo.length > 0) {
    selfTalks.push({
      timestamp: new Date().toISOString(),
      conversation: selfConvo,
      topic: selfConvo[0]?.content?.substring(0, 100) || 'unknown'
    });
    if (selfTalks.length > 30) selfTalks = selfTalks.slice(-30);

    for (let i = 0; i < selfConvo.length - 1; i++) {
      trainingPairs.push({
        prompt: selfConvo[i].content,
        response: selfConvo[i + 1].content
      });
    }
    console.log(`  Self-talk messages: ${selfConvo.length}`);
  } else {
    console.log('  ⚠️ Self-talk skipped (no topics generated)');
  }

  // === PHASE 5: Accumulating vocabulary ===
  console.log('\n📚 Building Vocabulary');
  console.log('-'.repeat(40));

  let tp = new TextProcessor(500);

  if (fs.existsSync(VOCAB_FILE)) {
    try {
      const existingVocab = JSON.parse(fs.readFileSync(VOCAB_FILE, 'utf-8'));
      tp.wordToIndex = existingVocab.wordToIndex || {};
      tp.indexToWord = existingVocab.indexToWord || {};
      tp.vocabSize = existingVocab.vocabSize || 0;
      console.log(`  📖 Loaded ${tp.vocabSize} existing words`);
    } catch (e) {
      console.log('  📖 Starting vocabulary fresh');
    }
  }

  const allTexts = trainingPairs.map(p => p.prompt + ' ' + p.response);
  let newWordsAdded = 0;
  allTexts.forEach(text => {
    const words = text.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 1);
    words.forEach(word => {
      if (!(word in tp.wordToIndex)) {
        tp.wordToIndex[word] = tp.vocabSize;
        tp.indexToWord[tp.vocabSize] = word;
        tp.vocabSize++;
        newWordsAdded++;
      }
    });
  });

  console.log(`  📚 Total vocabulary: ${tp.vocabSize} words (+${newWordsAdded} new)`);

  // === PHASE 6: Rank my AI ===
  const newRankings = await rankMyAI(brain, tp);
  rankings.push(...newRankings);
  if (rankings.length > 100) rankings = rankings.slice(-100);

  // === PHASE 7: Weighted training (with 10-min hard stop) ===
  console.log('\n🔄 PHASE: Neural Network Training');
  console.log('-'.repeat(40));

  // ⏰ HARD STOP: Don't train past 10 minutes total
  const trainingEndTime = Math.min(
    startTime + (TRAINING_MINUTES - 1) * 60 * 1000,
    startTime + HARD_STOP_MS - 30000 // Stop 30 seconds before 10 min
  );

  const weightedPairs = trainingPairs.map(p => {
    let weight = 1;
    for (const rank of rankings.slice(-20)) {
      if (rank.score >= 8 && p.response && rank.response) {
        if (getWordOverlap(p.response, rank.response) > 0.3) weight = 2;
      }
    }
    if (p.prompt.includes('chatbot') || p.prompt.includes('improve') || p.prompt.includes('.js')) {
      weight *= 1.5;
    }
    return { ...p, weight };
  });

  console.log(`  Weighted pairs: ${weightedPairs.length}`);

  let cycles = 0;
  let totalError = 0;
  let bestError = Infinity;

  console.log('\n  Training...');
  while (Date.now() < trainingEndTime) {
    const pair = weightedPairs[Math.floor(Math.random() * weightedPairs.length)];
    const weight = pair.weight || 1;

    const inputVector = tp.textToVector(pair.prompt, INPUT_SIZE);
    const targetVector = tp.textToVector(pair.response, OUTPUT_SIZE);

    const learningRate = 0.1 * weight * Math.max(0.1, 1 - (cycles / 4000));
    brain.forward(inputVector);
    const error = brain.backward(targetVector, learningRate);

    totalError += error;
    if (error < bestError) bestError = error;
    cycles++;

    if (cycles % 50 === 0) {
      const remaining = Math.max(0, Math.floor((trainingEndTime - Date.now()) / 1000));
      const avgError = totalError / cycles;
      const progress = Math.min(100, Math.floor(((Date.now() - startTime) / (TRAINING_MINUTES * 60 * 1000)) * 100));
      const bar = '█'.repeat(Math.floor(progress / 5)) + '░'.repeat(20 - Math.floor(progress / 5));
      process.stdout.write(`\r  [${bar}] ${progress}% | Cycles: ${cycles} | Error: ${avgError.toFixed(4)} | Best: ${bestError.toFixed(4)} | ${remaining}s left`);
    }

    if (cycles % 100 === 0) await new Promise(r => setTimeout(r, 50));
  }

  console.log('\n');

  // === SAVE ===
  console.log('💾 Saving...');
  fs.writeFileSync(BRAIN_FILE, JSON.stringify(brain.toJSON(), null, 2));
  fs.writeFileSync(VOCAB_FILE, JSON.stringify({
    wordToIndex: tp.wordToIndex,
    indexToWord: tp.indexToWord,
    vocabSize: tp.vocabSize
  }, null, 2));

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
  fs.writeFileSync(RANKINGS_FILE, JSON.stringify(rankings, null, 2));
  fs.writeFileSync(SELF_TALK_FILE, JSON.stringify(selfTalks, null, 2));

  // Update state
  let state = {};
  if (fs.existsSync(STATE_FILE)) {
    const raw = fs.readFileSync(STATE_FILE, 'utf-8');
    if (raw.trim()) try { state = JSON.parse(raw); } catch (e) {}
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

  // Summary
  const duration = Math.floor((Date.now() - startTime) / 1000);
  console.log('\n' + '='.repeat(70));
  console.log('✅ TRAINING COMPLETE');
  console.log('='.repeat(70));
  console.log(`   Duration: ${Math.floor(duration / 60)}m ${duration % 60}s`);
  console.log(`   Sessions: ${state.trainingSessions}`);
  console.log(`   Cycles: ${cycles}`);
  console.log(`   Avg error: ${avgError.toFixed(4)}`);
  console.log(`   Vocab: ${tp.vocabSize} words (+${newWordsAdded} new)`);
  console.log(`   Training pairs: ${uniquePairs.length}`);
  console.log(`   Code awareness: ${codePairs.length}`);
  console.log(`   Improvement: ${improvementPairs.length}`);
  console.log(`   Debates: ${debatePairs.length}`);
  console.log(`   Rankings: ${rankings.length}`);
  console.log(`   Avg ranking: ${avgRanking.toFixed(1)}/10`);
  console.log('='.repeat(70));

  // Trigger next cycle
  console.log('\n🔄 Triggering next cycle...');
  try {
    const repoInfo = process.env.GITHUB_REPOSITORY;
    if (repoInfo) {
      const [owner, repo] = repoInfo.split('/');
      const token = process.env.GITHUB_TOKEN;
      if (token) {
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
          console.log('  ✅ Next cycle triggered');
        } else {
          console.log(`  ⚠️ Could not trigger (${response.status})`);
        }
      }
    }
  } catch (e) {
    console.log('  ℹ️ Not in GitHub Actions');
  }

  console.log('\n' + '='.repeat(70) + '\n');
}

train().catch(error => {
  console.error('\n❌ TRAINING FAILED:', error.message);
  process.exit(1);
});
