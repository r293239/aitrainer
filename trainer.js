// trainer.js - Parallel Self-Play Trainer with Live Board Viewer

const TRAINER_VERSION = "1.0.0";

// ========== CONFIGURATION ==========
const CONFIG = {
    totalGames: 100,
    maxWorkers: navigator.hardwareConcurrency || 4,
    timePerMove: 1000,
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

// ========== GAME TRACKING ==========
let activeGames = new Map(); // gameId -> gameState
let workers = [];
let gameQueue = [];
let trainingData = {
    games: [],
    openings: {},
    evaluations: [],
    version: TRAINER_VERSION,
    started: null
};

// ========== GET CHESS ENGINE CODE AS STRING ==========
function getEngineCode() {
    // Extract the chess engine code from the script tag
    const scripts = document.getElementsByTagName('script');
    for (let script of scripts) {
        if (script.src && script.src.includes('chess-engine.js')) {
            // We'll fetch it instead
            return null;
        }
    }
    
    // Fallback: define minimal engine if not found
    return `
        // Chess engine functions will be injected from main thread
        let board, currentPlayer, moveCount, gameOver;
        
        function initEngine() {
            // This will be replaced by actual engine functions
        }
    `;
}

// ========== CREATE WORKER WITH ENGINE ==========
async function createWorkerWithEngine() {
    // Fetch the chess engine code
    const response = await fetch('chess-engine.js');
    const engineCode = await response.text();
    
    const workerCode = `
        // ========== CHESS ENGINE ==========
        ${engineCode}
        
        // ========== GAME RUNNER ==========
        let gameInstance = null;
        let moveInterval = null;
        
        // Capture engine functions
        const engine = {
            newGame: window.newGame,
            findBestMove: window.findBestMove,
            makeMove: window.makeMove,
            switchPlayer: window.switchPlayer,
            isCheckmate: window.isCheckmate,
            isStalemate: window.isStalemate,
            isDraw: window.isDraw,
            getFEN: window.getFEN,
            evaluatePositionForSearch: window.evaluatePositionForSearch,
            getAllPossibleMoves: window.getAllPossibleMoves,
            board: window.board,
            currentPlayer: window.currentPlayer,
            moveCount: window.moveCount,
            gameOver: window.gameOver
        };
        
        self.onmessage = function(e) {
            const { type, gameId } = e.data;
            
            if (type === 'start') {
                // Initialize new game
                if (typeof window.newGame === 'function') {
                    window.newGame();
                }
                
                runGame(gameId);
            } else if (type === 'stop') {
                if (moveInterval) {
                    clearTimeout(moveInterval);
                }
            } else if (type === 'getState') {
                // Return current game state for UI
                self.postMessage({
                    type: 'state',
                    gameId: gameId,
                    board: window.board,
                    currentPlayer: window.currentPlayer,
                    moveCount: window.moveCount,
                    gameOver: window.gameOver,
                    fen: typeof window.getFEN === 'function' ? window.getFEN() : ''
                });
            }
        };
        
        function runGame(gameId) {
            const moves = [];
            const evaluations = [];
            let moveCount = 0;
            
            function makeAIMove() {
                // Check if game is over
                if (window.gameOver) {
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
                
                // Get best move
                let move = null;
                if (typeof window.findBestMove === 'function') {
                    move = window.findBestMove();
                }
                
                if (!move) {
                    window.gameOver = true;
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
                
                // Make move
                if (typeof window.makeMove === 'function') {
                    window.makeMove(move.fromRow, move.fromCol, move.toRow, move.toCol);
                }
                if (typeof window.switchPlayer === 'function') {
                    window.switchPlayer();
                }
                
                moves.push(moveStr);
                moveCount++;
                
                // Get current evaluation
                let evalScore = 0;
                if (typeof window.evaluatePositionForSearch === 'function') {
                    evalScore = window.evaluatePositionForSearch(window.board, window.currentPlayer, window.moveCount);
                }
                
                const currentFEN = typeof window.getFEN === 'function' ? window.getFEN() : '';
                
                // Send progress update
                self.postMessage({
                    type: 'progress',
                    gameId: gameId,
                    moveCount: moveCount,
                    lastMove: moveStr,
                    board: window.board,
                    currentPlayer: window.currentPlayer,
                    evaluation: evalScore,
                    fen: currentFEN
                });
                
                // Continue if not over
                if (!window.gameOver && moveCount < 300) {
                    moveInterval = setTimeout(makeAIMove, 50);
                } else {
                    window.gameOver = true;
                    const result = determineResult();
                    self.postMessage({
                        type: 'complete',
                        gameId: gameId,
                        result: result,
                        moves: moves,
                        evaluations: evaluations,
                        moveCount: moveCount,
                        board: window.board,
                        fen: currentFEN
                    });
                }
            }
            
            function determineResult() {
                if (typeof window.isCheckmate === 'function' && window.isCheckmate()) {
                    const winner = window.currentPlayer === 'white' ? 'black' : 'white';
                    return { winner: winner, reason: 'checkmate' };
                } else if (typeof window.isStalemate === 'function' && window.isStalemate()) {
                    return { winner: 'draw', reason: 'stalemate' };
                } else if (typeof window.isDraw === 'function' && window.isDraw()) {
                    return { winner: 'draw', reason: 'draw' };
                }
                return { winner: 'draw', reason: 'move limit' };
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
    document.getElementById('white-wins').textContent = trainingState.whiteWins;
    document.getElementById('draws').textContent = trainingState.draws;
    document.getElementById('black-wins').textContent = trainingState.blackWins;
    
    const activeCount = workers.filter(w => w.busy).length;
    document.getElementById('active-workers').textContent = activeCount;
    
    const progress = (trainingState.gamesCompleted / CONFIG.totalGames) * 100;
    document.getElementById('progress-fill').style.width = Math.min(progress, 100) + '%';
    document.getElementById('progress-text').textContent = 
        `${trainingState.gamesCompleted}/${CONFIG.totalGames} Games`;
    
    if (trainingState.startTime && trainingState.isRunning) {
        const elapsed = Math.floor((Date.now() - trainingState.startTime) / 1000);
        const mins = Math.floor(elapsed / 60);
        const secs = elapsed % 60;
        document.getElementById('elapsed-time').textContent = 
            `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    
    updateWorkerStatus();
    updateGamesGrid();
}

function updateWorkerStatus() {
    const statusEl = document.getElementById('worker-status');
    statusEl.innerHTML = '';
    
    workers.forEach((worker, i) => {
        const dot = document.createElement('div');
        dot.className = `worker ${worker.busy ? 'active' : (worker.completed ? 'completed' : '')}`;
        dot.title = `Worker ${i + 1}: ${worker.busy ? 'Playing Game ' + (worker.gameId + 1) : 'Idle'}`;
        statusEl.appendChild(dot);
    });
}

function updateGamesGrid() {
    const grid = document.getElementById('games-grid');
    grid.innerHTML = '';
    
    // Show active games first, then recent completions
    const gamesToShow = [];
    
    activeGames.forEach((game, id) => {
        gamesToShow.push({ id, ...game });
    });
    
    // Sort by game ID
    gamesToShow.sort((a, b) => a.id - b.id);
    
    // Show up to 12 games
    gamesToShow.slice(0, 12).forEach(game => {
        const card = document.createElement('div');
        card.className = `game-card ${game.gameOver ? 'completed' : 'active'}`;
        card.id = `game-card-${game.id}`;
        
        const status = game.gameOver ? 
            (game.winner === 'white' ? 'White Won' : game.winner === 'black' ? 'Black Won' : 'Draw') :
            `${game.currentPlayer} to move`;
        
        card.innerHTML = `
            <div class="game-header">
                <span><strong>Game ${game.id + 1}</strong></span>
                <span>Move ${game.moveCount || 0}</span>
            </div>
            <div>Status: ${status}</div>
            <div>Eval: ${game.evaluation ? (game.evaluation > 0 ? '+' : '') + game.evaluation.toFixed(0) : 'N/A'}</div>
            <div style="margin: 5px 0;">
                <button class="view-board" onclick="showBoardModal(${game.id})">👁 View Board</button>
            </div>
            ${game.lastMove ? `<div>Last: ${game.lastMove}</div>` : ''}
        `;
        
        grid.appendChild(card);
    });
}

// ========== BOARD MODAL ==========
function showBoardModal(gameId) {
    const game = activeGames.get(gameId);
    if (!game) return;
    
    document.getElementById('modal-title').textContent = `Game #${gameId + 1}`;
    
    const status = game.gameOver ? 
        `Winner: ${game.winner} (${game.reason || 'complete'})` :
        `${game.currentPlayer} to move - Move ${game.moveCount}`;
    document.getElementById('modal-status').textContent = status;
    
    // Render board
    if (game.board) {
        let boardStr = '  a b c d e f g h\n';
        for (let row = 0; row < 8; row++) {
            boardStr += (8 - row) + ' ';
            for (let col = 0; col < 8; col++) {
                const piece = game.board[row]?.[col] || '.';
                boardStr += piece + ' ';
            }
            boardStr += '\n';
        }
        document.getElementById('modal-board').textContent = boardStr;
    }
    
    document.getElementById('modal-eval').innerHTML = `
        <strong>Evaluation:</strong> ${game.evaluation ? (game.evaluation > 0 ? '+' : '') + game.evaluation.toFixed(0) : 'N/A'}<br>
        <strong>Last Move:</strong> ${game.lastMove || 'N/A'}<br>
        <strong>FEN:</strong> ${game.fen || 'N/A'}
    `;
    
    document.getElementById('modal-overlay').classList.add('active');
    document.getElementById('board-modal').classList.add('active');
}

function closeBoardModal() {
    document.getElementById('modal-overlay').classList.remove('active');
    document.getElementById('board-modal').classList.remove('active');
}

window.showBoardModal = showBoardModal;
window.closeBoardModal = closeBoardModal;

// ========== PARALLEL TRAINING ==========
async function startParallelTraining() {
    if (trainingState.isRunning) return;
    
    trainingState.isRunning = true;
    trainingState.startTime = Date.now();
    trainingData.started = trainingData.started || new Date().toISOString();
    
    document.getElementById('btn-start').disabled = true;
    document.getElementById('btn-stop').disabled = false;
    
    log(`🚀 Starting ${CONFIG.totalGames} parallel games`, 'win');
    
    // Create worker pool
    for (let i = 0; i < CONFIG.maxWorkers; i++) {
        const worker = await createWorkerWithEngine();
        worker.id = i;
        worker.busy = false;
        worker.onmessage = (e) => handleWorkerMessage(worker, e.data);
        workers.push(worker);
    }
    
    // Queue all games
    for (let i = 0; i < CONFIG.totalGames; i++) {
        gameQueue.push({ id: i });
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
            
            // Initialize game state
            activeGames.set(game.id, {
                id: game.id,
                moveCount: 0,
                currentPlayer: 'white',
                gameOver: false,
                evaluation: 0
            });
            
            worker.postMessage({ type: 'start', gameId: game.id });
            log(`Game ${game.id + 1}: Started`, 'info');
        }
    });
    
    updateUI();
}

