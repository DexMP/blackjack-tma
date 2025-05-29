// blackjack-mini-app/js/ui.js

const dealerHandDiv = document.getElementById('dealer-hand');
const dealerScoreDiv = document.getElementById('dealer-score');
const playerHandDiv = document.getElementById('player-hand'); 
const playerScoreDiv = document.getElementById('player-score'); 
const gameMessagesDiv = document.getElementById('game-messages');

const hitButton = document.getElementById('btn-hit');
const standButton = document.getElementById('btn-stand');
const placeBetButton = document.getElementById('btn-place-bet');
const newRoundButton = document.getElementById('btn-new-round'); 

const betAmountInput = document.getElementById('bet-amount');

const playerBalanceSpan = document.getElementById('player-balance');
const topupAmountInput = document.getElementById('topup-amount');
const topupButton = document.getElementById('btn-topup');

const otherPlayersContainer = document.getElementById('other-players-container');
const tableIdDisplay = document.getElementById('table-id-display');
const playerUsernameDisplay = document.getElementById('player-username-display');

const SUIT_CHARACTERS = { 'Hearts': '♥', 'Diamonds': '♦', 'Clubs': '♣', 'Spades': '♠' };

function renderCard(cardInstance, handDiv, isDealerHidden = false, isSmall = false) {
    const cardDiv = document.createElement('div');
    cardDiv.classList.add('card');
    if (isSmall) cardDiv.classList.add('small-card');

    if (isDealerHidden) {
        cardDiv.textContent = 'Hidden'; 
        cardDiv.classList.add('hidden-card'); 
    } else {
        const valueSpan = document.createElement('span');
        valueSpan.classList.add('value');
        valueSpan.textContent = cardInstance.value;
        const suitSpan = document.createElement('span');
        suitSpan.classList.add('suit');
        suitSpan.textContent = SUIT_CHARACTERS[cardInstance.suit] || cardInstance.suit;
        if (cardInstance.suit === 'Hearts' || cardInstance.suit === 'Diamonds') cardDiv.classList.add('red-card');
        else cardDiv.classList.add('black-card');
        cardDiv.appendChild(valueSpan);
        cardDiv.appendChild(suitSpan);
    }
    handDiv.appendChild(cardDiv);
}

function renderPlayerOrDealerHand(handInstance, handDiv, isDealer = false, hideFirstCard = false, isSmall = false) {
    handDiv.innerHTML = ''; 
    const cards = handInstance.getCards();
    for (let i = 0; i < cards.length; i++) {
        const card = cards[i];
        const actuallyHideThisCard = isDealer && hideFirstCard && i === 0;
        renderCard(card, handDiv, actuallyHideThisCard, isSmall);
    }
}

function displayMessage(message) {
    if(gameMessagesDiv) gameMessagesDiv.textContent = message;
}

function updateMultiplayerButtonStates(gameState, currentTurnSocketId, mySocketId, amIReadyForNewRound, myPlayerTableStatus) {
    const isMyTurnNow = currentTurnSocketId === mySocketId && myPlayerTableStatus === 'playing';
    const canBetNow = gameState === 'betting' && myPlayerTableStatus === 'betting';
    
    if (hitButton) hitButton.disabled = !isMyTurnNow;
    if (standButton) standButton.disabled = !isMyTurnNow;
    
    if (placeBetButton) placeBetButton.disabled = !canBetNow;
    if (betAmountInput) betAmountInput.disabled = !canBetNow;

    if (newRoundButton) {
        const showNewRoundButton = (gameState === 'roundOver' && !amIReadyForNewRound) || 
                                   (gameState === 'waitingForPlayers' && !amIReadyForNewRound);
        newRoundButton.style.display = showNewRoundButton ? 'inline-block' : 'none';
        newRoundButton.disabled = amIReadyForNewRound; 
    } else { console.warn("newRoundButton not found in UI for state update."); }

    if (gameState === 'dealerTurn' || gameState === 'roundOver' || gameState === 'dealing') { 
        if (hitButton) hitButton.disabled = true;
        if (standButton) standButton.disabled = true;
        if (placeBetButton) placeBetButton.disabled = true; // Also disable betting buttons
        if (betAmountInput) betAmountInput.disabled = true;
    }
    if (topupButton) topupButton.disabled = false; 
}

function updatePlayerBalance(balance) {
    if (playerBalanceSpan) playerBalanceSpan.textContent = balance;
}

function updateSelfUsername(username) {
    if(playerUsernameDisplay) playerUsernameDisplay.textContent = username || "You";
}

