// trainer.js - Self-Play Training Engine
// VERSION: 1.0.0

const TRAINER_VERSION = "1.0.0";

// ========== CONFIGURATION ==========
const CONFIG = {
    gamesPerGeneration: 100,
    maxWorkers: navigator.hardwareConcurrency || 4,
    timePerMove: 3000, // ms
    maxDepth: 4,
    mutationRate: 0.02,
    exportFormats: ['json', 'csv'],
    neuronCount: 64 // Simple neural net size
};

// ========== GLOBAL STATE ==========
let trainingState = {
    isRunning: false,
    isPaused: false,
    generation: 0,
    gamesCompleted: 0,
    totalGames: 0,
    whiteWins: 0,
    blackWins: 0,
    draws: 0,
    bestWinRate: 0,
    avgMoves: 0
};

let workers = [];
let gameQueue = [];
let completedGames = [];
let learningData = {
    generations: [],
    winRates: []
};

let currentGenome = null; // Best genome so far
let genomePool = [];

// ========== GENOME (Neural Net Weights) ==========
class Genome {
    constructor(neuronCount = 64) {
        this.neuronCount = neuronCount;
        this.weights = this.randomWeights();
        this.fitness = 0;
        this.wins = 0;
        this.losses = 0;
        this.draws = 0;
    }
    
    randomWeights() {
        // Simple weight array for evaluation
        const weights = {
            material: Math.random() * 2,
            mobility: Math.random() * 2,
            centerControl: Math.random() * 2,
            kingSafety: Math.random() * 2,
            pawnStructure: Math.random() * 2,
            pieceActivity: Math.random() * 2,
            aggression: Math.random() * 1.5 + 0.5
        };
        return weights;
    }
    
    mutate(rate = CONFIG.mutationRate) {
        const child = new Genome(this.neuronCount);
        child.weights = { ...this.weights };
        
        for (let key in child.weights) {
            if (Math.random() < rate) {
                const delta = (Math.random() - 0.5) * 0.5;
                child.weights[key] = Math.max(0.1, Math.min(3.0, child.weights[key] + delta));
            }
        }
        
        return child;
    }
    
    crossover(other) {
        const child = new Genome(this.neuronCount);
        for (let key in child.weights) {
            child.weights[key] = Math.random() < 0.5 ? this.weights[key] : other.weights[key];
        }
        return child;
    }
    
    calculateFitness() {
        const total = this.wins + this.losses + this.draws;
        if (total === 0) return 0;
        this.fitness = (this.wins * 2 + this.draws) / (total * 2);
        return this.fitness;
    }
}

// ========== TRAINING CONTROLLER ==========
function log(message, type = 'info') {
    const consoleEl = document.getElementById('console-output');
    const line = document.createElement('div');
    line.className = `console-line ${type}`;
    line.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    consoleEl.appendChild(line);
    consoleEl.scrollTop = consoleEl.scrollHeight;
    
    // Keep only last 50 lines
    while (consoleEl.children.length > 50) {
        consoleEl.removeChild(consoleEl.firstChild);
    }
}

function updateUI() {
    document.getElementById('gen-count').textContent = trainingState.generation;
    document.getElementById('games-played').textContent = trainingState.totalGames;
    document.getElementById('best-winrate').textContent = trainingState.bestWinRate.toFixed(1) + '%';
    document.getElementById('avg-moves').textContent = trainingState.avgMoves;
    
    document.getElementById('white-wins').textContent = trainingState.whiteWins;
    document.getElementById('draws').textContent = trainingState.draws;
    document.getElementById('black-wins').textContent = trainingState.blackWins;
    
    const progress = (trainingState.gamesCompleted / CONFIG.gamesPerGeneration) * 100;
    document.getElementById('progress-fill').style.width = progress + '%';
    document.getElementById('progress-text').textContent = 
        `${trainingState.gamesCompleted}/${CONFIG.gamesPerGeneration} Games`;
}

