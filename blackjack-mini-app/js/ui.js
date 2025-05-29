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

/**
 * Renders a player's hand or the dealer's hand.
 * @param {Hand} handInstance - Client-side Hand object.
 * @param {HTMLElement} handDiv - The DOM element for displaying cards.
 * @param {boolean} isDealer - True if this is the dealer's hand.
 * @param {boolean} hideFirstCard - True to hide dealer's first card.
 * @param {boolean} isSmall - True for smaller cards (other players).
 */
function renderPlayerOrDealerHand(handInstance, handDiv, isDealer = false, hideFirstCard = false, isSmall = false) {
    handDiv.innerHTML = ''; 
    const cards = handInstance.getCards();
    for (let i = 0; i < cards.length; i++) {
        const card = cards[i];
        // For dealer, hideFirstCard applies to the card at index 0.
        // For other players, or self, hideFirstCard is typically false.
        const actuallyHideThisCard = isDealer && hideFirstCard && i === 0;
        renderCard(card, handDiv, actuallyHideThisCard, isSmall);
    }
}


function displayMessage(message) {
    if(gameMessagesDiv) gameMessagesDiv.textContent = message;
}

/**
 * Updates button states based on game phase and player turn.
 * @param {string} gameState - Current game state from server.
 * @param {string|null} currentTurnSocketId - Socket ID of the player whose turn it is.
 * @param {string} mySocketId - Socket ID of the current client.
 * @param {boolean} amIReadyForNewRound - Client's own ready status.
 * @param {string} myPlayerTableStatus - Client's own status at the table ('betting', 'betPlaced', 'playing', etc.)
 */
