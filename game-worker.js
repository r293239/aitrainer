// game-worker.js - Web Worker for running a single game

let board = [];
let moveHistory = [];
let moveCount = 0;

// Piece values and basic chess logic (simplified for worker)
const PIECE_VALUES = {
    'p': 100, 'n': 320, 'b': 330, 'r': 500, 'q': 900, 'k': 20000,
    'P': 100, 'N': 320, 'B': 330, 'R': 500, 'Q': 900, 'K': 20000
};

function evaluatePosition(boardState, weights) {
    let score = 0;
    
    // Material
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const piece = boardState[r]?.[c];
            if (piece) {
                const val = PIECE_VALUES[piece] || 0;
                score += (piece === piece.toUpperCase()) ? val : -val;
            }
        }
    }
    
    // Apply learned weights
    score = score * weights.material;
    
    return score;
}

function getBestMove(boardState, player, weights, depth, timeLimit) {
    // Simplified minimax with time check
    const startTime = Date.now();
    const moves = getAllMoves(boardState, player);
    
    if (moves.length === 0) return null;
    
    let bestMove = moves[0];
    let bestScore = player === 'white' ? -Infinity : Infinity;
    
    for (const move of moves) {
        if (Date.now() - startTime > timeLimit * 0.8) break;
        
        const newBoard = makeMove(boardState, move);
        const score = minimax(newBoard, depth - 1, -Infinity, Infinity, player === 'white' ? 'black' : 'white', weights);
        
        if (player === 'white' && score > bestScore) {
            bestScore = score;
            bestMove = move;
        } else if (player === 'black' && score < bestScore) {
            bestScore = score;
            bestMove = move;
        }
    }
    
    return bestMove;
}

function minimax(boardState, depth, alpha, beta, player, weights) {
    if (depth === 0) {
        return evaluatePosition(boardState, weights);
    }
    
    const moves = getAllMoves(boardState, player);
    if (moves.length === 0) {
        // Checkmate or stalemate
        return player === 'white' ? -10000 : 10000;
    }
    
    if (player === 'white') {
        let maxEval = -Infinity;
        for (const move of moves) {
            const newBoard = makeMove(boardState, move);
            const evalScore = minimax(newBoard, depth - 1, alpha, beta, 'black', weights);
            maxEval = Math.max(maxEval, evalScore);
            alpha = Math.max(alpha, evalScore);
            if (beta <= alpha) break;
        }
        return maxEval;
    } else {
        let minEval = Infinity;
        for (const move of moves) {
            const newBoard = makeMove(boardState, move);
            const evalScore = minimax(newBoard, depth - 1, alpha, beta, 'white', weights);
            minEval = Math.min(minEval, evalScore);
            beta = Math.min(beta, evalScore);
            if (beta <= alpha) break;
        }
        return minEval;
    }
}

// Simplified move generation (full implementation would be longer)
function getAllMoves(boardState, player) {
    // This is a placeholder - you'd paste the full move generation from chess-game.js
    return [];
}

function makeMove(boardState, move) {
    // Placeholder - implement full move logic
    return boardState;
}

// Worker message handler
self.onmessage = function(e) {
    const { type, whiteGenome, blackGenome, gameId, config } = e.data;
    
    if (type === 'start') {
        // Initialize board
        board = [
            ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'],
            ['p', 'p', 'p', 'p', 'p', 'p', 'p', 'p'],
            ['', '', '', '', '', '', '', ''],
            ['', '', '', '', '', '', '', ''],
            ['', '', '', '', '', '', '', ''],
            ['', '', '', '', '', '', '', ''],
            ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'],
            ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R']
        ];
        
        moveHistory = [];
        moveCount = 0;
        
        // Run game loop
        const gameLoop = setInterval(() => {
            const currentPlayer = moveCount % 2 === 0 ? 'white' : 'black';
            const weights = currentPlayer === 'white' ? whiteGenome : blackGenome;
            
            const move = getBestMove(board, currentPlayer, weights, config.maxDepth, config.timePerMove);
            
            if (!move) {
                // Game over
                clearInterval(gameLoop);
                
                const winner = moveCount % 2 === 0 ? 'black' : 'white';
                self.postMessage({
                    type: 'complete',
                    winner: winner,
                    moves: moveHistory,
                    moveCount: moveCount,
                    opening: moveHistory.slice(0, 6).join(' '),
                    criticalPositions: []
                });
                return;
            }
            
            board = makeMove(board, move);
            moveHistory.push(move);
            moveCount++;
            
            // Send progress update
            self.postMessage({
                type: 'progress',
                gameId: gameId,
                moveCount: moveCount,
                lastMoves: moveHistory.slice(-6).join(' '),
                status: 'RUNNING'
            });
            
            // Check for game end conditions
            if (moveCount > 200) {
                clearInterval(gameLoop);
                self.postMessage({
                    type: 'complete',
                    winner: 'draw',
                    moves: moveHistory,
                    moveCount: moveCount,
                    opening: moveHistory.slice(0, 6).join(' '),
                    criticalPositions: []
                });
            }
        }, config.timePerMove / 10);
    }
};