function updateChart() {
    const canvas = document.getElementById('learning-chart');
    const ctx = canvas.getContext('2d');
    
    // Clear canvas
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    if (learningData.generations.length === 0) return;
    
    // Draw grid
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 10; i++) {
        const x = (i / 10) * canvas.width;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.strokeStyle = '#222';
        ctx.stroke();
    }
    
    // Draw line
    ctx.beginPath();
    ctx.strokeStyle = '#00ff88';
    ctx.lineWidth = 3;
    ctx.shadowColor = '#00ff88';
    ctx.shadowBlur = 10;
    
    const maxGen = Math.max(...learningData.generations, 1);
    const maxWR = Math.max(...learningData.winRates, 100);
    
    for (let i = 0; i < learningData.generations.length; i++) {
        const x = (learningData.generations[i] / maxGen) * canvas.width;
        const y = canvas.height - (learningData.winRates[i] / maxWR) * canvas.height;
        
        if (i === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    }
    ctx.stroke();
    
    // Draw points
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#00ff88';
    for (let i = 0; i < learningData.generations.length; i++) {
        const x = (learningData.generations[i] / maxGen) * canvas.width;
        const y = canvas.height - (learningData.winRates[i] / maxWR) * canvas.height;
        
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#00ff88';
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.stroke();
    }
}

async function runGame(whiteGenome, blackGenome, gameId) {
    return new Promise((resolve) => {
        const worker = new Worker('game-worker.js');
        
        worker.postMessage({
            type: 'start',
            whiteGenome: whiteGenome.weights,
            blackGenome: blackGenome.weights,
            gameId: gameId,
            config: {
                timePerMove: CONFIG.timePerMove,
                maxDepth: CONFIG.maxDepth
            }
        });
        
        worker.onmessage = (e) => {
            if (e.data.type === 'progress') {
                updateGameDisplay(gameId, e.data);
            } else if (e.data.type === 'complete') {
                worker.terminate();
                resolve({
                    gameId: gameId,
                    winner: e.data.winner,
                    moves: e.data.moves,
                    moveCount: e.data.moveCount,
                    whiteGenome: whiteGenome,
                    blackGenome: blackGenome,
                    opening: e.data.opening,
                    criticalPositions: e.data.criticalPositions
                });
            }
        };
    });
}

function updateGameDisplay(gameId, data) {
    const gameEl = document.getElementById(`game-${gameId}`);
    if (!gameEl) return;
    
    const movesEl = gameEl.querySelector('.game-moves');
    const moveCountEl = gameEl.querySelector('.move-count');
    const statusEl = gameEl.querySelector('.status-badge');
    
    if (movesEl) {
        movesEl.textContent = data.lastMoves || 'Starting...';
    }
    if (moveCountEl) {
        moveCountEl.textContent = `Move ${data.moveCount || 0}`;
    }
    if (statusEl && data.status) {
        statusEl.textContent = data.status;
        statusEl.className = `status-badge ${data.status.toLowerCase()}`;
    }
}

