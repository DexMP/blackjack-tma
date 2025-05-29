// blackjack-mini-app/js/app.js

const tg = window.Telegram.WebApp;
tg.ready();
tg.expand(); 

const SERVER_URL = 'http://localhost:3000';

let currentTableId = null;
let localPlayersData = {}; 
let myPlayerData = { socketId: null, userId: null, username: null, balance: 100, isReady: false, status: 'connected' };
let currentTableState = { gameState: 'initializing', players: {}, dealerHand: {cards:[]}, messages: [], currentPlayerSocketId: null };

const tgUser = tg.initDataUnsafe?.user;
const queryData = {};
if (tgUser?.id) {
    queryData.userId = String(tgUser.id); 
    myPlayerData.userId = String(tgUser.id);
}
if (tgUser?.username) {
    queryData.username = tgUser.username;
    myPlayerData.username = tgUser.username;
} else if (tgUser?.first_name) {
    queryData.username = tgUser.first_name;
    myPlayerData.username = tgUser.first_name;
}

const socket = io(SERVER_URL, { query: queryData });

// --- Socket Event Handlers ---
socket.on('connect', () => {
    myPlayerData.socketId = socket.id; 
    if (!myPlayerData.username) myPlayerData.username = `Player_${socket.id.substring(0,5)}`;
    if (!myPlayerData.userId) myPlayerData.userId = socket.id; 
    console.log('Connected to WebSocket server:', myPlayerData);
    ui.displayMessage('Connected! Waiting to join table...');
    socket.emit('clientTest', { message: 'Hello from client!', ...myPlayerData });
});

socket.on('joinedTable', (data) => {
    console.log('Joined table:', data);
    currentTableId = data.tableId;
    localPlayersData = data.players; 
    currentTableState = data; 

    if (data.yourSocketId && localPlayersData[data.yourSocketId]) {
         myPlayerData = { ...myPlayerData, ...localPlayersData[data.yourSocketId] }; 
    } else if (data.yourSocketId) {
        myPlayerData.socketId = data.yourSocketId;
         if(localPlayersData[myPlayerData.socketId]) myPlayerData = {...myPlayerData, ...localPlayersData[myPlayerData.socketId]};
    }
    
    blackjack.playerBalance = myPlayerData.balance; 

    ui.updateTableId(currentTableId);
    ui.renderPlayers(localPlayersData, myPlayerData.socketId); 
    ui.updateSelfUsername(myPlayerData.username); 
    ui.updatePlayerBalance(myPlayerData.balance); 
    ui.displayMessage(`Joined table: ${currentTableId}. State: ${data.gameState}`);
    
    const selfPlayerDataFromServer = localPlayersData[myPlayerData.socketId];
    if(selfPlayerDataFromServer) { // Check if self is in players list from server
        ui.renderPlayerOrDealerHand(new Hand(selfPlayerDataFromServer.hand?.cards || []), ui.playerHandDiv, false, false, false);
        ui.playerScoreDiv.textContent = `Score: ${selfPlayerDataFromServer.score || 0}`;
        myPlayerData.status = selfPlayerDataFromServer.status; // Update own status
    } else {
        ui.renderPlayerOrDealerHand(new Hand(), ui.playerHandDiv, false, false, false);
        ui.playerScoreDiv.textContent = `Score: 0`;
    }
    
    const dealerClientHand = new Hand(data.dealerHand?.cards || []);
    const showHiddenDealer = data.dealerHand?.cards?.length === 1 && data.gameState !== 'roundOver' && data.gameState !== 'waitingForPlayers';
    ui.renderPlayerOrDealerHand(dealerClientHand, ui.dealerHandDiv, true, showHiddenDealer, false);
    if (showHiddenDealer && dealerClientHand.cards.length > 0) {
        ui.dealerScoreDiv.textContent = `Score: ${dealerClientHand.cards[0].rank} + ?`;
    } else {
        ui.dealerScoreDiv.textContent = `Score: ${dealerClientHand.calculateValue()}`;
    }
    
    ui.updateMultiplayerButtonStates(data.gameState, data.currentPlayerSocketId, myPlayerData.socketId, myPlayerData.isReady, myPlayerData.status);
    ui.highlightCurrentPlayer(data.currentPlayerSocketId, localPlayersData, myPlayerData.socketId);
});