function handleWorkerMessage(worker, data) {
    if (data.type === 'progress') {
        // Update game state
        activeGames.set(data.gameId, {
            id: data.gameId,
            moveCount: data.moveCount,
            currentPlayer: data.currentPlayer,
            gameOver: false,
            evaluation: data.evaluation,
            lastMove: data.lastMove,
            board: data.board,
            fen: data.fen
        });
        
        if (data.moveCount % 20 === 0) {
            log(`Game ${data.gameId + 1}: Move ${data.moveCount}`, 'info');
        }
        
        updateUI();
        
    } else if (data.type === 'complete') {
        worker.busy = false;
        
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
            winner: result.winner,
            reason: result.reason,
            moveCount: data.moveCount
        };
        
        trainingData.games.push(gameData);
        
        // Update active game as completed
        activeGames.set(data.gameId, {
            id: data.gameId,
            moveCount: data.moveCount,
            gameOver: true,
            winner: result.winner,
            reason: result.reason,
            evaluation: data.evaluation,
            board: data.board,
            fen: data.fen
        });
        
        // Learn openings
        if (data.moves && data.moves.length >= 4) {
            const openingKey = data.moves.slice(0, 6).join(' ');
            if (!trainingData.openings[openingKey]) {
                trainingData.openings[openingKey] = { white: 0, black: 0, draw: 0, total: 0 };
            }
            trainingData.openings[openingKey].total++;
            if (result.winner === 'white') trainingData.openings[openingKey].white++;
            else if (result.winner === 'black') trainingData.openings[openingKey].black++;
            else trainingData.openings[openingKey].draw++;
        }
        
        log(`Game ${data.gameId + 1}: ${result.winner} wins in ${data.moveCount} moves (${trainingState.gamesCompleted}/${CONFIG.totalGames})`, 
            result.winner === 'white' ? 'win' : (result.winner === 'black' ? 'loss' : 'draw'));
        
        updateUI();
        
        // Assign next game
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
    log(`🎉 TRAINING COMPLETE! ${CONFIG.totalGames} games finished`, 'win');
    log(`🎉 ${trainingState.whiteWins}W - ${trainingState.draws}D - ${trainingState.blackWins}L`, 'win');
    log('🎉 ========================================', 'win');
    
    workers.forEach(w => w.terminate());
    workers = [];
    
    updateUI();
}

