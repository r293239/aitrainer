// trainer.js - Sequential Self-Play Trainer (No Workers, Fully Compatible)

const TRAINER_VERSION = "1.0.0";

// ========== CONFIGURATION ==========
const CONFIG = {
    totalGames: 100,
    moveDelay: 50, // ms between moves
    gameDelay: 200 // ms between games
};

// ========== TRAINING STATE ==========
let trainingState = {
    isRunning: false,
    gamesCompleted: 0,
    whiteWins: 0,
    blackWins: 0,
    draws: 0,
    startTime: null,
    currentGame: null
};

// ========== DATA STORAGE ==========
let trainingData = {
    games: [],
    openings: {},
    version: TRAINER_VERSION,
    started: null
};

// Current game being played
let currentGameEngine = null;
let currentGameMoves = [];
let currentGameId = 0;
let gameInterval = null;

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
    
    const activeCount = trainingState.isRunning ? 1 : 0;
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
    
    updateGamesGrid();
}

function updateGamesGrid() {
    const grid = document.getElementById('games-grid');
    grid.innerHTML = '';
    
    // Show current game if running
    if (currentGameEngine && trainingState.isRunning) {
        const card = document.createElement('div');
        card.className = 'game-card active';
        
        const board = currentGameEngine.board;
        const moveCount = currentGameEngine.moveCount;
        const currentPlayer = currentGameEngine.currentPlayer;
        
        let evalScore = 0;
        if (typeof currentGameEngine.evaluatePositionForSearch === 'function') {
            evalScore = currentGameEngine.evaluatePositionForSearch(
                currentGameEngine.board, 
                currentGameEngine.currentPlayer, 
                currentGameEngine.moveCount
            );
        }
        
        card.innerHTML = `
            <div class="game-header">
                <span><strong>Game ${currentGameId + 1} (LIVE)</strong></span>
                <span>Move ${moveCount}</span>
            </div>
            <div>Status: ${currentPlayer} to move</div>
            <div>Eval: ${evalScore ? (evalScore > 0 ? '+' : '') + evalScore.toFixed(0) : 'N/A'}</div>
            <div style="margin: 5px 0;">
                <button class="view-board" onclick="showCurrentBoard()">👁 View Board</button>
            </div>
            <div>Last: ${currentGameMoves.slice(-1)[0] || 'N/A'}</div>
        `;
        
        grid.appendChild(card);
    }
    
    // Show completed games (last 3)
    trainingData.games.slice(-3).reverse().forEach(game => {
        const card = document.createElement('div');
        card.className = 'game-card completed';
        
        card.innerHTML = `
            <div class="game-header">
                <span><strong>Game ${game.id + 1}</strong></span>
                <span>${game.moveCount} moves</span>
            </div>
            <div>Winner: ${game.winner}</div>
            <div>${game.reason}</div>
        `;
        
        grid.appendChild(card);
    });
}

function showCurrentBoard() {
    if (!currentGameEngine) return;
    
    document.getElementById('modal-title').textContent = `Game ${currentGameId + 1} (LIVE)`;
    document.getElementById('modal-status').textContent = 
        `${currentGameEngine.currentPlayer} to move - Move ${currentGameEngine.moveCount}`;
    
    const board = currentGameEngine.board;
    let boardStr = '  a b c d e f g h\n';
    for (let row = 0; row < 8; row++) {
        boardStr += (8 - row) + ' ';
        for (let col = 0; col < 8; col++) {
            const piece = board[row]?.[col] || '.';
            boardStr += piece + ' ';
        }
        boardStr += '\n';
    }
    document.getElementById('modal-board').textContent = boardStr;
    
    let evalScore = 0;
    if (typeof currentGameEngine.evaluatePositionForSearch === 'function') {
        evalScore = currentGameEngine.evaluatePositionForSearch(
            currentGameEngine.board, 
            currentGameEngine.currentPlayer, 
            currentGameEngine.moveCount
        );
    }
    
    document.getElementById('modal-eval').innerHTML = `
        <strong>Evaluation:</strong> ${evalScore ? (evalScore > 0 ? '+' : '') + evalScore.toFixed(0) : 'N/A'}<br>
        <strong>FEN:</strong> ${typeof currentGameEngine.getFEN === 'function' ? currentGameEngine.getFEN() : 'N/A'}<br>
        <strong>Moves:</strong> ${currentGameMoves.join(' ') || 'N/A'}
    `;
    
    document.getElementById('modal-overlay').classList.add('active');
    document.getElementById('board-modal').classList.add('active');
}