socket.on('playerJoined', (playerData) => {
    console.log('Player joined table:', playerData);
    if (playerData.id === myPlayerData.socketId) return; 
    localPlayersData[playerData.id] = playerData;
    currentTableState.players[playerData.id] = playerData; 
    ui.addPlayerToUI(playerData); 
    ui.displayMessage(`${playerData.username} joined the table.`);
});

socket.on('playerLeft', (data) => {
    console.log('Player left table:', data);
    if (localPlayersData[data.socketId]) delete localPlayersData[data.socketId];
    if (currentTableState.players[data.socketId]) delete currentTableState.players[data.socketId];
    ui.removePlayerFromUI(data.socketId); 
    ui.displayMessage(`${data.username} left the table.`);
    if(data.socketId === currentTableState.currentPlayerSocketId){ // If current player left, server should advance turn
        // ui.displayMessage("Current player left. Waiting for next turn...");
    }
});

socket.on('tableFull', (data) => { ui.displayMessage(data.message + " Please try again later."); });
socket.on('tableMessage', (messageData) => { ui.displayMessage(`[Table]: ${messageData.text}`); });
socket.on('balanceUpdate', (data) => {
    if (myPlayerData) { 
         myPlayerData.balance = data.newBalance;
         blackjack.playerBalance = data.newBalance; 
         ui.updatePlayerBalance(myPlayerData.balance);
    }
});

socket.on('playerReadyStatus', (data) => {
    if (localPlayersData[data.socketId]) localPlayersData[data.socketId].isReady = data.isReady;
    if (data.socketId === myPlayerData.socketId) myPlayerData.isReady = data.isReady;
    ui.updatePlayerReadyStatusUI(data.socketId, data.username, data.isReady);
    ui.updateMultiplayerButtonStates(currentTableState.gameState, currentTableState.currentPlayerSocketId, myPlayerData.socketId, myPlayerData.isReady, myPlayerData.status);
});

socket.on('startBettingPhase', (data) => {
    console.log('Betting phase started:', data);
    currentTableState = data; 
    localPlayersData = data.players || {};
    myPlayerData.isReady = false; // Reset ready status for new round
    myPlayerData.status = localPlayersData[myPlayerData.socketId]?.status || 'betting'; // Update self status

    ui.displayMessage(data.message || "Place your bets!");
    ui.renderPlayers(localPlayersData, myPlayerData.socketId); 
    
    const selfData = localPlayersData[myPlayerData.socketId];
    ui.renderPlayerOrDealerHand(new Hand(selfData?.hand?.cards || []), ui.playerHandDiv, false, false, false);
    ui.playerScoreDiv.textContent = `Score: ${selfData?.score || 0}`;
    
    ui.renderPlayerOrDealerHand(new Hand(data.dealerHand?.cards || []), ui.dealerHandDiv, true, false, false);
    ui.dealerScoreDiv.textContent = `Score: 0`;
    
    ui.updateMultiplayerButtonStates(currentTableState.gameState, currentTableState.currentPlayerSocketId, myPlayerData.socketId, myPlayerData.isReady, myPlayerData.status);
    ui.highlightCurrentPlayer(null, localPlayersData, myPlayerData.socketId); // No one's turn during betting
});

