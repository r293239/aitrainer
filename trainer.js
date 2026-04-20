// trainer.js - Parallel Self-Play Trainer
// Uses Web Workers to run 100 games simultaneously

const TRAINER_VERSION = "1.0.0";

// ========== CONFIGURATION ==========
const CONFIG = {
    totalGames: 100,
    maxWorkers: navigator.hardwareConcurrency || 8, // Use available CPU cores
    timePerMove: 2000, // 2 seconds per move
    maxDepth: 3
};

// ========== TRAINING STATE ==========
let trainingState = {
    isRunning: false,
    gamesCompleted: 0,
    whiteWins: 0,
    blackWins: 0,
    draws: 0,
    startTime: null
};

// ========== WORKER POOL ==========
let workers = [];
let gameQueue = [];
let completedGames = [];
let trainingData = {
    games: [],
    openings: {},
    evaluations: [],
    version: TRAINER_VERSION,
    started: null
};

// ========== UI HELPERS ==========
function log(message, type = '') {
    const logEl = document.getElementById('log');
    const line = document.createElement('div');
    line.className = `log-line ${type}`;
    const time = new Date().toLocaleTimeString();
    line.textContent = `[${time}] ${message}`;
    logEl.appendChild(line);
    logEl.scrollTop = logEl.scrollHeight;
    
    while (logEl.children.length > 100) {
        logEl.removeChild(logEl.firstChild);
    }
}