window.showCurrentBoard = showCurrentBoard;
window.closeBoardModal = function() {
    document.getElementById('modal-overlay').classList.remove('active');
    document.getElementById('board-modal').classList.remove('active');
};

// ========== GAME ENGINE SETUP ==========
function createGameEngine() {
    // Save current global state
    const savedBoard = window.board ? JSON.parse(JSON.stringify(window.board)) : null;
    const savedPlayer = window.currentPlayer;
    const savedMoveCount = window.moveCount;
    const savedGameOver = window.gameOver;
    const savedMoveHistory = window.moveHistory ? [...window.moveHistory] : [];
    const savedCastling = window.castlingRights ? {...window.castlingRights} : null;
    
    // Create new game
    if (typeof window.newGame === 'function') {
        window.newGame();
    }
    
    // Return interface
    return {
        get board() { return window.board; },
        get currentPlayer() { return window.currentPlayer; },
        get moveCount() { return window.moveCount; },
        get gameOver() { return window.gameOver; },
        set gameOver(v) { window.gameOver = v; },
        
        findBestMove: () => window.findBestMove ? window.findBestMove() : null,
        makeMove: (fr, fc, tr, tc) => window.makeMove ? window.makeMove(fr, fc, tr, tc) : null,
        switchPlayer: () => window.switchPlayer ? window.switchPlayer() : null,
        isCheckmate: () => window.isCheckmate ? window.isCheckmate() : false,
        isStalemate: () => window.isStalemate ? window.isStalemate() : false,
        isDraw: () => window.isDraw ? window.isDraw() : false,
        getFEN: () => window.getFEN ? window.getFEN() : '',
        evaluatePositionForSearch: (b, p, m) => window.evaluatePositionForSearch ? 
            window.evaluatePositionForSearch(b, p, m) : 0,
        
        restore: () => {
            if (savedBoard) {
                window.board = savedBoard;
                window.currentPlayer = savedPlayer;
                window.moveCount = savedMoveCount;
                window.gameOver = savedGameOver;
                window.moveHistory = savedMoveHistory;
                if (savedCastling) window.castlingRights = savedCastling;
            }
        }
    };
}

function toAlgebraic(move) {
    const files = ['a','b','c','d','e','f','g','h'];
    const ranks = ['8','7','6','5','4','3','2','1'];
    return files[move.fromCol] + ranks[move.fromRow] + files[move.toCol] + ranks[move.toRow];
}

// ========== PLAY ONE GAME ==========
function playNextMove() {
    if (!trainingState.isRunning) {
        return;
    }
    
    if (currentGameEngine.gameOver) {
        finishCurrentGame();
        return;
    }
    
    // Get AI move
    const move = currentGameEngine.findBestMove();
    
    if (!move) {
        currentGameEngine.gameOver = true;
        finishCurrentGame();
        return;
    }
    
    const moveStr = toAlgebraic(move);
    currentGameMoves.push(moveStr);
    
    // Make move
    currentGameEngine.makeMove(move.fromRow, move.fromCol, move.toRow, move.toCol);
    currentGameEngine.switchPlayer();
    
    // Update UI
    updateUI();
    
    // Check for game over
    if (currentGameEngine.isCheckmate() || currentGameEngine.isStalemate() || 
        currentGameEngine.isDraw() || currentGameMoves.length >= 300) {
        currentGameEngine.gameOver = true;
        finishCurrentGame();
        return;
    }
    
    // Schedule next move
    gameInterval = setTimeout(playNextMove, CONFIG.moveDelay);
}

