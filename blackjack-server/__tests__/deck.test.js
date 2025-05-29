const { Deck, Card } = require('../gameClasses');

describe('Deck', () => {
    let deck;

    beforeEach(() => {
        deck = new Deck();
    });

    test('should create a deck with 52 cards', () => {
        expect(deck.cards.length).toBe(52);
    });

    test('all cards in the deck should be instances of Card', () => {
        deck.cards.forEach(card => {
            expect(card).toBeInstanceOf(Card);
        });
    });

    test('shuffle() should change the order of cards', () => {
        const originalOrder = [...deck.cards.map(card => card.toString())]; // Store string representations
        deck.shuffle();
        const newOrder = deck.cards.map(card => card.toString());
        
        expect(newOrder.length).toBe(52); // Ensure no cards lost
        // It's statistically highly improbable for shuffle to result in the exact same order.
        // A more robust test might check a few card positions or ensure not all are same.
        expect(newOrder).not.toEqual(originalOrder); 
    });

    test('dealCard() should remove and return the top card', () => {
        const initialCount = deck.cards.length;
        const topCard = deck.cards[initialCount - 1]; // Last card in array is "top" due to pop
        
        const dealtCard = deck.dealCard();
        
        expect(dealtCard).toBe(topCard);
        expect(deck.cards.length).toBe(initialCount - 1);
        expect(deck.cards.includes(topCard)).toBe(false);
    });

    test('should deal all 52 cards correctly', () => {
        const dealtCards = [];
        for (let i = 0; i < 52; i++) {
            const card = deck.dealCard();
            expect(card).toBeInstanceOf(Card);
            dealtCards.push(card);
        }
        expect(deck.cards.length).toBe(0);
        expect(dealtCards.length).toBe(52);
        // Check for uniqueness (optional, but good)
        const uniqueDealtCards = new Set(dealtCards.map(c => c.toString()));
        expect(uniqueDealtCards.size).toBe(52);
    });

    test('dealCard() from an empty or nearly empty deck', () => {
        // Deal all cards
        for (let i = 0; i < 52; i++) {
            deck.dealCard();
        }
        expect(deck.cards.length).toBe(0);
        
        // The Deck class's dealCard now re-initializes and shuffles if empty
        const newCard = deck.dealCard();
        expect(newCard).toBeInstanceOf(Card);
        expect(deck.cards.length).toBe(51); // Because it re-initialized a new 52-card deck and dealt one
    });
});