function stopTraining() {
    trainingState.isRunning = false;
    log('Training stopped by user', 'warning');
    
    workers.forEach(w => {
        w.postMessage({ type: 'stop' });
        w.terminate();
    });
    workers = [];
    
    document.getElementById('btn-start').disabled = false;
    document.getElementById('btn-stop').disabled = true;
}

function resetTraining() {
    if (!confirm('Reset all training data?')) return;
    
    if (trainingState.isRunning) stopTraining();
    
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
    
    activeGames.clear();
    gameQueue = [];
    
    updateUI();
    document.getElementById('log').innerHTML = '<div class="log-line">[System] Training data reset.</div>';
    log('Training data reset', 'info');
}

// ========== STORAGE ==========
function saveToLocalStorage() {
    try {
        localStorage.setItem('chess_parallel_training', JSON.stringify({
            state: trainingState,
            data: trainingData,
            version: TRAINER_VERSION
        }));
    } catch (e) {}
}

function loadFromLocalStorage() {
    try {
        const saved = localStorage.getItem('chess_parallel_training');
        if (saved) {
            const data = JSON.parse(saved);
            trainingState = data.state;
            trainingData = data.data;
            updateUI();
            log(`Loaded ${trainingState.gamesCompleted} games from storage`, 'info');
        }
    } catch (e) {}
}

