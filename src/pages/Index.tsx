import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { nanoid } from 'nanoid';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState } from 'react';
import { toast } from '@/components/ui/use-toast';

const Index = () => {
  const navigate = useNavigate();
  const [gameId, setGameId] = useState<string | null>(null);
  const [timeControl, setTimeControl] = useState('10');
  const [increment, setIncrement] = useState('5');
  
  const createGame = () => {
    const newGameId = nanoid(10);
    setGameId(newGameId);
  };

  const copyGameLink = () => {
    const gameUrl = `https://chess-apo.netlify.app/game/${gameId}?time=${timeControl}&increment=${increment}`;
    navigator.clipboard.writeText(gameUrl);
    toast({
      title: "Lien copié !",
      description: "Partagez ce lien avec votre adversaire pour commencer la partie.",
    });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-8 w-full max-w-md p-6">
        <h1 className="text-4xl font-bold text-foreground">Jeu d'Échecs</h1>
        
        {!gameId ? (
          <div className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-left block">Temps de réflexion (minutes)</label>
                <Select
                  value={timeControl}
                  onValueChange={setTimeControl}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1</SelectItem>
                    <SelectItem value="3">3</SelectItem>
                    <SelectItem value="5">5</SelectItem>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="15">15</SelectItem>
                    <SelectItem value="30">30</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-left block">Incrément (secondes)</label>
                <Select
                  value={increment}
                  onValueChange={setIncrement}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">0</SelectItem>
                    <SelectItem value="1">1</SelectItem>
                    <SelectItem value="2">2</SelectItem>
                    <SelectItem value="3">3</SelectItem>
                    <SelectItem value="5">5</SelectItem>
                    <SelectItem value="10">10</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button onClick={createGame} size="lg" className="w-full">
              Créer une nouvelle partie
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <Button onClick={copyGameLink} size="lg" className="w-full">
              Copier le lien de la partie
            </Button>
            <p className="text-sm text-muted-foreground">
              Partagez ce lien avec votre adversaire pour commencer à jouer
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Index;