async function runGeneration() {
    log(`Starting Generation ${trainingState.generation + 1}`, 'success');
    
    // Create genome pool if empty
    if (genomePool.length === 0) {
        for (let i = 0; i < 10; i++) {
            genomePool.push(new Genome(CONFIG.neuronCount));
        }
        currentGenome = genomePool[0];
    }
    
    // Create live game displays
    const liveGamesEl = document.getElementById('live-games');
    liveGamesEl.innerHTML = '';
    for (let i = 0; i < Math.min(6, CONFIG.gamesPerGeneration); i++) {
        const gameCard = document.createElement('div');
        gameCard.className = 'game-mini active';
        gameCard.id = `game-${i}`;
        gameCard.innerHTML = `
            <div class="game-header">
                <span>Game #${i + 1}</span>
                <span class="move-count">Move 0</span>
                <span class="status-badge running">RUNNING</span>
            </div>
            <div class="game-moves">Waiting to start...</div>
        `;
        liveGamesEl.appendChild(gameCard);
    }
    
    // Run games in batches
    const batchSize = CONFIG.maxWorkers;
    trainingState.gamesCompleted = 0;
    
    for (let i = 0; i < CONFIG.gamesPerGeneration; i += batchSize) {
        if (trainingState.isPaused) {
            log('Training paused', 'warning');
            while (trainingState.isPaused) {
                await new Promise(r => setTimeout(r, 100));
            }
        }
        
        if (!trainingState.isRunning) break;
        
        const batch = [];
        for (let j = 0; j < batchSize && i + j < CONFIG.gamesPerGeneration; j++) {
            const gameId = i + j;
            
            // Select genomes (tournament selection)
            const whiteIdx = Math.floor(Math.random() * genomePool.length);
            let blackIdx = Math.floor(Math.random() * genomePool.length);
            while (blackIdx === whiteIdx) {
                blackIdx = Math.floor(Math.random() * genomePool.length);
            }
            
            const whiteGenome = genomePool[whiteIdx].mutate(0.02);
            const blackGenome = genomePool[blackIdx].mutate(0.02);
            
            batch.push(runGame(whiteGenome, blackGenome, gameId));
        }
        
        const results = await Promise.all(batch);
        
        for (const result of results) {
            completedGames.push(result);
            trainingState.gamesCompleted++;
            trainingState.totalGames++;
            
            if (result.winner === 'white') {
                trainingState.whiteWins++;
                result.whiteGenome.wins++;
                result.blackGenome.losses++;
            } else if (result.winner === 'black') {
                trainingState.blackWins++;
                result.blackGenome.wins++;
                result.whiteGenome.losses++;
            } else {
                trainingState.draws++;
                result.whiteGenome.draws++;
                result.blackGenome.draws++;
            }
            
            trainingState.avgMoves = Math.round(
                (trainingState.avgMoves * (trainingState.gamesCompleted - 1) + result.moveCount) / 
                trainingState.gamesCompleted
            );
        }
        
        updateUI();
    }
    
    // Evolution step
    if (trainingState.isRunning && !trainingState.isPaused) {
        evolvePopulation();
    }
}

function evolvePopulation() {
    log('Evolving population...', 'success');
    
    // Calculate fitness for all genomes
    genomePool.sort((a, b) => b.calculateFitness() - a.calculateFitness());
    
    // Keep top performers
    const newPool = genomePool.slice(0, 5);
    
    // Update best win rate
    const bestFitness = newPool[0].fitness * 100;
    if (bestFitness > trainingState.bestWinRate) {
        trainingState.bestWinRate = bestFitness;
        currentGenome = newPool[0];
        log(`New best genome! Win rate: ${bestFitness.toFixed(1)}%`, 'success');
    }
    
    // Create new genomes through crossover and mutation
    while (newPool.length < 20) {
        const parent1 = genomePool[Math.floor(Math.random() * 5)];
        const parent2 = genomePool[Math.floor(Math.random() * 5)];
        let child = parent1.crossover(parent2);
        child = child.mutate(0.05);
        newPool.push(child);
    }
    
    genomePool = newPool;
    
    trainingState.generation++;
    learningData.generations.push(trainingState.generation);
    learningData.winRates.push(bestFitness);
    
    updateChart();
    
    // Reset for next generation
    trainingState.gamesCompleted = 0;
    genomePool.forEach(g => { g.wins = 0; g.losses = 0; g.draws = 0; });
}

async function startTraining() {
    if (trainingState.isRunning) return;
    
    trainingState.isRunning = true;
    trainingState.isPaused = false;
    
    document.getElementById('btn-start').disabled = true;
    document.getElementById('btn-pause').disabled = false;
    document.getElementById('btn-reset').disabled = true;
    
    log('Training started!', 'success');
    
    while (trainingState.isRunning) {
        await runGeneration();
        
        if (trainingState.generation >= 50) {
            log('Completed 50 generations!', 'success');
            trainingState.isRunning = false;
        }
    }
    
    document.getElementById('btn-start').disabled = false;
    document.getElementById('btn-pause').disabled = true;
    document.getElementById('btn-reset').disabled = false;
    
    log('Training completed!', 'success');
}

function pauseTraining() {
    trainingState.isPaused = !trainingState.isPaused;
    const btn = document.getElementById('btn-pause');
    btn.textContent = trainingState.isPaused ? '▶ Resume' : '⏸ Pause';
    log(trainingState.isPaused ? 'Training paused' : 'Training resumed', 'warning');
}

