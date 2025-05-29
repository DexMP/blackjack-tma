const { handlePlayerRequestNewRound, handlePlayerPlaceBet, handlePlayerGameAction } = require('../socketHandlers');
const { Card, Deck, Hand } = require('../gameClasses');
// Mock the gameFlowHandlers for testing socketHandlers in isolation where needed
const mockGameFlow = {
    moveToNextPlayerOrDealer: jest.fn(),
    processDealerTurn: jest.fn(), // Not directly called by socketHandlers being tested here but by moveToNext
    startDealingPhase: jest.fn()
};

// Mocks
let mockIo;
let mockSocket;
let gameTables; 
let userBalances; 
const DEFAULT_TABLE_ID = 'defaultTable123';

const createMockSocket = (id, tableId, userId, username, status = 'connected') => ({
    id: id,
    tableId: tableId,
    clientUserId: userId || id, 
    handshake: { query: { userId: userId, username: username } },
    emit: jest.fn(),
    join: jest.fn(),
    to: jest.fn().mockReturnThis(), 
});

// Helper to setup a basic table with players
const setupTestTableForSocketTests = (playersData = {}) => {
    const table = {
        id: DEFAULT_TABLE_ID,
        players: playersData,
        deck: new Deck(),
        dealerHand: new Hand(),
        gameState: 'waitingForPlayers',
        currentPlayerSocketId: null,
        maxPlayers: 5,
        messages: [],
        bets: {},
        readyForNewRound: new Set()
    };
    gameTables[DEFAULT_TABLE_ID] = table;
    for(const playerId in playersData){
        if(playersData[playerId].bet > 0) {
            table.bets[playerId] = playersData[playerId].bet;
        }
        // Ensure player has a hand instance
        if (!playersData[playerId].hand) {
            playersData[playerId].hand = new Hand();
        }
    }
    return table;
};