// ========== EXPORT FUNCTIONS ==========
function exportOpenings() {
    downloadJSON({ version: TRAINER_VERSION, openings: trainingData.openings }, 
        `openings-${trainingState.gamesCompleted}.json`);
    log(`Exported openings`, 'win');
}

function exportEvaluations() {
    let csv = 'gameId,moveNumber,fen,evaluation,player\n';
    trainingData.evaluations.forEach(e => {
        csv += `${e.gameId},${e.moveNumber},"${e.fen}",${e.evaluation},${e.player}\n`;
    });
    downloadFile(csv, `evaluations-${trainingState.gamesCompleted}.csv`, 'text/csv');
    log(`Exported evaluations`, 'win');
}

function exportGames() {
    let pgn = '';
    trainingData.games.forEach((game, i) => {
        pgn += `[Event "Game ${i+1}"]\n[Result "${game.winner}"]\n\n`;
        if (game.moves) {
            for (let j = 0; j < game.moves.length; j++) {
                if (j % 2 === 0) pgn += `${Math.floor(j/2)+1}. `;
                pgn += game.moves[j] + ' ';
                if (j % 2 === 1) pgn += '\n';
            }
        }
        pgn += ` ${game.winner}\n\n`;
    });
    downloadFile(pgn, `games-${trainingState.gamesCompleted}.pgn`, 'application/x-chess-pgn');
    log(`Exported games`, 'win');
}

function exportAll() {
    downloadJSON({
        version: TRAINER_VERSION,
        stats: {
            gamesPlayed: trainingState.gamesCompleted,
            whiteWins: trainingState.whiteWins,
            blackWins: trainingState.blackWins,
            draws: trainingState.draws
        },
        openings: trainingData.openings,
        games: trainingData.games
    }, `training-data-${trainingState.gamesCompleted}.json`);
    log(`Exported all data`, 'win');
}

function downloadJSON(data, filename) {
    downloadFile(JSON.stringify(data, null, 2), filename, 'application/json');
}

function downloadFile(content, filename, type) {
    const blob = new Blob([content], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
}

// ========== INITIALIZATION ==========
window.startParallelTraining = startParallelTraining;
window.stopTraining = stopTraining;
window.resetTraining = resetTraining;
window.exportOpenings = exportOpenings;
window.exportEvaluations = exportEvaluations;
window.exportGames = exportGames;
window.exportAll = exportAll;

window.addEventListener('load', () => {
    loadFromLocalStorage();
    updateUI();
    log(`Parallel Trainer v${TRAINER_VERSION} loaded`, 'win');
});