function updateUI() {
    document.getElementById('games-completed').textContent = trainingState.gamesCompleted;
    document.getElementById('total-games').textContent = CONFIG.totalGames;
    document.getElementById('white-wins').textContent = trainingState.whiteWins;
    document.getElementById('draws').textContent = trainingState.draws;
    document.getElementById('black-wins').textContent = trainingState.blackWins;
    
    const activeCount = workers.filter(w => w.busy).length;
    document.getElementById('active-workers').textContent = activeCount;
    
    const progress = (trainingState.gamesCompleted / CONFIG.totalGames) * 100;
    document.getElementById('progress-fill').style.width = progress + '%';
    document.getElementById('progress-text').textContent = 
        `${trainingState.gamesCompleted}/${CONFIG.totalGames} Games`;
    
    if (trainingState.startTime) {
        const elapsed = Math.floor((Date.now() - trainingState.startTime) / 1000);
        const mins = Math.floor(elapsed / 60);
        const secs = elapsed % 60;
        document.getElementById('elapsed-time').textContent = 
            `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    
    updateWorkerStatus();
}

function updateWorkerStatus() {
    const statusEl = document.getElementById('worker-status');
    statusEl.innerHTML = '';
    
    workers.forEach((worker, i) => {
        const dot = document.createElement('div');
        dot.className = `worker ${worker.busy ? 'active' : (worker.completed ? 'completed' : '')}`;
        dot.title = `Worker ${i + 1}: ${worker.busy ? 'Playing Game ' + worker.gameId : 'Idle'}`;
        statusEl.appendChild(dot);
    });
}

// ========== WORKER CREATION ==========
function createWorker() {
    const workerCode = `
        // Worker thread - runs a single chess game
        let board = null;
        let gameState = null;
        
        self.onmessage = function(e) {
            const { type, gameId } = e.data;
            
            if (type === 'start') {
                // Initialize a new game using the global ChessGame class
                gameState = new ChessGame();
                gameState.newGame();
                board = gameState.board;
                
                runGame(gameId);
            }
        };
        
        function runGame(gameId) {
            const moves = [];
            const evaluations = [];
            let moveCount = 0;
            
            function makeAIMove() {
                if (gameState.gameOver) {
                    const result = determineResult();
                    self.postMessage({
                        type: 'complete',
                        gameId: gameId,
                        result: result,
                        moves: moves,
                        evaluations: evaluations,
                        moveCount: moveCount
                    });
                    return;
                }
                
                const move = gameState.findBestMove();
                
                if (!move) {
                    gameState.gameOver = true;
                    const result = determineResult();
                    self.postMessage({
                        type: 'complete',
                        gameId: gameId,
                        result: result,
                        moves: moves,
                        evaluations: evaluations,
                        moveCount: moveCount
                    });
                    return;
                }
                
                const moveStr = toAlgebraic(move);
                gameState.makeMove(move.fromRow, move.fromCol, move.toRow, move.toCol);
                gameState.switchPlayer();
                
                moves.push(moveStr);
                moveCount++;
                
                // Record evaluation every 10 moves
                if (moveCount % 10 === 0) {
                    evaluations.push({
                        moveNumber: moveCount,
                        fen: gameState.getFEN(),
                        evaluation: gameState.evaluatePositionForSearch(gameState.board, gameState.currentPlayer, gameState.moveCount),
                        player: gameState.currentPlayer
                    });
                }
                
                // Progress update
                if (moveCount % 20 === 0) {
                    self.postMessage({
                        type: 'progress',
                        gameId: gameId,
                        moveCount: moveCount,
                        lastMove: moveStr
                    });
                }
                
                // Continue game
                if (moveCount < 300) {
                    setTimeout(makeAIMove, 10);
                } else {
                    gameState.gameOver = true;
                    self.postMessage({
                        type: 'complete',
                        gameId: gameId,
                        result: { winner: 'draw', reason: 'move limit' },
                        moves: moves,
                        evaluations: evaluations,
                        moveCount: moveCount
                    });
                }
            }
            
            function determineResult() {
                if (gameState.isCheckmate()) {
                    const winner = gameState.currentPlayer === 'white' ? 'black' : 'white';
                    return { winner: winner, reason: 'checkmate' };
                } else if (gameState.isStalemate()) {
                    return { winner: 'draw', reason: 'stalemate' };
                } else if (gameState.isDraw()) {
                    return { winner: 'draw', reason: 'draw' };
                }
                return { winner: 'draw', reason: 'unknown' };
            }
            
            function toAlgebraic(move) {
                const files = ['a','b','c','d','e','f','g','h'];
                const ranks = ['8','7','6','5','4','3','2','1'];
                return files[move.fromCol] + ranks[move.fromRow] + files[move.toCol] + ranks[move.toRow];
            }
            
            // Start the game
            setTimeout(makeAIMove, 10);
        }
    `;
    
    const blob = new Blob([workerCode], { type: 'application/javascript' });
    return new Worker(URL.createObjectURL(blob));
}

// ========== PARALLEL TRAINING ==========
async function startParallelTraining() {
    if (trainingState.isRunning) return;
    
    trainingState.isRunning = true;
    trainingState.startTime = Date.now();
    trainingData.started = trainingData.started || new Date().toISOString();
    
    document.getElementById('btn-start').disabled = true;
    document.getElementById('btn-stop').disabled = false;
    
    log(`🚀 Starting ${CONFIG.totalGames} parallel games with ${CONFIG.maxWorkers} workers`, 'win');
    
    // Create worker pool
    for (let i = 0; i < CONFIG.maxWorkers; i++) {
        const worker = createWorker();
        worker.id = i;
        worker.busy = false;
        worker.completed = false;
        worker.onmessage = (e) => handleWorkerMessage(worker, e.data);
        workers.push(worker);
    }
    
    // Queue all games
    for (let i = 0; i < CONFIG.totalGames; i++) {
        gameQueue.push({
            id: i,
            status: 'pending'
        });
    }
    
    // Start initial batch
    assignGamesToIdleWorkers();
    
    // Update timer
    const timerInterval = setInterval(() => {
        if (!trainingState.isRunning) {
            clearInterval(timerInterval);
        }
        updateUI();
    }, 1000);
}

function assignGamesToIdleWorkers() {
    workers.forEach(worker => {
        if (!worker.busy && gameQueue.length > 0) {
            const game = gameQueue.shift();
            worker.busy = true;
            worker.gameId = game.id;
            worker.postMessage({ type: 'start', gameId: game.id });
            
            log(`Game ${game.id + 1}: Started on worker ${worker.id}`, 'info');
        }
    });
    
    updateUI();
}

function handleWorkerMessage(worker, data) {
    if (data.type === 'progress') {
        // Just log occasionally
        if (data.moveCount % 50 === 0) {
            log(`Game ${data.gameId + 1}: Move ${data.moveCount}`, 'info');
        }
    } else if (data.type === 'complete') {
        worker.busy = false;
        worker.completed = true;
        
        // Record result
        const result = data.result;
        trainingState.gamesCompleted++;
        
        if (result.winner === 'white') trainingState.whiteWins++;
        else if (result.winner === 'black') trainingState.blackWins++;
        else trainingState.draws++;
        
        // Store game data
        const gameData = {
            id: data.gameId,
            moves: data.moves,
            evaluations: data.evaluations,
            winner: result.winner,
            reason: result.reason,
            moveCount: data.moveCount,
            timestamp: new Date().toISOString()
        };
        
        completedGames.push(gameData);
        trainingData.games.push(gameData);
        
        // Learn openings
        if (data.moves.length >= 4) {
            const openingKey = data.moves.slice(0, 6).join(' ');
            if (!trainingData.openings[openingKey]) {
                trainingData.openings[openingKey] = { white: 0, black: 0, draw: 0, total: 0 };
            }
            trainingData.openings[openingKey].total++;
            if (result.winner === 'white') trainingData.openings[openingKey].white++;
            else if (result.winner === 'black') trainingData.openings[openingKey].black++;
            else trainingData.openings[openingKey].draw++;
        }
        
        // Store evaluations
        data.evaluations.forEach(e => {
            trainingData.evaluations.push({
                gameId: data.gameId,
                ...e
            });
        });
        
        log(`Game ${data.gameId + 1}: Complete - ${result.winner} in ${data.moveCount} moves (${trainingState.gamesCompleted}/${CONFIG.totalGames})`, 
            result.winner === 'white' ? 'win' : (result.winner === 'black' ? 'loss' : 'draw'));
        
        updateUI();
        
        // Assign next game if available
        assignGamesToIdleWorkers();
        
        // Save progress every 10 games
        if (trainingState.gamesCompleted % 10 === 0) {
            saveToLocalStorage();
            log(`💾 Progress saved: ${trainingState.gamesCompleted} games`, 'info');
        }
        
        // Check if all games completed
        if (trainingState.gamesCompleted >= CONFIG.totalGames) {
            finishTraining();
        }
    }
}

function finishTraining() {
    trainingState.isRunning = false;
    trainingData.lastUpdated = new Date().toISOString();
    
    document.getElementById('btn-start').disabled = false;
    document.getElementById('btn-stop').disabled = true;
    
    saveToLocalStorage();
    
    log('🎉 ========================================', 'win');
    log(`🎉 TRAINING COMPLETE!`, 'win');
    log(`🎉 ${CONFIG.totalGames} games finished in parallel`, 'win');
    log(`🎉 Results: ${trainingState.whiteWins}W - ${trainingState.draws}D - ${trainingState.blackWins}L`, 'win');
    log('🎉 ========================================', 'win');
    
    // Terminate workers
    workers.forEach(w => w.terminate());
    workers = [];
}

function stopTraining() {
    trainingState.isRunning = false;
    log('Training stopped by user', 'warning');
    
    workers.forEach(w => w.terminate());
    workers = [];
    
    document.getElementById('btn-start').disabled = false;
    document.getElementById('btn-stop').disabled = true;
}

function resetTraining() {
    if (!confirm('Reset all training data? This cannot be undone.')) return;
    
    if (trainingState.isRunning) {
        stopTraining();
    }
    
    trainingState = {
        isRunning: false,
        gamesCompleted: 0,
        whiteWins: 0,
        blackWins: 0,
        draws: 0,
        startTime: null
    };
    
    trainingData = {
        games: [],
        openings: {},
        evaluations: [],
        version: TRAINER_VERSION,
        started: new Date().toISOString()
    };
    
    completedGames = [];
    gameQueue = [];
    
    updateUI();
    document.getElementById('log').innerHTML = '<div class="log-line">[System] Training data reset.</div>';
    log('All training data has been reset', 'info');
}

// ========== STORAGE ==========
function saveToLocalStorage() {
    try {
        const data = {
            state: trainingState,
            data: trainingData,
            version: TRAINER_VERSION
        };
        localStorage.setItem('chess_parallel_training', JSON.stringify(data));
    } catch (e) {
        log('Failed to save to localStorage', 'error');
    }
}

function loadFromLocalStorage() {
    try {
        const saved = localStorage.getItem('chess_parallel_training');
        if (saved) {
            const data = JSON.parse(saved);
            if (data.version === TRAINER_VERSION) {
                trainingState = data.state;
                trainingData = data.data;
                completedGames = data.data.games;
                updateUI();
                log(`Loaded ${trainingState.gamesCompleted} games from storage`, 'info');
            }
        }
    } catch (e) {
        log('No saved data found', 'info');
    }
}

// ========== EXPORT FUNCTIONS ==========
function exportOpenings() {
    const data = {
        version: TRAINER_VERSION,
        generated: new Date().toISOString(),
        totalGames: trainingState.gamesCompleted,
        openings: trainingData.openings
    };
    downloadJSON(data, `openings-${trainingState.gamesCompleted}.json`);
    log(`Exported ${Object.keys(trainingData.openings).length} opening lines`, 'win');
}

function exportEvaluations() {
    let csv = 'gameId,moveNumber,fen,evaluation,player\n';
    trainingData.evaluations.forEach(e => {
        csv += `${e.gameId},${e.moveNumber},"${e.fen}",${e.evaluation},${e.player}\n`;
    });
    downloadFile(csv, `evaluations-${trainingState.gamesCompleted}.csv`, 'text/csv');
    log(`Exported ${trainingData.evaluations.length} evaluations`, 'win');
}

function exportGames() {
    let pgn = '';
    trainingData.games.forEach((game, i) => {
        pgn += `[Event "Parallel Self-Play ${i + 1}"]\n`;
        pgn += `[Result "${game.winner === 'white' ? '1-0' : game.winner === 'black' ? '0-1' : '1/2-1/2'}"]\n`;
        pgn += `[Termination "${game.reason}"]\n\n`;
        
        for (let j = 0; j < game.moves.length; j++) {
            if (j % 2 === 0) pgn += `${Math.floor(j/2)+1}. `;
            pgn += game.moves[j] + ' ';
            if (j % 2 === 1) pgn += '\n';
        }
        pgn += ` ${game.winner === 'white' ? '1-0' : game.winner === 'black' ? '0-1' : '1/2-1/2'}\n\n`;
    });
    downloadFile(pgn, `games-${trainingState.gamesCompleted}.pgn`, 'application/x-chess-pgn');
    log(`Exported ${trainingData.games.length} games`, 'win');
}

function exportAll() {
    const allData = {
        version: TRAINER_VERSION,
        generated: new Date().toISOString(),
        stats: {
            gamesPlayed: trainingState.gamesCompleted,
            whiteWins: trainingState.whiteWins,
            blackWins: trainingState.blackWins,
            draws: trainingState.draws
        },
        openings: trainingData.openings,
        games: trainingData.games.map(g => ({
            id: g.id,
            winner: g.winner,
            moveCount: g.moveCount,
            moves: g.moves
        }))
    };
    downloadJSON(allData, `training-data-${trainingState.gamesCompleted}.json`);
    log(`Exported complete training data`, 'win');
}

function downloadJSON(data, filename) {
    downloadFile(JSON.stringify(data, null, 2), filename, 'application/json');
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
window.addEventListener('load', () => {
    loadFromLocalStorage();
    updateUI();
    
    // Create worker status dots
    const statusEl = document.getElementById('worker-status');
    for (let i = 0; i < CONFIG.maxWorkers; i++) {
        const dot = document.createElement('div');
        dot.className = 'worker';
        statusEl.appendChild(dot);
    }
    
    log(`Parallel Chess Trainer v${TRAINER_VERSION} loaded`, 'win');
    log(`Ready to run ${CONFIG.totalGames} games with ${CONFIG.maxWorkers} workers`, 'info');
});

// Global functions
window.startParallelTraining = startParallelTraining;
window.stopTraining = stopTraining;
window.resetTraining = resetTraining;
window.exportOpenings = exportOpenings;
window.exportEvaluations = exportEvaluations;
window.exportGames = exportGames;
window.exportAll = exportAll;
