const { Card } = require('../gameClasses'); // Adjust path as necessary

describe('Card', () => {
    test('should create a card with correct suit, value, and rank', () => {
        const card = new Card('Hearts', 'A');
        expect(card.suit).toBe('Hearts');
        expect(card.value).toBe('A');
        expect(card.rank).toBe(11); // Ace rank

        const card2 = new Card('Spades', 'K');
        expect(card2.rank).toBe(10); // King rank

        const card3 = new Card('Diamonds', '7');
        expect(card3.rank).toBe(7); // Number card rank
    });

    test('toJSON() should return a plain object with suit, value, and rank', () => {
        const card = new Card('Clubs', 'Q');
        const jsonCard = card.toJSON();
        expect(jsonCard).toEqual({
            suit: 'Clubs',
            value: 'Q',
            rank: 10
        });
    });

    test('toString() should return a string representation of the card', () => {
        const card = new Card('Diamonds', 'J');
        expect(card.toString()).toBe('J of Diamonds');

        const card2 = new Card('Hearts', '10');
        expect(card2.toString()).toBe('10 of Hearts');
    });
});
