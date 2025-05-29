// blackjack-server/socketHandlers.js
const { Card, Deck, Hand } = require('./gameClasses'); 
// Import game flow handlers
const { moveToNextPlayerOrDealer, startDealingPhase } = require('./gameFlowHandlers');

function handlePlayerRequestNewRound(socket, io, gameTables, userBalances, data) {
    const table = gameTables[socket.tableId];
    if (!table || !table.players[socket.id]) {
        return socket.emit('actionError', { message: 'Error: Table or player not found.' });
    }
    const player = table.players[socket.id];
    player.outcome = null; 
    player.isReady = true;

    if (table.gameState === 'roundOver' || table.gameState === 'waitingForPlayers') {
        table.readyForNewRound.add(socket.id);
        io.to(table.id).emit('playerReadyStatus', { socketId: socket.id, username: player.username, isReady: true });
        
        const connectedPlayers = Object.values(table.players).filter(p => p.status !== 'disconnected');
        const playersInTableCount = connectedPlayers.length;

        if (playersInTableCount > 0 && table.readyForNewRound.size >= playersInTableCount) {
            console.log(`All ${table.readyForNewRound.size} players ready. Starting betting phase for table ${table.id}`);
            table.deck = new Deck(); 
            table.dealerHand.clear();
            table.bets = {};
            connectedPlayers.forEach(p => {
                p.hand.clear(); p.score = 0; p.status = 'betting'; p.bet = 0; p.isReady = false; p.outcome = null;
            });
            table.gameState = 'betting';
            table.readyForNewRound.clear();
            table.messages = [{ type: 'system', text: "New round! Place your bets." }];
            
            io.to(table.id).emit('startBettingPhase', { 
                gameState: table.gameState, message: "Place your bets.", players: table.players,
                dealerHand: table.dealerHand.getCardsJSON() 
            });
            connectedPlayers.forEach(p => {
                io.to(table.id).emit('playerReadyStatus', { socketId: p.id, username: p.username, isReady: false });
            });
        }
    } else {
        socket.emit('actionError', { message: `Cannot request new round during ${table.gameState}.` });
    }
}

function handlePlayerPlaceBet(socket, io, gameTables, userBalances, data) {
    const { amount } = data;
    const table = gameTables[socket.tableId];
    const player = table ? table.players[socket.id] : null;
    
    if (!table || !player) return socket.emit('betError', { message: "Table or player not found." });
    const playerUserId = player.userId;

    if (table.gameState !== 'betting' || player.status !== 'betting') {
        return socket.emit('betError', { message: "Not in betting phase or already bet." });
    }
    if (typeof amount !== 'number' || amount <= 0 || (userBalances[playerUserId] || 0) < amount) {
        return socket.emit('betError', { message: "Invalid bet amount or insufficient balance." });
    }

    player.bet = amount; 
    player.status = 'betPlaced';
    userBalances[playerUserId] -= amount;
    table.bets[socket.id] = amount;

    io.to(socket.tableId).emit('playerBetPlaced', { 
        socketId: socket.id, userId: playerUserId, username: player.username, 
        betAmount: amount, status: player.status 
    });
    socket.emit('balanceUpdate', { newBalance: userBalances[playerUserId] });

    const connectedPlayers = Object.values(table.players).filter(p => p.status !== 'disconnected');
    const playersExpectedToBet = connectedPlayers.filter(p => p.status === 'betting' || p.status === 'betPlaced');
    const playersWhoBet = connectedPlayers.filter(p => p.status === 'betPlaced');
    
    if (playersExpectedToBet.length > 0 && playersWhoBet.length === playersExpectedToBet.length) {
        console.log(`All ${playersWhoBet.length} active players have bet on table ${table.id}. Proceeding to dealing.`);
        startDealingPhase(table.id, io, gameTables); // Call imported startDealingPhase
    }
}

function handlePlayerGameAction(socket, io, gameTables, userBalances, data) {
    const { action } = data; 
    const table = gameTables[socket.tableId];

    if (!table) return socket.emit('actionError', { message: "Table not found." });
    if (table.gameState !== 'playerTurns') return socket.emit('actionError', { message: "Not in player turn phase." });
    if (socket.id !== table.currentPlayerSocketId) return socket.emit('actionError', { message: "Not your turn." });
    
    const player = table.players[socket.id];
    if (!player) return socket.emit('actionError', { message: "Player not found in table."});
    if (player.status !== 'playing') return socket.emit('actionError', { message: `Your status is ${player.status}, cannot perform action.`});

    if (action === 'hit') {
        const newCard = table.deck.dealCard();
        if (!newCard) {
            io.to(table.id).emit('tableMessage', {type: 'error', text: "Deck empty! Admin needs to reshuffle."});
            return socket.emit('actionError', {message: "Deck empty!"});
        }
        player.hand.addCard(newCard); 
        player.score = player.hand.calculateValue();
        
        let messageText = `${player.username} hits, gets ${newCard.toString()}. New score: ${player.score}.`;

        if (player.hand.isBust()) {
            player.status = 'bust'; 
            messageText += ` ${player.username} busts!`;
            table.messages.push({ type: 'game', text: messageText });
            io.to(table.id).emit('playerActionUpdate', { 
                socketId: socket.id, action: 'bust', hand: player.hand.getCardsJSON(), 
                score: player.score, status: player.status, message: messageText 
            });
            moveToNextPlayerOrDealer(table.id, io, gameTables); // Pass dependencies
        } else {
            table.messages.push({ type: 'game', text: messageText });
            io.to(table.id).emit('playerActionUpdate', { 
                socketId: socket.id, action: 'hit', hand: player.hand.getCardsJSON(), 
                score: player.score, newCard: newCard.toJSON(), message: messageText,
                isPlayerTurn: true 
            });
        }
    } else if (action === 'stand') {
        player.status = 'stood';
        const messageText = `${player.username} stands with ${player.score}.`;
        table.messages.push({ type: 'game', text: messageText });
        io.to(table.id).emit('playerActionUpdate', { 
            socketId: socket.id, action: 'stand', score: player.score, 
            status: player.status, message: messageText 
        });
        moveToNextPlayerOrDealer(table.id, io, gameTables); // Pass dependencies
    } else {
        socket.emit('actionError', { message: "Invalid action string." });
    }
}


module.exports = {
    handlePlayerRequestNewRound,
    handlePlayerPlaceBet,
    handlePlayerGameAction
};
