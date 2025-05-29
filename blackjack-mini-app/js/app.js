// blackjack-mini-app/js/app.js

const tg = window.Telegram.WebApp;
tg.ready();
tg.expand(); 

const SERVER_URL = 'http://localhost:3000';

let currentTableId = null;
let localPlayersData = {}; 
let myPlayerData = { socketId: null, userId: null, username: null, balance: 100, isReady: false, status: 'connected', outcome: null };
let currentTableState = { 
    gameState: 'initializing', players: {}, dealerHand: {cards:[]}, 
    messages: [], currentPlayerSocketId: null 
};
// blackjack global object from blackjack.js, used for storing playerBalance primarily client-side.
// myPlayerData will be the primary source for self-data after joining table.

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
    console.log('Connected:', myPlayerData);
    ui.displayMessage('Connected! Joining table...');
    socket.emit('clientTest', { message: 'Hello from client!', ...myPlayerData });
});

socket.on('joinedTable', (data) => {
    console.log('Joined table:', data);
    currentTableId = data.tableId;
    localPlayersData = data.players || {}; 
    currentTableState = {...currentTableState, ...data}; 

    if (data.yourSocketId && localPlayersData[data.yourSocketId]) {
         myPlayerData = { ...myPlayerData, ...localPlayersData[data.yourSocketId] }; 
    } else if (data.yourSocketId) {
        myPlayerData.socketId = data.yourSocketId;
         if(localPlayersData[myPlayerData.socketId]) myPlayerData = {...myPlayerData, ...localPlayersData[myPlayerData.socketId]};
    }
    
    blackjack.playerBalance = myPlayerData.balance; 

    ui.updateTableId(currentTableId);
    ui.renderPlayers(localPlayersData, myPlayerData.socketId, data.currentPlayerSocketId); 
    ui.updateSelfUsername(myPlayerData.username); 
    ui.updatePlayerBalance(myPlayerData.balance); 
    ui.displayMessage(`Joined: ${currentTableId}. State: ${data.gameState}`);
    
    const selfData = localPlayersData[myPlayerData.socketId];
    if(selfData) {
        ui.addPlayerToUI(selfData, true, data.currentPlayerSocketId === myPlayerData.socketId); // Render self in main player area
        myPlayerData.status = selfData.status; 
    } else { // Clear self area if no data
        ui.addPlayerToUI({ id: myPlayerData.socketId, username: myPlayerData.username, hand: {cards:[]}, score: 0, status: 'connected', balance: myPlayerData.balance, bet:0, outcome:null }, true, false);
    }
    
    const dealerClientHand = new Hand(data.dealerHand?.cards || []);
    const showHiddenDealer = data.dealerHand?.cards?.length === 1 && data.gameState === 'playerTurns';
    ui.renderPlayerOrDealerHand(dealerClientHand, ui.dealerHandDiv, true, showHiddenDealer, false);
    if (showHiddenDealer && dealerClientHand.cards.length > 0) {
        ui.dealerScoreDiv.textContent = `Score: ${dealerClientHand.cards[0].rank} + ?`;
    } else {
        ui.dealerScoreDiv.textContent = `Score: ${dealerClientHand.calculateValue()}`;
    }
    
    ui.updateMultiplayerButtonStates(data.gameState, data.currentPlayerSocketId, myPlayerData.socketId, myPlayerData.isReady, myPlayerData.status);
    ui.highlightCurrentPlayer(data.currentPlayerSocketId, myPlayerData.socketId);
});

socket.on('playerJoined', (playerData) => {
    console.log('Player joined:', playerData);
    if (playerData.id === myPlayerData.socketId) return; 
    localPlayersData[playerData.id] = playerData;
    currentTableState.players[playerData.id] = playerData; 
    ui.addPlayerToUI(playerData, false, currentTableState.currentPlayerSocketId === playerData.id); 
    ui.displayMessage(`${playerData.username} joined.`);
});

socket.on('playerLeft', (data) => {
    console.log('Player left:', data);
    const leftPlayerUsername = localPlayersData[data.socketId]?.username || data.username || 'A player';
    if (localPlayersData[data.socketId]) delete localPlayersData[data.socketId];
    if (currentTableState.players[data.socketId]) delete currentTableState.players[data.socketId];
    ui.removePlayerFromUI(data.socketId); 
    ui.displayMessage(`${leftPlayerUsername} left.`);
    if(data.socketId === currentTableState.currentPlayerSocketId){ 
        // Server should manage turn advancement; client just updates UI based on next server message
    }
});

socket.on('tableMessage', (messageData) => { ui.displayMessage(`[Table]: ${messageData.text}`); });
socket.on('balanceUpdate', (data) => {
    if (myPlayerData) { 
         myPlayerData.balance = data.newBalance;
         blackjack.playerBalance = data.newBalance; 
         ui.updatePlayerBalance(myPlayerData.balance);
    }
});
socket.on('playerReadyStatus', (data) => { /* ... same ... */ });
socket.on('startBettingPhase', (data) => { /* ... same ... */ });
socket.on('playerBetPlaced', (data) => { /* ... same ... */ });
socket.on('betError', (data) => { /* ... same ... */ });
socket.on('cardsDealt', (data) => { /* ... same ... */ });

