// trainer.js - Self-Play Trainer using v2.4.1 Engine
// Copy your v2.4.1 chess-game.js into the section marked below

const TRAINER_VERSION = "1.0.0";

// ========== CONFIGURATION ==========
const CONFIG = {
    gamesPerSession: 100,
    timePerMove: 5000, // ms - 5 seconds per move
    maxDepth: 3,
    openingBookMoves: 8 // Use opening book for first N moves
};

// ========== TRAINING STATE ==========
let trainingState = {
    isRunning: false,
    gamesPlayed: 0,
    whiteWins: 0,
    blackWins: 0,
    draws: 0,
    totalMoves: 0,
    bestWinRate: 0
};

// ========== DATA STORAGE ==========
let trainingData = {
    games: [],
    openings: {},
    evaluations: [],
    version: TRAINER_VERSION,
    started: null,
    lastUpdated: null
};

// ========== LOGGING ==========
function log(message, type = '') {
    const logEl = document.getElementById('log');
    const line = document.createElement('div');
    line.className = `log-line ${type}`;
    const time = new Date().toLocaleTimeString();
    line.textContent = `[${time}] ${message}`;
    logEl.appendChild(line);
    logEl.scrollTop = logEl.scrollHeight;
    
    // Keep last 100 lines
    while (logEl.children.length > 100) {
        logEl.removeChild(logEl.firstChild);
    }
}

// ========== UI UPDATES ==========
function updateUI() {
    document.getElementById('games-played').textContent = trainingState.gamesPlayed;
    document.getElementById('white-wins').textContent = trainingState.whiteWins;
    document.getElementById('draws').textContent = trainingState.draws;
    document.getElementById('black-wins').textContent = trainingState.blackWins;
    
    const avgMoves = trainingState.gamesPlayed > 0 
        ? Math.round(trainingState.totalMoves / trainingState.gamesPlayed) 
        : 0;
    document.getElementById('avg-moves').textContent = avgMoves;
    
    const progress = (trainingState.gamesPlayed / CONFIG.gamesPerSession) * 100;
    document.getElementById('progress-fill').style.width = progress + '%';
    document.getElementById('progress-text').textContent = 
        `${trainingState.gamesPlayed}/${CONFIG.gamesPerSession} Games`;
    
    const totalGames = trainingState.whiteWins + trainingState.blackWins + trainingState.draws;
    if (totalGames > 0) {
        const whiteWR = (trainingState.whiteWins / totalGames * 100).toFixed(1);
        const blackWR = (trainingState.blackWins / totalGames * 100).toFixed(1);
        const bestWR = Math.max(whiteWR, blackWR);
        if (bestWR > trainingState.bestWinRate) {
            trainingState.bestWinRate = bestWR;
        }
        document.getElementById('best-winrate').textContent = trainingState.bestWinRate + '%';
    }
}