socket.on('playerBetPlaced', (data) => {
    console.log('Player bet placed:', data);
    if (localPlayersData[data.socketId]) {
        localPlayersData[data.socketId].bet = data.betAmount;
        localPlayersData[data.socketId].status = data.status;
        if (data.socketId === myPlayerData.socketId) myPlayerData.status = data.status;
    }
    ui.addPlayerToUI(localPlayersData[data.socketId]); 
    ui.updateMultiplayerButtonStates(currentTableState.gameState, currentTableState.currentPlayerSocketId, myPlayerData.socketId, myPlayerData.isReady, myPlayerData.status);
});

socket.on('betError', (data) => {
    ui.displayMessage(data.message);
    const selfPlayer = localPlayersData[myPlayerData.socketId];
    if (currentTableState.gameState === 'betting' && selfPlayer?.status === 'betting') { // check if self was trying to bet
         ui.updateMultiplayerButtonStates(currentTableState.gameState, null, myPlayerData.socketId, myPlayerData.isReady, 'betting'); // Re-enable betting for self
    }
});

socket.on('cardsDealt', (data) => {
    console.log('Cards dealt:', data);
    currentTableState = data; // Update with new game state, players hands, etc.
    localPlayersData = data.players;
    
    // Update self player data from the comprehensive list
    if (localPlayersData[myPlayerData.socketId]) {
        myPlayerData = { ...myPlayerData, ...localPlayersData[myPlayerData.socketId] };
    }

    ui.displayMessage(data.message);

    // Render all players, including self, to show new hands and scores
    ui.renderPlayers(localPlayersData, myPlayerData.socketId); 
    // Update main player's hand and score separately (as it's not in 'otherPlayersContainer')
    const myClientHand = new Hand(myPlayerData.hand?.cards || []);
    ui.renderPlayerOrDealerHand(myClientHand, ui.playerHandDiv, false, false, false);
    ui.playerScoreDiv.textContent = `Score: ${myPlayerData.score || 0}`;

    // Render dealer's hand (with one card hidden)
    const dealerClientHand = new Hand(data.dealerHand || []); // Server sends only visible card(s)
    const showHiddenDealer = data.dealerHand && data.dealerHand.length === 1; // Server controls this by data sent
    ui.renderPlayerOrDealerHand(dealerClientHand, ui.dealerHandDiv, true, showHiddenDealer, false);
    if (showHiddenDealer && dealerClientHand.cards.length > 0) {
        ui.dealerScoreDiv.textContent = `Score: ${data.dealerScore} + ?`; // Use score from server for visible card
    } else { // Should not happen for initial deal typically
        ui.dealerScoreDiv.textContent = `Score: ${data.dealerScore}`;
    }
    
    ui.updateMultiplayerButtonStates(currentTableState.gameState, currentTableState.currentPlayerSocketId, myPlayerData.socketId, myPlayerData.isReady, myPlayerData.status);
    ui.highlightCurrentPlayer(currentTableState.currentPlayerSocketId, localPlayersData, myPlayerData.socketId);
});


socket.on('message', (data) => { console.log('Generic message from server (WebSocket):', data); });
socket.on('serverTest', (data) => { console.log('Received serverTest (WebSocket):', data); });
socket.on('disconnect', (reason) => {
    ui.displayMessage("Disconnected. Please refresh.");
    if (ui.updateMultiplayerButtonStates) ui.updateMultiplayerButtonStates('disconnected', null, myPlayerData.socketId, false, 'disconnected');
});
socket.on('connect_error', (err) => { ui.displayMessage("Connection error."); });

// --- Event Listener Setup ---
function setupEventListeners() {
    if (ui.placeBetButton) ui.placeBetButton.addEventListener('click', handlePlaceBet);
    if (ui.hitButton) ui.hitButton.addEventListener('click', handlePlayerActionHit);
    if (ui.standButton) ui.standButton.addEventListener('click', handlePlayerActionStand);
    if (ui.topupButton) ui.topupButton.addEventListener('click', handleTopUp);
    if (ui.newRoundButton) ui.newRoundButton.addEventListener('click', handleRequestNewRound);
}