// *** UPDATED/NEW Socket Event Handlers for Player Actions & Round End ***
socket.on('playerActionUpdate', (data) => {
    console.log('Player action update:', data);
    currentTableState.message = data.message;
    if (localPlayersData[data.socketId]) {
        localPlayersData[data.socketId].hand = new Hand(data.hand);
        localPlayersData[data.socketId].score = data.score;
        localPlayersData[data.socketId].status = data.status;
        
        if (data.socketId === myPlayerData.socketId) {
            myPlayerData = {...myPlayerData, ...localPlayersData[data.socketId]}; // Update self data
            ui.addPlayerToUI(myPlayerData, true, currentTableState.currentPlayerSocketId === myPlayerData.socketId); // Update main player area
        } else {
            ui.addPlayerToUI(localPlayersData[data.socketId], false, currentTableState.currentPlayerSocketId === data.socketId);
        }
    }
    ui.displayMessage(data.message);
    // Buttons will be re-evaluated by 'nextPlayerTurn' or if action was self and still my turn (e.g. non-busting hit)
    if(data.isPlayerTurn && data.socketId === myPlayerData.socketId && data.status === 'playing'){
         ui.updateMultiplayerButtonStates(currentTableState.gameState, myPlayerData.socketId, myPlayerData.socketId, myPlayerData.isReady, myPlayerData.status);
    }
    // Highlight is managed by nextPlayerTurn or if player busts (no highlight then for them)
    ui.highlightCurrentPlayer(currentTableState.currentPlayerSocketId, myPlayerData.socketId);
});

socket.on('nextPlayerTurn', (data) => {
    console.log('Next player turn:', data);
    currentTableState.currentPlayerSocketId = data.currentPlayerSocketId;
    currentTableState.gameState = 'playerTurns'; 
    ui.displayMessage(data.message);
    
    // Update status of the new current player if it changed server-side
    if(localPlayersData[data.currentPlayerSocketId] && localPlayersData[data.currentPlayerSocketId].status !== 'playing'){
        localPlayersData[data.currentPlayerSocketId].status = 'playing';
        // Potentially re-render this player if status text is important
        ui.addPlayerToUI(localPlayersData[data.currentPlayerSocketId], false, true);
    }
    if (data.currentPlayerSocketId === myPlayerData.socketId) myPlayerData.status = 'playing';

    ui.highlightCurrentPlayer(data.currentPlayerSocketId, myPlayerData.socketId);
    ui.updateMultiplayerButtonStates(currentTableState.gameState, data.currentPlayerSocketId, myPlayerData.socketId, myPlayerData.isReady, myPlayerData.status);
});

socket.on('dealerHandReveal', (data) => { // Before dealer starts hitting
    console.log('Dealer hand reveal:', data);
    currentTableState.dealerHand = new Hand(data.dealerHand);
    currentTableState.dealerScore = data.dealerScore;
    ui.renderPlayerOrDealerHand(currentTableState.dealerHand, ui.dealerHandDiv, true, false, false); // false to show all cards
    ui.dealerScoreDiv.textContent = "Score: " + currentTableState.dealerScore;
    ui.displayMessage(data.message);
});

socket.on('dealerHitUpdate', (data) => {
    console.log('Dealer hit update:', data);
    currentTableState.dealerHand = new Hand(data.dealerHand);
    currentTableState.dealerScore = data.dealerScore;
    ui.renderPlayerOrDealerHand(currentTableState.dealerHand, ui.dealerHandDiv, true, false, false);
    ui.dealerScoreDiv.textContent = "Score: " + currentTableState.dealerScore;
    ui.displayMessage(data.message);
});

socket.on('dealerTurnEnd', (data) => { // Optional, if server sends distinct event before roundOver
    console.log('Dealer turn end:', data);
    ui.displayMessage(data.message);
    // Final results and payouts will come with 'roundOver'
});

socket.on('roundOver', (data) => {
    console.log('Round over:', data);
    currentTableState.gameState = data.gameState; // 'roundOver'
    localPlayersData = data.players; 
    currentTableState.dealerHand = new Hand(data.dealerHand);
    currentTableState.dealerScore = data.dealerScore;
    
    ui.displayMessage(data.message || data.roundSummary || "Round Over. Click 'Start New Round'.");

    // Update all player displays with outcomes and final balances
    ui.renderPlayers(localPlayersData, myPlayerData.socketId, null); // No current player
    // Update self in main area too
    if (localPlayersData[myPlayerData.socketId]) {
        myPlayerData = { ...myPlayerData, ...localPlayersData[myPlayerData.socketId] };
        blackjack.playerBalance = myPlayerData.balance; // Update global balance
        ui.addPlayerToUI(myPlayerData, true, false); // isSelf=true, isCurrentTurn=false
    }
    
    ui.renderPlayerOrDealerHand(currentTableState.dealerHand, ui.dealerHandDiv, true, false, false); // Show dealer's final hand
    ui.dealerScoreDiv.textContent = "Score: " + currentTableState.dealerScore;
    
    myPlayerData.isReady = false; // Reset self ready state for next round UI
    myPlayerData.status = 'roundOver'; // Update self status
    ui.updateMultiplayerButtonStates(currentTableState.gameState, null, myPlayerData.socketId, myPlayerData.isReady, myPlayerData.status);
    ui.highlightCurrentPlayer(null, myPlayerData.socketId); // No player highlighted
});

socket.on('actionError', (data) => { /* ... same as before ... */ });
socket.on('message', (data) => { /* ... same as before ... */ });
socket.on('serverTest', (data) => { /* ... same as before ... */ });
socket.on('disconnect', (reason) => { /* ... same as before ... */ });
socket.on('connect_error', (err) => { /* ... same as before ... */ });

// --- Event Listener Setup ---
function setupEventListeners() { /* ... same ... */ }
// --- Action Handlers ---
function handlePlaceBet() { /* ... same ... */ }
function handlePlayerActionHit() { /* ... same ... */ }
function handlePlayerActionStand() { /* ... same ... */ }
function handleRequestNewRound(){ /* ... same ... */ }
async function handleTopUp() { /* ... same as before ... */ }
// --- Initialization ---
async function initApp() { /* ... same as before ... */ }

document.addEventListener('DOMContentLoaded', initApp);
