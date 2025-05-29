// blackjack-server/gameFlowHandlers.js
const { Card, Deck, Hand } = require('./gameClasses'); // Assuming gameClasses.js is in the same directory

// Note: gameTables, userBalances, io are passed as arguments from server.js

async function processDealerTurn(tableId, io, gameTables, userBalances) {
    const table = gameTables[tableId];
    if (!table || table.gameState !== 'dealerTurn') {
        console.error(`processDealerTurn called for table ${tableId} not in 'dealerTurn' state. State: ${table?.gameState}`);
        return;
    }

    let dealerRevealMsg = `Dealer's full hand: ${table.dealerHand.getCardsJSON().map(c=>c.value+c.suit).join(', ')}`;
    if (table.dealerHand.cards.length > 1) {
        dealerRevealMsg = `Dealer reveals: ${table.dealerHand.cards[1].toString()}. Full hand: ${table.dealerHand.getCardsJSON().map(c=>c.value+c.suit).join(', ')}`;
    }
    table.messages.push({type: 'system', text: dealerRevealMsg });

    io.to(table.id).emit('dealerHandReveal', { 
        dealerHand: table.dealerHand.getCardsJSON(), 
        dealerScore: table.dealerHand.calculateValue(),
        message: dealerRevealMsg
    });
    
    // Allow clients to see revealed card before hits start
    await new Promise(resolve => setTimeout(resolve, 1000)); 

    while (table.dealerHand.calculateValue() < 17) {
        await new Promise(resolve => setTimeout(resolve, 1500)); 
        const newCard = table.deck.dealCard();
        if (!newCard) {
            console.error("Deck empty during dealer's turn for table:", tableId);
            table.messages.push({type: 'system', text: "Error: Deck empty during dealer's turn."});
            io.to(table.id).emit('tableMessage', table.messages[table.messages.length-1]);
            break; 
        }
        table.dealerHand.addCard(newCard);
        const dealerScore = table.dealerHand.calculateValue();
        table.messages.push({type: 'system', text: `Dealer hits, gets ${newCard.toString()}. New score: ${dealerScore}`});
        io.to(table.id).emit('dealerHitUpdate', { 
            newCard: newCard.toJSON(), 
            dealerHand: table.dealerHand.getCardsJSON(), 
            dealerScore: dealerScore,
            message: table.messages[table.messages.length-1].text
        });
        if (table.dealerHand.isBust()) break;
    }

    const dealerFinalScore = table.dealerHand.calculateValue();
    let dealerEndMessage = "";
    if (table.dealerHand.isBust()) {
        dealerEndMessage = `Dealer busts with ${dealerFinalScore}!`;
    } else {
        dealerEndMessage = `Dealer stands with ${dealerFinalScore}.`;
    }
    table.messages.push({type: 'system', text: dealerEndMessage});
    io.to(table.id).emit('dealerTurnEnd', { 
        dealerHand: table.dealerHand.getCardsJSON(), 
        dealerScore: dealerFinalScore,
        message: dealerEndMessage
    });
    
    finalizeRound(tableId, io, gameTables, userBalances); // Pass dependencies
}

function finalizeRound(tableId, io, gameTables, userBalances) {
    const table = gameTables[tableId];
    if (!table) {
        console.error("finalizeRound: Table not found", tableId);
        return;
    }

    table.gameState = 'roundOver';
    const dealerScore = table.dealerHand.calculateValue();
    const dealerBusted = table.dealerHand.isBust();
    let roundSummaryMessage = "Round Over. Results: ";

    Object.values(table.players).forEach(player => {
        if (player.status === 'disconnected') { // Skip disconnected players
            player.outcome = "Disconnected";
            return;
        }
        const playerUserId = player.userId;
        userBalances[playerUserId] = userBalances[playerUserId] || 0; 

        if (player.status === 'bust') {
            player.outcome = `Bust (${player.score}). Lost ${player.bet}.`;
        } else if (player.status === 'blackjack') { 
            if (dealerScore === 21 && table.dealerHand.cards.length === 2) { 
                player.outcome = `Push! Both Blackjack. Bet ${player.bet} returned.`;
                userBalances[playerUserId] += player.bet;
            } else {
                player.outcome = `Blackjack! Win ${player.bet * 1.5}! (Total: ${player.bet * 2.5})`;
                userBalances[playerUserId] += player.bet * 2.5; 
            }
        } else if (player.status === 'stood') { 
            if (dealerBusted) {
                player.outcome = `Dealer Bust! You Win ${player.bet * 2}!`;
                userBalances[playerUserId] += player.bet * 2;
            } else if (player.score > dealerScore) {
                player.outcome = `You Win (${player.score} vs ${dealerScore})! Win ${player.bet * 2}!`;
                userBalances[playerUserId] += player.bet * 2;
            } else if (dealerScore > player.score) {
                player.outcome = `Dealer Wins (${dealerScore} vs ${player.score}). Lost ${player.bet}.`;
            } else { 
                player.outcome = `Push (${player.score})! Bet ${player.bet} returned.`;
                userBalances[playerUserId] += player.bet;
            }
        } else { 
            player.outcome = "Round ended before play completed."; // E.g. if they were 'betPlaced' but round ended
        }
        player.balance = userBalances[playerUserId]; 
        player.status = 'roundOver'; 
        roundSummaryMessage += `${player.username}: ${player.outcome || 'No outcome'}. `;
    });
    
    table.messages.push({type: 'system', text: roundSummaryMessage});
    const finalMessage = table.messages[table.messages.length-1].text + " Click 'Start New Round' to play again.";
    table.messages.push({type: 'system', text: "Click 'Start New Round' to play again."});


    io.to(table.id).emit('roundOver', {
        players: table.players,
        dealerHand: table.dealerHand.getCardsJSON(),
        dealerScore: dealerScore,
        message: finalMessage,
        roundSummary: roundSummaryMessage, // Deprecated by including in final message
        gameState: table.gameState
    });

    Object.values(table.players).forEach(p => { if(p.status !== 'disconnected') p.isReady = false; }); 
    table.readyForNewRound.clear();
}

