// blackjack-server/gameClasses.js

class Card {
  constructor(suit, value) {
    this.suit = suit;
    this.value = value;
    this.rank = this._getRank(value);
  }
  _getRank(value) {
    if (['J', 'Q', 'K'].includes(value)) return 10;
    if (value === 'A') return 11; // Aces are initially 11
    return parseInt(value);
  }
  toString() { return `${this.value} of ${this.suit}`; }
  toJSON() { return { suit: this.suit, value: this.value, rank: this.rank }; }
}

class Deck {
  constructor() { 
    this.cards = []; 
    this._initializeDeck(); 
  }
  _initializeDeck() {
    const suits = ['Hearts', 'Diamonds', 'Clubs', 'Spades'];
    const values = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    this.cards = [];
    for (const suit of suits) {
      for (const value of values) {
        this.cards.push(new Card(suit, value));
      }
    }
    this.shuffle(); 
  }
  shuffle() {
    for (let i = this.cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
    }
  }
  dealCard() {
    if (this.cards.length === 0) {
        // This scenario should ideally be handled by ensuring deck is sufficient
        // or by reshuffling. For robustness, one might return null or throw an error.
        // For now, let's assume reshuffle logic in getOrCreateTable handles deck depletion.
        console.warn("Deck is attempting to deal from empty, relying on higher level reshuffle.");
        // Re-initializing here might break game flow if not expected by calling code.
        // Let's return null to indicate failure if no reshuffle logic above this.
        return null; 
    }
    return this.cards.pop();
  }
}

class Hand {
  constructor() { 
    this.cards = []; 
    this.value = 0; 
  }
  addCard(card) { 
    if (card) { 
      this.cards.push(card); 
      this.calculateValue(); 
    } 
  }
  getCardsJSON() { 
    return this.cards.map(card => card.toJSON()); 
  }
  calculateValue() {
    let currentValue = 0; 
    let aceCount = 0;
    for (const card of this.cards) { 
      currentValue += card.rank; 
      if (card.value === 'A') aceCount++; 
    }
    while (currentValue > 21 && aceCount > 0) { 
      currentValue -= 10; 
      aceCount--; 
    }
    this.value = currentValue; 
    return this.value;
  }
  isBust() { 
    return this.calculateValue() > 21; 
  }
  clear() { 
    this.cards = []; 
    this.value = 0; 
  }
}

module.exports = { Card, Deck, Hand };
