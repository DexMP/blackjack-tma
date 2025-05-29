const { processDealerTurn, finalizeRound, moveToNextPlayerOrDealer, startDealingPhase } = require('../gameFlowHandlers');
const { Card, Deck, Hand } = require('../gameClasses');

// Mocks
let mockIo;
let gameTables;
let userBalances;
const DEFAULT_TABLE_ID = 'defaultTable123';

// Helper to create player objects for tests
const createTestPlayer = (id, userId, username, status, bet, cards = [], balance = 100) => {
    const hand = new Hand();
    cards.forEach(c => hand.addCard(new Card(c.suit, c.value)));
    return {
        id, userId, username, status, bet, hand, score: hand.calculateValue(), balance, isReady: false, outcome: null
    };
};

// Helper to setup a basic table with players
const setupTestTable = (playersData = {}) => {
    gameTables[DEFAULT_TABLE_ID] = {
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
    // Populate table.bets from playerData
    for(const playerId in playersData){
        if(playersData[playerId].bet > 0) {
            gameTables[DEFAULT_TABLE_ID].bets[playerId] = playersData[playerId].bet;
        }
    }
    return gameTables[DEFAULT_TABLE_ID];
};


describe('Game Flow Handlers', () => {
    beforeEach(() => {
        gameTables = {};
        userBalances = {};
        const mockEmitFn = jest.fn();
        mockIo = {
            to: jest.fn().mockReturnValue({ emit: mockEmitFn }),
            emit: mockEmitFn,
        };
        // jest.useFakeTimers(); // For controlling setTimeout in processDealerTurn
    });

    // afterEach(() => {
    //     jest.clearAllTimers();
    // });

    describe('startDealingPhase', () => {
        test('should deal cards to players who bet and to dealer, then move to first player', () => {
            const player1 = createTestPlayer('p1', 'u1', 'P1', 'betPlaced', 10);
            const player2 = createTestPlayer('p2', 'u2', 'P2', 'betting', 0); // Did not bet
            const table = setupTestTable({ 'p1': player1, 'p2': player2 });
            table.gameState = 'betting';

            startDealingPhase(DEFAULT_TABLE_ID, mockIo, gameTables, moveToNextPlayerOrDealer);
            
            expect(table.gameState).toBe('playerTurns');
            expect(player1.hand.cards.length).toBe(2);
            expect(player1.status).toMatch(/playing|blackjack/); // Could be blackjack
            expect(player2.hand.cards.length).toBe(0); // Player 2 didn't bet
            expect(player2.status).toBe('waitingForNextRound');
            expect(table.dealerHand.cards.length).toBe(2);
            expect(mockIo.to(DEFAULT_TABLE_ID).emit).toHaveBeenCalledWith('cardsDealt', expect.any(Object));
            expect(mockIo.to(DEFAULT_TABLE_ID).emit).toHaveBeenCalledWith('nextPlayerTurn', expect.objectContaining({ currentPlayerSocketId: 'p1' }));
            expect(table.currentPlayerSocketId).toBe('p1');
        });
         test('should handle all players getting blackjack', () => {
            // Mock deck to deal specific cards leading to blackjack
            const mockDeck = new Deck();
            mockDeck.cards = [
                new Card('Hearts', 'A'), new Card('Spades', 'K'), // P1 BJ
                new Card('Diamonds', 'A'), new Card('Clubs', 'Q'), // P2 BJ
                new Card('Hearts', '10'), new Card('Spades', 'J')  // Dealer no BJ for this test
            ].reverse(); // Deal from end

            const player1 = createTestPlayer('p1', 'u1', 'P1', 'betPlaced', 10);
            const player2 = createTestPlayer('p2', 'u2', 'P2', 'betPlaced', 20);
            const table = setupTestTable({ 'p1': player1, 'p2': player2 });
            table.gameState = 'betting';
            table.deck = mockDeck;

            startDealingPhase(DEFAULT_TABLE_ID, mockIo, gameTables, moveToNextPlayerOrDealer);

            expect(player1.status).toBe('blackjack');
            expect(player2.status).toBe('blackjack');
            expect(table.gameState).toBe('dealerTurn'); // Skips to dealer if all players have resolved (e.g. BJ)
            expect(mockIo.to(DEFAULT_TABLE_ID).emit).toHaveBeenCalledWith('startDealerTurn', expect.any(Object));
        });
    });

    describe('moveToNextPlayerOrDealer', () => {
        test('should move to next playing player', () => {
            const player1 = createTestPlayer('p1', 'u1', 'P1', 'stood', 10);
            const player2 = createTestPlayer('p2', 'u2', 'P2', 'playing', 10);
            const player3 = createTestPlayer('p3', 'u3', 'P3', 'playing', 10);
            const table = setupTestTable({ 'p1': player1, 'p2': player2, 'p3':player3 });
            table.gameState = 'playerTurns';
            table.currentPlayerSocketId = 'p1'; // Simulate p1 just finished

            moveToNextPlayerOrDealer(DEFAULT_TABLE_ID, mockIo, gameTables, processDealerTurn);

            expect(table.currentPlayerSocketId).toBe('p2');
            expect(mockIo.to(DEFAULT_TABLE_ID).emit).toHaveBeenCalledWith('nextPlayerTurn', expect.objectContaining({ currentPlayerSocketId: 'p2' }));
        });

        test('should move to dealer if no more players are playing', () => {
            const player1 = createTestPlayer('p1', 'u1', 'P1', 'stood', 10);
            const player2 = createTestPlayer('p2', 'u2', 'P2', 'bust', 10);
            const table = setupTestTable({ 'p1': player1, 'p2': player2 });
            table.gameState = 'playerTurns';
            table.currentPlayerSocketId = 'p2'; // p2 just busted

            // Mock processDealerTurn because it's async and has timeouts
            const mockProcessDealerTurn = jest.fn();
            moveToNextPlayerOrDealer(DEFAULT_TABLE_ID, mockIo, gameTables, mockProcessDealerTurn);
            
            expect(table.gameState).toBe('dealerTurn');
            expect(table.currentPlayerSocketId).toBeNull();
            expect(mockIo.to(DEFAULT_TABLE_ID).emit).toHaveBeenCalledWith('startDealerTurn', expect.any(Object));
            expect(mockProcessDealerTurn).toHaveBeenCalledWith(DEFAULT_TABLE_ID, mockIo, gameTables, userBalances);
        });
    });

    describe('processDealerTurn', () => {
        // These tests are harder due to async/setTimeout.
        // We can test the logic by making setTimeout resolve immediately or mocking deck.
        // For now, focus on a simple case.
        test('dealer stands on 17', async () => {
            const table = setupTestTable({});
            table.gameState = 'dealerTurn';
            table.dealerHand.addCard(new Card('Hearts', '10'));
            table.dealerHand.addCard(new Card('Diamonds', '7')); // Total 17
            
            // Mock finalizeRound to prevent its full execution
            const mockFinalizeRound = jest.fn();
            
            // Temporarily replace global finalizeRound for this test
            const originalFinalizeRound = global.finalizeRound; 
            global.finalizeRound = mockFinalizeRound;

            await processDealerTurn(DEFAULT_TABLE_ID, mockIo, gameTables, userBalances);
            
            expect(table.dealerHand.calculateValue()).toBe(17);
            expect(mockIo.to(DEFAULT_TABLE_ID).emit).toHaveBeenCalledWith('dealerHandReveal', expect.any(Object));
            expect(mockIo.to(DEFAULT_TABLE_ID).emit).toHaveBeenCalledWith('dealerTurnEnd', expect.objectContaining({ dealerScore: 17 }));
            expect(mockFinalizeRound).toHaveBeenCalledWith(DEFAULT_TABLE_ID, mockIo, gameTables, userBalances);

            global.finalizeRound = originalFinalizeRound; // Restore
        });

         test('dealer hits and busts', async () => {
            const table = setupTestTable({});
            table.gameState = 'dealerTurn';
            // Setup deck for specific cards
            table.deck.cards = [new Card('Clubs', 'King'), new Card('Spades', 'King')].reverse(); // Dealer gets King next
            table.dealerHand.addCard(new Card('Hearts', 'Queen')); // 10
            table.dealerHand.addCard(new Card('Diamonds', '6'));   // 6 (Total 16, will hit)
            
            const mockFinalizeRound = jest.fn();
            const originalFinalizeRound = global.finalizeRound;
            global.finalizeRound = mockFinalizeRound;

            await processDealerTurn(DEFAULT_TABLE_ID, mockIo, gameTables, userBalances);
            
            expect(table.dealerHand.isBust()).toBe(true);
            expect(table.dealerHand.calculateValue()).toBe(26); // 10 + 6 + 10 = 26
            expect(mockIo.to(DEFAULT_TABLE_ID).emit).toHaveBeenCalledWith('dealerHitUpdate', expect.any(Object));
            expect(mockIo.to(DEFAULT_TABLE_ID).emit).toHaveBeenCalledWith('dealerTurnEnd', expect.objectContaining({ dealerScore: 26 }));
            expect(mockFinalizeRound).toHaveBeenCalled();

            global.finalizeRound = originalFinalizeRound;
        });
    });

    describe('finalizeRound', () => {
        test('player wins against dealer', () => {
            userBalances['u1'] = 100;
            const player1 = createTestPlayer('p1', 'u1', 'P1', 'stood', 10, [{suit: 'H', value: 'K'}, {suit: 'D', value: 'Q'}]); // Score 20
            const table = setupTestTable({ 'p1': player1 });
            table.dealerHand.addCard(new Card('Hearts', 'K'));
            table.dealerHand.addCard(new Card('Spades', '9')); // Dealer 19
            table.gameState = 'dealerTurn'; // Assume dealer turn just finished

            finalizeRound(DEFAULT_TABLE_ID, mockIo, gameTables, userBalances);

            expect(player1.outcome).toContain('You Win');
            expect(userBalances['u1']).toBe(100 - 10 + (10 * 2)); // Initial bal - bet + winnings (bet + bet)
            expect(table.gameState).toBe('roundOver');
            expect(mockIo.to(DEFAULT_TABLE_ID).emit).toHaveBeenCalledWith('roundOver', expect.any(Object));
        });

        test('player pushes with dealer', () => {
            userBalances['u1'] = 100;
            const player1 = createTestPlayer('p1', 'u1', 'P1', 'stood', 10, [{suit: 'H', value: 'K'}, {suit: 'D', value: 'Q'}]); // Score 20
            const table = setupTestTable({ 'p1': player1 });
            table.dealerHand.addCard(new Card('Hearts', 'K'));
            table.dealerHand.addCard(new Card('Spades', '10')); // Dealer 20
            
            finalizeRound(DEFAULT_TABLE_ID, mockIo, gameTables, userBalances);

            expect(player1.outcome).toContain('Push');
            expect(userBalances['u1']).toBe(100); // Bet returned
        });

        test('player loses to dealer', () => {
            userBalances['u1'] = 100;
            const player1 = createTestPlayer('p1', 'u1', 'P1', 'stood', 10, [{suit: 'H', value: 'K'}, {suit: 'D', value: '9'}]); // Score 19
            const table = setupTestTable({ 'p1': player1 });
            table.dealerHand.addCard(new Card('Hearts', 'K'));
            table.dealerHand.addCard(new Card('Spades', '10')); // Dealer 20
            
            finalizeRound(DEFAULT_TABLE_ID, mockIo, gameTables, userBalances);

            expect(player1.outcome).toContain('Dealer Wins');
            expect(userBalances['u1']).toBe(100 - 10); // Bet lost
        });

        test('player busts, dealer has valid hand, player loses', () => {
            userBalances['u1'] = 100;
            const player1 = createTestPlayer('p1', 'u1', 'P1', 'bust', 10, [{suit: 'H', value: 'K'}, {suit: 'D', value: 'Q'}, {suit: 'C', value: '5'}]); // Score 25
            const table = setupTestTable({ 'p1': player1 });
            table.dealerHand.addCard(new Card('Hearts', 'K')); // Dealer 10 (doesn't matter much)
            
            finalizeRound(DEFAULT_TABLE_ID, mockIo, gameTables, userBalances);

            expect(player1.outcome).toContain('Bust');
            expect(userBalances['u1']).toBe(100 - 10); // Bet lost
        });
        
        test('dealer busts, player stood with valid hand, player wins', () => {
            userBalances['u1'] = 100;
            const player1 = createTestPlayer('p1', 'u1', 'P1', 'stood', 10, [{suit: 'H', value: 'K'}, {suit: 'D', value: '9'}]); // Score 19
            const table = setupTestTable({ 'p1': player1 });
            table.dealerHand.addCard(new Card('Hearts', 'K'));
            table.dealerHand.addCard(new Card('Spades', 'Q'));
            table.dealerHand.addCard(new Card('Clubs', '5')); // Dealer busts (25)
            
            finalizeRound(DEFAULT_TABLE_ID, mockIo, gameTables, userBalances);
            
            expect(player1.outcome).toContain('Dealer Bust');
            expect(userBalances['u1']).toBe(100 - 10 + (10 * 2));
        });

        test('player has Blackjack, dealer does not, player wins 3:2', () => {
            userBalances['u1'] = 100;
            const player1 = createTestPlayer('p1', 'u1', 'P1', 'blackjack', 10, [{suit: 'H', value: 'A'}, {suit: 'D', value: 'K'}]); // Score 21
            const table = setupTestTable({ 'p1': player1 });
            table.dealerHand.addCard(new Card('Hearts', 'K'));
            table.dealerHand.addCard(new Card('Spades', '9')); // Dealer 19
            
            finalizeRound(DEFAULT_TABLE_ID, mockIo, gameTables, userBalances);
            
            expect(player1.outcome).toContain('Blackjack! Win');
            expect(userBalances['u1']).toBe(100 - 10 + (10 * 2.5)); // Bet (10) + 1.5 * Bet (15) = 25
        });
    });
});

// Note: For processDealerTurn, proper async testing with jest.runAllTimers() or similar
// would be needed if the setTimeout delays were critical to the logic being tested beyond just sequence.
// Here, we assume the core logic after delays is what's important.
// The global.finalizeRound mock is a temporary workaround for this test structure.
// A better approach would be to pass finalizeRound as a dependency to processDealerTurn if possible.
