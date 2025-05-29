class BlackjackGame {
  private deck: string[] = [];
  private playerHand: string[] = [];
  private dealerHand: string[] = [];
  private playerBalance = 1000;
  private currentBet = 0;
  private gameStatus: 'waiting' | 'in_progress' | 'ended' = 'waiting';

  constructor() {
    this.shuffleDeck();
  }

  private shuffleDeck(decks = 6): void {
    const suits = ['H', 'D', 'C', 'S'];
    const values = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    this.deck = [];
    
    for (let i = 0; i < decks; i++) {
      for (const suit of suits) {
        for (const value of values) {
          this.deck.push(`${value}${suit}`);
        }
      }
    }
    
    // Фишер-Йейтс
    for (let i = this.deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.deck[i], this.deck[j]] = [this.deck[j], this.deck[i]];
    }
  }

  public startGame(bet: number): void {
    if (bet > this.playerBalance) throw new Error("Insufficient balance");
    
    this.currentBet = bet;
    this.playerBalance -= bet;
    this.playerHand = [this.drawCard(), this.drawCard()];
    this.dealerHand = [this.drawCard(), this.drawCard()];
  }

  private drawCard(): string {
    if (this.deck.length === 0) this.shuffleDeck();
    return this.deck.pop()!;
  }

  public playerHit(): void {
    this.playerHand.push(this.drawCard());
  }

  public playerStand(): void {
    this.dealerPlay();
  }

  private dealerPlay(): void {
    while (this.calculateHandValue(this.dealerHand) < 17) {
      this.dealerHand.push(this.drawCard());
    }
    this.calculateResult();
  }

  private calculateHandValue(hand: string[]): number {
    let value = 0;
    let aces = 0;

    for (const card of hand) {
      const val = card.slice(0, -1);
      if (['J', 'Q', 'K'].includes(val)) value += 10;
      else if (val === 'A') aces++;
      else value += parseInt(val);
    }

    for (let i = 0; i < aces; i++) {
      value += (value + 11 <= 21) ? 11 : 1;
    }

    return value;
  }

  private calculateResult(): void {
    const playerValue = this.calculateHandValue(this.playerHand);
    const dealerValue = this.calculateHandValue(this.dealerHand);

    if (playerValue > 21) {
      // Player bust
    } else if (dealerValue > 21 || playerValue > dealerValue) {
      this.playerBalance += this.currentBet * 2.5; // Blackjack payout
    } else if (playerValue === dealerValue) {
      this.playerBalance += this.currentBet; // Push
    }
  }

  public getGameState() {
    return {
      playerHand: this.playerHand,
      dealerHand: this.dealerHand,
      playerBalance: this.playerBalance,
      gameStatus: "in_progress" // or "ended"
    };
  }
}