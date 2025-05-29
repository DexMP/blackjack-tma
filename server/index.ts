import express, { Request, Response, Application } from 'express';
import { BlackjackGame } from './gameLogic';

const app: Application = express();
app.use(express.json());

const activeGames: Record<string, BlackjackGame> = {};

// Явно указываем типы для Request и Response
app.post('/game/start', (req: Request, res: Response) => {
    const { userId, bet } = req.body;
    
    // Валидация входных данных
    if (!userId || typeof bet !== 'number') {
        return res.status(400).json({ error: 'Invalid request data' });
    }

    const game = new BlackjackGame();
    try {
        game.startGame(bet);
        activeGames[userId] = game;
        res.json(game.getGameState());
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.post('/game/action', (req: Request, res: Response) => {
    const { userId, action } = req.body;
    
    // Валидация
    if (!userId || !action) {
        return res.status(400).json({ error: 'Missing parameters' });
    }

    const game = activeGames[userId];
    if (!game) {
        return res.status(404).json({ error: 'Game not found' });
    }

    try {
        switch (action) {
            case 'HIT': 
                game.playerHit(); 
                break;
            case 'STAND': 
                game.playerStand(); 
                break;
            // Добавьте другие действия по мере необходимости
            default: 
                return res.status(400).json({ error: 'Invalid action' });
        }
        
        res.json(game.getGameState());
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.get('/balance/:wallet', (req: Request, res: Response) => {
    const wallet = req.params.wallet;
    // Заглушка для баланса
    res.json({ balance: 1000 });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});