// ========== GAME RUNNER ==========
async function runOneGame(gameId) {
    return new Promise((resolve) => {
        log(`Game ${gameId + 1}: Starting...`);
        
        // Create isolated game instance
        const game = createGameInstance();
        const moves = [];
        const evaluations = [];
        
        // Play game with timeout protection
        const gameInterval = setInterval(() => {
            if (game.gameOver) {
                clearInterval(gameInterval);
                return;
            }
            
            try {
                const currentPlayer = game.currentPlayer;
                const startTime = Date.now();
                
                // Get AI move
                const move = game.findBestMove();
                
                if (!move) {
                    // No legal moves - game over
                    game.gameOver = true;
                    clearInterval(gameInterval);
                    
                    const result = determineResult(game);
                    recordGameResult(gameId, moves, evaluations, result);
                    resolve(result);
                    return;
                }
                
                const moveTime = Date.now() - startTime;
                
                // Make the move
                const moveStr = toAlgebraic(move);
                game.makeMove(move.fromRow, move.fromCol, move.toRow, move.toCol);
                game.switchPlayer();
                
                moves.push(moveStr);
                
                // Record evaluation (every 5 moves to save memory)
                if (moves.length % 5 === 0) {
                    const evalScore = game.evaluatePositionForSearch(
                        game.board, 
                        game.currentPlayer, 
                        game.moveCount
                    );
                    evaluations.push({
                        moveNumber: moves.length,
                        fen: game.getFEN(),
                        evaluation: evalScore,
                        player: currentPlayer
                    });
                }
                
                // Progress update every 10 moves
                if (moves.length % 10 === 0) {
                    log(`Game ${gameId + 1}: Move ${moves.length}, Eval: ${evaluations[evaluations.length-1]?.evaluation || 'N/A'}`, 'info');
                }
                
                // 200 move draw rule
                if (moves.length >= 200) {
                    game.gameOver = true;
                    clearInterval(gameInterval);
                    
                    const result = { winner: 'draw', reason: '50-move rule' };
                    recordGameResult(gameId, moves, evaluations, result);
                    resolve(result);
                }
                
            } catch (e) {
                clearInterval(gameInterval);
                log(`Game ${gameId + 1}: ERROR - ${e.message}`, 'error');
                resolve({ winner: 'error', reason: e.message });
            }
        }, 10); // Small delay to prevent UI freeze
        
        // Safety timeout (5 minutes per game)
        setTimeout(() => {
            if (!game.gameOver) {
                clearInterval(gameInterval);
                game.gameOver = true;
                log(`Game ${gameId + 1}: Timeout after 5 minutes`, 'warning');
                resolve({ winner: 'timeout', moves: moves });
            }
        }, 300000);
    });
}

function recordGameResult(gameId, moves, evaluations, result) {
    const winner = result.winner || 'draw';
    
    // Update stats
    trainingState.gamesPlayed++;
    trainingState.totalMoves += moves.length;
    
    if (winner === 'white') trainingState.whiteWins++;
    else if (winner === 'black') trainingState.blackWins++;
    else trainingState.draws++;
    
    // Store game data
    const gameData = {
        id: gameId,
        moves: moves,
        evaluations: evaluations,
        winner: winner,
        reason: result.reason,
        moveCount: moves.length,
        timestamp: new Date().toISOString()
    };
    
    trainingData.games.push(gameData);
    
    // Learn from openings
    if (moves.length >= 4) {
        const openingKey = moves.slice(0, 6).join(' ');
        if (!trainingData.openings[openingKey]) {
            trainingData.openings[openingKey] = { white: 0, black: 0, draw: 0, total: 0 };
        }
        trainingData.openings[openingKey].total++;
        if (winner === 'white') trainingData.openings[openingKey].white++;
        else if (winner === 'black') trainingData.openings[openingKey].black++;
        else trainingData.openings[openingKey].draw++;
    }
    
    // Store critical evaluations
    evaluations.forEach(e => {
        trainingData.evaluations.push({
            gameId: gameId,
            ...e
        });
    });
    
    trainingData.lastUpdated = new Date().toISOString();
    
    // Log result
    const resultColor = winner === 'white' ? 'win' : (winner === 'black' ? 'loss' : 'draw');
    log(`Game ${gameId + 1}: Complete - ${winner} wins in ${moves.length} moves`, resultColor);
    
    updateUI();
}

function determineResult(game) {
    if (game.isCheckmate()) {
        const winner = game.currentPlayer === 'white' ? 'black' : 'white';
        return { winner, reason: 'checkmate' };
    } else if (game.isStalemate()) {
        return { winner: 'draw', reason: 'stalemate' };
    } else if (game.isDraw()) {
        return { winner: 'draw', reason: 'draw' };
    }
    return { winner: 'draw', reason: 'unknown' };
}

function toAlgebraic(move) {
    const files = ['a','b','c','d','e','f','g','h'];
    const ranks = ['8','7','6','5','4','3','2','1'];
    return files[move.fromCol] + ranks[move.fromRow] + files[move.toCol] + ranks[move.toRow];
}

