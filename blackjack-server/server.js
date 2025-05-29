const express = require('express');
const cors = require('cors');
const http = require('http'); 
const { Server } = require("socket.io"); 
const { Card, Deck, Hand } = require('./gameClasses');
// Import refactored socket handlers and game flow handlers
const { handlePlayerRequestNewRound, handlePlayerPlaceBet, handlePlayerGameAction } = require('./socketHandlers');
const { processDealerTurn, finalizeRound, moveToNextPlayerOrDealer, startDealingPhase } = require('./gameFlowHandlers');


const app = express();
const server = http.createServer(app); 
const io = new Server(server, { 
    cors: {
        origin: "*", 
        methods: ["GET", "POST"]
    }
});

const port = process.env.PORT || 3000;

// --- Server State ---
let userBalances = {}; 
let gameTables = {}; 
const DEFAULT_TABLE_ID = 'defaultTable123'; 

function getOrCreateTable(tableId) {
    if (!gameTables[tableId]) {
        console.log(`Creating new table: ${tableId}`);
        gameTables[tableId] = {
            id: tableId, players: {}, deck: new Deck(), dealerHand: new Hand(),
            gameState: 'waitingForPlayers', currentPlayerSocketId: null, maxPlayers: 5,
            messages: [], bets: {}, readyForNewRound: new Set()
        };
    } else if (gameTables[tableId].deck.cards.length < 15 * Math.max(1, Object.keys(gameTables[tableId].players).length)) { 
        console.log(`Reshuffling deck for table ${tableId}`);
        gameTables[tableId].deck = new Deck();
        io.to(tableId).emit('tableMessage', {type: 'system', text: 'Deck is being reshuffled.'});
    }
    return gameTables[tableId];
}

// Middleware
app.use(cors()); 
app.use(express.json());

// --- API Routes ---
app.get('/', (req, res) => res.send('Hello from Blackjack Server!'));
app.post('/api/validate-payment', (req, res) => {
  const { transaction_id, userId, amount } = req.body;
  if (!transaction_id || !userId || typeof amount !== 'number' || amount <= 0) {
    return res.status(400).json({ success: false, message: 'Missing or invalid fields.' });
  }
  const isPaymentValid = true; 
  if (isPaymentValid) {
    userBalances[userId] = (userBalances[userId] || 0) + amount;
    const table = gameTables[DEFAULT_TABLE_ID]; 
    if (table) {
        const playerSocketId = Object.keys(table.players).find(sid => table.players[sid].userId === userId);
        if (playerSocketId && table.players[playerSocketId]) {
            table.players[playerSocketId].balance = userBalances[userId];
            io.to(playerSocketId).emit('balanceUpdate', { newBalance: userBalances[userId] });
        }
    }
    res.json({ success: true, message: 'Payment validated.', newBalance: userBalances[userId], userId });
  } else {
    res.status(400).json({ success: false, message: 'Payment validation failed.' });
  }
});
app.get('/api/get-balance/:userId', (req, res) => {
  const { userId } = req.params;
  if (!userId) return res.status(400).json({ success: false, message: 'User ID required.' });
  res.json({ success: true, userId, balance: userBalances[userId] || 0 });
});