// --- Action Handlers ---
function handlePlaceBet() {
    const betAmountStr = ui.betAmountInput.value;
    const betAmount = parseInt(betAmountStr);
    if (isNaN(betAmount) || betAmount <= 0) { ui.displayMessage("Valid bet amount needed."); return; }
    socket.emit('playerPlaceBet', { amount: betAmount }); 
    if(ui.placeBetButton) ui.placeBetButton.disabled = true;
    if(ui.betAmountInput) ui.betAmountInput.disabled = true;
}
function handlePlayerActionHit() { socket.emit('playerGameAction', { action: 'hit', tableId: currentTableId }); }
function handlePlayerActionStand() { socket.emit('playerGameAction', { action: 'stand', tableId: currentTableId }); }
function handleRequestNewRound(){
    socket.emit('playerRequestNewRound', {tableId: currentTableId});
    myPlayerData.isReady = true; 
    ui.updateMultiplayerButtonStates(currentTableState.gameState, currentTableState.currentPlayerSocketId, myPlayerData.socketId, myPlayerData.isReady, myPlayerData.status);
    ui.updatePlayerReadyStatusUI(myPlayerData.socketId, myPlayerData.username, true);
}
async function handleTopUp() { /* ... same as before ... */ 
    const amountStr = ui.topupAmountInput.value;
    const amount = parseInt(amountStr);
    if (isNaN(amount) || amount <= 0) { ui.displayMessage("Invalid top-up amount."); return; }
    ui.displayMessage(`Initiating top-up for ${amount} Stars...`);
    const userIdForTopUp = myPlayerData.userId || socket.id;
    const invoice = { 
        currency: 'XTR', prices: [{ label: 'Blackjack Top-up', amount: amount }], 
        payload: `blackjack_topup_${Date.now()}_${amount}_user_${userIdForTopUp}`
    };
    try {
        tg.showInvoice(invoice, async (status, transaction_id, error_message) => {
            if (status === 'paid') {
                ui.displayMessage(`Payment successful (TG)! Validating...`);
                const response = await fetch(`${SERVER_URL}/api/validate-payment`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ transaction_id, userId: userIdForTopUp, amount, payload: invoice.payload })
                });
                const data = await response.json();
                if (response.ok && data.success) {
                    // balance update should come via socket 'balanceUpdate' event
                    ui.displayMessage(data.message || 'Payment validated! Balance will update.');
                } else { ui.displayMessage(data.message || 'Server validation failed.'); }
            } else { ui.displayMessage(`Payment ${status}: ${error_message || ''}`); }
        });
    } catch (e) { 
        ui.displayMessage("Telegram Payment API error.");
        if (typeof tg.showInvoice !== 'function') { 
            // Simulate for dev
            const currentBalance = blackjack.playerBalance || 0;
            blackjack.playerBalance = currentBalance + amount; 
            myPlayerData.balance = blackjack.playerBalance;
            ui.updatePlayerBalance(myPlayerData.balance);
            ui.displayMessage("Payment simulated (dev).");
        }
    }
}

// --- Initialization ---
async function initApp() {
    console.log("Initializing client app (multiplayer)...");
    if (myPlayerData.userId && myPlayerData.userId !== myPlayerData.socketId) {
        try {
            const response = await fetch(`${SERVER_URL}/api/get-balance/${myPlayerData.userId}`);
            if (response.ok) {
                const data = await response.json();
                if (data.success) blackjack.playerBalance = data.balance;
            } 
        } catch (fetchError) { console.error('Network error fetching balance:', fetchError); }
    }
    myPlayerData.balance = blackjack.playerBalance; 
    
    ui.updatePlayerBalance(myPlayerData.balance); 
    ui.displayMessage("Connecting to table..."); 
    ui.updateMultiplayerButtonStates('initializing', null, myPlayerData.socketId, false, 'initializing');
    setupEventListeners();
}

document.addEventListener('DOMContentLoaded', initApp);