// ========== TRAINING CONTROLLER ==========
async function startTraining() {
    if (trainingState.isRunning) return;
    
    trainingState.isRunning = true;
    trainingData.started = trainingData.started || new Date().toISOString();
    
    document.getElementById('btn-start').disabled = true;
    document.getElementById('btn-stop').disabled = false;
    
    log('=== Starting Training Session ===', 'win');
    log(`Target: ${CONFIG.gamesPerSession} games`, 'info');
    
    const startGameId = trainingState.gamesPlayed;
    const endGameId = Math.min(startGameId + CONFIG.gamesPerSession, startGameId + 100);
    
    for (let i = startGameId; i < endGameId && trainingState.isRunning; i++) {
        await runOneGame(i);
        
        // Save progress every 5 games
        if ((i + 1) % 5 === 0) {
            saveToLocalStorage();
            log(`Progress saved: ${i + 1} games completed`, 'info');
        }
        
        // Small delay between games
        await new Promise(r => setTimeout(r, 1000));
    }
    
    trainingState.isRunning = false;
    document.getElementById('btn-start').disabled = false;
    document.getElementById('btn-stop').disabled = true;
    
    saveToLocalStorage();
    log('=== Training Session Complete ===', 'win');
    log(`Final: ${trainingState.whiteWins}W - ${trainingState.draws}D - ${trainingState.blackWins}L`, 'info');
}

function stopTraining() {
    trainingState.isRunning = false;
    log('Training stopped by user', 'warning');
}

function resetTraining() {
    if (!confirm('Reset all training data? This cannot be undone.')) return;
    
    trainingState = {
        isRunning: false,
        gamesPlayed: 0,
        whiteWins: 0,
        blackWins: 0,
        draws: 0,
        totalMoves: 0,
        bestWinRate: 0
    };
    
    trainingData = {
        games: [],
        openings: {},
        evaluations: [],
        version: TRAINER_VERSION,
        started: new Date().toISOString(),
        lastUpdated: null
    };
    
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
        localStorage.setItem('chess_training_data', JSON.stringify(data));
    } catch (e) {
        log('Failed to save to localStorage', 'error');
    }
}