// --- Socket.IO Connection Handler ---
io.on('connection', (socket) => {
    const clientUserId = socket.handshake.query.userId || socket.id; 
    const username = socket.handshake.query.username || `Player_${socket.id.substring(0,5)}`;
    const table = getOrCreateTable(DEFAULT_TABLE_ID);

    socket.join(DEFAULT_TABLE_ID);
    socket.tableId = DEFAULT_TABLE_ID; 
    socket.clientUserId = clientUserId;

    if (Object.keys(table.players).length < table.maxPlayers && !table.players[socket.id]) {
        table.players[socket.id] = {
            id: socket.id, userId: clientUserId, username: username, hand: new Hand(), 
            score: 0, bet: 0, balance: userBalances[clientUserId] || 100, 
            status: 'connected', isReady: false, outcome: null
        };
        if (userBalances[clientUserId] === undefined) {
            userBalances[clientUserId] = table.players[socket.id].balance;
        } else {
            table.players[socket.id].balance = userBalances[clientUserId];
        }
        
        socket.emit('joinedTable', {
            tableId: DEFAULT_TABLE_ID, players: table.players, gameState: table.gameState,
            yourSocketId: socket.id, dealerHand: table.dealerHand.getCardsJSON(), messages: table.messages
        });
        socket.to(DEFAULT_TABLE_ID).emit('playerJoined', table.players[socket.id]);
        table.messages.push({ type: 'system', text: `${username} has joined.` });
        io.to(DEFAULT_TABLE_ID).emit('tableMessage', table.messages[table.messages.length-1]);
    } else if (table.players[socket.id]) {
        console.log(`Player ${username} (${socket.id}) reconnected.`);
        socket.emit('joinedTable', { /* same data as above */ 
            tableId: DEFAULT_TABLE_ID, players: table.players, gameState: table.gameState,
            yourSocketId: socket.id, dealerHand: table.dealerHand.getCardsJSON(), messages: table.messages
        });
    } else {
        socket.emit('tableFull', { tableId: DEFAULT_TABLE_ID, message: `Table is full.` });
        socket.disconnect(true);
    }

    socket.on('playerRequestNewRound', (data) => {
        handlePlayerRequestNewRound(socket, io, gameTables, userBalances, data);
    });

    socket.on('playerPlaceBet', (data) => {
        // Pass startDealingPhase from gameFlowHandlers
        handlePlayerPlaceBet(socket, io, gameTables, userBalances, data, 
            (tableId) => startDealingPhase(tableId, io, gameTables, moveToNextPlayerOrDealer) // Pass moveToNext as callback
        );
    });
    
    socket.on('playerGameAction', (data) => {
        handlePlayerGameAction(socket, io, gameTables, userBalances, data, 
            (tableId) => moveToNextPlayerOrDealer(tableId, io, gameTables, processDealerTurn), // Pass processDealerTurn
            (tableId) => processDealerTurn(tableId, io, gameTables, userBalances, finalizeRound) // Pass finalizeRound
        );
    });

    socket.on('disconnect', () => {
        const table = gameTables[socket.tableId];
        if (table && table.players[socket.id]) {
            const disconnectedPlayer = table.players[socket.id];
            disconnectedPlayer.status = 'disconnected'; // Mark as disconnected
            // delete table.players[socket.id]; // Or just mark status, depends on desired reconnect logic
            table.readyForNewRound.delete(socket.id);
            io.to(socket.tableId).emit('playerLeft', { socketId: socket.id, username: disconnectedPlayer.username, status: 'disconnected' });
            table.messages.push({ type: 'system', text: `${disconnectedPlayer.username} left.`});
            io.to(socket.tableId).emit('tableMessage', table.messages[table.messages.length-1]);
            
            // If the disconnected player was the current player, move to next
            if (socket.id === table.currentPlayerSocketId) {
                moveToNextPlayerOrDealer(socket.tableId, io, gameTables, processDealerTurn);
            }
            // If all connected players are now ready (e.g. one left and others were ready)
            const connectedPlayers = Object.values(table.players).filter(p => p.status !== 'disconnected');
            if (connectedPlayers.length > 0 && table.readyForNewRound.size === connectedPlayers.length && (table.gameState === 'roundOver' || table.gameState === 'waitingForPlayers')) {
                 handlePlayerRequestNewRound(socket, io, gameTables, userBalances, {}); // Simulate a ready check from one of the remaining
            } else if (connectedPlayers.length === 0 && table.gameState !== 'waitingForPlayers') {
                console.log(`Table ${socket.tableId} is empty. Resetting.`);
                gameTables[socket.tableId] = getOrCreateTable(socket.tableId); // Re-initialize
            }
        }
        console.log(`User ${username} (socket: ${socket.id}) disconnected.`);
    });

    socket.on('clientTest', (data) => {
        socket.emit('serverTest', { message: 'Server received your test!', originalData: data });
    });
});

server.listen(port, () => console.log(`Server listening on ${port}`));
