import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { nanoid } from 'nanoid';

const Index = () => {
  const navigate = useNavigate();
  
  const createGame = () => {
    const gameId = nanoid(10);
    navigate(`/game/${gameId}`);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-8">
        <h1 className="text-4xl font-bold text-foreground">Jeu d'Échecs</h1>
        <Button onClick={createGame} size="lg">
          Créer une nouvelle partie
        </Button>
      </div>
    </div>
  );
};

export default Index;