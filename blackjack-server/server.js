const express = require('express');
const cors = require('cors');
const http = require('http'); 
const { Server } = require("socket.io"); 

const app = express();
const server = http.createServer(app); 
const io = new Server(server, { 
    cors: {
        origin: "*", 
        methods: ["GET", "POST"]
    }
});

const port = process.env.PORT || 3000;

// --- Blackjack Game Classes ---
class Card {
  constructor(suit, value) {
    this.suit = suit;
    this.value = value;
    this.rank = this._getRank(value);
  }
  _getRank(value) {
    if (['J', 'Q', 'K'].includes(value)) return 10;
    if (value === 'A') return 11;
    return parseInt(value);
  }
  toString() { return `${this.value} of ${this.suit}`; }
  toJSON() { return { suit: this.suit, value: this.value, rank: this.rank }; }
}

class Deck {
  constructor() {
    this.cards = [];
    this._initializeDeck();
  }
  _initializeDeck() {
    const suits = ['Hearts', 'Diamonds', 'Clubs', 'Spades'];
    const values = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    this.cards = [];
    for (const suit of suits) {
      for (const value of values) {
        this.cards.push(new Card(suit, value));
      }
    }
    this.shuffle(); 
  }
  shuffle() {
    for (let i = this.cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
    }
  }
  dealCard() {
    return this.cards.length > 0 ? this.cards.pop() : null;
  }
}

class Hand {
  constructor() {
    this.cards = [];
    this.value = 0;
  }
  addCard(card) {
    if (card) {
      this.cards.push(card);
      this.calculateValue();
    }
  }
  getCardsJSON() { 
    return this.cards.map(card => card.toJSON());
  }
  calculateValue() {
    let currentValue = 0;
    let aceCount = 0;
    for (const card of this.cards) {
      currentValue += card.rank;
      if (card.value === 'A') aceCount++;
    }
    while (currentValue > 21 && aceCount > 0) {
      currentValue -= 10;
      aceCount--;
    }
    this.value = currentValue;
    return this.value;
  }
  isBust() {
    return this.calculateValue() > 21;
  }
  clear() {
    this.cards = [];
    this.value = 0;
  }
}

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
    } else if (gameTables[tableId].deck.cards.length < 15 * Object.keys(gameTables[tableId].players).length) { // Reshuffle if deck is low per player
        console.log(`Reshuffling deck for table ${tableId}`);
        gameTables[tableId].deck = new Deck();
        // Optionally notify clients about reshuffle
        io.to(tableId).emit('tableMessage', {type: 'system', text: 'Deck is being reshuffled.'});
    }
    return gameTables[tableId];
}

// Middleware
app.use(cors()); 
app.use(express.json());