function updateTableId(tableId){
    if(tableIdDisplay) tableIdDisplay.textContent = tableId || "N/A";
}

function renderPlayers(playersData, mySocketId, currentPlayerSocketId) { // Added currentPlayerSocketId
    if (!otherPlayersContainer) return;
    // No full clear here, addPlayerToUI will handle updates or creation
    for (const socketId in playersData) {
        if (socketId === mySocketId) continue; 
        addPlayerToUI(playersData[socketId], false, socketId === currentPlayerSocketId);
    }
}

function addPlayerToUI(playerData, isSelf = false, isCurrentTurn = false) {
    const container = isSelf ? playerHandDiv.parentElement : otherPlayersContainer;
    if (!container && !isSelf) return; 

    let playerBoxIdSuffix = playerData.id; 
    let playerBox;

    if (isSelf) { 
        playerBox = playerHandDiv.parentElement; 
        const myClientHand = new Hand(playerData.hand?.cards || []);
        renderPlayerOrDealerHand(myClientHand, playerHandDiv, false, false, false);
        if(playerScoreDiv) playerScoreDiv.textContent = `Score: ${playerData.score || 0}`;
        if(playerUsernameDisplay) playerUsernameDisplay.textContent = playerData.username || "You";
        // Display outcome for self near their hand/score area
        let outcomeEl = document.getElementById('self-player-outcome');
        if (!outcomeEl && playerBox) {
            outcomeEl = document.createElement('p');
            outcomeEl.id = 'self-player-outcome';
            outcomeEl.className = 'player-outcome';
            // Insert after player-score div
            const scoreDisplay = document.getElementById('player-score');
            if(scoreDisplay && scoreDisplay.parentNode === playerBox) {
                 scoreDisplay.parentNode.insertBefore(outcomeEl, scoreDisplay.nextSibling);
            } else {
                 playerBox.appendChild(outcomeEl); // Fallback append
            }
        }
        if(outcomeEl) {
            outcomeEl.textContent = playerData.outcome || '';
            outcomeEl.className = 'player-outcome ' + (playerData.outcome?.includes('Win') ? 'win' : playerData.outcome?.includes('Lost') || playerData.outcome?.includes('Bust') ? 'loss' : playerData.outcome?.includes('Push') ? 'push' : '');
        }


    } else { 
        playerBox = document.getElementById(`player-${playerBoxIdSuffix}`);
        if (!playerBox) {
            playerBox = document.createElement('div');
            playerBox.id = `player-${playerBoxIdSuffix}`;
            playerBox.classList.add('player-box');
            
            playerBox.innerHTML = `
                <h4 id="player-name-${playerBoxIdSuffix}"></h4>
                <p id="player-status-${playerBoxIdSuffix}"></p>
                <p id="player-balance-display-${playerBoxIdSuffix}"></p>
                <p>Bet: <span id="player-bet-${playerBoxIdSuffix}">0</span></p>
                <p class="ready-status" id="player-ready-${playerBoxIdSuffix}" style="display:none; color: green; font-weight: bold;">Ready!</p>
                <div class="hand-display" id="player-hand-${playerBoxIdSuffix}"></div>
                <p>Score: <span id="player-other-score-${playerBoxIdSuffix}">0</span></p> 
                <p class="player-outcome" id="player-outcome-${playerBoxIdSuffix}"></p>
            `;
            if(otherPlayersContainer) otherPlayersContainer.appendChild(playerBox);
        }
    }
    
    // Update common details
    const nameEl = isSelf ? null : document.getElementById(`player-name-${playerBoxIdSuffix}`);
    const statusEl = isSelf ? null : document.getElementById(`player-status-${playerBoxIdSuffix}`);
    const balanceEl = isSelf ? null : document.getElementById(`player-balance-display-${playerBoxIdSuffix}`);
    const betEl = isSelf ? null : document.getElementById(`player-bet-${playerBoxIdSuffix}`);
    const readyEl = isSelf ? null : document.getElementById(`player-ready-${playerBoxIdSuffix}`);
    const handDisplayEl = isSelf ? playerHandDiv : document.getElementById(`player-hand-${playerBoxIdSuffix}`); // For self, use main playerHandDiv
    const otherScoreEl = isSelf ? playerScoreDiv : document.getElementById(`player-other-score-${playerBoxIdSuffix}`); // For self, use main playerScoreDiv
    const outcomeDisplayEl = isSelf ? document.getElementById('self-player-outcome') : document.getElementById(`player-outcome-${playerBoxIdSuffix}`);


    if(nameEl) nameEl.textContent = playerData.username || 'Player';
    if(statusEl) {
        statusEl.textContent = `Status: ${playerData.status || 'N/A'}`;
        if (playerData.status === 'bust') statusEl.innerHTML = `Status: <strong style="color:red;">BUST</strong>`;
        if (playerData.status === 'stood') statusEl.innerHTML = `Status: <strong style="color:blue;">STOOD</strong>`;
        if (playerData.status === 'blackjack') statusEl.innerHTML = `Status: <strong style="color:gold;">BLACKJACK!</strong>`;
    }
    if(balanceEl) balanceEl.textContent = `Bal: ${playerData.balance !== undefined ? playerData.balance : 'N/A'}`;
    if(betEl) betEl.textContent = playerData.bet || 0;
    
    if(readyEl) readyEl.style.display = playerData.isReady ? 'block' : 'none';

    if (handDisplayEl) {
        const handToRender = new Hand(playerData.hand?.cards || []);
        renderPlayerOrDealerHand(handToRender, handDisplayEl, false, false, !isSelf); // isSmall = !isSelf
        if(otherScoreEl) otherScoreEl.textContent = (isSelf ? `Score: ${playerData.score || 0}` : playerData.score || 0);
    }

    if(outcomeDisplayEl) {
        outcomeDisplayEl.textContent = playerData.outcome || '';
        // Basic outcome styling
        outcomeDisplayEl.className = 'player-outcome ' + (playerData.outcome?.includes('Win') ? 'win' : playerData.outcome?.includes('Lost') || playerData.outcome?.includes('Bust') ? 'loss' : playerData.outcome?.includes('Push') ? 'push' : '');
    }


    // Highlight current turn
    if (!isSelf && playerBox) {
        if (isCurrentTurn) playerBox.classList.add('current-turn-highlight');
        else playerBox.classList.remove('current-turn-highlight');
    } else if (isSelf && playerBox) { // For self main area
         if (isCurrentTurn) playerBox.classList.add('current-turn-highlight');
         else playerBox.classList.remove('current-turn-highlight');
    }
}