function resetTraining() {
    trainingState = {
        isRunning: false,
        isPaused: false,
        generation: 0,
        gamesCompleted: 0,
        totalGames: 0,
        whiteWins: 0,
        blackWins: 0,
        draws: 0,
        bestWinRate: 0,
        avgMoves: 0
    };
    
    genomePool = [];
    completedGames = [];
    learningData = { generations: [], winRates: [] };
    
    document.getElementById('live-games').innerHTML = '';
    document.getElementById('console-output').innerHTML = '<div class="console-line success">[System] Training Arena reset</div>';
    
    updateUI();
    updateChart();
    
    log('Training data reset', 'success');
}

// ========== EXPORT FUNCTIONS ==========
function exportOpenings() {
    const openings = {};
    
    completedGames.forEach(game => {
        if (game.moves && game.moves.length >= 4) {
            const opening = game.moves.slice(0, 6).join(' ');
            if (!openings[opening]) {
                openings[opening] = { white: 0, black: 0, draw: 0 };
            }
            if (game.winner === 'white') openings[opening].white++;
            else if (game.winner === 'black') openings[opening].black++;
            else openings[opening].draw++;
        }
    });
    
    const dataStr = JSON.stringify(openings, null, 2);
    downloadFile(dataStr, 'trained-openings.json', 'application/json');
    log(`Exported ${Object.keys(openings).length} opening lines`, 'success');
}

function exportEvaluations() {
    const evaluations = [];
    
    completedGames.forEach(game => {
        if (game.criticalPositions) {
            game.criticalPositions.forEach(pos => {
                evaluations.push({
                    fen: pos.fen,
                    evaluation: pos.eval,
                    result: game.winner,
                    move: pos.bestMove
                });
            });
        }
    });
    
    let csv = 'fen,evaluation,result,bestMove\n';
    evaluations.forEach(e => {
        csv += `"${e.fen}",${e.evaluation},"${e.result}","${e.move}"\n`;
    });
    
    downloadFile(csv, 'position-evaluations.csv', 'text/csv');
    log(`Exported ${evaluations.length} position evaluations`, 'success');
}

function exportGames() {
    let pgn = '';
    
    completedGames.forEach((game, i) => {
        pgn += `[Event "Self-Play Game ${i + 1}"]\n`;
        pgn += `[Result "${game.winner === 'white' ? '1-0' : game.winner === 'black' ? '0-1' : '1/2-1/2'}"]\n`;
        pgn += `[White "Genome ${game.whiteGenome ? 'AI' : 'Unknown'}"]\n`;
        pgn += `[Black "Genome ${game.blackGenome ? 'AI' : 'Unknown'}"]\n\n`;
        
        if (game.moves) {
            for (let j = 0; j < game.moves.length; j++) {
                if (j % 2 === 0) pgn += `${Math.floor(j/2)+1}. `;
                pgn += game.moves[j] + ' ';
                if (j % 2 === 1) pgn += '\n';
            }
        }
        pgn += ` ${game.winner === 'white' ? '1-0' : game.winner === 'black' ? '0-1' : '1/2-1/2'}\n\n`;
    });
    
    downloadFile(pgn, 'training-games.pgn', 'application/x-chess-pgn');
    log(`Exported ${completedGames.length} games in PGN format`, 'success');
}

function exportWeights() {
    if (!currentGenome) {
        log('No genome to export!', 'error');
        return;
    }
    
    const exportData = {
        version: TRAINER_VERSION,
        generation: trainingState.generation,
        winRate: trainingState.bestWinRate,
        weights: currentGenome.weights,
        metadata: {
            totalGames: trainingState.totalGames,
            gamesPerGeneration: CONFIG.gamesPerGeneration
        }
    };
    
    const dataStr = JSON.stringify(exportData, null, 2);
    downloadFile(dataStr, `genome-gen${trainingState.generation}.json`, 'application/json');
    log(`Exported best genome (Win rate: ${trainingState.bestWinRate.toFixed(1)}%)`, 'success');
}

function downloadFile(content, filename, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

// ========== INITIALIZATION ==========
log(`Chess AI Training Arena v${TRAINER_VERSION} initialized`, 'success');
log(`Workers available: ${CONFIG.maxWorkers}`, 'info');
log(`Neuron count: ${CONFIG.neuronCount}`, 'info');
updateUI();