describe('Socket Handlers', () => {
    beforeEach(() => {
        gameTables = {};
        userBalances = {};
        
        const mockEmitFn = jest.fn();
        mockIo = {
            to: jest.fn(() => ({ emit: mockEmitFn })),
            emit: mockEmitFn 
        };
        mockGameFlow.moveToNextPlayerOrDealer.mockClear();
        mockGameFlow.startDealingPhase.mockClear();
    });

    describe('handlePlayerRequestNewRound', () => {
        // ... tests from previous step for handlePlayerRequestNewRound ...
        test('player requests new round when waiting, becomes ready', () => {
            mockSocket = createMockSocket('socket1', DEFAULT_TABLE_ID, 'user1', 'UserOne');
            const table = setupTestTableForSocketTests({ [mockSocket.id]: { id: mockSocket.id, userId: 'user1', username: 'UserOne', status: 'connected', isReady: false, outcome: null, hand: new Hand(), score:0, bet:0, balance: 100 }});
            
            handlePlayerRequestNewRound(mockSocket, mockIo, gameTables, userBalances, {});

            expect(table.players[mockSocket.id].isReady).toBe(true);
            expect(mockIo.to(DEFAULT_TABLE_ID).emit).toHaveBeenCalledWith('playerReadyStatus', { socketId: mockSocket.id, username: 'UserOne', isReady: true });
        });
    });

    describe('handlePlayerPlaceBet', () => {
        // ... tests from previous step for handlePlayerPlaceBet ...
        // Ensure startDealingPhaseCb is the mockGameFlow.startDealingPhase
        test('valid bet placed, last player to bet triggers dealing', () => {
            mockSocket = createMockSocket('socket1', DEFAULT_TABLE_ID, 'user1', 'UserOne');
            userBalances['user1'] = 100;
            const table = setupTestTableForSocketTests({ [mockSocket.id]: { id: mockSocket.id, userId: 'user1', username: 'UserOne', status: 'betting', bet: 0, balance: 100, hand: new Hand() }});
            table.gameState = 'betting';
            
            handlePlayerPlaceBet(mockSocket, mockIo, gameTables, userBalances, { amount: 50 }, mockGameFlow.startDealingPhase);

            expect(table.players[mockSocket.id].bet).toBe(50);
            expect(table.players[mockSocket.id].status).toBe('betPlaced');
            expect(userBalances['user1']).toBe(50);
            expect(mockGameFlow.startDealingPhase).toHaveBeenCalledWith(DEFAULT_TABLE_ID, mockIo, gameTables, mockGameFlow.moveToNextPlayerOrDealer); // Check if it's called
        });
    });

    describe('handlePlayerGameAction', () => {
        beforeEach(() => {
            userBalances['user1'] = 100;
            const player1 = { id: 'socket1', userId: 'user1', username: 'P1', status: 'playing', bet: 10, balance: 90, hand: new Hand(), score: 0 };
            player1.hand.addCard(new Card('Hearts', '7')); // 7
            player1.hand.addCard(new Card('Diamonds', '8')); // 8 -> Score 15
            player1.score = player1.hand.calculateValue();

            const table = setupTestTableForSocketTests({ 'socket1': player1 });
            table.gameState = 'playerTurns';
            table.currentPlayerSocketId = 'socket1';
            mockSocket = createMockSocket('socket1', DEFAULT_TABLE_ID, 'user1', 'P1', 'playing');
        });

        test('valid "hit" action, player does not bust', () => {
            const table = gameTables[DEFAULT_TABLE_ID];
            // Ensure deck has a card that won't bust the player
            table.deck.cards.push(new Card('Clubs', '2')); // Player gets a 2 (15 + 2 = 17)

            handlePlayerGameAction(mockSocket, mockIo, gameTables, userBalances, { action: 'hit' }, mockGameFlow.moveToNextPlayerOrDealer, mockGameFlow.processDealerTurn);
            
            const player = table.players['socket1'];
            expect(player.hand.cards.length).toBe(3);
            expect(player.score).toBe(17);
            expect(player.status).toBe('playing');
            expect(mockIo.to(DEFAULT_TABLE_ID).emit).toHaveBeenCalledWith('playerActionUpdate', expect.objectContaining({
                socketId: 'socket1', action: 'hit', score: 17, isPlayerTurn: true
            }));
            expect(mockGameFlow.moveToNextPlayerOrDealer).not.toHaveBeenCalled(); // Turn stays
        });

        test('valid "hit" action, player busts', () => {
            const table = gameTables[DEFAULT_TABLE_ID];
            table.deck.cards.push(new Card('Clubs', 'King')); // Player gets a King (15 + 10 = 25 BUST)
            
            handlePlayerGameAction(mockSocket, mockIo, gameTables, userBalances, { action: 'hit' }, mockGameFlow.moveToNextPlayerOrDealer, mockGameFlow.processDealerTurn);

            const player = table.players['socket1'];
            expect(player.hand.cards.length).toBe(3);
            expect(player.score).toBe(25);
            expect(player.status).toBe('bust');
            expect(mockIo.to(DEFAULT_TABLE_ID).emit).toHaveBeenCalledWith('playerActionUpdate', expect.objectContaining({
                socketId: 'socket1', action: 'bust', score: 25, status: 'bust'
            }));
            expect(mockGameFlow.moveToNextPlayerOrDealer).toHaveBeenCalledWith(DEFAULT_TABLE_ID, mockIo, gameTables, mockGameFlow.processDealerTurn);
        });

        test('valid "stand" action', () => {
            const table = gameTables[DEFAULT_TABLE_ID];
            handlePlayerGameAction(mockSocket, mockIo, gameTables, userBalances, { action: 'stand' }, mockGameFlow.moveToNextPlayerOrDealer, mockGameFlow.processDealerTurn);

            const player = table.players['socket1'];
            expect(player.status).toBe('stood');
            expect(mockIo.to(DEFAULT_TABLE_ID).emit).toHaveBeenCalledWith('playerActionUpdate', expect.objectContaining({
                socketId: 'socket1', action: 'stand', score: 15, status: 'stood'
            }));
            expect(mockGameFlow.moveToNextPlayerOrDealer).toHaveBeenCalledWith(DEFAULT_TABLE_ID, mockIo, gameTables, mockGameFlow.processDealerTurn);
        });

        test('"hit" when not player\'s turn', () => {
            gameTables[DEFAULT_TABLE_ID].currentPlayerSocketId = 'anotherPlayer';
            handlePlayerGameAction(mockSocket, mockIo, gameTables, userBalances, { action: 'hit' }, mockGameFlow.moveToNextPlayerOrDealer, mockGameFlow.processDealerTurn);
            expect(mockSocket.emit).toHaveBeenCalledWith('actionError', { message: "Not your turn." });
        });

        test('"hit" when game state is not playerTurns', () => {
            gameTables[DEFAULT_TABLE_ID].gameState = 'betting';
            handlePlayerGameAction(mockSocket, mockIo, gameTables, userBalances, { action: 'hit' }, mockGameFlow.moveToNextPlayerOrDealer, mockGameFlow.processDealerTurn);
            expect(mockSocket.emit).toHaveBeenCalledWith('actionError', { message: "Not in player turn phase." });
        });
         test('"hit" when player status is not playing', () => {
            gameTables[DEFAULT_TABLE_ID].players['socket1'].status = 'stood';
            handlePlayerGameAction(mockSocket, mockIo, gameTables, userBalances, { action: 'hit' }, mockGameFlow.moveToNextPlayerOrDealer, mockGameFlow.processDealerTurn);
            expect(mockSocket.emit).toHaveBeenCalledWith('actionError', { message: "Your status is stood, cannot perform action."});
        });
    });
});
