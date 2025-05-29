// blackjack-mini-app/js/blackjack.js

/**
 * Represents a playing card.
 * This class can be used by the client to reconstruct Card objects from server data
 * if needed for UI rendering or consistency with ui.js, though ui.js might be
 * adapted to use plain objects directly.
 */
class Card {
  /**
   * Creates a new card.
   * @param {string} suit - The suit of the card (e.g., 'Hearts', 'Diamonds').
   * @param {string} value - The face value of the card (e.g., '2', 'K', 'A').
   * @param {number} [rank] - Optional rank if provided by server, otherwise calculates it.
   */
  constructor(suit, value, rank) {
    this.suit = suit;
    this.value = value;
    // If rank is provided (e.g. from server data), use it. Otherwise, calculate.
    this.rank = rank !== undefined ? rank : this._getRank(value);
  }

  /**
   * Gets the numerical rank of the card if not provided.
   * Aces are initially 11. Face cards are 10.
   * @param {string} value - The face value of the card.
   * @returns {number} The numerical rank of the card.
   * @private
   */
  _getRank(value) {
    if (['J', 'Q', 'K'].includes(value)) {
      return 10;
    }
    if (value === 'A') {
      return 11; // Aces are initially 11
    }
    return parseInt(value);
  }

  /**
   * Returns a string representation of the card for display.
   * @returns {string} e.g., "Ace of Spades"
   */
  toString() {
    return `${this.value} of ${this.suit}`;
  }
}

/**
 * Represents a hand of cards.
 * This class can be used by the client to reconstruct Hand objects from server data
 * for easier display management with ui.js, which currently expects Hand objects.
 */
class Hand {
  constructor(cardsData = []) { // cardsData can be an array of {suit, value, rank} objects
    this.cards = cardsData.map(cardData => new Card(cardData.suit, cardData.value, cardData.rank));
    this.value = this.calculateValue();
  }

  addCard(cardData) { // cardData is {suit, value, rank}
    if (cardData) {
      this.cards.push(new Card(cardData.suit, cardData.value, cardData.rank));
      this.calculateValue();
    }
  }

  getCards() {
    return this.cards; // Returns array of Card instances
  }

  calculateValue() {
    let currentValue = 0;
    let aceCount = 0;
    for (const card of this.cards) { // card is an instance of Card
      currentValue += card.rank;
      if (card.value === 'A') {
        aceCount++;
      }
    }
    while (currentValue > 21 && aceCount > 0) {
      currentValue -= 10;
      aceCount--;
    }
    this.value = currentValue;
    return this.value;
  }

  clear() {
    this.cards = [];
    this.value = 0;
  }

  // isBust() might still be useful on client for quick UI checks,
  // but server will be the source of truth for game state.
  isBust() {
    return this.calculateValue() > 21;
  }

  toString() {
    return this.cards.map(card => card.toString()).join(', ');
  }
}

// Global/shared state that app.js will manage based on server responses
// These are effectively placeholders for data that app.js will hold and update.
// This helps if ui.js or other parts of app.js were implicitly relying on these names.
// However, the actual game logic and source of truth now resides on the server.
let blackjack = {
    playerBalance: 100, // Default, will be updated from server in app.js
    // Other game state like playerHand, dealerHand, etc.,
    // will be constructed in app.js from server responses.
    // For example, app.js might do:
    // blackjack.playerHand = new Hand(serverPlayerHandData);
    // blackjack.dealerHand = new Hand(serverDealerHandData);
    // blackjack.isPlayerTurn = serverIsPlayerTurn;
    // blackjack.isGameOver = serverIsGameOver;
    // blackjack.lastGameMessage = serverMessage;
};