// --- API Routes ---
app.get('/', (req, res) => res.send('Hello from Blackjack Server with Socket.IO!'));
app.post('/api/validate-payment', (req, res) => {
  const { transaction_id, userId, amount } = req.body;
  if (!transaction_id || !userId || typeof amount !== 'number' || amount <= 0) {
    return res.status(400).json({ success: false, message: 'Missing or invalid fields.' });
  }
  const isPaymentValid = true; // Placeholder
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

// --- Dealing Function ---
function startDealingPhase(tableId) {
    const table = gameTables[tableId];
    if (!table || table.gameState !== 'betting') {
        console.error(`Attempted to start dealing for table ${tableId} not in 'betting' state.`);
        return;
    }

    console.log(`Starting dealing phase for table ${tableId}`);
    table.gameState = 'dealing';
    io.to(table.id).emit('gameStateUpdate', { gameState: table.gameState, message: "All bets in. Dealing cards..." });

    // Deal cards to players who have placed bets
    Object.values(table.players).forEach(player => {
        if (player.status === 'betPlaced') {
            player.hand.addCard(table.deck.dealCard());
            player.hand.addCard(table.deck.dealCard());
            player.score = player.hand.calculateValue();
            player.status = 'playing'; // Ready for their turn
        }
    });

    // Deal to dealer
    table.dealerHand.addCard(table.deck.dealCard());
    table.dealerHand.addCard(table.deck.dealCard());

    // Determine first player (e.g., first in object, or some defined order)
    // For simplicity, find the first player with status 'playing'
    table.currentPlayerSocketId = Object.keys(table.players).find(pid => table.players[pid].status === 'playing') || null;

    table.gameState = 'playerTurns';
    const firstPlayerUsername = table.players[table.currentPlayerSocketId]?.username || 'First player';
    const dealMessage = `Cards dealt. ${firstPlayerUsername}'s turn.`;
    table.messages.push({type: 'system', text: dealMessage});

    const publicDealerHand = [table.dealerHand.cards[0].toJSON()]; // Only first card visible
    const publicDealerScore = table.dealerHand.cards[0].rank;

    // Handle immediate Blackjacks
    Object.values(table.players).forEach(player => {
        if (player.status === 'playing' && player.score === 21 && player.hand.cards.length === 2) {
            player.status = 'blackjack'; // Mark player as having Blackjack
            // Payout logic will be handled at the end of the round or when player stands on BJ
            table.messages.push({type: 'system', text: `${player.username} has Blackjack!`});
        }
    });
    // If dealer has blackjack, it will be revealed when it's dealer's turn or at showdown.

    io.to(table.id).emit('cardsDealt', {
        players: table.players,
        dealerHand: publicDealerHand,
        dealerScore: publicDealerScore,
        currentPlayerSocketId: table.currentPlayerSocketId,
        gameState: table.gameState,
        message: dealMessage
    });

    // If the first player has Blackjack, their turn might be skipped, or they just stand.
    // For now, client will handle 'stand' if they have BJ.
    // Or, if all players have blackjack or bust, proceed to dealer's turn.
    // This part of logic will be in player action handling.
}


// --- Socket.IO Connection Handler ---
io.on('connection', (socket) => {
    const clientUserId = socket.handshake.query.userId || socket.id; 
    const username = socket.handshake.query.username || `Player_${socket.id.substring(0,5)}`;
    console.log(`User ${username} (socket: ${socket.id}, clientUserId: ${clientUserId}) connected.`);
    const table = getOrCreateTable(DEFAULT_TABLE_ID);
    socket.join(DEFAULT_TABLE_ID);
    socket.tableId = DEFAULT_TABLE_ID; 
    socket.clientUserId = clientUserId;

    if (Object.keys(table.players).length < table.maxPlayers) {
        table.players[socket.id] = {
            id: socket.id, userId: clientUserId, username: username,
            hand: new Hand(), score: 0, bet: 0,
            balance: userBalances[clientUserId] || 100, status: 'connected', isReady: false
        };
        if (userBalances[clientUserId] === undefined) userBalances[clientUserId] = table.players[socket.id].balance;
        else table.players[socket.id].balance = userBalances[clientUserId];

        socket.emit('joinedTable', {
            tableId: DEFAULT_TABLE_ID, players: table.players, gameState: table.gameState,
            yourSocketId: socket.id, dealerHand: table.dealerHand.getCardsJSON(), messages: table.messages
        });
        socket.to(DEFAULT_TABLE_ID).emit('playerJoined', table.players[socket.id]);
        table.messages.push({ type: 'system', text: `${username} has joined.` });
        io.to(DEFAULT_TABLE_ID).emit('tableMessage', table.messages[table.messages.length-1]);
    } else {
        socket.emit('tableFull', { tableId: DEFAULT_TABLE_ID, message: `Table is full.` });
        socket.disconnect(true);
    }

    socket.on('playerRequestNewRound', () => {
        const table = gameTables[socket.tableId];
        if (!table || !table.players[socket.id]) return;
        const player = table.players[socket.id];

        if (table.gameState === 'roundOver' || table.gameState === 'waitingForPlayers') {
            player.isReady = true; // Mark player as ready
            table.readyForNewRound.add(socket.id);
            io.to(table.id).emit('playerReadyStatus', { socketId: socket.id, username: player.username, isReady: true });
            
            const playersInTableCount = Object.keys(table.players).length;
            const canStart = (playersInTableCount > 0 && table.readyForNewRound.size >= playersInTableCount);

            if (canStart) {
                console.log(`All ${table.readyForNewRound.size} players ready. Starting betting phase for table ${table.id}`);
                table.deck = new Deck(); 
                table.dealerHand.clear();
                table.bets = {};
                Object.values(table.players).forEach(p => {
                    p.hand.clear(); p.score = 0; p.status = 'betting'; p.bet = 0; p.isReady = false; // Reset ready status
                });
                table.gameState = 'betting';
                table.readyForNewRound.clear();
                table.messages = [{ type: 'system', text: "New round! Place your bets." }];
                
                io.to(table.id).emit('startBettingPhase', { 
                    gameState: table.gameState, message: "Place your bets.", players: table.players,
                    dealerHand: table.dealerHand.getCardsJSON() 
                });
                Object.keys(table.players).forEach(pid => io.to(table.id).emit('playerReadyStatus', { socketId: pid, username: table.players[pid].username, isReady: false }));
            }
        }
    });

    socket.on('playerPlaceBet', ({ amount }) => {
        const table = gameTables[socket.tableId];
        const player = table ? table.players[socket.id] : null;
        const playerUserId = player ? player.userId : null;

        if (!table || !player || table.gameState !== 'betting' || player.status !== 'betting') {
            return socket.emit('betError', { message: "Not in betting phase or already bet." });
        }
        if (typeof amount !== 'number' || amount <= 0 || userBalances[playerUserId] < amount) {
            return socket.emit('betError', { message: "Invalid bet or insufficient balance." });
        }

        player.bet = amount; player.status = 'betPlaced';
        userBalances[playerUserId] -= amount;
        table.bets[socket.id] = amount;

        io.to(socket.tableId).emit('playerBetPlaced', { 
            socketId: socket.id, userId: playerUserId, username: player.username, 
            betAmount: amount, status: player.status 
        });
        socket.emit('balanceUpdate', { newBalance: userBalances[playerUserId] });

        const activePlayers = Object.values(table.players).filter(p => p.status === 'betting' || p.status === 'betPlaced');
        const playersWhoBet = Object.values(table.players).filter(p => p.status === 'betPlaced');
        
        if (activePlayers.length > 0 && playersWhoBet.length === activePlayers.length) {
            startDealingPhase(table.id);
        }
    });

    socket.on('disconnect', () => {
        const table = gameTables[socket.tableId];
        if (table && table.players[socket.id]) {
            const disconnectedPlayer = table.players[socket.id];
            delete table.players[socket.id];
            table.readyForNewRound.delete(socket.id);
            io.to(socket.tableId).emit('playerLeft', { socketId: socket.id, username: disconnectedPlayer.username });
            table.messages.push({ type: 'system', text: `${disconnectedPlayer.username} left.`});
            io.to(socket.tableId).emit('tableMessage', table.messages[table.messages.length-1]);
            if (Object.keys(table.players).length === 0 && table.gameState !== 'waitingForPlayers') {
                console.log(`Table ${socket.tableId} is empty. Resetting.`);
                // delete gameTables[socket.tableId]; // Or reset to initial state
                getOrCreateTable(socket.tableId); // This re-initializes it
            }
        }
        console.log(`User ${username} (socket: ${socket.id}) disconnected.`);
    });

    socket.on('clientTest', (data) => {
        socket.emit('serverTest', { message: 'Server received your test!', originalData: data });
    });
});

server.listen(port, () => {
  console.log(`Blackjack server with Socket.IO listening at http://localhost:${port}`);
});