function removePlayerFromUI(socketId) {
    const playerBox = document.getElementById(`player-${socketId}`);
    if (playerBox) playerBox.remove();
}

function updatePlayerReadyStatusUI(socketId, username, isReady) {
    const selfPlayer = blackjack.myPlayerData; 

    if (socketId === selfPlayer?.socketId) { 
        if (newRoundButton) {
            newRoundButton.textContent = isReady ? "Waiting..." : "Start New Round";
            newRoundButton.disabled = isReady;
        }
        if(selfPlayer) selfPlayer.isReady = isReady;
        return;
    }
    
    let playerBox = document.getElementById(`player-${socketId}`);
    if (!playerBox && otherPlayersContainer && username) { 
        addPlayerToUI({id: socketId, username: username, isReady: isReady, hand: {cards:[]}, bet:0, balance: 'N/A', status:'connected'}, false, false);
        playerBox = document.getElementById(`player-${socketId}`); // try to get it again
    }
    
    const readyStatusEl = document.getElementById(`player-ready-${socketId}`);
    if (readyStatusEl) {
        readyStatusEl.style.display = isReady ? 'block' : 'none';
    } else if (playerBox && isReady) { 
        const newReadyStatusEl = document.createElement('p');
        newReadyStatusEl.id = `player-ready-${socketId}`;
        newReadyStatusEl.className = 'ready-status';
        newReadyStatusEl.style.color = 'green'; newReadyStatusEl.style.fontWeight = 'bold';
        newReadyStatusEl.textContent = 'Ready!';
        playerBox.appendChild(newReadyStatusEl);
    }
}

function highlightCurrentPlayer(currentPlayerSocketId, mySocketId) { 
    for (const socketId in localPlayersData) { // localPlayersData from app.js scope
        if (socketId === mySocketId) continue; // Skip self for otherPlayersContainer
        const playerBox = document.getElementById(`player-${socketId}`);
        if (playerBox) { 
            if (socketId === currentPlayerSocketId) playerBox.classList.add('current-turn-highlight');
            else playerBox.classList.remove('current-turn-highlight');
        }
    }
    const mainPlayerArea = document.getElementById('player-area');
    if (mainPlayerArea) {
        if (currentPlayerSocketId === mySocketId) mainPlayerArea.classList.add('current-turn-highlight');
        else mainPlayerArea.classList.remove('current-turn-highlight');
    }
}

// Ensure CSS has .current-turn-highlight { border: 2px solid yellow; /* or similar */ }
// And .player-outcome.win { color: green; } .player-outcome.loss { color: red; } .player-outcome.push { color: blue; }