function moveToNextPlayerOrDealer(tableId, io, gameTables) {
    const table = gameTables[tableId];
    if (!table) return;

    const connectedPlayerSocketIds = Object.keys(table.players).filter(pid => table.players[pid]?.status !== 'disconnected');
    let playingPlayerSocketIds = connectedPlayerSocketIds.filter(pid => table.players[pid]?.status === 'playing');
    
    // Handle players who got Blackjack - they don't play a turn but are not 'bust' or 'stood' yet.
    // Their turn is effectively skipped.
    playingPlayerSocketIds = playingPlayerSocketIds.filter(pid => table.players[pid]?.status !== 'blackjack');


    let currentPlayerIndex = playingPlayerSocketIds.indexOf(table.currentPlayerSocketId);
    let nextPlayerFound = false;

    for (let i = currentPlayerIndex + 1; i < playingPlayerSocketIds.length; i++) {
        const nextPotentialPlayerId = playingPlayerSocketIds[i];
        // Check again as status might have changed due to Blackjack
        if (table.players[nextPotentialPlayerId]?.status === 'playing') {
            table.currentPlayerSocketId = nextPotentialPlayerId;
            nextPlayerFound = true;
            break;
        }
    }
    
    if (nextPlayerFound) {
        const nextP = table.players[table.currentPlayerSocketId];
        const msg = `Next turn: ${nextP.username}.`;
        table.messages.push({ type: 'system', text: msg });
        io.to(table.id).emit('nextPlayerTurn', { currentPlayerSocketId: table.currentPlayerSocketId, message: msg });
    } else { 
        table.currentPlayerSocketId = null; 
        table.gameState = 'dealerTurn';
        const msg = "All players done. Dealer's turn.";
        table.messages.push({ type: 'system', text: msg });
        io.to(table.id).emit('startDealerTurn', { 
            gameState: table.gameState, 
            dealerHand: [table.dealerHand.cards[0].toJSON()], 
            dealerScore: table.dealerHand.cards[0].rank, 
            message: msg
        });
        // processDealerTurn is now async, so we don't await it here to avoid blocking socket handler
        processDealerTurn(tableId, io, gameTables, userBalances); 
    }
}

function startDealingPhase(tableId, io, gameTables) {
    const table = gameTables[tableId];
    if (!table || table.gameState !== 'betting') {
        console.error(`startDealingPhase: Table ${tableId} not in 'betting' state.`);
        return;
    }
    table.gameState = 'dealing';
    io.to(table.id).emit('gameStateUpdate', { gameState: table.gameState, message: "Dealing cards..." });

    Object.values(table.players).forEach(player => {
        if (player.status === 'betPlaced') { // Only deal to players who bet
            player.hand.addCard(table.deck.dealCard()); 
            player.hand.addCard(table.deck.dealCard());
            player.score = player.hand.calculateValue();
            if (player.score === 21) { 
                player.status = 'blackjack'; 
                table.messages.push({type: 'system', text: `${player.username} has Blackjack!`});
            } else {
                player.status = 'playing';
            }
        } else if (player.status !== 'disconnected') { // If player didn't bet, mark them as waiting out the round
            player.status = 'waitingForNextRound';
        }
    });
    table.dealerHand.addCard(table.deck.dealCard()); 
    table.dealerHand.addCard(table.deck.dealCard());
    table.currentPlayerSocketId = null; 
    table.gameState = 'playerTurns';
    
    // Check if any players are actually playing. If all had BJ or didn't bet.
    const playersActuallyPlaying = Object.values(table.players).filter(p => p.status === 'playing').length;

    io.to(table.id).emit('cardsDealt', {
        players: table.players, 
        dealerHand: [table.dealerHand.cards[0].toJSON()], 
        dealerScore: table.dealerHand.cards[0].rank, 
        currentPlayerSocketId: null, 
        gameState: table.gameState, 
        message: "Cards dealt. Determining first player..."
    });
    
    if (playersActuallyPlaying > 0) {
        moveToNextPlayerOrDealer(tableId, io, gameTables);
    } else { // No one to play (e.g. all BJ, or all didn't bet) -> go to dealer's turn / finalize
        console.log("No players in 'playing' state after deal. Moving to dealer/finalize.");
        moveToNextPlayerOrDealer(tableId, io, gameTables); // This will correctly go to dealer if no one is 'playing'
    }
}

module.exports = {
    processDealerTurn,
    finalizeRound,
    moveToNextPlayerOrDealer,
    startDealingPhase
};