function updateMultiplayerButtonStates(gameState, currentTurnSocketId, mySocketId, amIReadyForNewRound, myPlayerTableStatus) {
    const isMyTurn = currentTurnSocketId === mySocketId && myPlayerTableStatus === 'playing';
    const canBet = gameState === 'betting' && myPlayerTableStatus === 'betting';
    
    if (hitButton) hitButton.disabled = !isMyTurn;
    if (standButton) standButton.disabled = !isMyTurn;
    
    if (placeBetButton) placeBetButton.disabled = !canBet;
    if (betAmountInput) betAmountInput.disabled = !canBet;

    if (newRoundButton) {
        const showNewRoundButton = (gameState === 'roundOver' && !amIReadyForNewRound) || 
                                   (gameState === 'waitingForPlayers' && !amIReadyForNewRound);
        newRoundButton.style.display = showNewRoundButton ? 'inline-block' : 'none';
        newRoundButton.disabled = amIReadyForNewRound; 
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

function renderPlayers(playersData, mySocketId) {
    if (!otherPlayersContainer) return;
    otherPlayersContainer.innerHTML = ''; 
    for (const socketId in playersData) {
        if (socketId === mySocketId) continue; 
        addPlayerToUI(playersData[socketId]);
    }
}

function addPlayerToUI(playerData) {
    if (!otherPlayersContainer) return;
    let playerBox = document.getElementById(`player-${playerData.id}`); 
    if (!playerBox) {
        playerBox = document.createElement('div');
        playerBox.id = `player-${playerData.id}`;
        playerBox.classList.add('player-box');
        if (playerData.isCurrentTurn) playerBox.classList.add('current-turn'); // For highlighting current player

        playerBox.innerHTML = `
            <h4 id="player-name-${playerData.id}"></h4>
            <p id="player-status-${playerData.id}"></p>
            <p id="player-balance-display-${playerData.id}"></p>
            <p>Bet: <span id="player-bet-${playerData.id}">0</span></p>
            <p class="ready-status" id="player-ready-${playerData.id}" style="display:none; color: green; font-weight: bold;">Ready!</p>
            <div class="hand-display" id="player-hand-${playerData.id}"></div>
            <p>Score: <span id="player-other-score-${playerData.id}">0</span></p> 
        `;
        otherPlayersContainer.appendChild(playerBox);
    } else {
        // Toggle current-turn highlight
         if (playerData.isCurrentTurn) playerBox.classList.add('current-turn');
         else playerBox.classList.remove('current-turn');
    }

    document.getElementById(`player-name-${playerData.id}`).textContent = playerData.username || 'Player';
    document.getElementById(`player-status-${playerData.id}`).textContent = `Status: ${playerData.status || 'N/A'}`;
    document.getElementById(`player-balance-display-${playerData.id}`).textContent = `Bal: ${playerData.balance !== undefined ? playerData.balance : 'N/A'}`;
    document.getElementById(`player-bet-${playerData.id}`).textContent = playerData.bet || 0;
    
    const readyStatusEl = document.getElementById(`player-ready-${playerData.id}`);
    if (playerData.isReady && readyStatusEl) readyStatusEl.style.display = 'block';
    else if(readyStatusEl) readyStatusEl.style.display = 'none';

    const handDiv = document.getElementById(`player-hand-${playerData.id}`);
    const scoreSpan = document.getElementById(`player-other-score-${playerData.id}`);
    if (playerData.hand && handDiv) {
        const otherPlayerHand = new Hand(playerData.hand.cards || []); // Reconstruct Hand for rendering
        renderPlayerOrDealerHand(otherPlayerHand, handDiv, false, false, true); 
        if(scoreSpan) scoreSpan.textContent = playerData.score || 0;
    } else if (handDiv) {
        handDiv.innerHTML = ''; 
        if(scoreSpan) scoreSpan.textContent = 0;
    }
}

function removePlayerFromUI(socketId) {
    const playerBox = document.getElementById(`player-${socketId}`);
    if (playerBox) playerBox.remove();
}

function updatePlayerReadyStatusUI(socketId, username, isReady) {
    let playerBox = document.getElementById(`player-${socketId}`);
    const selfPlayer = blackjack.myPlayerData; // Assuming blackjack.myPlayerData is accessible

    if (socketId === selfPlayer?.socketId) { 
        if (newRoundButton) {
            newRoundButton.textContent = isReady ? "Waiting..." : "Start New Round";
            newRoundButton.disabled = isReady;
        }
        selfPlayer.isReady = isReady; // Update local state
        return;
    }
    
    if (!playerBox && otherPlayersContainer && username) { 
        addPlayerToUI({id: socketId, username: username, isReady: isReady, hand: {cards:[]}, bet:0, balance: 'N/A', status:'connected'});
        playerBox = document.getElementById(`player-${socketId}`);
    }
    
    const readyStatusEl = document.getElementById(`player-ready-${socketId}`);
    if (readyStatusEl) {
        readyStatusEl.style.display = isReady ? 'block' : 'none';
    } else if (playerBox && isReady) { 
        const newReadyStatusEl = document.createElement('p');
        newReadyStatusEl.id = `player-ready-${socketId}`;
        newReadyStatusEl.className = 'ready-status';
        newReadyStatusEl.style.color = 'green';
        newReadyStatusEl.style.fontWeight = 'bold';
        newReadyStatusEl.textContent = 'Ready!';
        playerBox.appendChild(newReadyStatusEl);
    }
}

// Function to highlight the current player
function highlightCurrentPlayer(currentPlayerSocketId, allPlayersData, my SocketId) {
    for (const socketId in allPlayersData) {
        const playerBox = document.getElementById(`player-${socketId}`);
        if (playerBox) { // Only for other players' boxes
            if (socketId === currentPlayerSocketId) {
                playerBox.classList.add('current-turn-highlight');
            } else {
                playerBox.classList.remove('current-turn-highlight');
            }
        }
    }
    // For self, maybe a message or a highlight on their main hand area
    const mainPlayerArea = document.getElementById('player-area');
    if (mainPlayerArea) {
        if (currentPlayerSocketId === my SocketId) {
             mainPlayerArea.classList.add('current-turn-highlight');
        } else {
             mainPlayerArea.classList.remove('current-turn-highlight');
        }
    }
}