function loadFromLocalStorage() {
    try {
        const saved = localStorage.getItem('chess_training_data');
        if (saved) {
            const data = JSON.parse(saved);
            if (data.version === TRAINER_VERSION) {
                trainingState = data.state;
                trainingData = data.data;
                updateUI();
                log(`Loaded ${trainingState.gamesPlayed} games from storage`, 'info');
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
        totalGames: trainingState.gamesPlayed,
        openings: trainingData.openings
    };
    
    downloadJSON(data, `openings-${trainingState.gamesPlayed}.json`);
    log(`Exported ${Object.keys(trainingData.openings).length} opening lines`, 'win');
}

function exportEvaluations() {
    let csv = 'gameId,moveNumber,fen,evaluation,player\n';
    
    trainingData.evaluations.forEach(e => {
        csv += `${e.gameId},${e.moveNumber},"${e.fen}",${e.evaluation},${e.player}\n`;
    });
    
    downloadFile(csv, `evaluations-${trainingState.gamesPlayed}.csv`, 'text/csv');
    log(`Exported ${trainingData.evaluations.length} position evaluations`, 'win');
}

function exportGames() {
    let pgn = '';
    
    trainingData.games.forEach((game, i) => {
        pgn += `[Event "Self-Play Game ${i + 1}"]\n`;
        pgn += `[Site "Chess AI Trainer v${TRAINER_VERSION}"]\n`;
        pgn += `[Date "${game.timestamp}"]\n`;
        pgn += `[Result "${game.winner === 'white' ? '1-0' : game.winner === 'black' ? '0-1' : '1/2-1/2'}"]\n`;
        pgn += `[Termination "${game.reason}"]\n`;
        pgn += `[PlyCount "${game.moveCount}"]\n\n`;
        
        for (let j = 0; j < game.moves.length; j++) {
            if (j % 2 === 0) pgn += `${Math.floor(j/2)+1}. `;
            pgn += game.moves[j] + ' ';
            if (j % 2 === 1) pgn += '\n';
        }
        pgn += ` ${game.winner === 'white' ? '1-0' : game.winner === 'black' ? '0-1' : '1/2-1/2'}\n\n`;
    });
    
    downloadFile(pgn, `games-${trainingState.gamesPlayed}.pgn`, 'application/x-chess-pgn');
    log(`Exported ${trainingData.games.length} games in PGN format`, 'win');
}

function exportAll() {
    const allData = {
        version: TRAINER_VERSION,
        generated: new Date().toISOString(),
        stats: {
            gamesPlayed: trainingState.gamesPlayed,
            whiteWins: trainingState.whiteWins,
            blackWins: trainingState.blackWins,
            draws: trainingState.draws,
            avgMoves: trainingState.gamesPlayed > 0 
                ? Math.round(trainingState.totalMoves / trainingState.gamesPlayed) 
                : 0
        },
        openings: trainingData.openings,
        games: trainingData.games.map(g => ({
            id: g.id,
            winner: g.winner,
            moveCount: g.moveCount,
            moves: g.moves
        })),
        evaluations: trainingData.evaluations.slice(0, 1000) // Limit size
    };
    
    downloadJSON(allData, `training-data-${trainingState.gamesPlayed}.json`);
    log(`Exported complete training data`, 'win');
}

function downloadJSON(data, filename) {
    const json = JSON.stringify(data, null, 2);
    downloadFile(json, filename, 'application/json');
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

// ========== CHESS ENGINE INTEGRATION ==========
// COPY YOUR ENTIRE v2.4.1 chess-game.js BELOW THIS LINE
// =============================================

function createGameInstance() {
    // This creates a fresh game instance using v2.4.1's logic
    // Since v2.4.1 uses global variables, we need to carefully manage state
    
    // Store current state
    const savedBoard = window.board ? JSON.parse(JSON.stringify(window.board)) : null;
    const savedPlayer = window.currentPlayer;
    const savedHistory = window.moveHistory ? [...window.moveHistory] : [];
    const savedGameOver = window.gameOver;
    
    // Reset for new game (calls the global newGame function)
    if (typeof window.newGame === 'function') {
        window.newGame();
    }
    
    // Return an interface to the current game state
    return {
        get board() { return window.board; },
        get currentPlayer() { return window.currentPlayer; },
        get moveCount() { return window.moveCount; },
        get gameOver() { return window.gameOver; },
        set gameOver(val) { window.gameOver = val; },
        
        findBestMove() {
            return window.findBestMove ? window.findBestMove() : null;
        },
        
        makeMove(fr, fc, tr, tc) {
            if (typeof window.makeMove === 'function') {
                window.makeMove(fr, fc, tr, tc);
            }
        },
        
        switchPlayer() {
            if (typeof window.switchPlayer === 'function') {
                window.switchPlayer();
            }
        },
        
        evaluatePositionForSearch(board, player, moveCount) {
            if (typeof window.evaluatePositionForSearch === 'function') {
                return window.evaluatePositionForSearch(board, player, moveCount);
            }
            return 0;
        },
        
        getFEN() {
            return typeof window.getFEN === 'function' ? window.getFEN() : '';
        },
        
        isCheckmate() {
            return typeof window.isCheckmate === 'function' ? window.isCheckmate() : false;
        },
        
        isStalemate() {
            return typeof window.isStalemate === 'function' ? window.isStalemate() : false;
        },
        
        isDraw() {
            return typeof window.isDraw === 'function' ? window.isDraw() : false;
        },
        
        // Restore previous state when done
        restore() {
            if (savedBoard) {
                window.board = savedBoard;
                window.currentPlayer = savedPlayer;
                window.moveHistory = savedHistory;
                window.gameOver = savedGameOver;
            }
        }
    };
}

// ========== INITIALIZATION ==========
window.addEventListener('load', () => {
    loadFromLocalStorage();
    updateUI();
    log(`Chess AI Self-Play Trainer v${TRAINER_VERSION} loaded`, 'win');
    log(`Ready to train. Click Start to begin ${CONFIG.gamesPerSession} games.`, 'info');
});

// Make functions globally available
window.startTraining = startTraining;
window.stopTraining = stopTraining;
window.resetTraining = resetTraining;
window.exportOpenings = exportOpenings;
window.exportEvaluations = exportEvaluations;
window.exportGames = exportGames;
window.exportAll = exportAll;

console.log('✅ Trainer loaded. Paste v2.4.1 below the marked line in this file.');