function finishCurrentGame() {
    clearTimeout(gameInterval);
    
    let winner = 'draw';
    let reason = 'move limit';
    
    if (currentGameEngine.isCheckmate()) {
        winner = currentGameEngine.currentPlayer === 'white' ? 'black' : 'white';
        reason = 'checkmate';
    } else if (currentGameEngine.isStalemate()) {
        reason = 'stalemate';
    } else if (currentGameEngine.isDraw()) {
        reason = 'draw';
    }
    
    // Update stats
    trainingState.gamesCompleted++;
    if (winner === 'white') trainingState.whiteWins++;
    else if (winner === 'black') trainingState.blackWins++;
    else trainingState.draws++;
    
    // Store game
    const gameData = {
        id: currentGameId,
        moves: currentGameMoves,
        winner: winner,
        reason: reason,
        moveCount: currentGameMoves.length
    };
    trainingData.games.push(gameData);
    
    // Learn openings
    if (currentGameMoves.length >= 4) {
        const openingKey = currentGameMoves.slice(0, 6).join(' ');
        if (!trainingData.openings[openingKey]) {
            trainingData.openings[openingKey] = { white: 0, black: 0, draw: 0, total: 0 };
        }
        trainingData.openings[openingKey].total++;
        if (winner === 'white') trainingData.openings[openingKey].white++;
        else if (winner === 'black') trainingData.openings[openingKey].black++;
        else trainingData.openings[openingKey].draw++;
    }
    
    log(`Game ${currentGameId + 1}: ${winner} in ${currentGameMoves.length} moves (${trainingState.gamesCompleted}/${CONFIG.totalGames})`,
        winner === 'white' ? 'win' : (winner === 'black' ? 'loss' : 'draw'));
    
    // Restore original engine state
    currentGameEngine.restore();
    currentGameEngine = null;
    currentGameMoves = [];
    
    updateUI();
    
    // Save every 10 games
    if (trainingState.gamesCompleted % 10 === 0) {
        saveToLocalStorage();
        log(`💾 Progress saved: ${trainingState.gamesCompleted} games`, 'info');
    }
    
    // Start next game or finish
    if (trainingState.gamesCompleted < CONFIG.totalGames && trainingState.isRunning) {
        currentGameId++;
        setTimeout(startNextGame, CONFIG.gameDelay);
    } else {
        finishTraining();
    }
}

function startNextGame() {
    currentGameEngine = createGameEngine();
    currentGameMoves = [];
    
    log(`Game ${currentGameId + 1}: Started`, 'info');
    updateUI();
    
    // Start playing
    gameInterval = setTimeout(playNextMove, CONFIG.moveDelay);
}

// ========== TRAINING CONTROL ==========
async function startParallelTraining() {
    if (trainingState.isRunning) return;
    
    trainingState.isRunning = true;
    trainingState.startTime = Date.now();
    trainingData.started = trainingData.started || new Date().toISOString();
    currentGameId = trainingState.gamesCompleted;
    
    document.getElementById('btn-start').disabled = true;
    document.getElementById('btn-stop').disabled = false;
    
    log(`🚀 Starting ${CONFIG.totalGames} games sequentially`, 'win');
    
    startNextGame();
    
    // Update timer
    const timerInterval = setInterval(() => {
        if (!trainingState.isRunning) {
            clearInterval(timerInterval);
        }
        updateUI();
    }, 1000);
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
    
    updateUI();
}

function stopTraining() {
    trainingState.isRunning = false;
    clearTimeout(gameInterval);
    
    if (currentGameEngine) {
        currentGameEngine.restore();
        currentGameEngine = null;
    }
    
    log('Training stopped', 'warning');
    
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
        version: TRAINER_VERSION,
        started: new Date().toISOString()
    };
    
    currentGameId = 0;
    currentGameMoves = [];
    
    updateUI();
    document.getElementById('log').innerHTML = '<div class="log-line">[System] Training data reset.</div>';
    log('Training data reset', 'info');
}

// ========== STORAGE ==========
function saveToLocalStorage() {
    try {
        localStorage.setItem('chess_trainer_data', JSON.stringify({
            state: trainingState,
            data: trainingData,
            version: TRAINER_VERSION
        }));
    } catch (e) {}
}

function loadFromLocalStorage() {
    try {
        const saved = localStorage.getItem('chess_trainer_data');
        if (saved) {
            const data = JSON.parse(saved);
            trainingState = data.state;
            trainingData = data.data;
            currentGameId = trainingState.gamesCompleted;
            updateUI();
            log(`Loaded ${trainingState.gamesCompleted} games from storage`, 'info');
        }
    } catch (e) {}
}

// ========== EXPORT ==========
function exportOpenings() {
    downloadJSON({ version: TRAINER_VERSION, openings: trainingData.openings }, 
        `openings-${trainingState.gamesCompleted}.json`);
    log(`Exported openings`, 'win');
}

function exportEvaluations() {
    downloadJSON(trainingData.games, `evaluations-${trainingState.gamesCompleted}.json`);
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
    log(`Sequential Trainer v${TRAINER_VERSION} loaded`, 'win');
    log(`Ready to play ${CONFIG.totalGames} games`, 'info');
});
