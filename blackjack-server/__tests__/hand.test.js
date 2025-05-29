const { Hand, Card } = require('../gameClasses');

describe('Hand', () => {
    let hand;

    beforeEach(() => {
        hand = new Hand();
    });

    test('should be created empty', () => {
        expect(hand.cards.length).toBe(0);
        expect(hand.value).toBe(0);
    });

    test('addCard() should add a card to the hand', () => {
        const card = new Card('Hearts', '7');
        hand.addCard(card);
        expect(hand.cards.length).toBe(1);
        expect(hand.cards[0]).toBe(card);
    });

    describe('calculateValue()', () => {
        test('should calculate value for simple hands', () => {
            hand.addCard(new Card('Hearts', '5'));
            hand.addCard(new Card('Diamonds', 'K'));
            expect(hand.calculateValue()).toBe(15);
        });

        test('should calculate value with one Ace as 11', () => {
            hand.addCard(new Card('Clubs', 'A'));
            hand.addCard(new Card('Spades', '5'));
            expect(hand.calculateValue()).toBe(16); // A (11) + 5 = 16
        });

        test('should calculate value with one Ace and face card as 21', () => {
            hand.addCard(new Card('Hearts', 'A'));
            hand.addCard(new Card('Diamonds', 'Q'));
            expect(hand.calculateValue()).toBe(21); // A (11) + Q (10) = 21
        });
        
        test('should calculate value with multiple Aces, one as 11', () => {
            hand.addCard(new Card('Spades', 'A')); // 11
            hand.addCard(new Card('Clubs', 'A'));   // 1
            hand.addCard(new Card('Hearts', '5'));  // 5
            expect(hand.calculateValue()).toBe(17); // 11 + 1 + 5 = 17
        });

        test('should change Ace value from 11 to 1 if hand would bust', () => {
            hand.addCard(new Card('Diamonds', 'A')); // Initially 11
            hand.addCard(new Card('Hearts', '7'));   // 7
            hand.addCard(new Card('Clubs', '8'));    // 8 (Total 26, so Ace becomes 1)
            expect(hand.calculateValue()).toBe(16);  // 1 + 7 + 8 = 16
        });

        test('should handle multiple Aces where some become 1', () => {
            hand.addCard(new Card('Spades', 'A'));   // 11
            hand.addCard(new Card('Clubs', 'A'));    // 1 (initially 11, but 11+11+9 = 31, so one A becomes 1 -> 11+1+9=21)
            hand.addCard(new Card('Diamonds', '9')); // 9
            expect(hand.calculateValue()).toBe(21);  // 11 + 1 + 9 = 21
        });

        test('should handle multiple Aces all becoming 1 if necessary', () => {
            hand.addCard(new Card('Hearts', 'A'));   // 1 (initially 11)
            hand.addCard(new Card('Diamonds', 'A')); // 1 (initially 11)
            hand.addCard(new Card('Spades', 'A'));   // 1 (initially 11)
            hand.addCard(new Card('Clubs', 'K'));    // 10 (Total 11+11+11+10 = 43 -> 1+1+1+10 = 13)
            expect(hand.calculateValue()).toBe(13);
        });
    });

    describe('isBust()', () => {
        test('should return false for hand value <= 21', () => {
            hand.addCard(new Card('Hearts', 'K'));
            hand.addCard(new Card('Diamonds', 'Q'));
            expect(hand.calculateValue()).toBe(20);
            expect(hand.isBust()).toBe(false);
        });

        test('should return true for hand value > 21', () => {
            hand.addCard(new Card('Clubs', 'K'));
            hand.addCard(new Card('Spades', 'Q'));
            hand.addCard(new Card('Hearts', '5')); // K + Q + 5 = 25
            expect(hand.calculateValue()).toBe(25);
            expect(hand.isBust()).toBe(true);
        });
    });

    test('getCardsJSON() should return an array of card-like objects', () => {
        hand.addCard(new Card('Hearts', '2'));
        hand.addCard(new Card('Spades', 'J'));
        const jsonCards = hand.getCardsJSON();
        expect(jsonCards).toEqual([
            { suit: 'Hearts', value: '2', rank: 2 },
            { suit: 'Spades', value: 'J', rank: 10 }
        ]);
    });

    test('clear() should empty the hand and reset value', () => {
        hand.addCard(new Card('Hearts', '5'));
        hand.addCard(new Card('Diamonds', 'K'));
        hand.clear();
        expect(hand.cards.length).toBe(0);
        expect(hand.value).toBe(0);
    });
});
