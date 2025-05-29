import { useTonConnect } from './hooks/useTonConnect';
import { useBackend } from './hooks/useBackend';

function App() {
  const { user } = useTonConnect();
  const { gameState, sendAction } = useBackend();

  return (
    <div className="game-container">
      <div className="dealer-cards">
        {gameState.dealerHand.map(card => (
          <Card key={card} value={card} />
        ))}
      </div>

      <div className="player-area">
        <div className="cards">
          {gameState.playerHand.map(card => (
            <Card key={card} value={card} />
          ))}
        </div>
        
        <div className="controls">
          <button onClick={() => sendAction('HIT')}>Hit</button>
          <button onClick={() => sendAction('STAND')}>Stand</button>
          <button onClick={() => sendAction('DOUBLE')}>Double</button>
        </div>
      </div>

      <div className="balance">
        Balance: {gameState.playerBalance} 
        <button onClick={openDepositModal}>Deposit</button>
      </div>
    </div>
  );
}